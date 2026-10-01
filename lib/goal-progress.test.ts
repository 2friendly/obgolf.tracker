import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoalProgressIndex, calculateGoalProgress, calculateGoalsProgress, type GoalProgressRecord, type GoalSessionRecord } from './goal-progress.ts';
import type { GoalInput } from './goals.ts';
import type { RoundRecord, PlayerHoleStat } from './rounds.ts';
import type { ClubMetric } from './club-import.ts';

const goal = (patch: Partial<GoalInput> = {}): GoalInput => ({
  id: 'ec68d0c7-9a80-4d08-a81c-508567113dce', title: 'My goal', type: 'score',
  target_value: 90, starting_value: null, target_date: null, status: 'active', is_primary: false, club: null, unit: null, ...patch,
});
function round(id: number, score = 90, count: '9' | '18' = '18'): RoundRecord {
  return {
    id: `r-${id}`, date: `2026-09-${String(id).padStart(2, '0')}`, kind: 'round', title: 'Round', category: 'On course', notes: '', done: true, status: 'complete', holeCount: count,
    players: [{ id: 'me', name: 'Me', scores: Array.from({ length: Number(count) }, (_, i) => i === 0 ? score - (Number(count) - 1) * 5 : 5) }],
    roundHoles: Array.from({ length: Number(count) }, (_, i) => {
      const value = i === 0 ? score - (Number(count) - 1) * 5 : 5;
      return { hole: i + 1, par: 4, score: value, playerStats: [{ playerId: 'me', score: value, completed: true, putts: 2, penalties: 0, teeResult: null, shots: [] }] };
    }),
  };
}
const stat = (round: RoundRecord, index: number): PlayerHoleStat => round.roundHoles[index].playerStats![0];
function reading(id: string, carry: number | undefined, sampleType: ClubMetric['sampleType'] = 'Single shot', club = 'Driver'): ClubMetric {
  return { id, club, sampleType, ...(carry === undefined ? {} : { carry }) };
}
function session(id: number, values: ClubMetric[]): GoalSessionRecord {
  return { id: `s-${id}`, kind: 'session', category: 'Simulator', date: `2026-09-${String(id).padStart(2, '0')}`, clubMetrics: values };
}
const calculate = (target: GoalInput, records: GoalProgressRecord[]) => calculateGoalProgress(target, buildGoalProgressIndex(records));
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test('score uses the best completed 18-hole round and a strict break target', () => {
  const rounds = [round(1, 100), round(2, 95), round(3, 90)];
  const progress = calculate(goal(), rounds);
  assert.equal(progress.current, 90);
  assert.equal(progress.baseline, 100);
  assert.equal(progress.baselineSource, 'derived');
  assert.equal(progress.target, 90);
  assert.equal(progress.effectiveTarget, 89);
  assert.equal(progress.targetRecorded, false);
  near(progress.progressPercent, 10 / 11 * 100);
  assert.equal(calculate(goal(), [...rounds, round(4, 89)]).targetRecorded, true);
  assert.equal(calculate(goal(), [...rounds, round(4, 89)]).progressPercent, 100);
  assert.equal(calculate(goal({ target_value: 89.5 }), [...rounds, round(4, 89)]).effectiveTarget, 89);
});

test('unfinished rounds, 9-hole scores, incomplete holes and companion scores cannot meet score targets', () => {
  const active = { ...round(1, 89), status: 'active' as const };
  const setup = { ...round(2, 89), status: 'setup' as const };
  const incomplete = round(3, 89); stat(incomplete, 1).completed = false;
  const missing = round(4, 89); missing.roundHoles.pop();
  const mine = round(5, 100);
  mine.players!.push({ id: 'friend', name: 'Friend', scores: Array(18).fill(3) });
  mine.roundHoles.forEach(hole => hole.playerStats!.push({ ...hole.playerStats![0], playerId: 'friend', score: 3 }));
  const progress = calculate(goal(), [active, setup, incomplete, missing, round(6, 45, '9'), mine]);
  assert.equal(progress.current, 100);
  assert.equal(progress.sample.rounds, 1);
});

