import type { GoalInput } from './goals.ts';
import type { GoalFinding, GoalInsights, InsightArea } from './goal-insights.ts';
import { goalClubKey, type GoalProgressIndex } from './goal-progress.ts';

export type FocusArea = 'tee_accuracy' | 'penalties' | 'putting' | 'scoring_control' | 'carry' | 'carry_consistency';
export type FocusEvidence = {
  source: 'course' | 'practice'; metric: string; value: number; unit: string;
  sample: { records: number; observations: number }; from: string; to: string; description: string;
};
export type FocusCandidate = {
  id: string; area: FocusArea; club: string | null; title: string;
  confidence: 'moderate' | 'high'; evidence: FocusEvidence[]; goalIds: string[];
  trend: 'worsening' | 'improving' | 'stable' | 'insufficient';
  ranking: { relevance: number; magnitude: number; confidence: number; trend: number; agreement: number; score: number };
  rule: string; limitations: string[];
};
export type PracticeCourseConnection = {
  id: string; club: string; kind: 'possible_transfer' | 'mixed_trends'; title: string;
  evidence: FocusEvidence[]; interpretation: string; rule: string;
};
export type GoalRecommendations = {
  primary: FocusCandidate | null; candidates: FocusCandidate[]; connections: PracticeCourseConnection[];
  status: 'available' | 'insufficient_evidence'; methodology: string;
};
export type DashboardInsights = GoalInsights & { recommendations: GoalRecommendations };

/** Transparent product heuristics; confidence describes evidence coverage, not causal certainty. */
export const focusRules = {
  records: 3, observations: 30, perSession: 10, perRound: 6, window: 5,
  offlineRmsMetres: 15, inPlayPercent: 60, penaltyRate: 0.2,
  dispersionChange: 0.2, speedChange: 0.05, accuracyChangePoints: 10, penaltyChange: 0.5, agreementMaxDays: 90,
  weights: { relevance: 40, magnitude: 25, confidence: 15, trend: 10, agreement: 10 },
} as const;
const mean = (xs: number[]) => xs.reduce((a,b) => a+b,0) / xs.length;
const clamp = (value: number) => Math.max(0,Math.min(1,value));
const fmt = (n: number) => Number(n.toFixed(1));
const valid = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
type Series = { id: string; date: string; value: number; count: number }[];
const repeated = (xs: { date: string }[]) => xs.length >= focusRules.records && new Set(xs.map(x=>x.date)).size >= focusRules.records;
const ready = (xs: Series) => repeated(xs) && xs.reduce((s,x)=>s+x.count,0) >= focusRules.observations;
const average = (xs: Series) => mean(xs.map(x=>x.value));
const weighted = (xs: Series) => xs.reduce((s,x)=>s+x.value*x.count,0) / xs.reduce((s,x)=>s+x.count,0);
function evidence(source: FocusEvidence['source'], metric: string, unit: string, series: Series, description: string, byShot = false): FocusEvidence {
  return { source, metric, unit, value: byShot ? weighted(series) : average(series),
    sample: { records: series.length, observations: series.reduce((s,x)=>s+x.count,0) },
    from: series[0].date, to: series.at(-1)!.date, description };
}
function windows(series: Series) {
  const previous = series.slice(-6,-3), recent = series.slice(-3);
  if (series.length < 6 || !ready(previous) || !ready(recent) || previous.at(-1)!.date >= recent[0].date) return null;
  return { previous, recent };
}
function shift(series: Series, relative: number, absolute: number, byShot = false) {
  const w = windows(series); if (!w) return null;
  const avg = byShot ? weighted : average;
  const previous = avg(w.previous), recent = avg(w.recent), delta = recent-previous;
  const threshold = Math.max(Math.abs(previous)*relative, absolute);
  // Every recent record must support the shift: one exceptional session/round cannot create a trend.
  const direction = delta <= -threshold && w.recent.every(x=>x.value <= previous-threshold) ? 'down'
    : delta >= threshold && w.recent.every(x=>x.value >= previous+threshold) ? 'up' : 'stable';
  return { ...w, previousValue: previous, recentValue: recent, direction };
}
const areaFor = (area: InsightArea): FocusArea => ['tee_in_play','direction','practice_direction'].includes(area) ? 'tee_accuracy'
  : ['putts','three_putts'].includes(area) ? 'putting' : ['blow_up','par_scoring'].includes(area) ? 'scoring_control'
  : area === 'carry_consistency' ? 'carry_consistency' : area === 'carry' ? 'carry' : 'penalties';
