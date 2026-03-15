import { parse } from "cookie";
import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { getUserBySessionToken } from "../lib/auth.js";
import { logRankingMatchActivity } from "../lib/rankingActivityLogger.js";
import {
  findParticipantIdForUser,
  loadMatchBundle,
  markParticipantJoined,
  maybeStartMatch,
  registerThrow,
  commitCurrentTurn,
  undoPendingThrow
} from "../services/matches.js";

export function createRealtime(app: FastifyInstance) {
  const io = new SocketIOServer(app.server, {
    cors: {
      origin: app.configValues.appOrigin,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    const cookies = parse(socket.handshake.headers.cookie ?? "");
    const token = cookies[app.configValues.sessionCookieName];
    const user = await getUserBySessionToken(app.db, token);
    if (!user) {
      return next(new Error("UNAUTHORIZED"));
    }

    socket.data.user = user;
    return next();
  });

  async function emitViewerCount(matchId: string) {
    const roomSockets = await io.in(`match:${matchId}`).fetchSockets();
    const count = roomSockets.filter((entry) => entry.data.livePresence?.matchId === matchId && entry.data.livePresence?.spectator)
      .length;
    io.to(`match:${matchId}`).emit("match:viewers", { count });
  }

  io.on("connection", (socket) => {
    async function joinMatchRoom(matchId: string, spectator: boolean) {
      const previousMatchId = socket.data.livePresence?.matchId as string | undefined;
      if (previousMatchId && previousMatchId !== matchId) {
        socket.leave(`match:${previousMatchId}`);
        await emitViewerCount(previousMatchId);
      }

      socket.data.livePresence = { matchId, spectator };
      socket.join(`match:${matchId}`);
      await emitViewerCount(matchId);
    }

    socket.on("match:join", async (payload: { matchId: string; spectator?: boolean }) => {
      const user = socket.data.user;
      const bundle = await loadMatchBundle(app.db, payload.matchId);
      if (!bundle) {
        socket.emit("match:error", { message: "MATCH_NOT_FOUND" });
        return;
      }

      const participantId = findParticipantIdForUser(bundle.participants, user.id);
      if (!payload.spectator && !participantId) {
        socket.emit("match:error", { message: "FORBIDDEN" });
        return;
      }

      if (bundle.match.kind === "offline" && payload.spectator) {
        socket.emit("match:error", { message: "OFFLINE_NO_SPECTATORS" });
        return;
      }

      await joinMatchRoom(payload.matchId, Boolean(payload.spectator));
      if (participantId) {
        await markParticipantJoined(app.db, participantId);
      }
      await logRankingMatchActivity(
        {
          id: bundle.match.id,
          name: bundle.match.name,
          mode: bundle.match.mode,
          kind: bundle.match.kind,
          playMode: bundle.match.playMode,
          status: bundle.match.status,
          isRanking: bundle.match.isRanking,
          tournamentId: bundle.match.tournamentId
        },
        payload.spectator ? "spectator_joined" : "participant_joined",
        {
          userId: user.id,
          nickname: user.nickname,
          participantId,
          spectator: Boolean(payload.spectator)
        }
      );
      const started = await maybeStartMatch(app.db, io, payload.matchId);
      socket.emit("match:snapshot", started);
    });

    socket.on("spectator:join", async (payload: { matchId: string }) => {
      const bundle = await loadMatchBundle(app.db, payload.matchId);
      if (!bundle || bundle.match.kind === "offline") {
        socket.emit("match:error", { message: "MATCH_NOT_FOUND" });
        return;
      }

      await joinMatchRoom(payload.matchId, true);
      await logRankingMatchActivity(
        {
          id: bundle.match.id,
          name: bundle.match.name,
          mode: bundle.match.mode,
          kind: bundle.match.kind,
          playMode: bundle.match.playMode,
          status: bundle.match.status,
          isRanking: bundle.match.isRanking,
          tournamentId: bundle.match.tournamentId
        },
        "spectator_joined",
        {
          userId: socket.data.user.id,
          nickname: socket.data.user.nickname,
          spectator: true
        }
      );
      socket.emit("match:snapshot", bundle.match.stateJson);
    });

    socket.on("match:leave", async (payload: { matchId: string }) => {
      if (socket.data.livePresence?.matchId !== payload.matchId) {
        return;
      }

      socket.leave(`match:${payload.matchId}`);
      socket.data.livePresence = undefined;
      await emitViewerCount(payload.matchId);
    });

    socket.on("turn:throw", async (payload: { matchId: string; throw: Record<string, unknown> }) => {
      try {
        const state = await registerThrow(app.db, io, payload.matchId, socket.data.user.id, payload.throw);
        socket.emit("match:snapshot", state);
      } catch (error) {
        socket.emit("match:error", { message: error instanceof Error ? error.message : "TURN_NOT_ALLOWED" });
      }
    });

    socket.on("turn:commit", async (payload: { matchId: string }) => {
      try {
        const state = await commitCurrentTurn(app.db, io, payload.matchId, socket.data.user.id);
        socket.emit("match:snapshot", state);
      } catch (error) {
        socket.emit("match:error", { message: error instanceof Error ? error.message : "TURN_NOT_ALLOWED" });
      }
    });

    socket.on("turn:undo", async (payload: { matchId: string }) => {
      try {
        const state = await undoPendingThrow(app.db, io, payload.matchId, socket.data.user.id);
        socket.emit("match:snapshot", state);
      } catch (error) {
        socket.emit("match:error", { message: error instanceof Error ? error.message : "TURN_NOT_ALLOWED" });
      }
    });

    socket.on("disconnect", async () => {
      const matchId = socket.data.livePresence?.matchId as string | undefined;
      socket.data.livePresence = undefined;
      if (matchId) {
        await emitViewerCount(matchId);
      }
    });
  });

  return io;
}
