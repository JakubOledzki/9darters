import { randomUUID } from "node:crypto";
import { calculateRatingDelta, type MatchConfig, type PlayerDescriptor } from "@9darters/shared";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { matchParticipants, matches, users } from "../db/schema.js";
import { requireUser } from "../lib/auth.js";
import {
  appendMatchEvent,
  canUserParticipate,
  createInAppNotifications,
  createMatchRecord,
  findParticipantIdForUser,
  listLiveMatches,
  loadMatchBundle,
  maybeStartMatch
} from "../services/matches.js";

const offlineSchema = z.object({
  name: z.string().trim().min(3).max(160),
  mode: z.enum(["501", "301", "cricket", "around-the-clock"]),
  guestNames: z.array(z.string().trim().min(1).max(50)).max(7),
  doubleOut: z.boolean().default(false),
  legsToWin: z.number().int().min(1).max(9).default(1),
  setsToWin: z.number().int().min(1).max(9).default(1),
  countingMode: z.enum(["default", "simplified"]).default("simplified")
});

const duelSchema = z.object({
  name: z.string().trim().min(3).max(160),
  mode: z.enum(["501", "301"]),
  opponentNickname: z.string().trim().min(3).max(50),
  playMode: z.enum(["online", "stationary"]).default("online"),
  isRanking: z.boolean().default(false),
  doubleOut: z.boolean().default(false),
  legsToWin: z.number().int().min(1).max(9),
  setsToWin: z.number().int().min(1).max(9),
  countingMode: z.enum(["default", "simplified"]).default("simplified")
});

