import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRoundSummary,
  hydrateRound,
  reconcileHolePenalties,
  updatePlayerHole,
  updateRoundHole,
  type RoundRecord,
  type RoundShot,
} from "./rounds.ts";

const legacyRound: RoundRecord = {
  id: "round-1",
  kind: "round",
  title: "Test Course",
  date: "2026-09-29",
  notes: "",
  category: "On course",
  done: false,
  holeCount: "9",
  roundHoles: Array.from({ length: 9 }, (_, index) => ({ hole: index + 1, par: index === 0 ? 3 : 4, score: index < 2 ? 4 + index : null })),
};

test("hydrates historical score-only rounds without losing scores", () => {
  const hydrated = hydrateRound(legacyRound);
  assert.equal(hydrated.players?.[0].scores[0], 4);
  assert.equal(hydrated.roundHoles[1].playerStats?.[0].score, 5);
  assert.equal(hydrated.roundHoles[2].playerStats?.[0].completed, false);
});

test("calculates deterministic round capture statistics", () => {
  const hydrated = hydrateRound(legacyRound);
  hydrated.roundHoles[0].playerStats![0] = { playerId: "legacy-primary", score: 4, putts: 2, teeResult: null, penalties: 0, completed: true, shots: [] };
  hydrated.roundHoles[1].playerStats![0] = { playerId: "legacy-primary", score: 7, putts: 3, teeResult: "right", penalties: 1, completed: true, shots: [{ id: "driver-ob", shotNumber: 1, club: "Driver", result: "ob", penaltyStrokes: 1 }] };
  const summary = calculateRoundSummary(hydrated);
  assert.deepEqual({ score: summary.totalScore, par: summary.totalPar, toPar: summary.toPar }, { score: 11, par: 7, toPar: 4 });
  assert.equal(summary.totalPutts, 5);
  assert.equal(summary.threePutts, 1);
  assert.equal(summary.teeRight, 1);
  assert.equal(summary.penalties, 1);
  assert.deepEqual(summary.penaltiesByClub, { Driver: 1 });
  assert.equal(summary.blowUpHoles, 1);
});

test("shot penalties attribute rather than double-count hole penalties", () => {
  const obShot: RoundShot = { id: "shot-1", shotNumber: 1, club: "Driver", result: "ob", penaltyStrokes: 1 };
  assert.equal(reconcileHolePenalties(0, [], [obShot]), 1);
  assert.equal(reconcileHolePenalties(2, [], [obShot]), 2);
  assert.equal(reconcileHolePenalties(1, [obShot], []), 0);
});

test("hole updates preserve the legacy score mirrors used by historical analytics", () => {
  const hydrated = hydrateRound(legacyRound);
  const playerId = hydrated.players![0].id;
  const updated = updatePlayerHole(hydrated, 2, playerId, { score: 6, putts: 2, completed: true });
  assert.equal(updated.players![0].scores[2], 6);
  assert.equal(updated.roundHoles[2].score, 6);
  assert.equal(updated.roundHoles[2].playerStats![0].putts, 2);
});

test("new course holes retain unknown pars across save and resume until entered", () => {
  const round = hydrateRound({
    ...legacyRound,
    roundHoles: legacyRound.roundHoles.map(hole => ({ ...hole, score: null, parConfirmed: false })),
  });
  const playerId = round.players![0].id;
  const withScore = updatePlayerHole(round, 0, playerId, { score: 5, putts: 2 });
  const withDistance = updateRoundHole(withScore, 0, { distance: 320 });
  const resumed = hydrateRound(JSON.parse(JSON.stringify(withDistance)));
  assert.equal(resumed.roundHoles[0].parConfirmed, false);
  assert.equal(resumed.roundHoles[0].distance, 320);
  assert.equal(calculateRoundSummary(resumed).holesCompleted, 0);
  assert.throws(() => updatePlayerHole(resumed, 0, playerId, { completed: true }), /Enter the hole par/);

  const withPar = updateRoundHole(resumed, 0, { par: 5 });
  const completed = updatePlayerHole(withPar, 0, playerId, { completed: true });
  assert.equal(completed.roundHoles[0].parConfirmed, true);
  assert.equal(completed.players![0].scores[0], 5);
  assert.equal(completed.roundHoles[0].playerStats![0].putts, 2);
  assert.equal(calculateRoundSummary(completed).toPar, 0);
  assert.equal(completed.roundHoles[1].parConfirmed, false);
});

test("editing tee box details preserves all players' scores and historical rounds", () => {
  const round = hydrateRound({ ...legacyRound, players: [
    { id: 'me', name: 'Me', scores: [4, 5, ...Array(7).fill(null)] },
    { id: 'friend', name: 'Friend', scores: [3, 6, ...Array(7).fill(null)] },
  ] });
  const updated = updateRoundHole(round, 0, { par: 4, distance: 300 });
  assert.deepEqual(updated.players, round.players);
  assert.deepEqual(updated.roundHoles[0].playerStats, round.roundHoles[0].playerStats);
  assert.equal(calculateRoundSummary(updated, 'me').toPar, 1);
  assert.equal(calculateRoundSummary(updated, 'friend').toPar, 1);
  assert.equal(updated.roundHoles[1].par, round.roundHoles[1].par);
  assert.equal(round.roundHoles[0].par, 3);
  assert.equal(updateRoundHole(updated, 0, { distance: undefined }).roundHoles[0].distance, undefined);
});

test("tee box updates reject invalid pars and distances", () => {
  for (const par of [2, 7, 3.5, NaN]) {
    assert.throws(() => updateRoundHole(legacyRound, 0, { par }));
  }
  for (const distance of [-1, 1001, Infinity, NaN]) {
    assert.throws(() => updateRoundHole(legacyRound, 0, { distance }));
  }
});
