import type {
  MatchConfig,
  MatchPlayerState,
  MatchState,
  PlayerDescriptor,
  PlayerStats,
  ThrowInput,
  TurnHistory
} from "../types.js";

const CRICKET_TARGETS = ["15", "16", "17", "18", "19", "20", "25"] as const;

function createEmptyStats(): PlayerStats {
  return {
    dartsThrown: 0,
    totalScored: 0,
    turn50Plus: 0,
    turn100Plus: 0,
    turn180: 0,
    busts: 0,
    checkouts: 0,
    highestCheckout: 0,
    highestScore: 0,
    threeDartAverage: 0
  };
}

function createPlayerState(player: PlayerDescriptor, order: number, mode: MatchConfig["mode"]): MatchPlayerState {
  return {
    participantId: player.id,
    userId: player.userId ?? null,
    name: player.name,
    order,
    setsWon: 0,
    legsWon: 0,
    totalLegsWon: 0,
    x01Score: mode === "501" ? 501 : mode === "301" ? 301 : 0,
    cricketPoints: 0,
    cricketMarks: Object.fromEntries(CRICKET_TARGETS.map((key) => [key, 0])),
    atcTarget: 1,
    finishedAtThrow: null,
    stats: createEmptyStats()
  };
}

function scoreThrow(entry: ThrowInput): number {
  if (typeof entry.score === "number") {
    return entry.score;
  }

  if (!entry.segment) {
    return 0;
  }

  if (entry.segment === 25) {
    return entry.multiplier === 2 ? 50 : 25;
  }

  return entry.segment * (entry.multiplier ?? 1);
}

function normalizeThrow(entry: ThrowInput): ThrowInput {
  const multiplier = entry.multiplier ?? 1;
  const label =
    entry.label ??
    (typeof entry.score === "number"
      ? `Suma ${entry.score}`
      : entry.segment === 25
        ? multiplier === 2
          ? "Bull"
          : "Outer Bull"
        : `${multiplier === 3 ? "T" : multiplier === 2 ? "D" : "S"}${entry.segment ?? 0}`);

  return {
    ...entry,
    multiplier,
    label,
    score: typeof entry.score === "number" ? entry.score : undefined
  };
}

function countDarts(throws: ThrowInput[], fallback: number) {
  const explicit = throws.reduce((sum, entry) => sum + (entry.dartsUsed ?? 0), 0);
  return explicit > 0 ? explicit : fallback;
}

function refreshAverage(player: MatchPlayerState) {
  const darts = player.stats.dartsThrown;
  player.stats.threeDartAverage = darts > 0 ? Number(((player.stats.totalScored * 3) / darts).toFixed(2)) : 0;
}

function updateTurnBuckets(player: MatchPlayerState, total: number) {
  if (total === 180) {
    player.stats.turn180 += 1;
  } else if (total >= 100) {
    player.stats.turn100Plus += 1;
  } else if (total >= 50) {
    player.stats.turn50Plus += 1;
  }

  if (total > player.stats.highestScore) {
    player.stats.highestScore = total;
  }
}

function rotatePlayer(state: MatchState) {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber += 1;
}

function resetLeg(state: MatchState) {
  state.currentLeg += 1;
  state.pendingThrows = [];
  state.players = state.players.map((player) => ({
    ...player,
    x01Score: state.config.mode === "501" ? 501 : 301,
    cricketPoints: 0,
    cricketMarks: Object.fromEntries(CRICKET_TARGETS.map((key) => [key, 0])),
    atcTarget: 1,
    finishedAtThrow: null
  }));
  state.starterIndex = (state.starterIndex + 1) % state.players.length;
  state.currentPlayerIndex = state.starterIndex;
}

function finishMatch(state: MatchState, winnerIndex: number) {
  state.status = "finished";
  state.winnerIndex = winnerIndex;
  state.finishedAt = new Date().toISOString();
  state.pendingThrows = [];
}

function winLegOrMatch(state: MatchState, winnerIndex: number, checkoutValue: number) {
  const player = state.players[winnerIndex];
  player.legsWon += 1;
  player.totalLegsWon += 1;
  player.stats.checkouts += 1;
  player.stats.highestCheckout = Math.max(player.stats.highestCheckout, checkoutValue);

  if (player.legsWon >= state.config.legsToWin) {
    player.setsWon += 1;
    if (player.setsWon >= state.config.setsToWin) {
      finishMatch(state, winnerIndex);
      return;
    }

    for (const entry of state.players) {
      entry.legsWon = 0;
    }
  }

  resetLeg(state);
}

function commitX01Turn(state: MatchState): { total: number; busted: boolean; checkout: boolean } {
  const player = state.players[state.currentPlayerIndex];
  const startScore = player.x01Score;
  const total = state.pendingThrows.reduce((sum, entry) => sum + scoreThrow(entry), 0);
  const dartsUsed = countDarts(state.pendingThrows, state.config.countingMode === "default" ? 3 : state.pendingThrows.length || 3);
  player.stats.dartsThrown += dartsUsed;

  const projected = startScore - total;
  const lastThrow = state.pendingThrows[state.pendingThrows.length - 1];
  const validDoubleOut = !state.config.doubleOut || lastThrow?.multiplier === 2;

  if (projected < 0 || (state.config.doubleOut && projected === 1) || (projected === 0 && !validDoubleOut)) {
    player.stats.busts += 1;
    refreshAverage(player);
    rotatePlayer(state);
    return { total, busted: true, checkout: false };
  }

  player.x01Score = projected;
  player.stats.totalScored += total;
  updateTurnBuckets(player, total);
  refreshAverage(player);

  if (projected === 0) {
    winLegOrMatch(state, state.currentPlayerIndex, startScore);
    return { total, busted: false, checkout: true };
  }

  rotatePlayer(state);
  return { total, busted: false, checkout: false };
}

