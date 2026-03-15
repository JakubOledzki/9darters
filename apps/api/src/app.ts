import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { db } from "./db/client.js";
import { ensureBootstrapAdmin, getUserBySessionToken } from "./lib/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { followRoutes } from "./routes/follows.js";
import { historyRoutes } from "./routes/history.js";
import { matchRoutes } from "./routes/matches.js";
import { notificationRoutes } from "./routes/notifications.js";
import { rankingRoutes } from "./routes/ranking.js";
import { tournamentRoutes } from "./routes/tournaments.js";
import { trainingRoutes } from "./routes/training.js";
import { userRoutes } from "./routes/users.js";
import { createRealtime } from "./realtime/socket.js";

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.decorate("db", db);
  app.decorate("configValues", config);
  app.decorateRequest("user", null);

  await ensureBootstrapAdmin(app.db);

  await app.register(cookie);
  await app.register(cors, {
    origin: config.appOrigin,
    credentials: true
  });

  app.addHook("preHandler", async (request) => {
    request.user = await getUserBySessionToken(app.db, request.cookies[config.sessionCookieName]);
  });

  app.get("/api/health", async () => ({
    ok: true
  }));

  await authRoutes(app);
  await userRoutes(app);
  await followRoutes(app);
  await notificationRoutes(app);
  await rankingRoutes(app);
  await historyRoutes(app);
  await trainingRoutes(app);
  await matchRoutes(app);
  await tournamentRoutes(app);
  await adminRoutes(app);

  const io = createRealtime(app);
  app.decorate("io", io);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return reply.status(401).send({ error: "UNAUTHORIZED" });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return reply.status(403).send({ error: "FORBIDDEN" });
    }

    if (typeof error === "object" && error !== null && "statusCode" in error) {
      const statusCode =
        typeof error.statusCode === "number" && Number.isFinite(error.statusCode) ? error.statusCode : 500;
      const errorCode = "code" in error && typeof error.code === "string" ? error.code : "REQUEST_ERROR";
      return reply.status(statusCode).send({ error: errorCode });
    }

    app.log.error(error);
    return reply.status(500).send({ error: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}
