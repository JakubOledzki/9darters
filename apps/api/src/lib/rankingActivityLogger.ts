import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "../config.js";

type RankingLogRecord = {
  timestamp: string;
  scope: "match" | "tournament";
  event: string;
  matchId?: string;
  tournamentId?: string | null;
  name: string;
  mode: string;
  playMode: string;
  status: string;
  details?: Record<string, unknown>;
};

type RankingMatchContext = {
  id: string;
  name: string;
  mode: string;
  kind: string;
  playMode: string;
  status: string;
  isRanking: boolean;
  tournamentId?: string | null;
};

type RankingTournamentContext = {
  id: string;
  name: string;
  mode: string;
  playMode: string;
  status: string;
  isRanking: boolean;
};

export function resolveRankingActivityLogPath(logPath = config.rankingActivityLogPath) {
  return resolve(process.cwd(), logPath);
}

export async function appendRankingActivityLog(
  record: Omit<RankingLogRecord, "timestamp">,
  logPath = config.rankingActivityLogPath
) {
  const filePath = resolveRankingActivityLogPath(logPath);

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(
      filePath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...record
      })}\n`,
      "utf8"
    );
  } catch (error) {
    console.error("Failed to append ranking activity log", error);
  }
}

export async function logRankingMatchActivity(
  match: RankingMatchContext,
  event: string,
  details?: Record<string, unknown>,
  logPath = config.rankingActivityLogPath
) {
  if (!match.isRanking) {
    return;
  }

  await appendRankingActivityLog(
    {
      scope: "match",
      event,
      matchId: match.id,
      tournamentId: match.tournamentId ?? null,
      name: match.name,
      mode: `${match.kind}:${match.mode}`,
      playMode: match.playMode,
      status: match.status,
      details
    },
    logPath
  );
}

export async function logRankingTournamentActivity(
  tournament: RankingTournamentContext,
  event: string,
  details?: Record<string, unknown>,
  logPath = config.rankingActivityLogPath
) {
  if (!tournament.isRanking) {
    return;
  }

  await appendRankingActivityLog(
    {
      scope: "tournament",
      event,
      tournamentId: tournament.id,
      name: tournament.name,
      mode: tournament.mode,
      playMode: tournament.playMode,
      status: tournament.status,
      details
    },
    logPath
  );
}
