import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { matches, tournamentParticipants, tournaments, users } from "../db/schema.js";
import { areAllParticipantsAccepted } from "../lib/acceptance.js";
import { requireUser } from "../lib/auth.js";
import { logRankingTournamentActivity } from "../lib/rankingActivityLogger.js";
import { createTournamentMatches, createInAppNotifications, resolveTournamentStandings } from "../services/matches.js";

const createTournamentSchema = z.object({
  name: z.string().trim().min(3).max(160),
  mode: z.enum(["501", "301"]),
  playMode: z.enum(["online", "stationary"]).default("online"),
  isRanking: z.boolean().default(false),
  doubleOut: z.boolean().default(false),
  legsToWin: z.number().int().min(1).max(9),
  setsToWin: z.number().int().min(1).max(9),
  countingMode: z.enum(["default", "simplified"]).default("simplified"),
  participantNicknames: z.array(z.string().trim().min(3).max(50)).min(1).max(11)
});

export async function tournamentRoutes(app: FastifyInstance) {
  app.post("/api/tournaments", async (request, reply) => {
    const user = requireUser(request);
    const body = createTournamentSchema.parse(request.body);
    const nicknameSet = [...new Set(body.participantNicknames.filter((nickname) => nickname !== user.nickname))];

    const invitedUsers = (
      await Promise.all(
        nicknameSet.map(async (nickname) => {
          const [found] = await app.db.select().from(users).where(eq(users.nickname, nickname)).limit(1);
          return found ?? null;
        })
      )
    ).filter(Boolean);

    if (invitedUsers.length !== nicknameSet.length) {
      return reply.status(404).send({ error: "PARTICIPANT_NOT_FOUND" });
    }

    const timestamp = new Date().toISOString();
    const tournamentId = randomUUID();
    await app.db.insert(tournaments).values({
      id: tournamentId,
      name: body.name,
      mode: body.mode,
      status: "pending",
      isRanking: body.isRanking,
      countingMode: body.countingMode,
      playMode: body.playMode,
      doubleOut: body.doubleOut,
      legsToWin: body.legsToWin,
      setsToWin: body.setsToWin,
      createdByUserId: user.id,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await app.db.insert(tournamentParticipants).values([
      {
        id: randomUUID(),
        tournamentId,
        userId: user.id,
        displayName: user.nickname,
        status: "accepted",
        acceptedAt: timestamp,
        createdAt: timestamp
      },
      ...invitedUsers.map((participant) => ({
        id: randomUUID(),
        tournamentId,
        userId: participant.id,
        displayName: participant.nickname,
        status: "pending" as const,
        acceptedAt: null,
        createdAt: timestamp
      }))
    ]);

    await createInAppNotifications(
      app.db,
      invitedUsers.map((participant) => ({
        userId: participant.id,
        type: "tournament_invite",
        title: `${user.nickname} dodal Cie do turnieju`,
        body: `${body.name} | ${body.mode} | ${body.isRanking ? "rankingowy" : "towarzyski"} | czeka na Twoje potwierdzenie`,
        entityType: "tournament",
        entityId: tournamentId
      }))
    );
    await logRankingTournamentActivity(
      {
        id: tournamentId,
        name: body.name,
        mode: body.mode,
        playMode: body.playMode,
        status: "pending",
        isRanking: body.isRanking
      },
      "tournament_created",
      {
        createdByUserId: user.id,
        createdByNickname: user.nickname,
        invitedUserIds: invitedUsers.map((participant) => participant.id),
        invitedNicknames: invitedUsers.map((participant) => participant.nickname)
      }
    );

    return reply.status(201).send({ id: tournamentId });
  });

  app.get("/api/tournaments/:id", async (request, reply) => {
    requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const [tournament] = await app.db.select().from(tournaments).where(eq(tournaments.id, params.id)).limit(1);
    if (!tournament) {
      return reply.status(404).send({ error: "TOURNAMENT_NOT_FOUND" });
    }

    const participants = await app.db
      .select()
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, params.id))
      .orderBy(asc(tournamentParticipants.createdAt));
    const standings = await resolveTournamentStandings(app.db, params.id);
    return { tournament, participants, standings };
  });

  app.post("/api/tournaments/:id/accept", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const [tournament] = await app.db.select().from(tournaments).where(eq(tournaments.id, params.id)).limit(1);
    if (!tournament) {
      return reply.status(404).send({ error: "TOURNAMENT_NOT_FOUND" });
    }

    const [participant] = await app.db
      .select()
      .from(tournamentParticipants)
      .where(and(eq(tournamentParticipants.tournamentId, params.id), eq(tournamentParticipants.userId, user.id)))
      .limit(1);

    if (!participant) {
      return reply.status(404).send({ error: "TOURNAMENT_NOT_FOUND" });
    }

    if (participant.status !== "accepted") {
      await app.db
        .update(tournamentParticipants)
        .set({
          status: "accepted",
          acceptedAt: new Date().toISOString()
        })
        .where(eq(tournamentParticipants.id, participant.id));
      await logRankingTournamentActivity(
        {
          id: tournament.id,
          name: tournament.name,
          mode: tournament.mode,
          playMode: tournament.playMode,
          status: tournament.status,
          isRanking: tournament.isRanking
        },
        "tournament_accepted",
        {
          actorUserId: user.id,
          actorNickname: user.nickname,
          participantId: participant.id
        }
      );
    }

    const refreshedParticipants = await app.db
      .select()
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, params.id))
      .orderBy(asc(tournamentParticipants.createdAt));
    const allAccepted = areAllParticipantsAccepted(
      refreshedParticipants.map((entry) => ({
        userId: entry.userId,
        status: entry.status
      }))
    );

    if (allAccepted && tournament.status === "pending") {
      const createdMatchIds = await createTournamentMatches(app.db, params.id);
      await createInAppNotifications(
        app.db,
        refreshedParticipants.map((entry) => ({
          userId: entry.userId,
          type: "tournament_ready",
          title: `${tournament.name} jest gotowy`,
          body: `Wszyscy gracze potwierdzili udzial. Turniej ${tournament.mode} moze sie rozpoczac.`,
          entityType: "tournament",
          entityId: params.id
        }))
      );
      await logRankingTournamentActivity(
        {
          id: tournament.id,
          name: tournament.name,
          mode: tournament.mode,
          playMode: tournament.playMode,
          status: "ready",
          isRanking: tournament.isRanking
        },
        "tournament_confirmed",
        {
          confirmedParticipantIds: refreshedParticipants.map((entry) => entry.id),
          createdMatchIds
        }
      );
    }

    return reply.status(204).send();
  });

  app.get("/api/tournaments/:id/standings", async (request) => {
    requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const standings = await resolveTournamentStandings(app.db, params.id);
    return { standings };
  });

  app.get("/api/tournaments/:id/next-match", async (request, reply) => {
    requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const [next] = await app.db
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, params.id), eq(matches.status, "ready")))
      .limit(1);
    if (!next) {
      return reply.status(404).send({ error: "NO_PENDING_MATCH" });
    }
    return { match: next };
  });
}
