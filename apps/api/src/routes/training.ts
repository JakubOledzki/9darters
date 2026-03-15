import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { TrainingSummary } from "@9darters/shared";
import { trainingSessions } from "../db/schema.js";
import { requireUser } from "../lib/auth.js";

const trainingSummarySchema = z.object({
  mode: z.enum(["around-the-clock", "doubles-practice", "trebles-practice", "bull-practice"]),
  attempts: z.number().int().min(0),
  hits: z.number().int().min(0),
  hitRate: z.number().min(0).max(100),
  bestStreak: z.number().int().min(0),
  durationSeconds: z.number().int().min(0),
  throwsToFinish: z.number().int().min(0).nullable().optional(),
  attemptsLog: z.array(
    z.object({
      target: z.string(),
      hit: z.boolean(),
      scoredValue: z.number().int().min(0),
      createdAt: z.string()
    })
  )
});

export async function trainingRoutes(app: FastifyInstance) {
  app.get("/api/training/sessions", async (request) => {
    const user = requireUser(request);
    const rows = await app.db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, user.id))
      .orderBy(desc(trainingSessions.updatedAt))
      .limit(50);

    return { sessions: rows };
  });

  app.post("/api/training/sessions", async (request, reply) => {
    const user = requireUser(request);
    const body = trainingSummarySchema.parse(request.body);
    const summary: TrainingSummary = {
      id: randomUUID(),
      userId: user.id,
      ...body,
      throwsToFinish: body.throwsToFinish ?? null,
      createdAt: new Date().toISOString()
    };

    await app.db.insert(trainingSessions).values({
      id: summary.id,
      userId: user.id,
      mode: body.mode,
      status: "finished",
      summaryJson: summary,
      createdAt: summary.createdAt,
      updatedAt: summary.createdAt
    });

    return reply.status(201).send({ session: summary });
  });
}
