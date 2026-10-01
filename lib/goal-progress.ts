import type { GoalInput } from './goals.ts';
import type { ClubMetric } from './club-import.ts';
import { calculateRoundSummary, hydrateRound, type RoundRecord } from './rounds.ts';
import { displayDistance } from './preferences.ts';

export type GoalSessionRecord = {
  id: string; kind: 'session'; date: string; category: string;
  holes?: '9' | '18'; score?: number; club?: string; carry?: number; clubMetrics?: ClubMetric[];
};
export type GoalProgressRecord = RoundRecord | GoalSessionRecord;
export type GoalSample = { rounds: number; sessions: number; shots: number; averages: number; teeShots: number; holes: number };
export type Observation = { id: string; date: string; value: number; weight: number; sample: GoalSample };
export type CompletedRoundObservation = {
  id: string; date: string; holeCount: number;
  holes: { par: number; score: number; putts: number | null; penalties: number | null; teeResult: string | null; teeShot?: { club: string; result: string; penalties: number | null } }[];
};
export type PracticeObservation = { id: string; date: string; readings: ClubMetric[] };
export type GoalProgressIndex = {
  rounds: CompletedRoundObservation[]; practice: Map<string, PracticeObservation[]>;
  score: Observation[]; penalties: Observation[]; tee_in_play: Observation[]; putts: Observation[];
  carry: Map<string, Observation[]>;
};
export type GoalProgress = {
  current: number | null; baseline: number | null; baselineSource: 'entered' | 'derived' | 'unavailable';
  baselineDate: string | null; target: number; effectiveTarget: number;
  progressPercent: number | null; targetRecorded: boolean;
  status: 'no_data' | 'limited' | 'available' | 'unsupported';
  sample: GoalSample; currentSample: GoalSample;
  currentLabel: string; method: string;
  trend: { direction: 'improving' | 'worsening' | 'stable' | 'insufficient'; delta: number | null;
    previous: number | null; recent: number | null; previousSample: GoalSample; recentSample: GoalSample };
};
const emptySample = (): GoalSample => ({ rounds: 0, sessions: 0, shots: 0, averages: 0, teeShots: 0, holes: 0 });
const sampleSum = (values: Observation[]) => values.reduce<GoalSample>((sum, observation) => {
  for (const key of Object.keys(sum) as (keyof GoalSample)[]) sum[key] += observation.sample[key];
  return sum;
}, emptySample());
const validNumber = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const weightedMean = (values: Observation[]) => values.reduce((sum, item) => sum + item.value * item.weight, 0) / values.reduce((sum, item) => sum + item.weight, 0);
/** Formatting differences are aliases, but different clubs (e.g. 3 wood and 3 hybrid) stay distinct. */
export const goalClubKey = (club: string) => club.trim().toLowerCase().replace(/[-\s]+/g, '').replace(/^(\d+)i(?:ron)?$/, '$1iron');
const sortObservations = (items: Observation[]) => items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

// Only an unambiguous recorded first shot identifies the tee club. Never parse notes for direction.
function attributedTeeShot(shots: import('./rounds.ts').RoundShot[] | undefined) {
  const first = (shots ?? []).filter(shot => shot.shotNumber === 1);
  if (first.length !== 1 || typeof first[0].club !== 'string' || !goalClubKey(first[0].club)) return undefined;
  const shot = first[0];
  return { club: goalClubKey(shot.club), result: shot.result,
    penalties: validNumber(shot.penaltyStrokes, 10) && Number.isInteger(shot.penaltyStrokes) ? shot.penaltyStrokes : null };
}

