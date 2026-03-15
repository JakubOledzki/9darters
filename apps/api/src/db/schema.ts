import type { MatchConfig, MatchState, TrainingSummary } from "@9darters/shared";
import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";

const matchModeEnum = mysqlEnum("match_mode", ["501", "301", "cricket", "around-the-clock"]);
const matchKindEnum = mysqlEnum("match_kind", ["offline", "duel", "tournament", "training"]);
const matchStatusEnum = mysqlEnum("match_status", [
  "pending",
  "accepted",
  "ready",
  "live",
  "finished",
  "declined",
  "expired"
]);
const countingModeEnum = mysqlEnum("counting_mode", ["default", "simplified"]);
const playModeEnum = mysqlEnum("play_mode", ["online", "stationary"]);
const participantStatusEnum = mysqlEnum("participant_status", ["pending", "accepted", "declined"]);
const tournamentStatusEnum = mysqlEnum("tournament_status", ["pending", "ready", "live", "finished", "cancelled"]);
const trainingModeEnum = mysqlEnum("training_mode", [
  "around-the-clock",
  "doubles-practice",
  "trebles-practice",
  "bull-practice"
]);

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    nickname: varchar("nickname", { length: 50 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    rating: int("rating").notNull().default(500),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: varchar("created_at", { length: 40 }).notNull()
  },
  (table) => ({
    nicknameUnique: uniqueIndex("users_nickname_unique").on(table.nickname),
    ratingIndex: index("users_rating_index").on(table.rating)
  })
);

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    rememberMe: boolean("remember_me").notNull().default(false),
    expiresAt: varchar("expires_at", { length: 40 }).notNull(),
    createdAt: varchar("created_at", { length: 40 }).notNull(),
    lastSeenAt: varchar("last_seen_at", { length: 40 }).notNull()
  },
  (table) => ({
    tokenUnique: uniqueIndex("auth_sessions_token_unique").on(table.tokenHash),
    userIndex: index("auth_sessions_user_index").on(table.userId)
  })
);

export const loginAttempts = mysqlTable("login_attempts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  nickname: varchar("nickname", { length: 50 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }).notNull(),
  success: boolean("success").notNull().default(false),
  createdAt: varchar("created_at", { length: 40 }).notNull()
});

export const follows = mysqlTable(
  "follows",
  {
    followerUserId: varchar("follower_user_id", { length: 36 }).notNull(),
    followedUserId: varchar("followed_user_id", { length: 36 }).notNull(),
    createdAt: varchar("created_at", { length: 40 }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.followerUserId, table.followedUserId] }),
    followerIndex: index("follows_follower_index").on(table.followerUserId),
    followedIndex: index("follows_followed_index").on(table.followedUserId)
  })
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: varchar("body", { length: 500 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: varchar("created_at", { length: 40 }).notNull()
  },
  (table) => ({
    userUnreadIndex: index("notifications_user_unread_index").on(table.userId, table.isRead)
  })
);

export const tournaments = mysqlTable(
  "tournaments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    mode: matchModeEnum.notNull(),
    status: tournamentStatusEnum.notNull().default("pending"),
    isRanking: boolean("is_ranking").notNull().default(false),
    countingMode: countingModeEnum.notNull().default("simplified"),
    playMode: playModeEnum.notNull().default("online"),
    doubleOut: boolean("double_out").notNull().default(false),
    legsToWin: int("legs_to_win").notNull(),
    setsToWin: int("sets_to_win").notNull(),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).notNull(),
    createdAt: varchar("created_at", { length: 40 }).notNull(),
    updatedAt: varchar("updated_at", { length: 40 }).notNull()
  },
  (table) => ({
    statusIndex: index("tournaments_status_index").on(table.status)
  })
);

