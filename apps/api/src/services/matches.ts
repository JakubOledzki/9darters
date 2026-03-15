import { randomUUID } from "node:crypto";
import {
  applyMatchRating,
  beginLiveMatch,
  buildTournamentStandings,
  commitTurn,
  createInitialMatchState,
  generateRoundRobinPairings,
  getMatchWinner,
  removeLastPendingThrow,
  pushThrow,
  type MatchConfig,
  type MatchState,
  type PlayerDescriptor,
  type ThrowInput
} from "@9darters/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";
import type { Database } from "../db/client.js";
import {
  follows,
  matchEvents,
  matchParticipants,
  matches,
  notifications,
  ratingLedger,
  tournamentParticipants,
  tournaments,
  users
} from "../db/schema.js";

function nowIso() {
  return new Date().toISOString();
}

export async function loadMatchBundle(db: Database, matchId: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) {
    return null;
  }

  const participants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(matchParticipants.orderIndex);

  return { match, participants };
}

export async function appendMatchEvent(
  db: Database,
  matchId: string,
  eventType: string,
  actorParticipantId: string | null,
  payload: Record<string, unknown>
) {
  await db.insert(matchEvents).values({
    id: randomUUID(),
    matchId,
    actorParticipantId,
    eventType,
    payload,
    createdAt: nowIso()
  });
}

export async function persistMatchState(
  db: Database,
  matchId: string,
  state: MatchState,
  winnerParticipantId?: string | null
) {
  await db
    .update(matches)
    .set({
      status: state.status,
      stateJson: state,
      currentPlayerIndex: state.currentPlayerIndex,
      starterIndex: state.starterIndex,
      winnerParticipantId: winnerParticipantId ?? null,
      startedAt: state.startedAt ?? null,
      finishedAt: state.finishedAt ?? null,
      updatedAt: nowIso()
    })
    .where(eq(matches.id, matchId));
}

export async function createMatchRecord(
  db: Database,
  config: MatchConfig,
  players: PlayerDescriptor[],
  participantSeed: Array<{
    id: string;
    userId?: string | null;
    displayName: string;
    orderIndex: number;
    status: "pending" | "accepted" | "declined";
    acceptedAt?: string | null;
  }>
) {
  const starterIndex = Math.floor(Math.random() * players.length);
  const state = createInitialMatchState(config, players, starterIndex);
  const id = state.id;
  const timestamp = nowIso();

  await db.insert(matches).values({
    id,
    name: config.name,
    mode: config.mode,
    kind: config.kind,
    status: state.status,
    isRanking: config.isRanking,
    countingMode: config.countingMode,
    playMode: config.playMode,
    doubleOut: config.doubleOut,
    legsToWin: config.legsToWin,
    setsToWin: config.setsToWin,
    createdByUserId: config.createdByUserId,
    tournamentId: config.tournamentId ?? null,
    currentPlayerIndex: state.currentPlayerIndex,
    starterIndex: state.starterIndex,
    winnerParticipantId: null,
    configJson: state.config,
    stateJson: state,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: state.startedAt,
    finishedAt: null
  });

  await db.insert(matchParticipants).values(
    participantSeed.map((participant) => ({
      id: participant.id,
      matchId: id,
      userId: participant.userId ?? null,
      displayName: participant.displayName,
      orderIndex: participant.orderIndex,
      status: participant.status,
      acceptedAt: participant.acceptedAt ?? null,
      joinedAt: null,
      createdAt: timestamp
    }))
  );

  await appendMatchEvent(db, id, "match_created", participantSeed[0]?.id ?? null, {
    config
  });

  return { id, state };
}

export function canUserParticipate(participants: Array<{ userId: string | null }>, userId: string) {
  return participants.some((participant) => participant.userId === userId);
}

export function findParticipantIdForUser(
  participants: Array<{ id: string; userId: string | null }>,
  userId: string
) {
  return participants.find((participant) => participant.userId === userId)?.id ?? null;
}

