import type { GoalInput } from './goals.ts';
import { calculateGoalProgress, goalClubKey, type GoalProgressIndex, type CompletedRoundObservation } from './goal-progress.ts';

export type InsightArea = 'penalties' | 'tee_in_play' | 'direction' | 'putts' | 'three_putts' | 'blow_up' | 'par_scoring' | 'carry' | 'carry_consistency' | 'practice_direction';
export type GoalFinding = {
  id: string; area: InsightArea; title: string; club?: string;
  relation: 'goal_metric' | 'course_context' | 'practice_context';
  metric: { value: number; unit: '%' | 'penalties / round' | 'putts / round' | 'holes / round' | 'strokes over par / hole' | 'm'; label: string };
  evidence: string[]; rule: string;
  sample: { rounds: number; sessions: number; holes: number; shots: number };
  from: string; to: string;
};
export type InsightCoverage = { area: string; sufficient: boolean; evidence: string };
export type GoalInsights = { findings: GoalFinding[]; coverage: InsightCoverage[] };

/** Product heuristics, not coaching benchmarks. Each rule also requires recurrence on 3 distinct dates. */
export const insightRules = {
  rounds: 3, window: 5, teeShots: 30, teePerRound: 6, puttingHoles: 54, parHoles: 12,
  penaltiesPerRound: 2, teeInPlayPercent: 60, directionPercent: 30,
  puttsPerRound: 36, threePuttPercent: 10, blowUpPerRound: 2,
  parExcess: 1.5, parGap: 0.5,
  practiceShots: 30, shotsPerSession: 10, carryCv: 0.15, offlinePercent: 60, offlineMetres: 10,
  carryDropPercent: 5,
} as const;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const dates = (items: { date: string }[]) => new Set(items.map(item => item.date)).size;
const repeated = (items: { date: string }[]) => items.length >= insightRules.rounds && dates(items) >= insightRules.rounds;
const valid = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const fmt = (value: number) => Number(value.toFixed(1));
const sample = (rounds = 0, holes = 0, sessions = 0, shots = 0) => ({ rounds, holes, sessions, shots });

