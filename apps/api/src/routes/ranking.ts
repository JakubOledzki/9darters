import { desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { users } from "../db/schema.js";

export async function rankingRoutes(app: FastifyInstance) {
  app.get("/api/ranking", async () => {
    const leaderboard = await app.db
      .select({
        id: users.id,
        nickname: users.nickname,
        firstName: users.firstName,
        lastName: users.lastName,
        rating: users.rating
      })
      .from(users)
      .orderBy(desc(users.rating))
      .limit(100);

    return { leaderboard };
  });
}