function relevance(goal: GoalInput, area: FocusArea, club: string | null) {
  if (goal.type === 'carry') return goalClubKey(goal.club ?? '') === club ? area === 'carry' ? 1 : ['tee_accuracy','carry_consistency'].includes(area) ? 0.75 : 0 : 0;
  if (goal.type === 'putts') return area === 'putting' ? 1 : area === 'scoring_control' ? 0.4 : 0.15;
  if (goal.type === 'penalties') return area === 'penalties' ? 1 : area === 'tee_accuracy' ? 0.9 : 0.2;
  if (goal.type === 'tee_in_play') return area === 'tee_accuracy' ? 1 : area === 'penalties' ? 0.7 : 0.15;
  if (goal.type === 'score') return ['carry','carry_consistency'].includes(area) ? 0.3 : 0.85;
  return 0.25; // A custom title is not evidence of a measurable objective.
}
function magnitude(finding: GoalFinding) {
  const value = finding.metric.value;
  switch (finding.area) {
    case 'penalties': return clamp(value/5);
    case 'tee_in_play': return clamp((100-value)/60);
    case 'direction': return clamp(value/60);
    case 'putts': return clamp((value-30)/12);
    case 'three_putts': return clamp(value/25);
    case 'blow_up': return clamp(value/5);
    case 'par_scoring': return clamp(value/3);
    case 'carry_consistency': return clamp(value/30);
    case 'practice_direction': return clamp(value/100);
    case 'carry': return 0.5;
  }
}