export async function markParticipantJoined(db: Database, participantId: string) {
  await db
    .update(matchParticipants)
    .set({ joinedAt: nowIso() })
    .where(eq(matchParticipants.id, participantId));
}

export async function maybeStartMatch(db: Database, io: SocketIOServer, matchId: string) {
  const bundle = await loadMatchBundle(db, matchId);
  if (!bundle) {
    return null;
  }

  if (bundle.match.playMode === "stationary" && bundle.match.kind !== "offline") {
    if (bundle.match.status === "ready" || bundle.match.status === "accepted") {
      const started = beginLiveMatch(bundle.match.stateJson);
      await persistMatchState(db, matchId, started);
      io.to(`match:${matchId}`).emit("match:update", started);
      return started;
    }

    return bundle.match.stateJson;
  }

  const participantCount = bundle.participants.filter((entry) => entry.userId).length;
  const joinedCount = bundle.participants.filter((entry) => entry.userId && entry.joinedAt).length;
  if (participantCount === 0 || joinedCount < participantCount) {
    return bundle.match.stateJson;
  }

  if (bundle.match.status === "ready" || bundle.match.status === "accepted" || bundle.match.kind === "offline") {
    const started = beginLiveMatch(bundle.match.stateJson);
    await persistMatchState(db, matchId, started);
    io.to(`match:${matchId}`).emit("match:update", started);
    return started;
  }

  return bundle.match.stateJson;
}

async function notifyFollowersForMatch(
  db: Database,
  params: {
    matchId: string;
    title: string;
    body: string;
    participantUserIds: string[];
    entityType: string;
  }
) {
  const followerRows = await db
    .select({
      followerUserId: follows.followerUserId
    })
    .from(follows)
    .where(inArray(follows.followedUserId, params.participantUserIds));

  const uniqueFollowers = [...new Set(followerRows.map((row) => row.followerUserId))];
  if (uniqueFollowers.length === 0) {
    return;
  }

  await db.insert(notifications).values(
    uniqueFollowers.map((userId) => ({
      id: randomUUID(),
      userId,
      type: "match_result",
      title: params.title,
      body: params.body,
      entityType: params.entityType,
      entityId: params.matchId,
      isRead: false,
      createdAt: nowIso()
    }))
  );
}

export async function applyRatingAndNotifications(db: Database, matchId: string) {
  const bundle = await loadMatchBundle(db, matchId);
  if (!bundle || !bundle.match.isRanking) {
    return;
  }

  const winner = getMatchWinner(bundle.match.stateJson);
  if (!winner?.userId) {
    return;
  }

  const loser = bundle.match.stateJson.players.find((player) => player.userId && player.userId !== winner.userId);
  if (!loser?.userId) {
    return;
  }

  const [winnerUser] = await db.select().from(users).where(eq(users.id, winner.userId)).limit(1);
  const [loserUser] = await db.select().from(users).where(eq(users.id, loser.userId)).limit(1);
  if (!winnerUser || !loserUser) {
    return;
  }

  const { delta, winnerAfter, loserAfter } = applyMatchRating(winnerUser.rating, loserUser.rating);
  await db.update(users).set({ rating: winnerAfter }).where(eq(users.id, winner.userId));
  await db.update(users).set({ rating: loserAfter }).where(eq(users.id, loser.userId));
  await db.insert(ratingLedger).values([
    {
      id: randomUUID(),
      playerUserId: winner.userId,
      opponentUserId: loser.userId,
      matchId,
      delta,
      ratingBefore: winnerUser.rating,
      ratingAfter: winnerAfter,
      createdAt: nowIso()
    },
    {
      id: randomUUID(),
      playerUserId: loser.userId,
      opponentUserId: winner.userId,
      matchId,
      delta: -delta,
      ratingBefore: loserUser.rating,
      ratingAfter: loserAfter,
      createdAt: nowIso()
    }
  ]);

  await notifyFollowersForMatch(db, {
    matchId,
    title: `Wynik meczu rankingowego: ${bundle.match.name}`,
    body: `${winner.name} pokonal ${loser.name} i zdobyl ${delta} dRating.`,
    participantUserIds: [winner.userId, loser.userId],
    entityType: bundle.match.tournamentId ? "tournament_match" : "match"
  });

  if (bundle.match.tournamentId) {
    const tournamentMatches = await db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, bundle.match.tournamentId));

    const unfinished = tournamentMatches.some((entry) => entry.status !== "finished");
    await db
      .update(tournaments)
      .set({ status: unfinished ? "live" : "finished", updatedAt: nowIso() })
      .where(eq(tournaments.id, bundle.match.tournamentId));
  }
}