test('erased modern scores are not recovered from stale score mirrors', () => {
  const erased = round(1, 89); stat(erased, 0).score = null;
  assert.equal(calculate(goal(), [erased]).current, null);
});

test('legacy score-only rounds and course-session totals remain eligible without inventing hole metrics', () => {
  const legacy = round(1, 98);
  delete legacy.status; delete legacy.players;
  legacy.roundHoles = legacy.roundHoles.map(hole => ({ hole: hole.hole, par: hole.par, score: hole.score }));
  const logged: GoalSessionRecord = { id: 'legacy-session', kind: 'session', date: '2026-09-02', category: 'Course round', holes: '18', score: 92 };
  const simulator = { ...logged, id: 'simulator', category: 'Simulator', score: 65 };
  assert.equal(calculate(goal(), [legacy, logged, simulator]).current, 92);
  assert.equal(calculate(goal({ type: 'penalties', target_value: 1 }), [legacy, logged]).current, null);
  assert.equal(calculate(goal({ type: 'putts', target_value: 30 }), [legacy, logged]).current, null);
});

test('penalties use full hole totals, preserve zero, and never double-count attributed shots', () => {
  const first = round(1); stat(first, 0).penalties = 2;
  stat(first, 0).shots = [{ id: 'ob', shotNumber: 1, club: 'Driver', result: 'ob', penaltyStrokes: 2 }];
  const second = round(2);
  const partial = round(3); partial.roundHoles[5].playerStats = [];
  const progress = calculate(goal({ type: 'penalties', target_value: 0 }), [first, second, partial]);
  assert.equal(progress.current, 1);
  assert.equal(progress.baseline, 2);
  assert.equal(progress.progressPercent, 50);
  assert.equal(progress.sample.rounds, 2);
  assert.equal(progress.currentSample.holes, 36);
});

test('putts require a fully tracked round and missing holes are never extrapolated', () => {
  const first = round(1); stat(first, 0).putts = 3;
  const second = round(2);
  const missing = round(3); stat(missing, 0).putts = null;
  const progress = calculate(goal({ type: 'putts', target_value: 30 }), [first, second, missing]);
  assert.equal(progress.current, 36.5);
  assert.equal(progress.sample.rounds, 2);
  const zero = round(4); zero.roundHoles.forEach(hole => { hole.playerStats![0].putts = 0; });
  assert.equal(calculate(goal({ type: 'putts', target_value: 0 }), [zero]).current, 0);
});

test('tee results are weighted by tracked tee shots, excluding missing results and par 3s', () => {
  const first = round(1); stat(first, 0).teeResult = 'in_play';
  const second = round(2, 45, '9');
  ['left', 'right', 'ob', 'water'].forEach((result, i) => { stat(second, i).teeResult = result as PlayerHoleStat['teeResult']; });
  second.roundHoles[4].par = 3; stat(second, 4).teeResult = 'in_play';
  const progress = calculate(goal({ type: 'tee_in_play', target_value: 80 }), [first, second, round(3)]);
  assert.equal(progress.current, 20);
  assert.equal(progress.sample.teeShots, 5);
  assert.equal(progress.sample.rounds, 2);
  assert.equal(progress.baseline, 100);
  assert.equal(progress.progressPercent, null); // baseline was already above target
  assert.equal(calculate(goal({ type: 'tee_in_play', target_value: 80, starting_value: 0 }), [first, second]).progressPercent, 25);
});

