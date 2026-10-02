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
  goal?: Goal;
  progress?: GoalProgress;
  insights: DashboardInsights | null;
  loading: boolean;
  error: string;
  preferences: UserPreferences;
  onGoals: () => void;
  onRetry: () => void;
  onPractice: () => void;
  onPlan: (title: string, notes: string) => void;
};
const number = (value: number) => value.toLocaleString('en-AU', { maximumFractionDigits: 1 });
function sampleText(progress: GoalProgress) {
  const sample = progress.currentSample;
  if (sample.sessions) return `${sample.sessions} sessions${sample.shots ? ` · ${sample.shots} shots` : ''}${sample.averages ? ` · ${sample.averages} recorded averages` : ''}`;
  return `${sample.rounds} rounds${sample.teeShots ? ` · ${sample.teeShots} tracked tee shots` : ''}`;
}
function evidenceValue(item: FocusEvidence, preferences: UserPreferences) {
  const unit = item.unit === 'm' ? preferences.distanceUnit : item.unit === 'mph' ? speedLabel(preferences.speedUnit) : item.unit;
  const amount = item.unit === 'm' ? displayDistance(item.value, preferences.distanceUnit)! : item.unit === 'mph' && preferences.speedUnit === 'kmh' ? item.value * 1.609344 : item.value;
  return `${number(amount)}${unit === '%' ? '' : ' '}${unit}`;
}
function Evidence({ item, preferences }: { item: FocusEvidence; preferences: UserPreferences }) {
  return <><strong>{evidenceValue(item, preferences)}</strong> · {item.metric}<br/><span className="muted">{item.sample.observations} observations across {item.sample.records} {item.source === 'course' ? 'rounds' : 'sessions'} · {item.from} to {item.to}. {item.description}</span></>;
}
function Finding({ finding, preferences, goal }: { finding: GoalFinding; preferences: UserPreferences; goal: Goal }) {
  const unit = goal.type === 'carry' && goal.unit === 'yd' ? 'yd' : goal.type === 'carry' ? 'm' : preferences.distanceUnit;
  const value = finding.metric.unit === 'm' ? displayDistance(finding.metric.value, unit)! : finding.metric.value;
  const metricUnit = finding.metric.unit === 'm' ? unit : finding.metric.unit;
  return <article className="progress-finding">
    <div className="finding-title"><h3>{finding.title}</h3><span className="badge">{finding.relation === 'practice_context' ? 'Practice observation' : finding.relation === 'goal_metric' ? 'Goal-related' : 'Course observation'}</span></div>
    <p className="finding-measure"><strong>{number(value)}{metricUnit === '%' ? '%' : ` ${metricUnit}`}</strong><span className="muted">{finding.metric.label}</span></p>
    <p className="muted">{finding.sample.rounds ? `${finding.sample.rounds} completed rounds` : `${finding.sample.sessions} sessions`}{finding.sample.shots ? ` · ${finding.sample.shots} individual shots` : ''}{finding.sample.holes ? ` · ${finding.sample.holes} tracked holes / outcomes` : ''}</p>
    <details className="progress-disclosure"><summary>See evidence</summary><ul>{finding.evidence.map(item => <li key={item}>{item}</li>)}</ul><p className="muted">Recorded {finding.from} to {finding.to}.</p></details>
  </article>;
}