export async function resolveTournamentStandings(db: Database, tournamentId: string) {
  const participants = await db
    .select()
    .from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, tournamentId));
  const tournamentMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .orderBy(desc(matches.createdAt));

  const summaries = tournamentMatches.map((match) => {
    const state = match.stateJson;
    return {
      matchId: match.id,
      homeParticipantId: state.players[0]?.participantId ?? "",
      awayParticipantId: state.players[1]?.participantId ?? "",
      homeSets: state.players[0]?.setsWon ?? 0,
      awaySets: state.players[1]?.setsWon ?? 0,
      homeLegs: state.players[0]?.totalLegsWon ?? 0,
      awayLegs: state.players[1]?.totalLegsWon ?? 0,
      homeAverage: state.players[0]?.stats.threeDartAverage ?? 0,
      awayAverage: state.players[1]?.stats.threeDartAverage ?? 0,
      winnerParticipantId:
        state.winnerIndex === null ? null : state.players[state.winnerIndex]?.participantId ?? null,
      status: match.status
    };
  });

  return buildTournamentStandings(
    participants.map((participant) => participant.id),
    summaries
  );
}

export async function createTournamentMatches(db: Database, tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    return [];
  }

  const participants = await db
    .select()
    .from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, tournamentId))
    .orderBy(tournamentParticipants.createdAt);

  const pairings = generateRoundRobinPairings(participants.map((participant) => participant.id));
  const createdMatches: string[] = [];

  for (const [index, pairing] of pairings.entries()) {
    const home = participants.find((entry) => entry.id === pairing.homeParticipantId);
    const away = participants.find((entry) => entry.id === pairing.awayParticipantId);
    if (!home || !away) {
      continue;
    }

    const participantDefs: PlayerDescriptor[] = [
      { id: home.id, userId: home.userId, name: home.displayName, kind: "registered" },
      { id: away.id, userId: away.userId, name: away.displayName, kind: "registered" }
    ];

    const participantSeed = [
      {
        id: home.id,
        userId: home.userId,
        displayName: home.displayName,
        orderIndex: 0,
        status: "accepted" as const,
        acceptedAt: home.acceptedAt ?? nowIso()
      },
      {
        id: away.id,
        userId: away.userId,
        displayName: away.displayName,
        orderIndex: 1,
        status: "accepted" as const,
        acceptedAt: away.acceptedAt ?? nowIso()
      }
    ];

    const { id } = await createMatchRecord(
      db,
      {
        name: `${tournament.name} - mecz ${index + 1}`,
        mode: tournament.mode,
        kind: "tournament",
        createdByUserId: tournament.createdByUserId,
        isRanking: tournament.isRanking,
        countingMode: tournament.countingMode,
        playMode: tournament.playMode,
        doubleOut: tournament.doubleOut,
        legsToWin: tournament.legsToWin,
        setsToWin: tournament.setsToWin,
        tournamentId
      },
      participantDefs,
      participantSeed
    );
    await db.update(matches).set({ status: "ready" }).where(eq(matches.id, id));
    createdMatches.push(id);
  }

  await db.update(tournaments).set({ status: "ready", updatedAt: nowIso() }).where(eq(tournaments.id, tournamentId));
  return createdMatches;
}