/** Normalize once for all goals. Raw records are never mutated, and missing metrics are never fabricated. */
export function buildGoalProgressIndex(records: readonly GoalProgressRecord[]): GoalProgressIndex {
  const index: GoalProgressIndex = { score: [], penalties: [], tee_in_play: [], putts: [], carry: new Map(), rounds: [], practice: new Map() };
  for (const record of records) {
    if (!record || typeof record.date !== 'string' || !validDate(record.date)) continue;
    const add = (series: Observation[], value: number, sample: Partial<GoalSample>, weight = 1) => series.push({ id: record.id, date: record.date, value, weight, sample: { ...emptySample(), ...sample } });
    if (record.kind === 'round') {
      const count = Number(record.holeCount);
      if (![9, 18].includes(count) || !Array.isArray(record.roundHoles) || record.roundHoles.length !== count) continue;
      // Modern rounds must be explicitly finished. Older rounds infer completion from their scores.
      const round = hydrateRound(record);
      if (round.status !== 'complete') continue;
      const playerId = round.players![0].id;
      // An explicit modern hole stat is authoritative; stale legacy score mirrors must not fill an erased score.
      const rawStats = record.roundHoles.map(hole => hole.playerStats?.find(stat => stat.playerId === playerId));
      if (rawStats.some(stat => stat && (!stat.completed || !validNumber(stat.score, 30) || !Number.isInteger(stat.score) || stat.score === 0))) continue;
      const stats = round.roundHoles.map(hole => hole.playerStats!.find(stat => stat.playerId === playerId)!);
      if (stats.some(stat => !stat.completed || !validNumber(stat.score, 30) || !Number.isInteger(stat.score) || stat.score === 0)) continue;
      index.rounds.push({ id: record.id, date: record.date, holeCount: count, holes: round.roundHoles.map((hole, i) => ({
        par: hole.par, score: stats[i].score!,
        putts: validNumber(stats[i].putts, 10) && Number.isInteger(stats[i].putts) ? stats[i].putts : null,
        penalties: rawStats[i] && validNumber(rawStats[i]!.penalties, 10) && Number.isInteger(rawStats[i]!.penalties) ? rawStats[i]!.penalties : null,
        teeResult: ['in_play', 'left', 'right', 'ob', 'water'].includes(stats[i].teeResult ?? '') ? stats[i].teeResult : null,
        teeShot: attributedTeeShot(rawStats[i]?.shots),
      })) });
      const summary = calculateRoundSummary(round, playerId);
      if (count === 18) {
        add(index.score, summary.totalScore, { rounds: 1, holes: count });
        // Hydration creates zero penalties for historical score-only records. Those are not observations.
        if (rawStats.every(stat => stat && validNumber(stat.penalties, 10) && Number.isInteger(stat.penalties))) {
          add(index.penalties, summary.penalties, { rounds: 1, holes: count });
        }
        if (stats.every(stat => validNumber(stat.putts, 10) && Number.isInteger(stat.putts))) {
          add(index.putts, summary.totalPutts, { rounds: 1, holes: count });
        }
      }
      if (summary.teeShotsTracked > 0) {
        add(index.tee_in_play, summary.teeInPlay / summary.teeShotsTracked * 100, { rounds: 1, teeShots: summary.teeShotsTracked }, summary.teeShotsTracked);
      }
    } else if (record.kind === 'session') {
      if (record.category === 'Course round') {
        // Legacy course-session scores represent logged round totals, irrespective of the task-style done flag.
        if (record.holes === '18' && validNumber(record.score, 300) && Number.isInteger(record.score) && record.score! > 0) {
          add(index.score, record.score!, { rounds: 1, holes: 18 });
        }
        continue;
      }
      const individual = new Map<string, ClubMetric[]>();
      for (const reading of record.clubMetrics ?? []) {
        if (!reading || reading.sampleType !== 'Single shot' || typeof reading.club !== 'string') continue;
        const club = goalClubKey(reading.club);
        if (!club) continue;
        const readings = individual.get(club) ?? [];
        readings.push(reading); individual.set(club, readings);
      }
      for (const [club, readings] of individual) {
        const sessions = index.practice.get(club) ?? [];
        sessions.push({ id: record.id, date: record.date, readings }); index.practice.set(club, sessions);
      }
      const grouped = new Map<string, { shots: number[]; averages: number[] }>();
      for (const reading of record.clubMetrics ?? []) {
        if (!reading || typeof reading.club !== 'string' || !validNumber(reading.carry, 600)) continue;
        const key = goalClubKey(reading.club);
        if (!key || !['Single shot', 'Average'].includes(reading.sampleType)) continue;
        const values = grouped.get(key) ?? { shots: [], averages: [] };
        values[reading.sampleType === 'Single shot' ? 'shots' : 'averages'].push(reading.carry!);
        grouped.set(key, values);
      }
      // The session-level carry mirrors the first club measurement in modern records; use it only for legacy sessions.
      if (!record.clubMetrics?.length && typeof record.club === 'string' && goalClubKey(record.club) && validNumber(record.carry, 600)) {
        grouped.set(goalClubKey(record.club), { shots: [], averages: [record.carry!] });
      }
      for (const [club, values] of grouped) {
        const readings = values.shots.length ? values.shots : values.averages;
        const series = index.carry.get(club) ?? [];
        add(series, mean(readings), { sessions: 1, shots: values.shots.length, averages: values.shots.length ? 0 : values.averages.length });
        index.carry.set(club, series);
      }
    }
  }
  for (const series of [index.score, index.penalties, index.putts, index.tee_in_play, ...index.carry.values()]) sortObservations(series);
  index.rounds.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const sessions of index.practice.values()) sessions.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return index;
}