export function detectGoalInsights(goal: GoalInput, index: GoalProgressIndex): GoalInsights {
  const findings: GoalFinding[] = [], coverage: InsightCoverage[] = [];
  const add = (finding: Omit<GoalFinding, 'relation'>) => {
    const direct = goal.type === finding.area || (goal.type === 'putts' && finding.area === 'three_putts') || (goal.type === 'tee_in_play' && finding.area === 'direction') || (goal.type === 'carry' && ['carry_consistency', 'practice_direction'].includes(finding.area));
    findings.push({ ...finding, relation: direct ? 'goal_metric' : ['carry', 'carry_consistency', 'practice_direction'].includes(finding.area) ? 'practice_context' : 'course_context' });
  };
  const cover = (area: string, sufficient: boolean, evidence: string) => coverage.push({ area, sufficient, evidence });
  const recent = index.rounds.filter(round => round.holeCount === 18).slice(-insightRules.window);
  const range = (items: { date: string }[]) => ({ from: items[0].date, to: items.at(-1)!.date });
  const penalties = recent.filter(round => round.holes.every(hole => hole.penalties !== null));
  cover('Penalties', repeated(penalties), `${penalties.length} of the latest ${recent.length} completed 18-hole rounds have full penalty data; 3 rounds on distinct dates required.`);
  if (repeated(penalties)) {
    const totals = penalties.map(round => sum(round.holes.map(hole => hole.penalties!)));
    const affected = penalties.filter((_, i) => totals[i] >= insightRules.penaltiesPerRound);
    if (mean(totals) >= insightRules.penaltiesPerRound && repeated(affected)) add({
      id: 'penalties', area: 'penalties', title: 'Penalties are a repeated scoring cost',
      metric: { value: mean(totals), unit: 'penalties / round', label: 'Hole-total penalties' },
      evidence: [`${sum(totals)} penalty strokes in ${penalties.length} completed 18-hole rounds.`, `${affected.length} rounds had at least 2 penalties. Shot attribution is not added to hole totals.`],
      rule: 'Average ≥2 penalties per 18-hole round, with ≥2 in at least 3 rounds on distinct dates.', sample: sample(penalties.length, penalties.length * 18), ...range(penalties),
    });
  }

  const tee = index.rounds.slice(-insightRules.window).map(round => ({ ...round, tracked: round.holes.filter(hole => hole.par > 3 && hole.teeResult !== null) })).filter(round => round.tracked.length >= insightRules.teePerRound);
  const tracked = tee.flatMap(round => round.tracked), teeCount = tracked.length;
  const teeReady = repeated(tee) && teeCount >= insightRules.teeShots;
  cover('Tee results', teeReady, `${teeCount} tracked par 4/5/6 tee shots in ${tee.length} recent rounds; 30 shots, 3 dates and at least 6 shots per round required.`);
  if (teeReady) {
    const inPlay = tracked.filter(hole => hole.teeResult === 'in_play').length;
    const affected = tee.filter(round => round.tracked.filter(hole => hole.teeResult === 'in_play').length / round.tracked.length * 100 <= insightRules.teeInPlayPercent);
    if (inPlay / teeCount * 100 <= insightRules.teeInPlayPercent && repeated(affected)) add({
      id: 'tee-in-play', area: 'tee_in_play', title: 'Tee shots often finish outside “in play”',
      metric: { value: inPlay / teeCount * 100, unit: '%', label: 'Tracked tee shots in play' },
      evidence: [`${inPlay} of ${teeCount} recorded tee outcomes were in play across ${tee.length} completed rounds.`, `${affected.length} rounds recorded 60% or fewer in play. Missing results and par 3s are excluded.`],
      rule: '≤60% in play across ≥30 tracked shots; at least 3 rounds on distinct dates also at ≤60%.', sample: sample(tee.length, teeCount), ...range(tee),
    });
    for (const side of ['left', 'right'] as const) {
      const misses = tracked.filter(hole => hole.teeResult === side).length;
      const recurring = tee.filter(round => round.tracked.filter(hole => hole.teeResult === side).length / round.tracked.length * 100 >= insightRules.directionPercent);
      if (misses / teeCount * 100 >= insightRules.directionPercent && repeated(recurring)) add({
        id: `tee-${side}`, area: 'direction', title: `${side === 'left' ? 'Left' : 'Right'} tee misses recur across rounds`,
        metric: { value: misses / teeCount * 100, unit: '%', label: `Tracked tee shots marked ${side}` },
        evidence: [`${misses} of ${teeCount} tee outcomes were marked ${side} in ${tee.length} rounds.`, `At least 30% were marked ${side} in ${recurring.length} rounds. OB/water outcomes have no recorded side and are not assigned one.`],
        rule: 'One recorded side ≥30% of ≥30 tracked outcomes, recurring at ≥30% in 3 rounds on distinct dates.', sample: sample(tee.length, teeCount), ...range(tee),
      });
    }
  }

  const fullPutts = recent.filter(round => round.holes.every(hole => hole.putts !== null));
  cover('Putts per round', repeated(fullPutts), `${fullPutts.length} recent 18-hole rounds have putts on every hole; 3 rounds on distinct dates required.`);
  if (repeated(fullPutts)) {
    const totals = fullPutts.map(round => sum(round.holes.map(hole => hole.putts!)));
    const affected = fullPutts.filter((_, i) => totals[i] >= insightRules.puttsPerRound);
    if (mean(totals) >= insightRules.puttsPerRound && repeated(affected)) add({
      id: 'putts', area: 'putts', title: 'Putting totals remain high across rounds',
      metric: { value: mean(totals), unit: 'putts / round', label: 'Fully tracked putting totals' },
      evidence: [`${sum(totals)} putts across ${fullPutts.length} complete 18-hole putting records.`, `${affected.length} rounds had at least 36 putts. Putt totals alone do not identify putting technique or approach quality.`],
      rule: 'Average ≥36 putts per 18-hole round, with ≥36 in at least 3 rounds on distinct dates.', sample: sample(fullPutts.length, fullPutts.length * 18), ...range(fullPutts),
    });
  }
  const putting = recent.map(round => ({ ...round, tracked: round.holes.filter(hole => hole.putts !== null) })).filter(round => round.tracked.length >= 9);
  const puttingHoles = putting.flatMap(round => round.tracked), threePutts = puttingHoles.filter(hole => hole.putts! >= 3).length;
  const puttingReady = repeated(putting) && puttingHoles.length >= insightRules.puttingHoles;
  cover('Three-putts', puttingReady, `${puttingHoles.length} tracked putting holes in ${putting.length} recent rounds; 54 holes across 3 dates required.`);
  if (puttingReady) {
    const affected = putting.filter(round => round.tracked.filter(hole => hole.putts! >= 3).length / round.tracked.length * 100 >= insightRules.threePuttPercent);
    if (threePutts / puttingHoles.length * 100 >= insightRules.threePuttPercent && repeated(affected)) add({
      id: 'three-putts', area: 'three_putts', title: 'Three-putts recur across rounds',
      metric: { value: threePutts / puttingHoles.length * 100, unit: '%', label: 'Tracked holes with 3+ putts' },
      evidence: [`${threePutts} of ${puttingHoles.length} tracked putting holes had 3 or more putts.`, `The rate reached 10% in ${affected.length} of ${putting.length} rounds. Untracked putts are excluded.`],
      rule: '3+ putts on ≥10% of ≥54 tracked holes, with ≥10% in 3 rounds on distinct dates.', sample: sample(putting.length, puttingHoles.length), ...range(putting),
    });
  }

  cover('Hole scoring', repeated(recent), `${recent.length} completed 18-hole scorecards; 3 rounds on distinct dates required.`);
  if (repeated(recent)) {
    const counts = recent.map(round => round.holes.filter(hole => hole.score - hole.par >= 3).length);
    const affected = recent.filter((_, i) => counts[i] >= insightRules.blowUpPerRound);
    if (mean(counts) >= insightRules.blowUpPerRound && repeated(affected)) add({
      id: 'blow-up', area: 'blow_up', title: 'Large hole scores recur across rounds',
      metric: { value: mean(counts), unit: 'holes / round', label: 'Holes at least 3 over par' },
      evidence: [`${sum(counts)} of ${recent.length * 18} holes were at least 3 strokes over par.`, `${affected.length} rounds had at least 2 such holes. These can overlap with penalty and putting observations.`],
      rule: 'Average ≥2 holes at least 3 over par per round, recurring in 3 rounds on distinct dates.', sample: sample(recent.length, recent.length * 18), ...range(recent),
    });
    const candidates: { par: number; excess: number; gap: number; count: number; affected: CompletedRoundObservation[] }[] = [];
    for (const par of [3, 4, 5]) {
      const holes = recent.flatMap(round => round.holes.filter(hole => hole.par === par));
      const other = recent.flatMap(round => round.holes.filter(hole => [3, 4, 5].includes(hole.par) && hole.par !== par));
      if (holes.length < insightRules.parHoles || !other.length) continue;
      const excess = mean(holes.map(hole => hole.score - hole.par)), gap = excess - mean(other.map(hole => hole.score - hole.par));
      const affected = recent.filter(round => {
        const same = round.holes.filter(hole => hole.par === par), rest = round.holes.filter(hole => [3,4,5].includes(hole.par) && hole.par !== par);
        return same.length > 0 && rest.length > 0 && mean(same.map(hole => hole.score - hole.par)) >= insightRules.parExcess && mean(same.map(hole => hole.score - hole.par)) - mean(rest.map(hole => hole.score - hole.par)) >= insightRules.parGap;
      });
      if (excess >= insightRules.parExcess && gap >= insightRules.parGap && repeated(affected)) candidates.push({ par, excess, gap, count: holes.length, affected });
    }
    const worst = candidates.sort((a,b) => b.excess - a.excess || a.par - b.par)[0];
    if (worst) add({
      id: `par-${worst.par}`, area: 'par_scoring', title: `Par ${worst.par} scores are higher relative to par`,
      metric: { value: worst.excess, unit: 'strokes over par / hole', label: `Par ${worst.par} scoring average` },
      evidence: [`${worst.count} par ${worst.par} holes across ${recent.length} rounds averaged ${fmt(worst.excess)} over par.`, `${fmt(worst.gap)} more strokes over par per hole than other par types. The difference recurred in ${worst.affected.length} rounds; course difficulty is not adjusted.`],
      rule: '≥12 holes; ≥1.5 over par per hole and ≥0.5 worse than other par types, recurring in 3 rounds on distinct dates.', sample: sample(recent.length, worst.count), ...range(recent),
    });
  }

  // Practice patterns are club-specific. For carry goals restrict them to the selected club.
  const clubs = goal.type === 'carry' ? [goalClubKey(goal.club ?? '')] : [...index.practice.keys()].sort();
  for (const club of clubs) {
    const name = goal.type === 'carry' ? goal.club! : index.practice.get(club)?.[0]?.readings[0]?.club ?? club;
    const sessions = (index.practice.get(club) ?? []).slice(-insightRules.window);
    const metricSessions = (field: 'carry' | 'offline') => sessions.map(session => ({ ...session,
      values: session.readings.map(reading => reading[field]).filter(value => valid(value, field === 'carry' ? 0 : -600, 600)),
    })).filter(session => session.values.length >= insightRules.shotsPerSession);
    for (const field of ['carry', 'offline'] as const) {
      const eligible = metricSessions(field), shots = sum(eligible.map(session => session.values.length));
      const ready = repeated(eligible) && shots >= insightRules.practiceShots;
      cover(`${name} ${field === 'carry' ? 'carry consistency' : 'offline pattern'}`, ready, `${shots} individual shots across ${eligible.length} recent sessions; 30 shots, 3 dates and at least 10 per session required.`);
      if (!ready) continue;
      if (field === 'carry') {
        const variation = (session: typeof eligible[number]) => {
          const avg = mean(session.values);
          return avg > 0 ? Math.sqrt(mean(session.values.map(value => (value - avg) ** 2))) / avg : 0;
        };
        const affected = eligible.filter(session => variation(session) >= insightRules.carryCv);
        if (repeated(affected)) add({
          id: `carry-consistency-${club}`, club, area: 'carry_consistency', title: `${name} carry varies within sessions`,
          metric: { value: mean(eligible.map(variation)) * 100, unit: '%', label: 'Average within-session carry variation (SD / mean)' },
          evidence: [`${shots} individual carry measurements across ${eligible.length} sessions.`, `Variation was at least 15% in ${affected.length} sessions. Best and average entries are excluded; shot intent and practice conditions are unknown.`],
          rule: 'Within-session population SD / mean ≥15% in 3 sessions on distinct dates, each with ≥10 carry observations.', sample: sample(0, 0, eligible.length, shots), ...range(eligible),
        });
      } else {
        for (const side of ['left', 'right'] as const) {
          const onSide = (value: number) => side === 'right' ? value >= insightRules.offlineMetres : value <= -insightRules.offlineMetres;
          const affected = eligible.filter(session => session.values.filter(onSide).length / session.values.length * 100 >= insightRules.offlinePercent);
          if (!repeated(affected)) continue;
          const values = eligible.flatMap(session => session.values), count = values.filter(onSide).length;
          if (count / values.length * 100 < insightRules.offlinePercent) continue;
          add({ id: `offline-${side}-${club}`, club, area: 'practice_direction', title: `${name} practice shots repeatedly finish ${side}`,
            metric: { value: count / values.length * 100, unit: '%', label: `Individual shots at least 10 m ${side} of target` },
            evidence: [`${count} of ${shots} offline measurements were at least 10 m ${side}, across ${eligible.length} sessions.`, `At least 60% finished on that side in ${affected.length} sessions. This is practice evidence; it does not establish a course miss or a swing cause.`],
            rule: '≥60% at least 10 m to one side across ≥30 individual shots, recurring in 3 sessions on distinct dates with ≥10 shots each.', sample: sample(0, 0, eligible.length, shots), ...range(eligible),
          });
        }
      }
    }
    if (goal.type === 'carry') addCarryRegression(goal, index, name, add, cover);
  }
  const priority: InsightArea[] = ['penalties', 'tee_in_play', 'three_putts', 'putts', 'blow_up', 'direction', 'par_scoring', 'carry', 'carry_consistency', 'practice_direction'];
  findings.sort((a,b) => Number(b.relation === 'goal_metric') - Number(a.relation === 'goal_metric') || Number(a.relation === 'practice_context') - Number(b.relation === 'practice_context') || priority.indexOf(a.area) - priority.indexOf(b.area) || a.id.localeCompare(b.id));
  return { findings, coverage };
}

