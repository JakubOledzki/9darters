export type MatchMode = "501" | "301" | "cricket" | "around-the-clock";
export type MatchKind = "offline" | "duel" | "tournament" | "training";
export type CountingMode = "default" | "simplified";
export type PlayMode = "online" | "stationary";
export type MatchStatus =
  | "pending"
  | "accepted"
  | "ready"
  | "live"
  | "finished"
  | "declined"
  | "expired";

export type PlayerKind = "registered" | "guest";
export type TrainingMode =
  | "around-the-clock"
  | "doubles-practice"
  | "trebles-practice"
  | "bull-practice";

export interface MatchConfig {
  id?: string;
  name: string;
  mode: MatchMode;
  kind: MatchKind;
  createdByUserId: string;
  isRanking: boolean;
  countingMode: CountingMode;
  playMode: PlayMode;
  doubleOut: boolean;
  legsToWin: number;
  setsToWin: number;
  tournamentId?: string | null;
}

export interface PlayerDescriptor {
  id: string;
  name: string;
  kind: PlayerKind;
  userId?: string | null;
}

export interface ThrowInput {
  segment?: number;
  multiplier?: 1 | 2 | 3;
  score?: number;
  label?: string;
  dartsUsed?: 1 | 2 | 3;
}

export interface PlayerStats {
  dartsThrown: number;
  totalScored: number;
  turn50Plus: number;
  turn100Plus: number;
  turn180: number;
  busts: number;
  checkouts: number;
  highestCheckout: number;
  highestScore: number;
  threeDartAverage: number;
}

export interface MatchPlayerState {
  participantId: string;
  name: string;
  userId?: string | null;
  order: number;
  setsWon: number;
  legsWon: number;
  totalLegsWon: number;
  x01Score: number;
  cricketPoints: number;
  cricketMarks: Record<string, number>;
  atcTarget: number;
  finishedAtThrow: number | null;
  stats: PlayerStats;
}

export interface TurnHistory {
  playerIndex: number;
  playerName: string;
  throws: ThrowInput[];
  total: number;
  busted: boolean;
  checkout: boolean;
  dartsUsed: number;
  at: string;
}

export interface MatchState {
  id: string;
  config: MatchConfig;
  status: MatchStatus;
  players: MatchPlayerState[];
  currentPlayerIndex: number;
  starterIndex: number;
  currentSet: number;
  currentLeg: number;
  turnNumber: number;
  pendingThrows: ThrowInput[];
  winnerIndex: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  timeline: TurnHistory[];
}

export interface RatingLedgerEntry {
  playerId: string;
  opponentId: string;
  matchId: string;
  delta: number;
  ratingBefore: number;
  ratingAfter: number;
  createdAt: string;
}

export interface TrainingAttempt {
  target: string;
  hit: boolean;
  scoredValue: number;
  createdAt: string;
}

export interface TrainingSummary {
  id: string;
  userId: string;
  mode: TrainingMode;
  attempts: number;
  hits: number;
  hitRate: number;
  bestStreak: number;
  durationSeconds: number;
  throwsToFinish?: number | null;
  createdAt: string;
  attemptsLog: TrainingAttempt[];
}

export interface TournamentPairing {
  round: number;
  homeParticipantId: string;
  awayParticipantId: string;
}

export interface TournamentMatchSummary {
  matchId: string;
  homeParticipantId: string;
  awayParticipantId: string;
  homeSets: number;
  awaySets: number;
  homeLegs: number;
  awayLegs: number;
  homeAverage: number;
  awayAverage: number;
  winnerParticipantId: string | null;
  status: MatchStatus;
}

export interface TournamentStanding {
  participantId: string;
  wins: number;
  losses: number;
  legsDiff: number;
  setsDiff: number;
  average: number;
  played: number;
}
