'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { MAX_READINGS, clubMetricSchema, distanceFields, type ClubMetric } from '@/lib/club-import';
import { defaultShotSettings, parseShotSettings, shotColumns, shotPresets, shotMetricFields, practiceSmash, shotMetricLabels, shotDisplayValue, shotStoredValue, shotHasData, isShotSpeed, type ShotColumn, type ShotPreset, type ShotEntrySettings } from '@/lib/practice-shots';
import { distanceLabel, speedLabel, rounded, type UserPreferences } from '@/lib/preferences';

type Props = { readings: ClubMetric[]; preferences: UserPreferences; preferenceKey: string; onUpsert: (shot: ClubMetric) => void; onRemove: (id: string) => void };
const shortLabels: Partial<Record<ShotColumn, string>> = { total: 'Total', clubSpeed: 'Club speed', ballSpeed: 'Ball speed', launch: 'Launch', horizontalLaunch: 'H. launch', distanceToPin: 'To pin', apex: 'Apex', attackAngle: 'Attack', faceToPath: 'Face/path' };
export function PracticeShots({ readings, preferences, preferenceKey, onUpsert, onRemove }: Props) {
  const shots = readings.filter(reading => reading.sampleType === 'Single shot');
  const [selectedClub, setSelectedClub] = useState(shots[0]?.club ?? 'Driver');
  const [newClub, setNewClub] = useState(shots[0]?.club ?? 'Driver');
  const [extraClubs, setExtraClubs] = useState<string[]>([]);
  const [blankIds, setBlankIds] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<ShotEntrySettings>(defaultShotSettings);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const storageKey = `golf-progress:shot-entry:${encodeURIComponent(preferenceKey)}`;
  useEffect(() => {
    // Imported shots arriving in an initially empty editor should be visible.
    if (!shots.length || shots.some(shot => shot.club === selectedClub) || extraClubs.includes(selectedClub)) return;
    let active = true;
    const name = shots[0].club;
    queueMicrotask(() => { if (active) { setSelectedClub(name); setNewClub(name); } });
    return () => { active = false; };
  }, [shots, selectedClub, extraClubs]);
  useEffect(() => {
    let active = true;
    let restored = defaultShotSettings;
    try { restored = parseShotSettings(localStorage.getItem(storageKey)); } catch { /* Entry works when browser storage is unavailable. */ }
    queueMicrotask(() => { if (active) { setSettings(restored); setReady(true); } });
    return () => { active = false; };
  }, [storageKey]);
  function changeSettings(next: ShotEntrySettings) {
    setSettings(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Optional device preference. */ }
  }
  const columns = shotColumns(settings);
  const clubs = [...new Set([selectedClub, ...shots.map(shot => shot.club), ...extraClubs])];
  const group = shots.filter(row => row.club === selectedClub);
  // A blank row is never saved. Its ID stays unchanged when its first value
  // commits the shot, so the focused cell and partially typed decimal survive.
  const tail: ClubMetric = { id: blankIds[selectedClub] ?? '', club: selectedClub, sampleType: 'Single shot' };
  const displayed = tail.id && !group.some(row => row.id === tail.id) && readings.length < MAX_READINGS ? [...group, tail] : group;
  useEffect(() => {
    if (blankIds[selectedClub] && !shots.some(shot => shot.id === blankIds[selectedClub])) return;
    let active = true;
    const id = crypto.randomUUID();
    queueMicrotask(() => { if (active) setBlankIds(current => ({ ...current, [selectedClub]: id })); });
    return () => { active = false; };
  }, [selectedClub, blankIds, shots]);
  const unit = (field: ShotColumn) => field === 'notes' ? '' : distanceFields.includes(field) ? distanceLabel(preferences.distanceUnit) : isShotSpeed(field) ? speedLabel(preferences.speedUnit) : ['spin', 'sideSpin'].includes(field) ? 'rpm' : field === 'smash' ? '' : '°';
  const label = (field: ShotColumn) => field === 'notes' ? 'Notes' : shotMetricLabels[field];
  function selectClub() {
    const name = newClub.trim();
    if (!name) return;
    setSelectedClub(name); setExtraClubs(current => current.includes(name) ? current : [...current, name]);
  }
  function update(row: ClubMetric, field: ShotColumn, text: string) {
    const next = { ...row, [field]: field === 'notes' ? text : shotStoredValue(field, text, preferences) };
    if (readings.length >= MAX_READINGS && !shots.some(shot => shot.id === row.id)) return;
    if (shots.some(shot => shot.id === row.id) || shotHasData(next)) onUpsert(next);
  }
  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || !['Enter', 'Tab'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const cells = Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-shot-cell]:not(:disabled)') ?? []);
    const index = cells.indexOf(event.currentTarget);
    const next = cells[index + (event.shiftKey ? -1 : 1)];
    if (next) { event.preventDefault(); next.focus(); }
    else if (event.key === 'Enter') event.preventDefault();
  }
  const hiddenStored = shotMetricFields.filter(field => !columns.includes(field) && group.some(row => row[field] !== undefined)).length;
  return <div className="practice-shots" ref={root}>
    <div className="shot-entry-toolbar">
      <label className="field shot-club-label">Club<input aria-label="Club for shots" list="golf-clubs" maxLength={80} value={newClub} onChange={event => setNewClub(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); selectClub(); } }}/></label>
      <button className="iconbtn shot-use-club" title="Use club" aria-label="Use club" type="button" disabled={!newClub.trim()} onClick={selectClub}><Check size={18}/></button>
      <label className="field shot-preset-label">Metrics<select aria-label="Shot metric preset" disabled={!ready} value={settings.preset} onChange={event => changeSettings({ ...settings, preset: event.target.value as ShotPreset })}>{['Basic', 'Standard', 'Advanced', 'Custom'].map(preset => <option key={preset}>{preset}</option>)}</select></label>
    </div>
    {clubs.length > 1 && <div className="shot-club-switch" aria-label="Shot clubs">{clubs.map(name => <button key={name} className={`button small ${selectedClub === name ? 'primary' : ''}`} type="button" aria-pressed={selectedClub === name} onClick={() => { setSelectedClub(name); setNewClub(name); }}>{name} · {shots.filter(row => row.club === name).length}</button>)}</div>}
    <details className="shot-column-picker">
      <summary>Customize columns{hiddenStored ? ` · ${hiddenStored} hidden metrics retained` : ''}</summary>
      <div>{([...shotMetricFields, 'notes'] as ShotColumn[]).map(field => <label key={field}><input type="checkbox" checked={columns.includes(field)} disabled={!ready || (columns.length === 1 && columns.includes(field))} onChange={event => changeSettings({ preset: 'Custom', custom: event.target.checked ? [...columns, field] : columns.filter(column => column !== field) })}/>{label(field)}</label>)}</div>
      {settings.preset !== 'Custom' && <button className="button small" type="button" onClick={() => changeSettings({ preset: 'Custom', custom: [...shotPresets[settings.preset as keyof typeof shotPresets]] })}>Use these as custom columns</button>}
    </details>
    <div className="shot-grid-caption"><strong>{selectedClub} · {group.length} shots</strong><span>Tab / Enter: next cell <span className="shot-swipe-hint">· Swipe for columns</span></span></div>
    <div className="shot-table-scroll" role="region" aria-label={`${selectedClub} shot entry table`} tabIndex={0}>
      <table className="shot-table"><thead><tr><th scope="col">#</th>{columns.map(field => <th scope="col" key={field} title={label(field)}>{shortLabels[field] ?? label(field)}{unit(field) && <small>{unit(field)}</small>}</th>)}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{displayed.map((row, index) => <tr className={`shot-entry-row ${row.id === tail.id ? 'shot-next-row' : ''}`} key={row.id}>
          <th scope="row" className="shot-number" title={row.id === tail.id ? 'Next shot' : `Shot ${index + 1}`}>{row.id === tail.id ? '+' : index + 1}</th>
          {columns.map(field => {
            const value = field === 'notes' ? row.notes : rounded(shotDisplayValue(field, row[field], preferences), 4);
            const derived = field === 'smash' && row.smash === undefined ? practiceSmash(row) : undefined;
            const schema = field === 'notes' ? undefined : clubMetricSchema.shape[field];
            const min = schema?.unwrap().minValue ?? undefined, max = schema?.unwrap().maxValue ?? undefined;
            return <td className="shot-cell" key={`${field}-${preferences.distanceUnit}-${preferences.speedUnit}`}><input
              data-shot-cell data-shot-id={row.id} aria-label={`${selectedClub} shot ${index + 1} ${label(field)}`} title={derived === undefined ? label(field) : `Calculated smash: ${rounded(derived, 2)}. Enter a value to override.`}
              type={field === 'notes' ? 'text' : 'number'} inputMode={field === 'notes' ? 'text' : 'decimal'} step="any"
              min={field === 'notes' ? undefined : shotDisplayValue(field, min, preferences)} max={field === 'notes' ? undefined : shotDisplayValue(field, max, preferences)} maxLength={field === 'notes' ? 500 : undefined}
              defaultValue={value ?? ''} placeholder={derived === undefined ? '—' : `${rounded(derived, 2)}`}
              onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
              onChange={event => update(row, field, event.target.value)} onKeyDown={navigate}
            /></td>;
          })}
          <td className="shot-action">{row.id !== tail.id && <button className="iconbtn shot-remove" type="button" aria-label={`Remove ${selectedClub} shot ${index + 1}`} onClick={() => onRemove(row.id)}><Trash2 size={15}/></button>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="muted shot-entry-help">Smash calculates from speeds unless entered. Empty rows are skipped; save the session when finished.</p>
    {readings.length >= MAX_READINGS && <p role="status" className="import-warning">Session limit reached ({MAX_READINGS} readings).</p>}
  </div>;
}
