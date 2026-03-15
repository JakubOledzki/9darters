import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { users } from "../db/schema.js";
import {
  applySessionCookie,
  clearLoginAttempts,
  clearSessionCookie,
  createSession,
  deleteSessionByToken,
  hashPassword,
  isLoginLocked,
  recordLoginAttempt,
  verifyPassword
} from "../lib/auth.js";

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  nickname: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(128)
});

const loginSchema = z.object({
  nickname: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().default(false)
});

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", async (request) => ({
    user: request.user
  }));

  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const [existing] = await app.db.select().from(users).where(eq(users.nickname, body.nickname)).limit(1);
    if (existing) {
      return reply.status(409).send({ error: "NICKNAME_TAKEN" });
    }

    const [adminCountRow] = await app.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.isAdmin, true));
    const isAdmin = Number(adminCountRow?.count ?? 0) === 0;

    const id = randomUUID();
    const passwordHash = await hashPassword(body.password);
    await app.db.insert(users).values({
      id,
      firstName: body.firstName,
      lastName: body.lastName,
      nickname: body.nickname,
      passwordHash,
      rating: 500,
      isAdmin,
      createdAt: new Date().toISOString()
    });

    const session = await createSession(app.db, id, true);
    applySessionCookie(
      reply,
      app.configValues.sessionCookieName,
      session.token,
      session.expiresAt,
      app.configValues.cookieDomain,
      app.configValues.cookieSecure
    );

    return reply.status(201).send({
      user: {
        id,
        firstName: body.firstName,
        lastName: body.lastName,
        nickname: body.nickname,
        rating: 500,
        isAdmin
      }
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const clientIp = request.ip;
    const locked = await isLoginLocked(app.db, body.nickname);
    if (locked) {
      return reply.status(429).send({ error: "LOGIN_LOCKED" });
    }

    const [user] = await app.db.select().from(users).where(eq(users.nickname, body.nickname)).limit(1);
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      await recordLoginAttempt(app.db, body.nickname, clientIp, false);
      return reply.status(401).send({ error: "INVALID_CREDENTIALS" });
    }

    await clearLoginAttempts(app.db, body.nickname);
    await recordLoginAttempt(app.db, body.nickname, clientIp, true);

    const session = await createSession(app.db, user.id, body.rememberMe);
    applySessionCookie(
      reply,
      app.configValues.sessionCookieName,
      session.token,
      session.expiresAt,
      app.configValues.cookieDomain,
      app.configValues.cookieSecure
    );

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        nickname: user.nickname,
        rating: user.rating,
        isAdmin: user.isAdmin
      }
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await deleteSessionByToken(app.db, request.cookies[app.configValues.sessionCookieName]);
    clearSessionCookie(
      reply,
      app.configValues.sessionCookieName,
      app.configValues.cookieDomain,
      app.configValues.cookieSecure
    );
    return reply.status(204).send();
  });
}
