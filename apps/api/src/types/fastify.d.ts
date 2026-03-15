import type { FastifyRequest } from "fastify";
import type { Server as SocketIOServer } from "socket.io";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  rating: number;
  isAdmin: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    io: SocketIOServer;
    configValues: AppConfig;
  }

  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export type AuthenticatedRequest = FastifyRequest & { user: SessionUser };