function addCarryRegression(goal: GoalInput, index: GoalProgressIndex, name: string, add: (finding: Omit<GoalFinding, 'relation'>) => void, cover: (area: string, sufficient: boolean, evidence: string) => void) {
  const series = index.carry.get(goalClubKey(goal.club ?? '')) ?? [];
  const six = series.slice(-6), previous = six.slice(0,3), recent = six.slice(3);
  const progress = calculateGoalProgress(goal, index);
  const ready = six.length === 6 && repeated(previous) && repeated(recent) && progress.trend.delta !== null;
  cover(`${name} carry trend`, ready, `${six.length} eligible carry sessions; two 3-session windows on distinct dates required.`);
  if (!ready) return;
  const previousMean = mean(previous.map(session => session.value)), recentMean = mean(recent.map(session => session.value));
  if (previousMean <= 0 || (previousMean - recentMean) / previousMean * 100 < insightRules.carryDropPercent || !recent.every(session => session.value <= previousMean * 0.95)) return;
  add({ id: `carry-decline-${goalClubKey(goal.club ?? '')}`, club: goalClubKey(goal.club ?? ''), area: 'carry', title: `${name} recorded session carry has declined`,
    metric: { value: recentMean, unit: 'm', label: 'Average carry in the latest 3 sessions' },
    evidence: [`Session carry averaged ${fmt(previousMean)} m in the preceding 3 sessions and ${fmt(recentMean)} m in the latest 3.`, `All 3 recent sessions were at least 5% below the preceding average. The 6 session means use ${sum(six.map(session => session.sample.shots))} individual carry observations and ${sum(six.map(session => session.sample.averages))} recorded averages. Session means have equal weight; conditions and shot intent are not known.`],
    rule: 'At least 6 carry sessions with 3 dates per window; latest mean ≥5% lower, with all 3 recent session means ≥5% below the preceding mean.', sample: sample(0, 0, 6, sum(six.map(session => session.sample.shots))), ...{ from: six[0].date, to: six.at(-1)!.date },
  });
}
