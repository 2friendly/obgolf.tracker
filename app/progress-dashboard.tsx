'use client';

import { ArrowUpRight, Target } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { goalValue, type Goal } from '@/lib/goals';
import type { GoalProgress } from '@/lib/goal-progress';
import type { GoalFinding } from '@/lib/goal-insights';
import type { DashboardInsights, FocusEvidence } from '@/lib/goal-recommendations';
import { displayDistance, speedLabel, type UserPreferences } from '@/lib/preferences';
import './progress-dashboard.css';

type Props = {
  goal?: Goal; progress?: GoalProgress; insights: DashboardInsights | null;
  loading: boolean; error: string; preferences: UserPreferences;
  onGoals: () => void; onRetry: () => void;
};
const number = (value: number) => value.toLocaleString('en-AU', { maximumFractionDigits: 1 });
function sampleText(progress: GoalProgress) {
  const sample = progress.currentSample;
  if (sample.sessions) return `${sample.sessions} sessions${sample.shots ? ` · ${sample.shots} shots` : ''}${sample.averages ? ` · ${sample.averages} recorded averages` : ''}`;
  return `${sample.rounds} eligible rounds${sample.teeShots ? ` · ${sample.teeShots} tracked tee shots` : ''}`;
}
function Evidence({ item, preferences }: { item: FocusEvidence; preferences: UserPreferences }) {
  const unit = item.unit === 'm' ? preferences.distanceUnit : item.unit === 'mph' ? speedLabel(preferences.speedUnit) : item.unit;
  const amount = item.unit === 'm' ? displayDistance(item.value, preferences.distanceUnit)! : item.unit === 'mph' && preferences.speedUnit === 'kmh' ? item.value*1.609344 : item.value;
  return <><strong>{number(amount)} {unit}</strong> · {item.metric}<br/><span className="muted">{item.sample.observations} observations across {item.sample.records} {item.source === 'course' ? 'rounds' : 'sessions'} · {item.from} to {item.to}. {item.description}</span></>;
}
function Finding({ finding, preferences, goal }: { finding: GoalFinding; preferences: UserPreferences; goal: Goal }) {
  const unit = goal.type === 'carry' && goal.unit === 'yd' ? 'yd' : goal.type === 'carry' ? 'm' : preferences.distanceUnit;
  const value = finding.metric.unit === 'm' ? displayDistance(finding.metric.value, unit)! : finding.metric.value;
  const metricUnit = finding.metric.unit === 'm' ? unit : finding.metric.unit;
  return <article className="progress-finding">
    <div className="finding-title"><h3>{finding.title}</h3><span className="badge">{finding.relation === 'practice_context' ? 'Practice observation' : finding.relation === 'goal_metric' ? 'Goal-related' : 'Course observation'}</span></div>
    <p className="finding-measure"><strong>{number(value)}{metricUnit === '%' ? '%' : ` ${metricUnit}`}</strong><span className="muted">{finding.metric.label}</span></p>
    <p className="muted">{finding.sample.rounds ? `${finding.sample.rounds} completed rounds` : `${finding.sample.sessions} sessions`}{finding.sample.shots ? ` · ${finding.sample.shots} individual shots` : ''}{finding.sample.holes ? ` · ${finding.sample.holes} tracked holes / outcomes` : ''}</p>
    <details className="progress-disclosure"><summary>See evidence</summary><ul>{finding.evidence.map(item => <li key={item}>{item}</li>)}</ul><p className="muted">Recorded {finding.from} to {finding.to}.</p><p className="muted">Rule: {finding.rule}</p></details>
  </article>;
}

