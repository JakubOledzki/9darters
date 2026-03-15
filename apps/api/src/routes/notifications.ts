import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notifications } from "../db/schema.js";
import { requireUser } from "../lib/auth.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications", async (request) => {
    const user = requireUser(request);
    const rows = await app.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return { notifications: rows };
  });

  app.post("/api/notifications/:notificationId/read", async (request, reply) => {
    const user = requireUser(request);
    const params = z.object({ notificationId: z.string().uuid() }).parse(request.params);
    await app.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, params.notificationId), eq(notifications.userId, user.id)));
    return reply.status(204).send();
  });
}
