import assert from "node:assert/strict";
import {
  applyMatchRating,
  buildTournamentStandings,
  commitTurn,
  createInitialMatchState,
  generateRoundRobinPairings,
  pushThrow
} from "../dist/index.js";

function testX01Bust() {
  let state = createInitialMatchState(
    {
      name: "Bust test",
      mode: "301",
      kind: "offline",
      createdByUserId: "u1",
      isRanking: false,
      countingMode: "default",
      playMode: "stationary",
      doubleOut: false,
      legsToWin: 1,
      setsToWin: 1
    },
    [
      { id: "p1", name: "A", kind: "guest" },
      { id: "p2", name: "B", kind: "guest" }
    ]
  );

  state.players[0].x01Score = 40;
  state = pushThrow(state, { score: 60, dartsUsed: 3 });
  state = commitTurn(state);

  assert.equal(state.timeline[0]?.busted, true);
  assert.equal(state.players[0]?.x01Score, 40);
  assert.equal(state.currentPlayerIndex, 1);
}

function testDoubleOut() {
  let state = createInitialMatchState(
    {
      name: "Checkout test",
      mode: "301",
      kind: "offline",
      createdByUserId: "u1",
      isRanking: false,
      countingMode: "simplified",
      playMode: "stationary",
      doubleOut: true,
      legsToWin: 1,
      setsToWin: 1
    },
    [
      { id: "p1", name: "A", kind: "guest" },
      { id: "p2", name: "B", kind: "guest" }
    ]
  );

  state.players[0].x01Score = 20;
  state = pushThrow(state, { segment: 20, multiplier: 1 });
  state = commitTurn(state);

  assert.equal(state.timeline[0]?.busted, true);
}

function testRating() {
  const result = applyMatchRating(500, 1000);
  assert.equal(result.winnerAfter > 500, true);
  assert.equal(result.loserAfter < 1000, true);
  assert.equal(result.delta >= 18, true);
}

function testTournament() {
  const pairings = generateRoundRobinPairings(["a", "b", "c"]);
  assert.equal(pairings.length, 3);

  const standings = buildTournamentStandings(["a", "b", "c"], [
    {
      matchId: "1",
      homeParticipantId: "a",
      awayParticipantId: "b",
      homeSets: 1,
      awaySets: 0,
      homeLegs: 3,
      awayLegs: 1,
      homeAverage: 50,
      awayAverage: 45,
      winnerParticipantId: "a",
      status: "finished"
    },
    {
      matchId: "2",
      homeParticipantId: "b",
      awayParticipantId: "c",
      homeSets: 1,
      awaySets: 0,
      homeLegs: 3,
      awayLegs: 2,
      homeAverage: 48,
      awayAverage: 47,
      winnerParticipantId: "b",
      status: "finished"
    },
    {
      matchId: "3",
      homeParticipantId: "a",
      awayParticipantId: "c",
      homeSets: 1,
      awaySets: 0,
      homeLegs: 3,
      awayLegs: 0,
      homeAverage: 55,
      awayAverage: 40,
      winnerParticipantId: "a",
      status: "finished"
    }
  ]);

  assert.equal(standings[0]?.participantId, "a");
}

testX01Bust();
testDoubleOut();
testRating();
testTournament();

console.log("shared tests passed");