export function ProgressDashboard({ goal, progress, insights, loading, error, preferences, onGoals, onRetry }: Props) {
  const value = (amount: number | null) => amount === null ? '—' : goal ? goalValue(goal, Number(amount.toFixed(1))) : '—';
  const recommendation = insights?.recommendations.primary;
  const more = insights?.findings ?? [];
  return <div className="progress-dashboard">
    <section className="panel progress-goal" aria-label="Primary goal progress">
      <div className="sectionhead"><span className="eyebrow">YOUR PRIMARY GOAL</span><button className="button small" onClick={onGoals}>Manage goals <ArrowUpRight size={16}/></button></div>
      {loading ? <p role="status" className="muted">Loading your progress…</p> : error ? <div role="alert" className="error">{error} <button className="button small" onClick={onRetry}>Retry</button></div> : !goal ? <div className="progress-no-goal"><Target size={24}/><h2 id="primary-goal-heading">What do you want to improve?</h2><p className="muted">Choose a primary goal to see your starting point, current performance and recent patterns together.</p><button className="button primary" onClick={onGoals}>Choose a goal</button></div> : <>
        <h2 id="primary-goal-heading">{goal.title}</h2>
        <p className="progress-target">Target: <strong>{goal.type === 'score' ? 'below ' : ''}{goalValue(goal)}</strong>{goal.type === 'carry' ? ` · ${goal.club}` : ''}{goal.target_date ? ` · by ${goal.target_date}` : ''}</p>
        {!progress ? <p className="muted" role="status">Calculating progress…</p> : <>
          <dl className="progress-journey"><div><dt>Where I started</dt><dd>{value(progress.baseline)}</dd><small>{progress.baselineSource === 'entered' ? 'Your entered starting value' : progress.baselineDate ? `First eligible observation · ${progress.baselineDate}` : 'No baseline yet'}</small></div><div><dt>Where I am now</dt><dd>{value(progress.current)}</dd><small>{progress.status === 'unsupported' ? 'No linked metric' : progress.currentLabel}{progress.current !== null ? ` · ${sampleText(progress)}` : ' · no eligible data yet'}</small></div><div><dt>Am I improving?</dt><dd>{progress.status === 'unsupported' ? 'Unavailable' : progress.trend.direction === 'insufficient' ? 'Not enough data' : progress.trend.direction === 'stable' ? 'Holding steady' : progress.trend.direction === 'improving' ? 'Recent average improving' : 'Recent average worsening'}</dd><small>{progress.status === 'unsupported' ? 'This goal has no linked performance metric.' : progress.trend.delta === null ? 'Trend needs 6 eligible rounds or sessions in two date-separated windows.' : `${progress.trend.delta > 0 ? '+' : ''}${goal.type === 'tee_in_play' ? number(progress.trend.delta) + ' percentage points' : value(progress.trend.delta)} · latest 3 versus preceding 3`}</small></div></dl>
          {progress.progressPercent !== null && <div className="progress-to-target"><Progress className="bar" value={progress.progressPercent} aria-label={`Progress from baseline to target: ${Math.floor(progress.progressPercent)}%`}/><p className="muted">{progress.targetRecorded ? 'Target recorded in your data. Mark completion when you are ready.' : `${Math.floor(progress.progressPercent)}% of the change from baseline to target`}</p></div>}
          {progress.status === 'limited' && <p className="muted">Limited sample · fewer than 3 eligible rounds or sessions.</p>}
          {progress.status === 'unsupported' && <p className="muted">This custom goal has no linked metric. Automatic progress is unavailable.</p>}
          {progress.status === 'no_data' && <p className="muted">Your baseline and current value will appear when enough relevant performance data is captured.</p>}
          <details className="progress-disclosure"><summary>How progress is measured</summary><p className="muted">{progress.method} An entered starting value overrides the derived baseline.</p></details>
        </>}
      </>}
    </section>
    {!loading && !error && goal && progress && <section className="panel progress-patterns" aria-labelledby="progress-pattern-heading">
      <div className="sectionhead"><div><span className="eyebrow">YOUR NEXT FOCUS</span><h2 id="progress-pattern-heading">What should I work on next?</h2></div></div>
      {recommendation ? <article className="progress-finding">
        <div className="finding-title"><h3>{recommendation.title}</h3><span className="badge">{recommendation.confidence === 'high' ? 'High' : 'Moderate'} evidence confidence</span></div>
        <p className="muted">{recommendation.goalIds.includes(goal.id) ? `Relevant to your primary goal: ${goal.title}.` : 'A repeated performance pattern; relevance to your primary goal is limited.'}</p>
        <ul>{recommendation.evidence.map((item,i) => <li key={i}><Evidence item={item} preferences={preferences}/></li>)}</ul>
        <details className="progress-disclosure"><summary>Why this focus?</summary>
          <p className="muted">{insights?.recommendations.methodology}</p>
          <p className="muted">Recent trend: {recommendation.trend === 'insufficient' ? 'not enough data' : recommendation.trend}.</p>
          <p className="muted">Rule: {recommendation.rule}</p>
          <ul>{recommendation.limitations.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="muted">Priority score: {number(recommendation.ranking.score)} / 100. Goal relevance {number(recommendation.ranking.relevance*100)}%; problem magnitude {number(recommendation.ranking.magnitude*100)}%; evidence coverage {number(recommendation.ranking.confidence*100)}%; trend priority {number(recommendation.ranking.trend*100)}%; practice/course agreement {number(recommendation.ranking.agreement*100)}%.</p>
        </details>
      </article> : <p className="progress-pattern-empty">No focus has enough repeated evidence yet. Keep recording relevant round and practice measurements; limited tracking leaves areas unassessed.</p>}
      <details className="progress-disclosure"><summary>More evidence and data coverage{insights?.recommendations.connections.length ? ` · ${insights.recommendations.connections.length} practice/course comparisons` : ''}{more.length ? ` · ${more.length} other observations` : ''}</summary>
        {insights?.recommendations.connections.map(connection => <article className="progress-finding" key={connection.id}>
          <h3>{connection.title}</h3><ul>{connection.evidence.map((item,i)=><li key={i}><Evidence item={item} preferences={preferences}/></li>)}</ul>
          <p className="muted">{connection.interpretation}</p><p className="muted">Rule: {connection.rule}</p>
        </article>)}
        {insights?.recommendations.candidates.slice(1).map(candidate => <p className="muted" key={candidate.id}>Also assessed: {candidate.title} · priority {number(candidate.ranking.score)} / 100.</p>)}
        {more.map(finding => <Finding finding={finding} preferences={preferences} goal={goal} key={finding.id}/>)}
        <p className="muted">A signal must recur across at least 3 distinct round or session dates. Areas with limited tracking remain unassessed; an empty list does not establish that every area is performing well.</p>
        <ul className="progress-coverage">{insights?.coverage.map(item => <li key={item.area}><strong>{item.area}</strong><span className="badge">{item.sufficient ? 'Sample sufficient' : 'Limited data'}</span><p className="muted">{item.evidence}</p></li>)}</ul>
      </details>
    </section>}
  </div>;
}
