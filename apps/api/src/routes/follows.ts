import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { follows, users } from "../db/schema.js";
import { requireUser } from "../lib/auth.js";

export async function followRoutes(app: FastifyInstance) {
  app.get("/api/follows", async (request) => {
    const user = requireUser(request);
    const rows = await app.db
      .select({
        id: users.id,
        nickname: users.nickname,
        firstName: users.firstName,
        lastName: users.lastName,
        rating: users.rating,
        createdAt: follows.createdAt
      })
      .from(follows)
      .innerJoin(users, eq(follows.followedUserId, users.id))
      .where(eq(follows.followerUserId, user.id))
      .orderBy(desc(follows.createdAt));

    return { follows: rows };
  });

  app.post("/api/follows", async (request, reply) => {
    const user = requireUser(request);
    const body = z.object({ followedUserId: z.string().uuid() }).parse(request.body);
    if (body.followedUserId === user.id) {
      return reply.status(400).send({ error: "SELF_FOLLOW_NOT_ALLOWED" });
    }

    await app.db
      .insert(follows)
      .values({
        followerUserId: user.id,
        followedUserId: body.followedUserId,
        createdAt: new Date().toISOString()
      })
      .onDuplicateKeyUpdate({
        set: {
          createdAt: new Date().toISOString()
        }
      });

    return reply.status(201).send({ ok: true });
  });

  app.delete("/api/follows/:followedUserId", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ followedUserId: z.string().uuid() }).parse(request.params);
    await app.db
      .delete(follows)
      .where(and(eq(follows.followerUserId, user.id), eq(follows.followedUserId, params.followedUserId)));
    return reply.status(204).send();
  });
}