test('carry uses per-session means, selects the club and excludes Best and mirrored summaries', () => {
  const first = { ...session(1, [reading('a', 190), reading('b', 210), reading('summary', 240, 'Average'), reading('best', 280, 'Best'), reading('iron', 160, 'Single shot', '7-iron')]), club: 'Driver', carry: 280 };
  const second = session(2, [reading('c', 240)]);
  const third = session(3, [reading('avg', 210, 'Average'), reading('best', 300, 'Best')]);
  const progress = calculate(goal({ type: 'carry', club: 'driver', unit: 'm', target_value: 250 }), [first, second, third]);
  near(progress.current, (200 + 240 + 210) / 3);
  assert.equal(progress.baseline, 200);
  assert.deepEqual(progress.sample, { rounds: 0, sessions: 3, shots: 3, averages: 1, holes: 0, teeShots: 0 });
  const iron = calculate(goal({ type: 'carry', club: ' 7 Iron ', unit: 'm', target_value: 180 }), [first]);
  assert.equal(iron.current, 160);
  assert.equal(calculate(goal({ type: 'carry', club: '7i', unit: 'm', target_value: 180 }), [first]).current, 160);
  assert.equal(calculate(goal({ type: 'carry', club: '3 wood', unit: 'm', target_value: 180 }), [first]).current, null);
});

test('legacy carries are preserved, modern mirrors and course data cannot masquerade as practice', () => {
  const legacy: GoalSessionRecord = { ...session(1, []), club: 'Driver', carry: 205 };
  const bestOnly = { ...session(2, [reading('best', 300, 'Best')]), club: 'Driver', carry: 300 };
  const course = { ...session(3, [reading('shot', 280)]), category: 'Course round' };
  const otherClub = { ...session(4, [reading('other', 160, 'Average', '7-iron')]), club: 'Driver', carry: 220 };
  const progress = calculate(goal({ type: 'carry', club: 'Driver', unit: 'm', target_value: 230 }), [legacy, bestOnly, course, otherClub]);
  assert.equal(progress.current, 205);
  assert.equal(progress.sample.averages, 1);
  assert.equal(progress.sample.shots, 0);
});

test('carry is converted from stored metres to goal units without changing the entered baseline or target', () => {
  const progress = calculate(goal({ type: 'carry', club: 'Driver', unit: 'yd', target_value: 250, starting_value: 200 }), [session(1, [reading('a', 200)])]);
  near(progress.current, 200 * 1.0936133);
  assert.equal(progress.baseline, 200);
  assert.equal(progress.target, 250);
  near(progress.progressPercent, (200 * 1.0936133 - 200) / 50 * 100);
});

test('recent means use at most 5 eligible observations while baselines and sample counts retain history', () => {
  const rounds = Array.from({ length: 6 }, (_, i) => {
    const result = round(i + 1); stat(result, 0).penalties = 6 - i; return result;
  });
  const progress = calculate(goal({ type: 'penalties', target_value: 1 }), rounds.reverse());
  assert.equal(progress.current, 3);
  assert.equal(progress.baseline, 6);
  assert.equal(progress.sample.rounds, 6);
  assert.equal(progress.currentSample.rounds, 5);
  assert.equal(progress.progressPercent, 60);
  assert.equal(progress.trend.previous, 5);
  assert.equal(progress.trend.recent, 2);
  assert.equal(progress.trend.delta, -3);
  assert.equal(progress.trend.direction, 'improving');
});

test('trends compare raw scoring averages, and correctly handle improving, worsening and stable metrics', () => {
  const scores = [100, 98, 96, 94, 92, 90].map((score, i) => round(i + 1, score));
  const scored = calculate(goal(), scores);
  assert.equal(scored.trend.previous, 98); assert.equal(scored.trend.recent, 92);
  assert.equal(scored.trend.direction, 'improving');
  const carries = [200, 210, 220, 210, 200, 190].map((carry, i) => session(i + 1, [reading(String(i), carry)]));
  const carryGoal = goal({ type: 'carry', club: 'Driver', unit: 'm', target_value: 240 });
  assert.equal(calculate(carryGoal, carries).trend.direction, 'worsening');
  assert.equal(calculate(carryGoal, carries.map(item => ({ ...item, clubMetrics: [reading('a', 200)] }))).trend.direction, 'stable');
  assert.equal(calculate(carryGoal, carries.slice(0, 5)).trend.direction, 'insufficient');
  assert.equal(calculate(carryGoal, carries.map(item => ({ ...item, date: '2026-09-01' }))).trend.direction, 'insufficient');
});