export function recommendGoalFocus(goals: readonly GoalInput[], index: GoalProgressIndex, insights: GoalInsights): GoalRecommendations {
  const active = goals.filter(goal=>goal.status === 'active');
  const primary = active.find(goal=>goal.is_primary);
  const candidates: FocusCandidate[] = [], connections: PracticeCourseConnection[] = [];
  const add = (candidate: Omit<FocusCandidate,'ranking'|'goalIds'>, magnitude: number, confidence: number, agreement: number) => {
    const related = active.map(goal=>({goal, relevance: relevance(goal,candidate.area,candidate.club)}));
    const goalRelevance = Math.max(0,...related.map(({goal,relevance:r})=>r*(primary && goal.id !== primary.id ? 0.7 : 1)));
    const trend = candidate.trend === 'worsening' ? 1 : candidate.trend === 'improving' ? 0 : 0.5;
    const ranking = { relevance: goalRelevance, magnitude: clamp(magnitude), confidence: clamp(confidence), trend, agreement: clamp(agreement), score: 0 };
    for (const key of ['relevance','magnitude','confidence','trend','agreement'] as const) ranking.score += ranking[key]*focusRules.weights[key];
    candidates.push({ ...candidate, ranking, goalIds: related.filter(x=>x.relevance >= 0.7).map(x=>x.goal.id).sort() });
  };
  for (const finding of active.length ? insights.findings : []) {
    const area = areaFor(finding.area);
    const club = finding.club ?? (finding.area === 'practice_direction' ? finding.id.replace(/^offline-(left|right)-/,'')
      : finding.area === 'carry_consistency' ? finding.id.replace(/^carry-consistency-/,'')
      : finding.area === 'carry' ? goalClubKey(primary?.club ?? '') || null : null);
    const series = finding.area === 'penalties' ? index.penalties : finding.area === 'putts' ? index.putts
      : finding.area === 'tee_in_play' ? index.tee_in_play : finding.area === 'carry' && club ? index.carry.get(club) ?? [] : [];
    // Course totals can have fewer than 30 observations, so use their established goal-progress trend rule.
    const last = series.slice(-6), before = last.slice(0,3), after = last.slice(3);
    let trend: FocusCandidate['trend'] = 'insufficient';
    if (last.length === 6 && repeated(before) && repeated(after) && before.at(-1)!.date < after[0].date) {
      const old = mean(before.map(x=>x.value)), higherBetter = ['tee_in_play','carry'].includes(finding.area);
      const better = after.every(x=>higherBetter ? x.value > old : x.value < old);
      const worse = after.every(x=>higherBetter ? x.value < old : x.value > old);
      trend = better ? 'improving' : worse ? 'worsening' : 'stable';
    }
    const titles: Record<FocusArea,string> = { tee_accuracy:'Practise tee-shot accuracy', penalties:'Work on reducing on-course penalties', putting:'Practise putting consistency', scoring_control:'Focus on avoiding high-scoring holes', carry:'Work on consistent carry distance', carry_consistency:'Practise consistent carry distance' };
    add({ id: finding.id, area, club, title: titles[area], confidence:'moderate', trend,
      evidence:[{ source: finding.sample.rounds ? 'course' : 'practice', metric:finding.metric.label, value:finding.metric.value, unit:finding.metric.unit,
        sample:{records:finding.sample.rounds || finding.sample.sessions,observations:finding.sample.shots || finding.sample.holes}, from:finding.from,to:finding.to,description:finding.evidence.join(' ') }],
      rule:finding.rule, limitations:['These are repeated observations, not a diagnosis.', ...(club ? ['Practice intent and conditions are unknown.'] : ['Club attribution is unavailable for this aggregate.'])] },magnitude(finding),Math.min(1,(finding.sample.rounds || finding.sample.sessions)/5),0);
  }
  const clubs = [...new Set([...index.practice.keys(),...index.rounds.flatMap(r=>r.holes.map(h=>h.teeShot?.club).filter((c): c is string=>!!c))])].sort();
  for (const club of active.length ? clubs : []) {
    const name = index.practice.get(club)?.at(-1)?.readings[0]?.club ?? club;
    const practice = (field: 'offline'|'clubSpeed') => (index.practice.get(club) ?? []).map(session=>{
      const values = session.readings.map(x=>x[field]).filter(x=>valid(x,field === 'offline' ? -600 : 1, field === 'offline' ? 600 : 250));
      return {id:session.id,date:session.date,count:values.length,value:values.length ? field === 'offline' ? Math.sqrt(mean(values.map(x=>x*x))) : mean(values) : 0};
    }).filter(s=>s.count >= focusRules.perSession);
    // RMS offline includes both spread and bias relative to the target, in normalized metres.
    const dispersion = practice('offline'), speed = practice('clubSpeed');
    const course = index.rounds.map(round=>{
      const tees = round.holes.filter(h=>h.par > 3 && h.teeShot?.club === club).map(h=>({
        result:h.teeResult ?? ({good:'in_play',left:'left',right:'right',ob:'ob',water:'water'} as Record<string,string>)[h.teeShot!.result] ?? null,
        penalties:h.teeShot!.penalties,
      })).filter(h=>h.result !== null);
      return {id:round.id,date:round.date,holeCount:round.holeCount,tees};
    }).filter(r=>r.tees.length >= focusRules.perRound);
    const accuracy: Series = course.map(r=>({id:r.id,date:r.date,count:r.tees.length,value:r.tees.filter(h=>h.result==='in_play').length/r.tees.length*100}));
    const penalties: Series = course.filter(r=>r.holeCount === 18 && r.tees.every(h=>h.penalties!==null)).map(r=>({id:r.id,date:r.date,count:r.tees.length,value:r.tees.reduce((s,h)=>s+h.penalties!,0)}));
    const recentCourse = accuracy.slice(-5), recentPractice = dispersion.slice(-5);
    const recentPenaltyRates = course.slice(-5).map(r=>({id:r.id,date:r.date,count:r.tees.length,value:r.tees.filter(h=>['ob','water'].includes(h.result!)).length/r.tees.length}));
    const badCourse = recentCourse.filter(s=>s.value<=focusRules.inPlayPercent);
    const badPenaltyRates = recentPenaltyRates.filter(s=>s.value >= focusRules.penaltyRate);
    const badPractice = recentPractice.filter(s=>s.value>=focusRules.offlineRmsMetres);
    const pTrend = shift(dispersion,focusRules.dispersionChange,1);
    const practiceReady = ready(recentPractice) && repeated(badPractice) && average(recentPractice)>=focusRules.offlineRmsMetres;
    if (practiceReady) add({id:`practice-accuracy-${club}`,area:'tee_accuracy',club,title:`Practise ${name} accuracy`,confidence:'moderate',trend:pTrend?.direction==='down'?'improving':pTrend?.direction==='up'?'worsening':pTrend?'stable':'insufficient',
      evidence:[evidence('practice',`${name} offline RMS`,'m',recentPractice,`RMS offline was ≥15 m on at least 3 session dates. Session means have equal weight.`)],
      rule:'≥30 individual offline measurements in ≥3 sessions on distinct dates, ≥10 per session; average RMS ≥15 m and threshold exceeded on ≥3 dates.',
      limitations:['Course confirmation is unavailable for this practice-only finding.','Practice intent and conditions are unknown; this is not a swing diagnosis.']},clamp(average(recentPractice)/30),Math.min(1,recentPractice.length/5),0);
    const aTrend = shift(accuracy,0,focusRules.accuracyChangePoints,true);
    const penaltyTrend = shift(penalties,0,focusRules.penaltyChange);
    const speedTrend = shift(speed,focusRules.speedChange,1);
    if (ready(recentCourse) && ((repeated(badCourse) && weighted(recentCourse)<=focusRules.inPlayPercent) || (repeated(badPenaltyRates) && weighted(recentPenaltyRates)>=focusRules.penaltyRate))) {
      const agreement = practiceReady && Math.abs(Date.parse(recentPractice.at(-1)!.date)-Date.parse(recentCourse.at(-1)!.date)) <= focusRules.agreementMaxDays*86400000;
      const outcomes = course.slice(-5).flatMap(r=>r.tees);
      const ev = [evidence('course',`${name} first tee shots in play`,'%',recentCourse,
        `${fmt(weighted(recentCourse))}% in play across ${recentCourse.length} rounds; ${outcomes.filter(h=>h.result==='ob').length} OB, ${outcomes.filter(h=>h.result==='water').length} water, ${outcomes.filter(h=>h.result==='right').length} right and ${outcomes.filter(h=>h.result==='left').length} left outcomes. Each recorded first tee shot identifies ${name}; OB/water directions are unknown.`,true)];
      if (agreement) ev.push(evidence('practice',`${name} offline RMS`,'m',recentPractice,
        `${fmt(average(recentPractice))} m average session RMS offline across ${recentPractice.length} sessions; ≥15 m on at least 3 dates.`));
      add({id:`accuracy-${club}`,area:'tee_accuracy',club,title:`Practise ${name} accuracy`,confidence:agreement?'high':'moderate',evidence:ev,
        trend:aTrend?.direction==='down'?'worsening':aTrend?.direction==='up'?'improving':aTrend?'stable':'insufficient',
        rule:'≥30 club-attributed first tee shots in ≥3 rounds on distinct dates (≥6 per round); ≤60% in play or ≥20% OB/water on ≥3 dates. Practice agreement: ≥30 individual offline measurements (≥10 per session), RMS ≥15 m on ≥3 dates, with latest practice/course records within 90 days.',
        limitations:['Confidence reflects repeated evidence coverage, not a swing diagnosis.','Only explicitly club-attributed first tee shots are included; retries and par 3s are excluded.','Practice intent, course difficulty and conditions are not controlled.']},Math.max(clamp((100-weighted(recentCourse))/60),clamp(weighted(recentPenaltyRates)/0.4)),agreement?1:Math.min(1,recentCourse.length/5),agreement?1:0);
    }
    // Practice improvement must finish before the subsequent course window, with prior course outcomes
    // recorded before the improved practice window. Same-day ordering is deliberately not inferred.
    if (pTrend?.direction==='down' && (aTrend?.direction==='up' || penaltyTrend?.direction==='down')) {
      const c = penaltyTrend?.direction==='down' ? penaltyTrend : aTrend!;
      if (c.previous.at(-1)!.date < pTrend.recent[0].date && pTrend.recent.at(-1)!.date < c.recent[0].date) {
        const isPenalty = c===penaltyTrend;
        connections.push({id:`transfer-${club}`,club,kind:'possible_transfer',title:`${name}: practice improvement followed by better course results`,
          evidence:[evidence('practice',`${name} previous offline RMS`,'m',pTrend.previous,`Earlier RMS: ${fmt(pTrend.previousValue)} m.`),evidence('practice',`${name} recent offline RMS`,'m',pTrend.recent,`Later RMS: ${fmt(pTrend.recentValue)} m.`),
            evidence('course',`${name} previous ${isPenalty?'first-tee penalties':'in-play rate'}`,isPenalty?'penalties / round':'%',c.previous,`Earlier course value: ${fmt(c.previousValue)}.`,!isPenalty),evidence('course',`${name} subsequent ${isPenalty?'first-tee penalties':'in-play rate'}`,isPenalty?'penalties / round':'%',c.recent,`Subsequent course value: ${fmt(c.recentValue)}.`,!isPenalty)],
          interpretation:'The sequence is consistent with possible positive practice-to-course transfer. It does not establish that practice caused the course change.',
          rule:'Two 3-date windows per source, ≥30 observations per window. All recent sessions improve RMS ≥20%; all subsequent rounds improve in-play rate ≥10 points or first-tee penalties ≥0.5 per round. Improved practice follows the prior course window and precedes the subsequent course window.'});
      }
    }
    if (speedTrend?.direction==='up' && aTrend?.direction==='down') connections.push({id:`mixed-${club}`,club,kind:'mixed_trends',title:`${name}: practice speed increased while course accuracy declined`,
      evidence:[evidence('practice',`${name} previous club speed`,'mph',speedTrend.previous,`Earlier speed: ${fmt(speedTrend.previousValue)} mph.`),evidence('practice',`${name} recent club speed`,'mph',speedTrend.recent,`Recent speed: ${fmt(speedTrend.recentValue)} mph.`),
        evidence('course',`${name} previous in-play rate`,'%',aTrend.previous,`Earlier in play: ${fmt(aTrend.previousValue)}%.`,true),evidence('course',`${name} recent in-play rate`,'%',aTrend.recent,`Recent in play: ${fmt(aTrend.recentValue)}%.`,true)],
      interpretation:'These trends measure different outcomes. The data does not show that increased speed caused the accuracy change.',rule:'Two 3-date windows per metric, ≥30 measurements per window; all recent sessions show ≥5% speed increase and all recent rounds show ≥10-point in-play decline.'});
  }
  candidates.sort((a,b)=>b.ranking.score-a.ranking.score || a.id.localeCompare(b.id));
  // Overlapping findings remain as evidence, but do not create multiple recommendations for one area/club.
  const unique = candidates.filter((candidate,i)=>!candidates.slice(0,i).some(other=>other.area===candidate.area && other.club===candidate.club));
  return {primary:unique[0] ?? null,candidates:unique,connections,status:unique.length?'available':'insufficient_evidence',
    methodology:'Priority = goal relevance ×40 + problem magnitude ×25 + evidence coverage ×15 + recent trend ×10 + practice/course agreement ×10. Dimensions are normalized 0–1. Secondary goals receive 70% relevance when a primary goal exists. Only repeated, threshold-qualified patterns are candidates; no causal or swing conclusions are calculated.'};
}
