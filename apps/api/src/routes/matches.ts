import { randomUUID } from "node:crypto";
import { calculateRatingDelta, type MatchConfig, type PlayerDescriptor } from "@9darters/shared";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { matchParticipants, matches, users } from "../db/schema.js";
import { areAllParticipantsAccepted, isPreStartMatchStatus, isResolvedMatchStatus } from "../lib/acceptance.js";
import { requireUser } from "../lib/auth.js";
import { logRankingMatchActivity } from "../lib/rankingActivityLogger.js";
import {
  appendMatchEvent,
  canUserParticipate,
  createInAppNotifications,
  createMatchRecord,
  findParticipantIdForUser,
  listLiveMatches,
  loadMatchBundle,
  maybeStartMatch,
  persistMatchState,
  refreshTournamentStatus,
  revertMatchRating
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

    const { id, state } = await createMatchRecord(
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

    await createInAppNotifications(app.db, [
      {
        userId: opponent.id,
        type: "match_invite",
        title: `${user.nickname} utworzyl mecz 1v1`,
        body: `${body.name} | ${body.mode} | ${body.isRanking ? "rankingowy" : "towarzyski"} | ${body.playMode === "online" ? "online" : "stacjonarnie"} | czeka na Twoje potwierdzenie`,
        entityType: "match",
        entityId: id
      }
    ]);
    await logRankingMatchActivity(
      {
        id,
        name: body.name,
        mode: body.mode,
        kind: "duel",
        playMode: body.playMode,
        status: state.status,
        isRanking: body.isRanking,
        tournamentId: null
      },
      "match_invited",
      {
        createdByUserId: user.id,
        createdByNickname: user.nickname,
        opponentUserId: opponent.id,
        opponentNickname: opponent.nickname
      }
    );
    return reply.status(201).send({ id });
  });

  app.post("/api/matches/:id/accept", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const bundle = await loadMatchBundle(app.db, params.id);
    if (!bundle || bundle.match.kind !== "duel") {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    const participant = bundle.participants.find((item) => item.userId === user.id);
    if (!participant) {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    const now = new Date().toISOString();
    if (participant.status !== "accepted") {
      await app.db
        .update(matchParticipants)
        .set({
          status: "accepted",
          acceptedAt: now
        })
        .where(eq(matchParticipants.id, participant.id));
      await appendMatchEvent(app.db, params.id, "match_accepted", participant.id, {
        userId: user.id,
        nickname: user.nickname
      });
      await logRankingMatchActivity(
        {
          id: bundle.match.id,
          name: bundle.match.name,
          mode: bundle.match.mode,
          kind: bundle.match.kind,
          playMode: bundle.match.playMode,
          status: bundle.match.status,
          isRanking: bundle.match.isRanking,
          tournamentId: bundle.match.tournamentId
        },
        "match_accepted",
        {
          actorUserId: user.id,
          actorNickname: user.nickname,
          actorParticipantId: participant.id
        }
      );
    }

    const refreshedBundle = await loadMatchBundle(app.db, params.id);
    if (!refreshedBundle) {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    const allAccepted = areAllParticipantsAccepted(refreshedBundle.participants);
    const alreadyReady =
      isResolvedMatchStatus(refreshedBundle.match.status) || isResolvedMatchStatus(refreshedBundle.match.stateJson.status);

    if (allAccepted && !alreadyReady) {
      const readyState = {
        ...refreshedBundle.match.stateJson,
        status: "ready" as const
      };
      await persistMatchState(app.db, params.id, readyState, refreshedBundle.match.winnerParticipantId);
      app.io.to(`match:${params.id}`).emit("match:update", readyState);
      await createInAppNotifications(
        app.db,
        refreshedBundle.participants
          .filter((entry) => entry.userId && entry.userId !== user.id)
          .map((entry) => ({
            userId: entry.userId!,
            type: "match_ready",
            title: `${bundle.match.name} jest gotowy`,
            body: `Wszyscy gracze potwierdzili mecz ${bundle.match.mode}. Mozesz wejsc do spotkania i rozpoczac gre.`,
            entityType: "match",
            entityId: params.id
          }))
      );
      await logRankingMatchActivity(
        {
          id: refreshedBundle.match.id,
          name: refreshedBundle.match.name,
          mode: refreshedBundle.match.mode,
          kind: refreshedBundle.match.kind,
          playMode: refreshedBundle.match.playMode,
          status: "ready",
          isRanking: refreshedBundle.match.isRanking,
          tournamentId: refreshedBundle.match.tournamentId
        },
        "match_ready",
        {
          confirmedParticipantIds: refreshedBundle.participants.map((entry) => entry.id)
        }
      );
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

    const allAccepted = areAllParticipantsAccepted(bundle.participants);
    if (
      allAccepted &&
      (
        isPreStartMatchStatus(bundle.match.status) ||
        isPreStartMatchStatus(bundle.match.stateJson.status)
      )
    ) {
      await persistMatchState(
        app.db,
        params.id,
        {
          ...bundle.match.stateJson,
          status: "ready"
        },
        bundle.match.winnerParticipantId
      );
    } else if (
      !allAccepted &&
      (
        isPreStartMatchStatus(bundle.match.status) ||
        isPreStartMatchStatus(bundle.match.stateJson.status)
      )
    ) {
      return reply.status(409).send({ error: "MATCH_AWAITING_ACCEPTANCE" });
    }

    await logRankingMatchActivity(
      {
        id: bundle.match.id,
        name: bundle.match.name,
        mode: bundle.match.mode,
        kind: bundle.match.kind,
        playMode: bundle.match.playMode,
        status: bundle.match.status,
        isRanking: bundle.match.isRanking,
        tournamentId: bundle.match.tournamentId
      },
      "match_start_requested",
      {
        actorUserId: user.id,
        actorNickname: user.nickname,
        stationaryController: canControlStationary
      }
    );
    const started = await maybeStartMatch(app.db, app.io, params.id);
    return { state: started };
  });

  app.post("/api/matches/:id/cancel", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const bundle = await loadMatchBundle(app.db, params.id);
    if (!bundle) {
      return reply.status(404).send({ error: "MATCH_NOT_FOUND" });
    }

    const participant = bundle.participants.find((item) => item.userId === user.id) ?? null;
    const canCancel = Boolean(participant || bundle.match.createdByUserId === user.id);
    if (!canCancel) {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    if (bundle.match.status === "cancelled" || bundle.match.stateJson.status === "cancelled") {
      return reply.status(200).send({
        state: bundle.match.stateJson,
        ratingReverted: false
      });
    }

    const cancelledAt = new Date().toISOString();
    const revertedRating = await revertMatchRating(app.db, params.id);
    const cancelledState = {
      ...bundle.match.stateJson,
      status: "cancelled" as const,
      pendingThrows: [],
      winnerIndex: null,
      finishedAt: cancelledAt
    };

    await persistMatchState(app.db, params.id, cancelledState, null);
    await appendMatchEvent(app.db, params.id, "match_cancelled", participant?.id ?? null, {
      actorUserId: user.id,
      actorNickname: user.nickname,
      ratingReverted: revertedRating.reverted,
      revertedEntries: revertedRating.entries
    });
    await createInAppNotifications(
      app.db,
      bundle.participants
        .filter((entry) => entry.userId && entry.userId !== user.id)
        .map((entry) => ({
          userId: entry.userId!,
          type: "match_cancelled",
          title: `${bundle.match.name} zostal anulowany`,
          body: `${user.nickname} anulowal mecz ${bundle.match.mode}.`,
          entityType: "match",
          entityId: params.id
        }))
    );
    await logRankingMatchActivity(
      {
        id: bundle.match.id,
        name: bundle.match.name,
        mode: bundle.match.mode,
        kind: bundle.match.kind,
        playMode: bundle.match.playMode,
        status: "cancelled",
        isRanking: bundle.match.isRanking,
        tournamentId: bundle.match.tournamentId
      },
      "match_cancelled",
      {
        actorUserId: user.id,
        actorNickname: user.nickname,
        actorParticipantId: participant?.id ?? null,
        ratingReverted: revertedRating.reverted,
        revertedEntries: revertedRating.entries
      }
    );

    if (bundle.match.tournamentId) {
      await refreshTournamentStatus(app.db, bundle.match.tournamentId);
    }

    app.io.to(`match:${params.id}`).emit("match:update", cancelledState);
    return reply.status(200).send({
      state: cancelledState,
      ratingReverted: revertedRating.reverted
    });
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
