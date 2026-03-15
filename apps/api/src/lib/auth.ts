import { createHash, randomBytes, randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authSessions, loginAttempts, users } from "../db/schema.js";
import type { Database } from "../db/client.js";
import type { SessionUser } from "../types/fastify.d.ts";

export const MAX_LOGIN_FAILURES = 5;
const LOCK_WINDOW_MINUTES = 15;

function nowIso() {
  return new Date().toISOString();
}

function addHours(hours: number) {
  const value = new Date();
  value.setHours(value.getHours() + hours);
  return value.toISOString();
}

function addDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString();
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}

export async function createSession(db: Database, userId: string, rememberMe: boolean) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const createdAt = nowIso();
  const expiresAt = rememberMe ? addDays(30) : addHours(24);

  await db.insert(authSessions).values({
    id: randomUUID(),
    userId,
    tokenHash,
    rememberMe,
    expiresAt,
    createdAt,
    lastSeenAt: createdAt
  });

  return { token, expiresAt };
}

function shouldUseExplicitCookieDomain(domain: string) {
  if (!domain) {
    return false;
  }

  return domain !== "localhost" && !/^\d{1,3}(\.\d{1,3}){3}$/.test(domain);
}

export function applySessionCookie(
  reply: FastifyReply,
  cookieName: string,
  token: string,
  expiresAt: string,
  domain: string,
  secure: boolean
) {
  reply.setCookie(cookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    ...(shouldUseExplicitCookieDomain(domain) ? { domain } : {}),
    expires: new Date(expiresAt)
  });
}

export function clearSessionCookie(reply: FastifyReply, cookieName: string, domain: string, secure: boolean) {
  reply.clearCookie(cookieName, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    ...(shouldUseExplicitCookieDomain(domain) ? { domain } : {})
  });
}

export async function getUserBySessionToken(db: Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const [session] = await db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      nickname: users.nickname,
      rating: users.rating,
      isAdmin: users.isAdmin
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);

  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return null;
  }

  await db.update(authSessions).set({ lastSeenAt: nowIso() }).where(eq(authSessions.id, session.sessionId));

  return {
    id: session.id,
    firstName: session.firstName,
    lastName: session.lastName,
    nickname: session.nickname,
    rating: session.rating,
    isAdmin: session.isAdmin
  };
}

export async function deleteSessionByToken(db: Database, token: string | undefined) {
  if (!token) {
    return;
  }

  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
}

export async function recordLoginAttempt(db: Database, nickname: string, ipAddress: string, success: boolean) {
  await db.insert(loginAttempts).values({
    id: randomUUID(),
    nickname,
    ipAddress,
    success,
    createdAt: nowIso()
  });
}

export async function isLoginLocked(db: Database, nickname: string) {
  const threshold = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60_000).toISOString();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(sql`${loginAttempts.nickname} = ${nickname} and ${loginAttempts.success} = false and ${loginAttempts.createdAt} >= ${threshold}`);

  return Number(row?.count ?? 0) >= MAX_LOGIN_FAILURES;
}

export async function clearLoginAttempts(db: Database, nickname: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.nickname, nickname));
}

export function requireUser(request: FastifyRequest): SessionUser {
  if (!request.user) {
    throw new Error("UNAUTHORIZED");
  }

  return request.user;
}

export function requireAdmin(request: FastifyRequest): SessionUser {
  const user = requireUser(request);
  if (!user.isAdmin) {
    throw new Error("FORBIDDEN");
  }

  return user;
}

export async function ensureBootstrapAdmin(db: Database) {
  const [adminRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.isAdmin, true));

  if (Number(adminRow?.count ?? 0) > 0) {
    return;
  }

  const [oldestUser] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1);
  if (!oldestUser) {
    return;
  }

  await db.update(users).set({ isAdmin: true }).where(eq(users.id, oldestUser.id));
}
