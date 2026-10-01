'use client';
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MAX_READINGS, clubMetricSchema, distanceFields, metricFields, type ClubMetric, type MetricField } from '@/lib/club-import';
import { practiceSmash, shotMetricLabels, shotDisplayValue, shotStoredValue, shotHasData, isShotSpeed } from '@/lib/practice-shots';
import { distanceLabel, speedLabel, rounded, type UserPreferences } from '@/lib/preferences';

type Column = MetricField | 'notes';
type Props = { readings: ClubMetric[]; preferences: UserPreferences; onUpsert: (shot: ClubMetric) => void; onRemove: (id: string) => void };
export function PracticeShots({ readings, preferences, onUpsert, onRemove }: Props) {
  const shots = readings.filter(reading => reading.sampleType === 'Single shot');
  // Empty entry rows are UI-only. The first observation commits a real shot to
  // the session draft; editing an existing shot preserves its ID/provenance.
  const [entryRows, setEntryRows] = useState<ClubMetric[]>([]);
  const [selectedClub, setSelectedClub] = useState(shots[0]?.club ?? 'Driver');
  const [newClub, setNewClub] = useState('Driver');
  const [columns, setColumns] = useState<Column[]>(() => [...new Set<Column>(['carry', 'clubSpeed', 'ballSpeed', 'smash', ...metricFields.filter(field => shots.some(shot => shot[field] !== undefined)), ...(shots.some(shot => shot.notes) ? ['notes' as const] : [])])]);
  const root = useRef<HTMLDivElement>(null);
  const rows = [...shots.filter(shot => !entryRows.some(row => row.id === shot.id)), ...entryRows.map(row => shots.find(shot => shot.id === row.id) ?? row)];
  const clubs = [...new Set(rows.map(row => row.club))];
  const club = clubs.includes(selectedClub) ? selectedClub : clubs[0] ?? selectedClub;
  const group = rows.filter(row => row.club === club);
  const count = readings.length + entryRows.filter(row => !shots.some(shot => shot.id === row.id)).length;
  const unit = (field: Column) => field === 'notes' ? '' : distanceFields.includes(field) ? distanceLabel(preferences.distanceUnit) : isShotSpeed(field) ? speedLabel(preferences.speedUnit) : ['launch', 'horizontalLaunch'].includes(field) ? '°' : ['spin', 'sideSpin'].includes(field) ? 'rpm' : '';
  const label = (field: Column) => field === 'notes' ? 'Notes' : shotMetricLabels[field];
  function focusRow(id: string) {
    requestAnimationFrame(() => Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-shot-cell]') ?? []).find(input => input.dataset.shotId === id)?.focus());
  }
  function addRow(targetClub = club) {
    if (count >= MAX_READINGS || !targetClub.trim()) return;
    const row: ClubMetric = { id: crypto.randomUUID(), club: targetClub.trim(), sampleType: 'Single shot' };
    setSelectedClub(row.club); setEntryRows(current => [...current, row]); focusRow(row.id);
  }
  function update(row: ClubMetric, field: Column, text: string) {
    if (readings.length >= MAX_READINGS && !shots.some(shot => shot.id === row.id)) return;
    const next = { ...row, [field]: field === 'notes' ? text : shotStoredValue(field, text, preferences) };
    if (shots.some(shot => shot.id === row.id) || shotHasData(next)) onUpsert(next);
  }
  function navigate(event: KeyboardEvent<HTMLInputElement>, row: ClubMetric) {
    if (event.nativeEvent.isComposing || (event.key !== 'Enter' && event.key !== 'Tab') || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const cells = Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-shot-cell]') ?? []);
    const index = cells.indexOf(event.currentTarget);
    if (cells[index + 1]) { event.preventDefault(); cells[index + 1].focus(); }
    else if (index === cells.length - 1 && shotHasData(row) && count < MAX_READINGS) { event.preventDefault(); addRow(); }
    else if (event.key === 'Enter') { event.preventDefault(); } // Never submit the session while entering shots.
  }
  const grid = { '--shot-columns': columns.length } as CSSProperties;
  return <div className="practice-shots" ref={root}>
    <div className="shot-club-start"><label className="field">Club for shots<input list="golf-clubs" maxLength={80} value={newClub} onChange={event => setNewClub(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addRow(newClub); } }}/></label><button className="button" type="button" disabled={!newClub.trim() || count >= MAX_READINGS} onClick={() => addRow(newClub)}><Plus size={17}/>Start shots</button></div>
    {!!clubs.length && <div className="shot-club-switch" aria-label="Shot clubs">{clubs.map(name => <button key={name} className={`button ${club === name ? 'primary' : ''}`} type="button" aria-pressed={club === name} onClick={() => setSelectedClub(name)}>{name} <span className="muted">{rows.filter(row => row.club === name && shotHasData(row)).length}</span></button>)}</div>}
    <details className="shot-column-picker"><summary>Choose columns · {columns.length} selected</summary><p className="muted">Hidden columns keep their values. Every measurement is optional.</p><div>{([...metricFields, 'notes'] as Column[]).map(field => <label key={field}><input type="checkbox" checked={columns.includes(field)} disabled={columns.length === 1 && columns.includes(field)} onChange={event => setColumns(current => event.target.checked ? [...current, field] : current.filter(column => column !== field))}/>{label(field)}</label>)}</div></details>
    <p className="muted shot-entry-help">Tab or Enter moves to the next cell and adds a row at the end. Smash is calculated from speeds unless entered. Save the session when finished; empty rows are skipped.</p>
    {!!group.length && <>
      <div className="shot-table-scroll"><div className="shot-table" style={grid}>
        <div className="shot-table-head" aria-hidden="true"><span>Shot</span>{columns.map(field => <span key={field}>{label(field)} {unit(field)}</span>)}<span/></div>
        {group.map((row, index) => <div className="shot-entry-row" key={row.id}>
          <strong className="shot-number">{index + 1}<span>Shot {index + 1} · {club}</span></strong>
          {columns.map(field => {
            const value = field === 'notes' ? row.notes : rounded(shotDisplayValue(field, row[field], preferences), 4);
            const derived = field === 'smash' && row.smash === undefined ? practiceSmash(row) : undefined;
            const schema = field === 'notes' ? undefined : clubMetricSchema.shape[field];
            const min = schema?.unwrap().minValue ?? undefined, max = schema?.unwrap().maxValue ?? undefined;
            return <label className="field shot-cell" key={`${field}-${preferences.distanceUnit}-${preferences.speedUnit}`}><span>{label(field)} {unit(field)}</span><input
              data-shot-cell data-shot-id={row.id} aria-label={`${club} shot ${index + 1} ${label(field)}`}
              disabled={readings.length >= MAX_READINGS && !shots.some(shot => shot.id === row.id)}
              type={field === 'notes' ? 'text' : 'number'} inputMode={field === 'notes' ? 'text' : 'decimal'} step="any"
              min={field === 'notes' ? undefined : shotDisplayValue(field, min, preferences)} max={field === 'notes' ? undefined : shotDisplayValue(field, max, preferences)} maxLength={field === 'notes' ? 500 : undefined}
              defaultValue={value ?? ''} placeholder={derived === undefined ? '—' : `${rounded(derived, 2)} auto`}
              onChange={event => update(row, field, event.target.value)} onKeyDown={event => navigate(event, row)}
            />{derived !== undefined && <small className="shot-derived">Auto {rounded(derived, 2)}</small>}</label>;
          })}
          <button className="iconbtn shot-remove" type="button" aria-label={`Remove ${club} shot ${index + 1}`} onClick={() => { setEntryRows(current => current.filter(entry => entry.id !== row.id)); onRemove(row.id); }}><Trash2 size={17}/></button>
        </div>)}
      </div></div>
      <button type="button" className="button shot-add" disabled={count >= MAX_READINGS} onClick={() => addRow()}><Plus size={17}/>Add {club} shot</button>
    </>}
    {!group.length && <p className="muted">Choose a club and start shots to enter a set of individual readings.</p>}
    {count >= MAX_READINGS && <p role="status" className="import-warning">Session limit reached ({MAX_READINGS} readings). Start another session for more shots.</p>}
  </div>;
}