const methods = {
  score: 'Best completed 18-hole on-course score across all recorded history. The target means scoring below the entered value. Baseline: first eligible round. Trend: average score in the last 3 rounds versus the preceding 3.',
  penalties: 'Average hole-total penalties over the latest 5 completed 18-hole rounds with penalty data on every hole. Shot penalties are attribution and are not added again. Baseline: first eligible round. Trend: last 3 versus preceding 3 rounds.',
  putts: 'Average total putts over the latest 5 completed 18-hole rounds with putts on every hole. Incomplete putting totals are excluded. Baseline: first eligible round. Trend: last 3 versus preceding 3 rounds.',
  tee_in_play: 'In-play results divided by recorded tee results on par 4/5/6 holes, across the latest 5 completed 9- or 18-hole rounds. Missing results are excluded. Baseline: first eligible round. Trend: last 3 versus preceding 3 rounds, weighted by tracked tee shots.',
  carry: 'Average session carry over the latest 5 practice sessions for this club, with each session weighted equally. Individual shots take priority over averages within a session; Best entries are excluded. Baseline: first eligible session. Trend: last 3 versus preceding 3 sessions. Recorded averages have unknown underlying shot counts.',
  custom: 'Custom goals have no linked metric. Automatic progress is unavailable.',
};

export function calculateGoalProgress(goal: GoalInput, index: GoalProgressIndex): GoalProgress {
  const series = goal.type === 'custom' ? [] : goal.type === 'carry' ? index.carry.get(goalClubKey(goal.club ?? '')) ?? [] : index[goal.type];
  const distanceFactor = goal.type === 'carry' && goal.unit === 'yd' ? displayDistance(1, 'yd')! : 1;
  const convert = (value: number) => value * distanceFactor;
  const currentWindow = goal.type === 'score' ? series : series.slice(-5);
  const current = currentWindow.length ? convert(goal.type === 'score' ? currentWindow.reduce((best, item) => Math.min(best, item.value), Infinity) : weightedMean(currentWindow)) : null;
  const baseline = goal.starting_value ?? (series.length ? convert(series[0].value) : null);
  const baselineSource = goal.starting_value !== null ? 'entered' : series.length ? 'derived' : 'unavailable';
  const effectiveTarget = goal.type === 'score' ? Math.ceil(goal.target_value) - 1 : goal.target_value;
  const higherIsBetter = goal.type === 'carry' || goal.type === 'tee_in_play';
  const targetRecorded = current !== null && goal.type !== 'custom' && (higherIsBetter ? current >= effectiveTarget : current <= effectiveTarget);
  const usableBaseline = baseline !== null && (higherIsBetter ? baseline < effectiveTarget : baseline > effectiveTarget);
  const progressPercent = current === null || baseline === null ? null : targetRecorded ? 100 : usableBaseline
    ? Math.max(0, Math.min(100, (current - baseline) / (effectiveTarget - baseline) * 100)) : null;
  const trend: GoalProgress['trend'] = { direction: 'insufficient', delta: null, previous: null, recent: null, previousSample: emptySample(), recentSample: emptySample() };
  if (series.length >= 6) {
    const previous = series.slice(-6, -3), recent = series.slice(-3);
    // Date-only records cannot establish an ordering for observations on the same day across the boundary.
    if (previous.at(-1)!.date < recent[0].date) {
      trend.previous = convert(weightedMean(previous)); trend.recent = convert(weightedMean(recent));
      trend.delta = trend.recent - trend.previous;
      trend.previousSample = sampleSum(previous); trend.recentSample = sampleSum(recent);
      trend.direction = Math.abs(trend.delta) < 1e-9 ? 'stable' : (higherIsBetter ? trend.delta > 0 : trend.delta < 0) ? 'improving' : 'worsening';
    }
  }
  return {
    current, baseline, baselineSource, baselineDate: baselineSource === 'derived' ? series[0].date : null,
    target: goal.target_value, effectiveTarget, progressPercent, targetRecorded,
    status: goal.type === 'custom' ? 'unsupported' : !series.length ? 'no_data' : series.length < 3 ? 'limited' : 'available',
    sample: sampleSum(series), currentSample: sampleSum(currentWindow), trend,
    currentLabel: goal.type === 'score' ? 'Best 18-hole score' : goal.type === 'carry' ? 'Recent average session carry' : goal.type === 'tee_in_play' ? 'Recent tee shots in play' : 'Recent round average',
    method: methods[goal.type],
  };
}

export function calculateGoalsProgress(goals: readonly GoalInput[], records: readonly GoalProgressRecord[]) {
  const index = buildGoalProgressIndex(records);
  return Object.fromEntries(goals.map(goal => [goal.id, calculateGoalProgress(goal, index)]));
}
