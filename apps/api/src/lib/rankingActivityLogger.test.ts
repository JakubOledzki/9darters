import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { logRankingMatchActivity } from "./rankingActivityLogger.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    })
  );
});

describe("rankingActivityLogger", () => {
  it("writes ranking activity as JSON lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "9darters-ranking-log-"));
    tempRoots.push(root);
    const logPath = join(root, "logs", "ranking-activity.log");

    await logRankingMatchActivity(
      {
        id: "match-1",
        name: "Liga A",
        mode: "501",
        kind: "duel",
        playMode: "online",
        status: "ready",
        isRanking: true,
        tournamentId: null
      },
      "match_ready",
      {
        actorUserId: "user-1"
      },
      logPath
    );

    const file = await readFile(logPath, "utf8");
    const [entry] = file
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(entry.scope).toBe("match");
    expect(entry.event).toBe("match_ready");
    expect(entry.matchId).toBe("match-1");
    expect(entry.status).toBe("ready");
    expect(entry.details).toMatchObject({ actorUserId: "user-1" });
  });

  it("skips non-ranking matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "9darters-ranking-log-"));
    tempRoots.push(root);
    const logPath = join(root, "logs", "ranking-activity.log");

    await logRankingMatchActivity(
      {
        id: "match-2",
        name: "Towarzyski",
        mode: "501",
        kind: "duel",
        playMode: "online",
        status: "pending",
        isRanking: false,
        tournamentId: null
      },
      "match_invited",
      undefined,
      logPath
    );

    await expect(access(logPath)).rejects.toThrow();
  });
});
