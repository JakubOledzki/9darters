import { and, like, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { users } from "../db/schema.js";
import { requireUser } from "../lib/auth.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/api/users/search", async (request) => {
    const user = requireUser(request);
    const querySchema = z.object({
      q: z.string().trim().min(1).max(50)
    });
    const query = querySchema.parse(request.query);

    const results = await app.db
      .select({
        id: users.id,
        nickname: users.nickname,
        firstName: users.firstName,
        lastName: users.lastName,
        rating: users.rating
      })
      .from(users)
      .where(and(like(users.nickname, `%${query.q}%`), ne(users.id, user.id)))
      .limit(10);

    return { results };
  });
}
