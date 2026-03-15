import { desc, eq, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { matchParticipants, matches, tournaments, trainingSessions } from "../db/schema.js";
import { requireUser } from "../lib/auth.js";

export async function historyRoutes(app: FastifyInstance) {
  app.get("/api/history", async (request) => {
    const user = requireUser(request);
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50)
      })
      .parse(request.query);

    const matchRows = await app.db
      .select({
        id: matches.id,
        name: matches.name,
        mode: matches.mode,
        kind: matches.kind,
        status: matches.status,
        playMode: matches.playMode,
        isRanking: matches.isRanking,
        updatedAt: matches.updatedAt,
        stateJson: matches.stateJson
      })
      .from(matches)
      .innerJoin(matchParticipants, eq(matches.id, matchParticipants.matchId))
      .where(or(eq(matchParticipants.userId, user.id), eq(matches.createdByUserId, user.id)))
      .orderBy(desc(matches.updatedAt))
      .limit(query.limit * 4);

    const seenMatches = new Set<string>();
    const uniqueMatches = matchRows.filter((row) => {
      if (seenMatches.has(row.id)) {
        return false;
      }

      seenMatches.add(row.id);
      return true;
    });

    const tournamentRows = await app.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.createdByUserId, user.id))
      .orderBy(desc(tournaments.updatedAt))
      .limit(20);

    const trainingRows = await app.db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, user.id))
      .orderBy(desc(trainingSessions.updatedAt))
      .limit(20);

    return {
      matches: uniqueMatches.slice(0, query.limit),
      tournaments: tournamentRows,
      trainingSessions: trainingRows
    };
  });
}