export async function registerThrow(
  db: Database,
  io: SocketIOServer,
  matchId: string,
  userId: string,
  entry: ThrowInput
) {
  const bundle = await loadMatchBundle(db, matchId);
  if (!bundle) {
    throw new Error("MATCH_NOT_FOUND");
  }

  const participant = bundle.participants.find((item) => item.userId === userId);
  const state = bundle.match.stateJson;
  const canControlStationary = bundle.match.playMode === "stationary" && bundle.match.createdByUserId === userId;
  if ((!participant && !canControlStationary) || state.status !== "live") {
    throw new Error("TURN_NOT_ALLOWED");
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!canControlStationary && currentPlayer?.participantId !== participant?.id) {
    throw new Error("TURN_NOT_ALLOWED");
  }

  const nextState = pushThrow(state, entry);
  await persistMatchState(db, matchId, nextState, bundle.match.winnerParticipantId);
  await appendMatchEvent(db, matchId, "turn_throw", participant?.id ?? null, { throw: entry });
  io.to(`match:${matchId}`).emit("match:update", nextState);
  return nextState;
}

export async function commitCurrentTurn(
  db: Database,
  io: SocketIOServer,
  matchId: string,
  userId: string
) {
  const bundle = await loadMatchBundle(db, matchId);
  if (!bundle) {
    throw new Error("MATCH_NOT_FOUND");
  }

  const participant = bundle.participants.find((item) => item.userId === userId);
  const state = bundle.match.stateJson;
  const canControlStationary = bundle.match.playMode === "stationary" && bundle.match.createdByUserId === userId;
  if ((!participant && !canControlStationary) || state.status !== "live") {
    throw new Error("TURN_NOT_ALLOWED");
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!canControlStationary && currentPlayer?.participantId !== participant?.id) {
    throw new Error("TURN_NOT_ALLOWED");
  }

  const nextState = commitTurn(state);
  const winnerParticipantId =
    nextState.winnerIndex === null ? null : nextState.players[nextState.winnerIndex]?.participantId ?? null;
  await persistMatchState(db, matchId, nextState, winnerParticipantId);
  await appendMatchEvent(db, matchId, "turn_commit", participant?.id ?? null, {
    pendingThrows: state.pendingThrows
  });

  if (nextState.status === "finished") {
    await applyRatingAndNotifications(db, matchId);
    io.to(`match:${matchId}`).emit("match:finish", nextState);
  } else {
    io.to(`match:${matchId}`).emit("match:update", nextState);
  }

  return nextState;
}

export async function undoPendingThrow(
  db: Database,
  io: SocketIOServer,
  matchId: string,
  userId: string
) {
  const bundle = await loadMatchBundle(db, matchId);
  if (!bundle) {
    throw new Error("MATCH_NOT_FOUND");
  }

  const participant = bundle.participants.find((item) => item.userId === userId);
  const state = bundle.match.stateJson;
  const canControlStationary = bundle.match.playMode === "stationary" && bundle.match.createdByUserId === userId;
  if ((!participant && !canControlStationary) || state.status !== "live") {
    throw new Error("TURN_NOT_ALLOWED");
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!canControlStationary && currentPlayer?.participantId !== participant?.id) {
    throw new Error("TURN_NOT_ALLOWED");
  }

  const nextState = removeLastPendingThrow(state);
  await persistMatchState(db, matchId, nextState, bundle.match.winnerParticipantId);
  await appendMatchEvent(db, matchId, "turn_undo", participant?.id ?? null, {
    pendingThrows: nextState.pendingThrows
  });
  io.to(`match:${matchId}`).emit("match:update", nextState);
  return nextState;
}

export async function listLiveMatches(db: Database) {
  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.status, "live"), inArray(matches.kind, ["duel", "tournament"])))
    .orderBy(desc(matches.updatedAt));

  return rows.map((match) => ({
    id: match.id,
    name: match.name,
    mode: match.mode,
    kind: match.kind,
    playMode: match.playMode,
    updatedAt: match.updatedAt,
    players: match.stateJson.players.map((player) => ({
      name: player.name,
      score: match.mode === "501" || match.mode === "301" ? player.x01Score : player.cricketPoints,
      setsWon: player.setsWon,
      legsWon: player.legsWon
    }))
  }));
}