test('tee trend windows use tracked-shot denominators rather than mean percentages', () => {
  const rounds = Array.from({ length: 6 }, (_, i) => round(i + 1));
  rounds.forEach((item, i) => {
    const tracked = i < 3 ? i + 1 : 4;
    for (let j = 0; j < tracked; j++) stat(item, j).teeResult = j === 0 ? 'in_play' : 'left';
  });
  const progress = calculate(goal({ type: 'tee_in_play', target_value: 80 }), rounds);
  assert.equal(progress.trend.previous, 50);
  assert.equal(progress.trend.recent, 25);
  assert.equal(progress.trend.direction, 'worsening');
  assert.equal(progress.trend.previousSample.teeShots, 6);
  assert.equal(progress.trend.recentSample.teeShots, 12);
});

test('entered baselines, equal or already-met baselines, and regressions avoid division by zero or inverted progress', () => {
  const input = goal({ type: 'carry', club: 'Driver', unit: 'm', target_value: 220, starting_value: 200 });
  const records = [session(1, [reading('a', 190)])];
  assert.equal(calculate(input, records).progressPercent, 0);
  assert.equal(calculate({ ...input, starting_value: 220 }, records).progressPercent, null);
  assert.equal(calculate({ ...input, starting_value: 250 }, records).progressPercent, null);
  assert.equal(calculate(input, [session(1, [reading('a', 230)])]).progressPercent, 100);
});

test('no-data, invalid observations and custom goals retain targets without inventing progress', () => {
  const invalid = [session(1, [reading('nan', NaN), reading('infinity', Infinity), reading('missing', undefined), reading('negative', -1)])];
  const carry = calculate(goal({ type: 'carry', club: 'Driver', unit: 'm', target_value: 230, starting_value: 200 }), invalid);
  assert.equal(carry.current, null); assert.equal(carry.baseline, 200); assert.equal(carry.progressPercent, null); assert.equal(carry.status, 'no_data');
  const custom = calculate(goal({ type: 'custom', starting_value: 0 }), [round(1)]);
  assert.equal(custom.status, 'unsupported'); assert.equal(custom.baseline, 0); assert.equal(custom.current, null);
  assert.equal(custom.targetRecorded, false); assert.equal(custom.trend.direction, 'insufficient');
  assert.equal(calculate(goal(), [{ ...round(1), date: '2026-02-30' }]).current, null);
  const invalidPutt = round(1); stat(invalidPutt, 0).putts = NaN;
  assert.equal(calculate(goal({ type: 'putts', target_value: 30 }), [invalidPutt]).current, null);
});

test('multi-goal calculations do not mutate records or goals and are independent of input ordering', () => {
  const records = [round(1, 100), round(2, 90), session(3, [reading('a', 210)])];
  const goals = [goal(), goal({ id: 'carry-goal', type: 'carry', club: 'Driver', unit: 'm', target_value: 230 })];
  const snapshot = structuredClone({ records, goals });
  const result = calculateGoalsProgress(goals, records);
  assert.deepEqual(calculateGoalsProgress(goals, [...records].reverse()), result);
  assert.deepEqual({ records, goals }, snapshot);
  assert.equal(result[goals[0].id].current, 90);
  assert.equal(result['carry-goal'].current, 210);
  assert.equal(result['carry-goal'].status, 'limited');
});

test('projected historical JSON nulls do not create fake stats or break calculations', () => {
  const legacy = round(1, 95);
  legacy.roundHoles = legacy.roundHoles.map(hole => ({ hole: hole.hole, par: hole.par, score: hole.score }));
  const projected = { ...legacy, players: null, status: null } as unknown as RoundRecord;
  const carry = { ...session(2, []), clubMetrics: null, club: 'Driver', carry: 210 } as unknown as GoalSessionRecord;
  assert.equal(calculate(goal(), [projected]).current, 95);
  assert.equal(calculate(goal({ type: 'penalties', target_value: 1 }), [projected]).current, null);
  assert.equal(calculate(goal({ type: 'carry', club: 'Driver', unit: 'm', target_value: 220 }), [carry]).current, 210);
});