export async function matchRoutes(app: FastifyInstance) {
  app.get("/api/matches/live", async (request) => {
    requireUser(request);
    return { matches: await listLiveMatches(app.db) };
  });

  app.post("/api/matches/offline", async (request, reply) => {
    const user = requireUser(request);
    const body = offlineSchema.parse(request.body);
    const config: MatchConfig = {
      name: body.name,
      mode: body.mode,
      kind: "offline",
      createdByUserId: user.id,
      isRanking: false,
      countingMode: body.countingMode,
      playMode: "stationary",
      doubleOut: body.doubleOut,
      legsToWin: body.legsToWin,
      setsToWin: body.setsToWin
    };

    const players: PlayerDescriptor[] = [
      {
        id: randomUUID(),
        userId: user.id,
        name: user.nickname,
        kind: "registered"
      },
      ...body.guestNames.map((name) => ({
        id: randomUUID(),
        name,
        kind: "guest" as const,
        userId: null
      }))
    ];

    const participantSeed = players.map((player, index) => ({
      id: player.id,
      userId: player.userId ?? null,
      displayName: player.name,
      orderIndex: index,
      status: "accepted" as const,
      acceptedAt: new Date().toISOString()
    }));

    const { id } = await createMatchRecord(app.db, config, players, participantSeed);
    return reply.status(201).send({ id });
  });

  app.post("/api/matches/duel", async (request, reply) => {
    const user = requireUser(request);
    const body = duelSchema.parse(request.body);
    if (body.opponentNickname === user.nickname) {
      return reply.status(400).send({ error: "SELF_MATCH_NOT_ALLOWED" });
    }

    const [opponent] = await app.db.select().from(users).where(eq(users.nickname, body.opponentNickname)).limit(1);
    if (!opponent) {
      return reply.status(404).send({ error: "OPPONENT_NOT_FOUND" });
    }

    const homeId = randomUUID();
    const awayId = randomUUID();
    const participants: PlayerDescriptor[] = [
      { id: homeId, userId: user.id, name: user.nickname, kind: "registered" },
      { id: awayId, userId: opponent.id, name: opponent.nickname, kind: "registered" }
    ];

    const { id } = await createMatchRecord(
      app.db,
      {
        name: body.name,
        mode: body.mode,
        kind: "duel",
        createdByUserId: user.id,
        isRanking: body.isRanking,
        countingMode: body.countingMode,
        playMode: body.playMode,
        doubleOut: body.doubleOut,
        legsToWin: body.legsToWin,
        setsToWin: body.setsToWin
      },
      participants,
      [
        {
          id: homeId,
          userId: user.id,
          displayName: user.nickname,
          orderIndex: 0,
          status: "accepted",
          acceptedAt: new Date().toISOString()
        },
        {
          id: awayId,
          userId: opponent.id,
          displayName: opponent.nickname,
          orderIndex: 1,
          status: "pending",
          acceptedAt: null
        }
      ]
    );

    await app.db.update(matches).set({ status: "pending" }).where(eq(matches.id, id));
    await createInAppNotifications(app.db, [
      {
        userId: opponent.id,
        type: "match_invite",
        title: `${user.nickname} wyzywa Cie na mecz`,
        body: `${body.name} | ${body.mode} | ${body.isRanking ? "rankingowy" : "towarzyski"} | ${body.playMode === "online" ? "online" : "stacjonarnie"}`,
        entityType: "match",
        entityId: id
      }
    ]);
    return reply.status(201).send({ id });
  });

  app.post("/api/matches/:id/accept", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const bundle = await loadMatchBundle(app.db, params.id);
    if (!bundle) {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    const ownParticipant = bundle.participants.find((participant) => participant.userId === user.id);
    if (!ownParticipant) {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    if (ownParticipant.status === "accepted") {
      return reply.status(204).send();
    }

    await app.db
      .update(matchParticipants)
      .set({
        status: "accepted",
        acceptedAt: new Date().toISOString()
      })
      .where(and(eq(matchParticipants.matchId, params.id), eq(matchParticipants.userId, user.id)));

    const participants = await app.db
      .select()
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, params.id))
      .orderBy(asc(matchParticipants.orderIndex));

    const allAccepted = participants.filter((entry) => entry.userId).every((entry) => entry.status === "accepted");
    if (allAccepted) {
      await app.db.update(matches).set({ status: "ready", updatedAt: new Date().toISOString() }).where(eq(matches.id, params.id));
    }

    await appendMatchEvent(app.db, params.id, "match_accepted", findParticipantIdForUser(participants, user.id), {});
    const invitingParticipant = participants.find((participant) => participant.userId && participant.userId !== user.id);
    if (invitingParticipant?.userId) {
      await createInAppNotifications(app.db, [
        {
          userId: invitingParticipant.userId,
          type: "match_ready",
          title: `${user.nickname} zaakceptowal mecz`,
          body: `Mecz ${bundle.match.name} jest gotowy do startu.`,
          entityType: "match",
          entityId: params.id
        }
      ]);
    }

    if (allAccepted) {
      await maybeStartMatch(app.db, app.io, params.id);
    }

    return reply.status(204).send();
  });

  app.post("/api/matches/:id/start", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const bundle = await loadMatchBundle(app.db, params.id);
    const canControlStationary = Boolean(
      bundle?.match.playMode === "stationary" && bundle.match.createdByUserId === user.id
    );
    if (!bundle || (!canUserParticipate(bundle.participants, user.id) && !canControlStationary)) {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    if (bundle.match.status === "accepted") {
      await app.db.update(matches).set({ status: "ready", updatedAt: new Date().toISOString() }).where(eq(matches.id, params.id));
    }

    const started = await maybeStartMatch(app.db, app.io, params.id);
    return { state: started };
  });

  app.get("/api/matches/:id/state", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const bundle = await loadMatchBundle(app.db, params.id);
    if (!bundle) {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    const canView =
      canUserParticipate(bundle.participants, user.id) ||
      ["duel", "tournament"].includes(bundle.match.kind);
    if (!canView) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    const ratingPreviewByParticipantId: Record<string, { currentRating: number; winDelta: number; lossDelta: number }> = {};
    if (bundle.match.isRanking) {
      type RankingPlayer = (typeof bundle.match.stateJson.players)[number] & { userId: string };
      const rankingPlayers = bundle.match.stateJson.players.filter(
        (player): player is RankingPlayer => typeof player.userId === "string"
      );

      if (rankingPlayers.length === 2) {
        const ratingRows = await app.db
          .select({
            id: users.id,
            rating: users.rating
          })
          .from(users)
          .where(inArray(users.id, rankingPlayers.map((player) => player.userId)));

        const ratings = new Map(ratingRows.map((row) => [row.id, row.rating]));
        const [homePlayer, awayPlayer] = rankingPlayers;
        const homeRating = ratings.get(homePlayer.userId);
        const awayRating = ratings.get(awayPlayer.userId);

        if (typeof homeRating === "number" && typeof awayRating === "number") {
          ratingPreviewByParticipantId[homePlayer.participantId] = {
            currentRating: homeRating,
            winDelta: calculateRatingDelta(homeRating, awayRating),
            lossDelta: calculateRatingDelta(awayRating, homeRating)
          };
          ratingPreviewByParticipantId[awayPlayer.participantId] = {
            currentRating: awayRating,
            winDelta: calculateRatingDelta(awayRating, homeRating),
            lossDelta: calculateRatingDelta(homeRating, awayRating)
          };
        }
      }
    }

    return {
      match: bundle.match,
      participants: bundle.participants,
      ratingPreviewByParticipantId
    };
  });

  app.get("/api/matches", async (request) => {
    const user = requireUser(request);
    const rows = await app.db
      .select()
      .from(matches)
      .innerJoin(matchParticipants, eq(matches.id, matchParticipants.matchId))
      .where(or(eq(matches.createdByUserId, user.id), eq(matchParticipants.userId, user.id)))
      .orderBy(asc(matches.updatedAt));

    const seen = new Set<string>();
    const items = rows
      .filter((row) => {
        if (seen.has(row.matches.id)) {
          return false;
        }
        seen.add(row.matches.id);
        return true;
      })
      .map((row) => row.matches);

    return { matches: items };
  });
}