function commitCricketTurn(state: MatchState): { total: number; busted: boolean; checkout: boolean } {
  const player = state.players[state.currentPlayerIndex];
  const opponent = state.players[(state.currentPlayerIndex + 1) % state.players.length];
  let scored = 0;
  const dartsUsed = countDarts(state.pendingThrows, state.pendingThrows.length || 3);
  player.stats.dartsThrown += dartsUsed;

  for (const entry of state.pendingThrows) {
    const segment = entry.segment ?? 0;
    if (!CRICKET_TARGETS.includes(String(segment) as (typeof CRICKET_TARGETS)[number])) {
      continue;
    }

    const marks = entry.multiplier ?? 1;
    const key = String(segment);
    const currentMarks = player.cricketMarks[key] ?? 0;
    const available = Math.max(0, 3 - currentMarks);
    const closingMarks = Math.min(available, marks);
    const overflow = marks - closingMarks;
    player.cricketMarks[key] = Math.min(3, currentMarks + marks);

    if (overflow > 0 && (opponent.cricketMarks[key] ?? 0) < 3) {
      scored += overflow * (segment === 25 ? 25 : segment);
    }
  }

  player.cricketPoints += scored;
  player.stats.totalScored += scored;
  updateTurnBuckets(player, scored);
  refreshAverage(player);

  const closedAll = CRICKET_TARGETS.every((target) => (player.cricketMarks[target] ?? 0) >= 3);
  const leading = player.cricketPoints >= opponent.cricketPoints;

  if (closedAll && leading) {
    finishMatch(state, state.currentPlayerIndex);
    return { total: scored, busted: false, checkout: true };
  }

  rotatePlayer(state);
  return { total: scored, busted: false, checkout: false };
}

function commitAroundTheClockTurn(state: MatchState): { total: number; busted: boolean; checkout: boolean } {
  const player = state.players[state.currentPlayerIndex];
  let hits = 0;
  const dartsUsed = countDarts(state.pendingThrows, state.pendingThrows.length || 3);
  player.stats.dartsThrown += dartsUsed;

  for (const entry of state.pendingThrows) {
    if ((entry.segment ?? 0) === player.atcTarget) {
      player.atcTarget += 1;
      hits += 1;
      if (player.atcTarget > 20) {
        player.finishedAtThrow = hits;
        player.stats.totalScored += 20;
        refreshAverage(player);
        finishMatch(state, state.currentPlayerIndex);
        return { total: hits, busted: false, checkout: true };
      }
    }
  }

  player.stats.totalScored += hits;
  refreshAverage(player);
  rotatePlayer(state);
  return { total: hits, busted: false, checkout: false };
}

export function createInitialMatchState(
  config: MatchConfig,
  players: PlayerDescriptor[],
  starterIndex = 0
): MatchState {
  const id = config.id ?? crypto.randomUUID();
  const createdAt = new Date().toISOString();
  return {
    id,
    config: {
      ...config,
      id
    },
    status: config.kind === "offline" ? "live" : "pending",
    players: players.map((player, index) => createPlayerState(player, index, config.mode)),
    currentPlayerIndex: starterIndex,
    starterIndex,
    currentSet: 1,
    currentLeg: 1,
    turnNumber: 1,
    pendingThrows: [],
    winnerIndex: null,
    createdAt,
    startedAt: config.kind === "offline" ? createdAt : null,
    finishedAt: null,
    timeline: []
  };
}

export function pushThrow(state: MatchState, entry: ThrowInput): MatchState {
  if (state.status === "finished") {
    return state;
  }

  const normalized = normalizeThrow(entry);
  return {
    ...state,
    pendingThrows: [...state.pendingThrows, normalized].slice(0, 3)
  };
}

export function clearPendingThrows(state: MatchState): MatchState {
  return {
    ...state,
    pendingThrows: []
  };
}

export function removeLastPendingThrow(state: MatchState): MatchState {
  if (state.status === "finished" || state.pendingThrows.length === 0) {
    return state;
  }

  return {
    ...state,
    pendingThrows: state.pendingThrows.slice(0, -1)
  };
}

export function beginLiveMatch(state: MatchState): MatchState {
  if (state.status === "live") {
    return state;
  }

  return {
    ...state,
    status: "live",
    startedAt: state.startedAt ?? new Date().toISOString()
  };
}

export function commitTurn(state: MatchState): MatchState {
  if (state.status !== "live" || state.pendingThrows.length === 0) {
    return state;
  }

  const workingCopy: MatchState = JSON.parse(JSON.stringify(state));
  let result: { total: number; busted: boolean; checkout: boolean };

  if (workingCopy.config.mode === "501" || workingCopy.config.mode === "301") {
    result = commitX01Turn(workingCopy);
  } else if (workingCopy.config.mode === "cricket") {
    result = commitCricketTurn(workingCopy);
  } else {
    result = commitAroundTheClockTurn(workingCopy);
  }

  const timelineEntry: TurnHistory = {
    playerIndex: state.currentPlayerIndex,
    playerName: state.players[state.currentPlayerIndex].name,
    throws: state.pendingThrows,
    total: result.total,
    busted: result.busted,
    checkout: result.checkout,
    dartsUsed: countDarts(
      state.pendingThrows,
      state.config.countingMode === "default" ? 3 : state.pendingThrows.length || 3
    ),
    at: new Date().toISOString()
  };

  workingCopy.timeline = [...workingCopy.timeline, timelineEntry];
  workingCopy.pendingThrows = [];

  return workingCopy;
}

export function getMatchWinner(state: MatchState) {
  return state.winnerIndex === null ? null : state.players[state.winnerIndex];
}
