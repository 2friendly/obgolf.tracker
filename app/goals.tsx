'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { goalLabels, goalSchema, goalTypes, goalValue, type Goal, type GoalInput } from '@/lib/goals';
import { Progress } from '@/components/ui/progress';
import type { DashboardInsights } from '@/lib/goal-recommendations';
import type { GoalProgress } from '@/lib/goal-progress';
import type { DistanceUnit } from '@/lib/preferences';

export function useUserGoals() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<string, GoalProgress>>({});
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [progressRevision, setProgressRevision] = useState(0);
  function invalidateProgress() { setProgressLoading(true); setProgressRevision(value => value + 1); }
  useEffect(() => {
    if (!goals.length) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setProgressLoading(true); setProgressError('');
      fetch('/api/goals/progress?view=dashboard', { signal: controller.signal, cache: 'no-store' }).then(async response => {
        if (response.status === 401) { router.replace('/auth/login'); throw new Error('Sign in again to view progress.'); }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not calculate goal progress.');
        if (!controller.signal.aborted) { setProgress(data.progress); setInsights(data.insights); }
      }).catch(cause => { if (!controller.signal.aborted) setProgressError((cause as Error).message); })
        .finally(() => { if (!controller.signal.aborted) setProgressLoading(false); });
    }, 200);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [goals, progressRevision, router]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/goals', { signal: controller.signal }).then(async response => {
      if (response.status === 401) { router.replace('/auth/login'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load goals.');
      setProgressLoading(true); setGoals(data);
    }).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [router]);
  async function request(method: string, goal?: GoalInput, id?: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/goals' + (id ? '?id=' + encodeURIComponent(id) : ''), {
        method, headers: { 'Content-Type': 'application/json' }, body: goal ? JSON.stringify(goal) : undefined,
      });
      if (response.status === 401) { router.replace('/auth/login'); throw new Error('Sign in again to manage your goals.'); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save goals.');
      setProgressError('');
      if (method === 'DELETE') setGoals(current => current.filter(item => item.id !== id));
      else { setProgressLoading(true); setGoals(data); }
      return true;
    } catch (cause) { setError((cause as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function reload() {
    setLoading(true);
    await request('GET');
    setLoading(false);
  }
  return { goals, loading, error, busy, setError, request, reload, progress, insights, progressLoading, progressError, invalidateProgress };
}
type GoalsState = ReturnType<typeof useUserGoals>;
type Draft = Omit<GoalInput, 'target_value' | 'starting_value'> & { target_value: string; starting_value: string };

function sampleLabel(sample: GoalProgress['sample']) {
  const parts: string[] = [];
  if (sample.rounds) parts.push(`${sample.rounds} ${sample.rounds === 1 ? 'round' : 'rounds'}`);
  if (sample.sessions) parts.push(`${sample.sessions} ${sample.sessions === 1 ? 'session' : 'sessions'}`);
  if (sample.teeShots) parts.push(`${sample.teeShots} tracked tee shots`);
  if (sample.shots) parts.push(`${sample.shots} individual shots`);
  if (sample.averages) parts.push(`${sample.averages} recorded ${sample.averages === 1 ? 'average' : 'averages'}`);
  return parts.join(' · ') || 'No eligible observations';
}

export function GoalProgressDetails({ goal, progress, loading, error, onRetry, compact = false }: {
  goal: Goal; progress?: GoalProgress; loading: boolean; error: string; onRetry: () => void; compact?: boolean;
}) {
  if (loading || (!progress && !error)) return <p className="muted" role="status">Calculating progress…</p>;
  if (error) return <p className="muted" role="alert">{error} <button className="button small" onClick={onRetry}>Retry progress</button></p>;
  if (!progress) return null;
  const value = (number: number | null) => number === null ? '—' : goalValue(goal, Number(number.toFixed(1)));
  if (progress.status === 'unsupported') return <p className="muted">Custom goal · automatic progress is unavailable.{progress.baseline !== null && <> Starting value: {value(progress.baseline)}.</>}</p>;
  return <div className={'goal-progress' + (compact ? ' compact' : '')}>
    <dl className="goal-progress-values"><div><dt>{progress.currentLabel}</dt><dd>{value(progress.current)}</dd></div>{!compact && <div><dt>Starting / baseline{progress.baselineSource === 'entered' ? ' · entered' : progress.baselineSource === 'derived' ? ' · from data' : ''}</dt><dd>{value(progress.baseline)}</dd></div>}</dl>
    {progress.current === null ? <p className="muted">No eligible data yet. {goal.type === 'carry' ? `Log carry for ${goal.club} in a practice session.` : goal.type === 'tee_in_play' ? 'Record tee results and complete a round.' : goal.type === 'putts' ? 'Complete an 18-hole round with putts recorded on every hole.' : goal.type === 'penalties' ? 'Complete an 18-hole round with hole penalty totals.' : 'Complete an 18-hole on-course round.'}</p> : <>
      {progress.progressPercent !== null ? <><Progress className="bar" value={progress.progressPercent} aria-label={`${goal.title}: ${Math.round(progress.progressPercent)}% of baseline-to-target change`}/><p className="muted">{progress.targetRecorded ? 'Target recorded in your data. Completion is your choice.' : `${Math.floor(progress.progressPercent)}% of the change from baseline to target`}</p></> : <p className="muted">Percentage progress is unavailable: the starting value already met this target.</p>}
      <p className="muted">Current sample: {sampleLabel(progress.currentSample)}</p>
      {progress.status === 'limited' && <p className="muted">Limited data · fewer than 3 eligible {goal.type === 'carry' ? 'sessions' : 'rounds'}.</p>}
    </>}
    {!compact && <>
      <p className="muted">Recent trend: {progress.trend.delta === null ? 'Needs 6 eligible rounds / sessions with separate dates between the two windows.' : `${progress.trend.direction[0].toUpperCase() + progress.trend.direction.slice(1)} · ${progress.trend.delta > 0 ? '+' : ''}${goal.type === 'tee_in_play' ? Number(progress.trend.delta.toFixed(1)) + ' percentage points' : value(progress.trend.delta)} (last 3 versus preceding 3)`}</p>
      <details className="goal-progress-method"><summary>How this is calculated</summary><p className="muted">{progress.method} An entered starting value overrides the derived baseline. Calculations use all recorded history, including data before the goal was created.</p>{progress.baselineDate && <p className="muted">Baseline observation: {progress.baselineDate}</p>}<p className="muted">All eligible data: {sampleLabel(progress.sample)}</p></details>
    </>}
  </div>;
}

export function Goals({ state, distanceUnit, pretty }: { state: GoalsState; distanceUnit: DistanceUnit; pretty: (date: string) => string }) {
  const { goals, loading, error, busy, setError, request, reload } = state;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<Goal | null>(null);
  const [filter, setFilter] = useState<Goal['status']>('active');
  function add() {
    setError(''); setEditing(false);
    setDraft({ id: crypto.randomUUID(), title: '', type: 'score', target_value: '', starting_value: '', target_date: null, status: 'active', is_primary: false, club: null, unit: null });
  }
  function edit(goal: Goal) {
    setError(''); setEditing(true);
    setDraft({ ...goal, target_value: String(goal.target_value), starting_value: goal.starting_value === null ? '' : String(goal.starting_value) });
  }
  async function save() {
    if (!draft) return;
    const result = goalSchema.safeParse({ ...draft, target_value: draft.target_value.trim() ? Number(draft.target_value) : NaN,
      starting_value: draft.starting_value.trim() ? Number(draft.starting_value) : null });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    if (await request(editing ? 'PUT' : 'POST', result.data)) { setFilter(result.data.status); setDraft(null); }
  }
  const visible = goals.filter(goal => goal.status === filter).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return <div className="goals-surface">
    <div className="heading"><div><h2>Your goals</h2><p className="muted">Choose what you want to improve. Set a primary goal to keep it in focus.</p></div><button className="button primary" disabled={loading || busy} onClick={add}><Plus size={16}/>Add goal</button></div>
    <div className="toolbar" aria-label="Filter goals">{(['active', 'completed', 'archived'] as const).map(status => <button className={'button ' + (filter === status ? 'primary' : '')} aria-pressed={filter === status} key={status} onClick={() => setFilter(status)}>{status[0].toUpperCase() + status.slice(1)} ({goals.filter(goal => goal.status === status).length})</button>)}</div>
    {error && !draft && <div className="error" role="alert">{error} <button className="button small" disabled={busy || loading} onClick={() => void reload()}>Reload goals</button></div>}
    {loading ? <p className="loading muted">Loading your goals…</p> : <div className="ledger">{visible.map(goal => <article className="panel goalcard" key={goal.id}>
      <div className="sectionhead"><span className="badge">{goal.is_primary ? 'Primary · ' : ''}{goalLabels[goal.type]}</span><button className="goal-edit iconbtn" disabled={busy} aria-label={'Edit ' + goal.title} onClick={() => edit(goal)}><Pencil size={18}/></button></div>
      <h3>{goal.title}</h3><p>Target: <strong>{goalValue(goal)}</strong>{goal.type === 'carry' && <> · {goal.club}</>}</p>
      {goal.type === 'score' && <p className="muted">Score below this target in a complete 18-hole on-course round.</p>}
      <GoalProgressDetails goal={goal} progress={state.progress[goal.id]} loading={state.progressLoading} error={state.progressError} onRetry={state.invalidateProgress}/>
      {goal.target_date && <p className="muted">Target date: {pretty(goal.target_date)}</p>}
      <div className="toolbar goal-actions">
        {goal.status === 'active' ? <>
          <button className="button" disabled={busy} onClick={() => void request('PUT', { ...goal, is_primary: !goal.is_primary })}>{goal.is_primary ? 'Make secondary' : 'Make primary'}</button>
          <button className="button" disabled={busy} onClick={() => void request('PUT', { ...goal, status: 'completed', is_primary: false })}>Complete</button>
          <button className="button" disabled={busy} onClick={() => void request('PUT', { ...goal, status: 'archived', is_primary: false })}>Archive</button>
        </> : <button className="button" disabled={busy} onClick={() => void request('PUT', { ...goal, status: 'active', is_primary: false })}>Reactivate</button>}
        <button className="button danger" disabled={busy} onClick={() => { setError(''); setRemoving(goal); }}>Delete</button>
      </div>
    </article>)}</div>}
    {!loading && !error && !visible.length && <section className="panel empty"><Target size={28}/><h3>{filter === 'active' ? 'Give your progress a destination' : `No ${filter} goals`}</h3><p className="muted">{filter === 'active' ? 'Create a goal for scoring, course performance, club carry or your own measurable target.' : 'Your goals will appear here when you change their status.'}</p>{filter === 'active' && <button className="button" onClick={add}>Create a goal</button>}</section>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open && !busy) { setDraft(null); setError(''); } }}>
      <DialogContent className="modal goals-modal"><DialogTitle>{editing ? 'Edit goal' : 'Create goal'}</DialogTitle><DialogDescription>Set a measurable target. Starting value and target date are optional.</DialogDescription>
        {draft && <form onSubmit={event => { event.preventDefault(); void save(); }}><div className="formgrid">
          <label className="field span2">Goal type<select value={draft.type} onChange={event => {
            const type = event.target.value as Goal['type'];
            setDraft({ ...draft, type, target_value: '', starting_value: '', club: type === 'carry' ? 'Driver' : null, unit: type === 'carry' ? distanceUnit : null });
          }}>{goalTypes.map(type => <option key={type} value={type}>{goalLabels[type]}</option>)}</select></label>
          <label className="field span2">Title<input required maxLength={200} value={draft.title} placeholder="What do you want to achieve?" onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
          {draft.type === 'carry' && <><label className="field">Club<input required maxLength={80} value={draft.club ?? ''} onChange={event => setDraft({ ...draft, club: event.target.value })}/></label><label className="field">Distance unit<select value={draft.unit ?? distanceUnit} onChange={event => setDraft({ ...draft, unit: event.target.value })}><option value="m">Metres</option><option value="yd">Yards</option></select></label></>}
          {draft.type === 'custom' && <label className="field span2">Unit (optional)<input maxLength={30} placeholder="e.g. sessions / month" value={draft.unit ?? ''} onChange={event => setDraft({ ...draft, unit: event.target.value || null })}/></label>}
          <label className="field">{draft.type === 'score' ? 'Score below' : 'Target value'}{draft.type === 'tee_in_play' ? ' (%)' : ''}<input required type="number" step="any" min={draft.type === 'custom' ? -1000000 : draft.type === 'score' ? 0.000001 : 0} max={draft.type === 'tee_in_play' ? 100 : 1000000} value={draft.target_value} onChange={event => setDraft({ ...draft, target_value: event.target.value })}/></label>
          <label className="field">Starting value (optional)<input type="number" step="any" value={draft.starting_value} onChange={event => setDraft({ ...draft, starting_value: event.target.value })}/></label>
          <label className="field">Target date (optional)<input type="date" value={draft.target_date ?? ''} onChange={event => setDraft({ ...draft, target_date: event.target.value || null })}/></label>
          <label className="field">Status<select value={draft.status} onChange={event => { const status = event.target.value as Goal['status']; setDraft({ ...draft, status, is_primary: status === 'active' && draft.is_primary }); }}>{['active', 'completed', 'archived'].map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          {draft.status === 'active' && <label className="goal-primary span2"><input type="checkbox" checked={draft.is_primary} onChange={event => setDraft({ ...draft, is_primary: event.target.checked })}/>Make this my primary goal</label>}
          {draft.is_primary && <p className="muted span2">Your previous primary goal will become a secondary goal.</p>}
        </div>{error && <div className="error" role="alert">{error}</div>}<div className="goal-actions toolbar"><button className="button" type="button" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Cancel</button><button className="button primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save goal'}</button></div></form>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!removing} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}><AlertDialogContent className="modal"><AlertDialogTitle>Delete this goal?</AlertDialogTitle><AlertDialogDescription>“{removing?.title}” will be permanently deleted. Archive it to keep a record instead.</AlertDialogDescription>{error && <div className="error" role="alert">{error}</div>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); if (removing) void request('DELETE', undefined, removing.id).then(ok => { if (ok) setRemoving(null); }); }}>{busy ? 'Deleting…' : 'Delete goal'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
