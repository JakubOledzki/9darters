import { desc, eq, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authSessions,
  follows,
  loginAttempts,
  matchEvents,
  matchParticipants,
  matches,
  notifications,
  ratingLedger,
  tournamentParticipants,
  tournaments,
  trainingSessions,
  users
} from "../db/schema.js";
import { ensureBootstrapAdmin, requireAdmin } from "../lib/auth.js";

async function deleteMatchCascade(app: FastifyInstance, matchId: string) {
  await app.db.delete(notifications).where(eq(notifications.entityId, matchId));
  await app.db.delete(ratingLedger).where(eq(ratingLedger.matchId, matchId));
  await app.db.delete(matchEvents).where(eq(matchEvents.matchId, matchId));
  await app.db.delete(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  await app.db.delete(matches).where(eq(matches.id, matchId));
}

async function deleteTournamentCascade(app: FastifyInstance, tournamentId: string) {
  const tournamentMatchRows = await app.db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId));

  for (const row of tournamentMatchRows) {
    await deleteMatchCascade(app, row.id);
  }

  await app.db.delete(notifications).where(eq(notifications.entityId, tournamentId));
  await app.db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, tournamentId));
  await app.db.delete(tournaments).where(eq(tournaments.id, tournamentId));
}

export async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/overview", async (request) => {
    requireAdmin(request);

    const [userRows, matchRows, tournamentRows] = await Promise.all([
      app.db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          nickname: users.nickname,
          rating: users.rating,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(100),
      app.db
        .select({
          id: matches.id,
          name: matches.name,
          mode: matches.mode,
          kind: matches.kind,
          status: matches.status,
          isRanking: matches.isRanking,
          playMode: matches.playMode,
          updatedAt: matches.updatedAt
        })
        .from(matches)
        .orderBy(desc(matches.updatedAt))
        .limit(100),
      app.db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          mode: tournaments.mode,
          status: tournaments.status,
          isRanking: tournaments.isRanking,
          playMode: tournaments.playMode,
          updatedAt: tournaments.updatedAt
        })
        .from(tournaments)
        .orderBy(desc(tournaments.updatedAt))
        .limit(100)
    ]);

    return {
      users: userRows,
      matches: matchRows,
      tournaments: tournamentRows
    };
  });

  app.patch("/api/admin/users/:id/rating", async (request, reply) => {
    requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ rating: z.number().int().min(0).max(5000) }).parse(request.body);

    await app.db.update(users).set({ rating: body.rating }).where(eq(users.id, params.id));
    return reply.status(204).send();
  });

  app.delete("/api/admin/matches/:id", async (request, reply) => {
    requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await deleteMatchCascade(app, params.id);
    return reply.status(204).send();
  });

  app.delete("/api/admin/tournaments/:id", async (request, reply) => {
    requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await deleteTournamentCascade(app, params.id);
    return reply.status(204).send();
  });

  app.delete("/api/admin/users/:id", async (request, reply) => {
    requireAdmin(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const [userRow] = await app.db.select().from(users).where(eq(users.id, params.id)).limit(1);
    if (!userRow) {
      return reply.status(404).send({ error: "USER_NOT_FOUND" });
    }

    const tournamentIds = new Set<string>();
    const matchIds = new Set<string>();

    const [createdTournaments, joinedTournaments, createdMatches, joinedMatches] = await Promise.all([
      app.db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.createdByUserId, userRow.id)),
      app.db
        .select({ tournamentId: tournamentParticipants.tournamentId })
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.userId, userRow.id)),
      app.db.select({ id: matches.id }).from(matches).where(eq(matches.createdByUserId, userRow.id)),
      app.db
        .select({ matchId: matchParticipants.matchId })
        .from(matchParticipants)
        .where(eq(matchParticipants.userId, userRow.id))
    ]);

    for (const row of createdTournaments) {
      tournamentIds.add(row.id);
    }
    for (const row of joinedTournaments) {
      tournamentIds.add(row.tournamentId);
    }
    for (const row of createdMatches) {
      matchIds.add(row.id);
    }
    for (const row of joinedMatches) {
      matchIds.add(row.matchId);
    }

    for (const tournamentId of tournamentIds) {
      await deleteTournamentCascade(app, tournamentId);
    }

    for (const matchId of matchIds) {
      const [matchRow] = await app.db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
      if (matchRow && !matchRow.tournamentId) {
        await deleteMatchCascade(app, matchId);
      }
    }

    await app.db.delete(trainingSessions).where(eq(trainingSessions.userId, userRow.id));
    await app.db.delete(notifications).where(eq(notifications.userId, userRow.id));
    await app.db
      .delete(follows)
      .where(or(eq(follows.followerUserId, userRow.id), eq(follows.followedUserId, userRow.id)));
    await app.db
      .delete(ratingLedger)
      .where(or(eq(ratingLedger.playerUserId, userRow.id), eq(ratingLedger.opponentUserId, userRow.id)));
    await app.db.delete(authSessions).where(eq(authSessions.userId, userRow.id));
    await app.db.delete(loginAttempts).where(eq(loginAttempts.nickname, userRow.nickname));
    await app.db.delete(users).where(eq(users.id, userRow.id));

    await ensureBootstrapAdmin(app.db);
    return reply.status(204).send();
  });
}