export function ProgressDashboard({ goal, progress, insights, loading, error, preferences, onGoals, onRetry, onPractice, onPlan }: Props) {
  const value = (amount: number | null) => amount === null ? '—' : goal ? goalValue(goal, Number(amount.toFixed(1))) : '—';
  const recommendation = insights?.recommendations.primary;
  const more = insights?.findings ?? [];
  const trendLabel = progress?.status === 'unsupported' ? 'No linked metric' : progress?.trend.direction === 'improving' ? 'Improving' : progress?.trend.direction === 'worsening' ? 'Needs attention' : progress?.trend.direction === 'stable' ? 'Holding steady' : 'Building a baseline';
  return <div className="progress-dashboard">
    <section className="progress-goal" aria-label="Primary goal progress">
      <div className="sectionhead"><div><span className="home-section-label">Primary goal</span><h2>{goal?.title??'Your goal'}</h2></div><button className="button small" onClick={onGoals}>Goals <ArrowUpRight size={16}/></button></div>
      {loading ? <p role="status" className="muted">Loading your progress…</p> : error ? <div role="alert" className="error">{error} <button className="button small" onClick={onRetry}>Retry</button></div> : !goal ? <div className="progress-no-goal"><Target size={24}/><h2>What do you want to improve?</h2><p className="muted">Choose a goal. Your rounds and practice will show how you’re progressing.</p><button className="button primary" onClick={onGoals}>Choose a goal</button></div> : <>
        <p className="progress-target">Target: <strong>{goal.type === 'score' ? 'below ' : ''}{goalValue(goal)}</strong>{goal.type === 'carry' ? ` · ${goal.club}` : ''}{goal.target_date ? ` · by ${goal.target_date}` : ''}</p>
        {!progress ? <p className="muted" role="status">Calculating progress…</p> : <>
          <div className="progress-current"><div><span>{progress.status === 'unsupported' ? 'Starting value' : progress.currentLabel}</span><strong>{value(progress.status === 'unsupported' ? progress.baseline : progress.current)}</strong></div><span className={`trend-status ${progress.trend.direction}`}>{trendLabel}</span></div>
          {progress.progressPercent !== null && <div className="progress-to-target"><Progress className="bar" value={progress.progressPercent} aria-label={`Progress from baseline to target: ${Math.floor(progress.progressPercent)}%`}/><p className="muted">{progress.targetRecorded ? 'Target recorded · mark it complete in Goals' : `${Math.floor(progress.progressPercent)}% of your baseline-to-target improvement`}</p></div>}
          <details className="progress-disclosure goal-detail"><summary>Starting point &amp; recent trend</summary>
            <dl className="progress-journey"><div><dt>Starting point</dt><dd>{value(progress.baseline)}</dd><small>{progress.baselineSource === 'entered' ? 'Your entered starting value' : progress.baselineDate ? `First eligible observation · ${progress.baselineDate}` : 'No baseline yet'}</small></div><div><dt>Recent average trend</dt><dd>{trendLabel}</dd><small>{progress.status === 'unsupported' ? 'This custom goal has no linked performance metric.' : progress.trend.delta === null ? 'Needs 6 eligible rounds or sessions in two date-separated windows.' : `${progress.trend.delta > 0 ? '+' : ''}${goal.type === 'tee_in_play' ? number(progress.trend.delta) + ' percentage points' : value(progress.trend.delta)} · latest 3 versus preceding 3`}</small></div></dl>
            <p className="muted">Current sample: {sampleText(progress)}.</p>
            {progress.status === 'limited' && <p className="muted">Limited sample · fewer than 3 eligible rounds or sessions.</p>}
            {progress.status === 'no_data' && <p className="muted">Capture relevant rounds or practice to establish your baseline.</p>}
            <p className="muted">{progress.method} An entered starting value overrides the derived baseline.</p>
          </details>
        </>}
      </>}
    </section>
    {!loading && !error && <section className="progress-patterns" aria-labelledby="progress-pattern-heading">
      <div className="sectionhead"><h2 id="progress-pattern-heading">Your next focus</h2></div>
      {recommendation && goal && progress ? <>
        <h3 className="focus-title">{recommendation.title}</h3>
        {recommendation.evidence[0] && <p className="focus-observation"><strong>{evidenceValue(recommendation.evidence[0], preferences)}</strong> · {recommendation.evidence[0].metric}<span>{recommendation.evidence[0].sample.observations} observations · {recommendation.evidence[0].sample.records} {recommendation.evidence[0].source === 'course' ? 'rounds' : 'sessions'}</span></p>}
        <div className="focus-action"><button className="button primary" onClick={() => onPlan(recommendation.title, recommendation.evidence.map(item => `${evidenceValue(item, preferences)} · ${item.metric}. ${item.description}`).join('\n'))}>Plan practice <ArrowUpRight size={16}/></button><span className="evidence-status">{recommendation.confidence === 'high' ? 'Strong' : 'Moderate'} evidence</span></div>
        <details className="progress-disclosure"><summary>Why this focus?</summary>
          <p className="muted">{recommendation.goalIds.includes(goal.id) ? `Relevant to your goal: ${goal.title}.` : 'A repeated pattern; relevance to your primary goal is limited.'}</p>
          <ul>{recommendation.evidence.map((item, i) => <li key={i}><Evidence item={item} preferences={preferences}/></li>)}</ul>
          <ul>{recommendation.limitations.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="muted">{insights?.recommendations.methodology}</p>
          <p className="muted">Recent trend: {recommendation.trend === 'insufficient' ? 'not enough data' : recommendation.trend}.</p>
        </details>
      </> : <div className="progress-pattern-empty"><h3>{goal ? 'Capture your next session' : 'Start with one session'}</h3><p className="muted">{goal ? 'A few more relevant rounds or practice sessions will help reveal a reliable focus.' : 'Log practice or play a round to build your starting point.'}</p><button className="button" onClick={onPractice}>Log practice <ArrowUpRight size={16}/></button></div>}
      {goal && progress && <details className="progress-disclosure"><summary>More observations &amp; data coverage</summary>
        {insights?.recommendations.connections.map(connection => <article className="progress-finding" key={connection.id}><h3>{connection.title}</h3><ul>{connection.evidence.map((item, i) => <li key={i}><Evidence item={item} preferences={preferences}/></li>)}</ul><p className="muted">{connection.interpretation}</p></article>)}
        {insights?.recommendations.candidates.slice(1).map(candidate => <p className="muted" key={candidate.id}>Also assessed: {candidate.title}.</p>)}
        {more.map(finding => <Finding finding={finding} preferences={preferences} goal={goal} key={finding.id}/>)}
        <p className="muted">Patterns need at least 3 distinct round or session dates. Limited tracking leaves areas unassessed.</p>
        <ul className="progress-coverage">{insights?.coverage.map(item => <li key={item.area}><strong>{item.area}</strong><span className="badge">{item.sufficient ? 'Sample sufficient' : 'Limited data'}</span><p className="muted">{item.evidence}</p></li>)}</ul>
      </details>}
    </section>}
  </div>;
}