export const tournamentParticipants = mysqlTable(
  "tournament_participants",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tournamentId: varchar("tournament_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    displayName: varchar("display_name", { length: 50 }).notNull(),
    status: participantStatusEnum.notNull().default("pending"),
    acceptedAt: varchar("accepted_at", { length: 40 }),
    createdAt: varchar("created_at", { length: 40 }).notNull()
  },
  (table) => ({
    tournamentIndex: index("tournament_participants_tournament_index").on(table.tournamentId),
    userTournamentUnique: uniqueIndex("tournament_participants_unique").on(table.tournamentId, table.userId)
  })
);

export const matches = mysqlTable(
  "matches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    mode: matchModeEnum.notNull(),
    kind: matchKindEnum.notNull(),
    status: matchStatusEnum.notNull().default("pending"),
    isRanking: boolean("is_ranking").notNull().default(false),
    countingMode: countingModeEnum.notNull().default("simplified"),
    playMode: playModeEnum.notNull().default("online"),
    doubleOut: boolean("double_out").notNull().default(false),
    legsToWin: int("legs_to_win").notNull(),
    setsToWin: int("sets_to_win").notNull(),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).notNull(),
    tournamentId: varchar("tournament_id", { length: 36 }),
    currentPlayerIndex: int("current_player_index").notNull().default(0),
    starterIndex: int("starter_index").notNull().default(0),
    winnerParticipantId: varchar("winner_participant_id", { length: 36 }),
    configJson: json("config_json").$type<MatchConfig>().notNull(),
    stateJson: json("state_json").$type<MatchState>().notNull(),
    createdAt: varchar("created_at", { length: 40 }).notNull(),
    updatedAt: varchar("updated_at", { length: 40 }).notNull(),
    startedAt: varchar("started_at", { length: 40 }),
    finishedAt: varchar("finished_at", { length: 40 })
  },
  (table) => ({
    statusIndex: index("matches_status_index").on(table.status),
    tournamentIndex: index("matches_tournament_index").on(table.tournamentId)
  })
);

export const matchParticipants = mysqlTable(
  "match_participants",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    matchId: varchar("match_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    orderIndex: int("order_index").notNull(),
    status: participantStatusEnum.notNull().default("accepted"),
    acceptedAt: varchar("accepted_at", { length: 40 }),
    joinedAt: varchar("joined_at", { length: 40 }),
    createdAt: varchar("created_at", { length: 40 }).notNull()
  },
  (table) => ({
    matchIndex: index("match_participants_match_index").on(table.matchId),
    userIndex: index("match_participants_user_index").on(table.userId)
  })
);

export const matchEvents = mysqlTable(
  "match_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    matchId: varchar("match_id", { length: 36 }).notNull(),
    actorParticipantId: varchar("actor_participant_id", { length: 36 }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: varchar("created_at", { length: 40 }).notNull()
  },
  (table) => ({
    matchIndex: index("match_events_match_index").on(table.matchId)
  })
);

export const ratingLedger = mysqlTable(
  "rating_ledger",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    playerUserId: varchar("player_user_id", { length: 36 }).notNull(),
    opponentUserId: varchar("opponent_user_id", { length: 36 }).notNull(),
    matchId: varchar("match_id", { length: 36 }).notNull(),
    delta: int("delta").notNull(),
    ratingBefore: int("rating_before").notNull(),
    ratingAfter: int("rating_after").notNull(),
    createdAt: varchar("created_at", { length: 40 }).notNull()
  },
  (table) => ({
    playerIndex: index("rating_ledger_player_index").on(table.playerUserId)
  })
);

export const trainingSessions = mysqlTable(
  "training_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    mode: trainingModeEnum.notNull(),
    status: varchar("status", { length: 32 }).notNull().default("finished"),
    summaryJson: json("summary_json").$type<TrainingSummary>().notNull(),
    createdAt: varchar("created_at", { length: 40 }).notNull(),
    updatedAt: varchar("updated_at", { length: 40 }).notNull()
  },
  (table) => ({
    userIndex: index("training_sessions_user_index").on(table.userId)
  })
);
