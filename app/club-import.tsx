'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { Worker } from 'tesseract.js';
import { MAX_READINGS, MAX_SOURCE_LENGTH, metricFields, distanceFields, clubMetricSchema, type ClubMetric, type ImportSource, type ImportIssue, type MetricField } from '@/lib/club-import';
import Image from 'next/image';
import { readGolfImage } from '@/lib/image-ocr';
import { displayDistance, displaySpeed, rounded, storeDistance, storeSpeed, type UserPreferences, type DistanceUnit, type SpeedUnit } from '@/lib/preferences';

type Preview = { readings: ClubMetric[]; warnings: string[]; issues?: ImportIssue[]; sourceRows: number };
const metricLabels: Record<MetricField, string> = { carry: 'Carry', total: 'Total distance', clubSpeed: 'Club speed', ballSpeed: 'Ball speed', smash: 'Smash', launch: 'Vertical launch', spin: 'Back spin', sideSpin: 'Side spin', offline: 'Offline', horizontalLaunch: 'Horizontal launch', apex: 'Peak height', distanceToPin: 'Distance to pin' };
const isSpeed = (field: MetricField) => field === 'clubSpeed' || field === 'ballSpeed';
function ReadingReview({ reading, issues, included, distanceUnit, speedUnit, onInclude, onCorrect, onEditing }: {
  reading: ClubMetric; issues: ImportIssue[]; included: boolean; distanceUnit: DistanceUnit; speedUnit: SpeedUnit;
  onInclude: (included: boolean) => void; onCorrect: (field: MetricField, value: string) => boolean; onEditing: () => void;
}) {
  const [inputs, setInputs] = useState<Partial<Record<MetricField, string>>>({});
  const shown = (field: MetricField) => rounded(distanceFields.includes(field) ? displayDistance(reading[field], distanceUnit) : isSpeed(field) ? displaySpeed(reading[field], speedUnit) : reading[field], 2);
  const unit = (field: MetricField) => distanceFields.includes(field) ? distanceUnit : isSpeed(field) ? speedUnit === 'kmh' ? 'km/h' : 'mph' : field === 'spin' || field === 'sideSpin' ? 'rpm' : field === 'launch' || field === 'horizontalLaunch' ? '°' : '';
  const fields = metricFields.filter(field => reading[field] !== undefined || issues.some(issue => issue.field === field));
  return <article className="import-reading"><label className="import-row-select"><input type="checkbox" aria-label={`Include row ${reading.sourceRow}`} checked={included} onChange={event => onInclude(event.target.checked)}/></label><div>
    <strong>Row {reading.sourceRow} · {reading.club} · {reading.sampleType}</strong>
    <span className="import-values">{fields.filter(field => reading[field] !== undefined).map(field => <span key={field}>{metricLabels[field]}: {shown(field)} {unit(field)}</span>)}</span>
    <details><summary>{issues.length ? `Correct ${issues.length} flagged ${issues.length === 1 ? 'value' : 'values'}` : 'Edit extracted values'}</summary><div className="import-settings">{fields.map(field => {
      const issue = issues.find(issue => issue.field === field);
      return <label className="field" key={field}>{metricLabels[field]} {unit(field)}{issue && <small className="import-warning">OCR: {issue.rawValue}</small>}<input type="number" inputMode="decimal" step="any" aria-label={`Row ${reading.sourceRow} ${metricLabels[field]}`} value={inputs[field] ?? shown(field) ?? ''} onChange={event => { setInputs(current => ({ ...current, [field]: event.target.value })); onEditing(); }} onBlur={event => {
        if (inputs[field] === undefined) return;
        const valid = onCorrect(field, event.target.value);
        setInputs(current => { const next = { ...current }; if (valid) delete next[field]; else next[field] = String(shown(field) ?? ''); return next; });
      }}/></label>;
    })}</div></details>
  </div></article>;
}
export function ClubImport({ preferences, existing, sources, onImport }: {
  preferences: UserPreferences; existing: ClubMetric[]; sources: ImportSource[];
  onImport: (readings: ClubMetric[], source: ImportSource) => void;
}) {
  const [open, setOpen] = useState(false), [club, setClub] = useState('Driver');
  const [distanceUnit, setDistanceUnit] = useState(preferences.distanceUnit), [speedUnit, setSpeedUnit] = useState(preferences.speedUnit);
  const [sampleType, setSampleType] = useState<ClubMetric['sampleType']>('Single shot');
  const [fileName, setFileName] = useState(''), [format, setFormat] = useState<ImportSource['format']>('csv');
  const [imageUrl, setImageUrl] = useState(''), [imageLayout, setImageLayout] = useState<'simulator' | 'generic' | 'text'>('text');
  const [text, setText] = useState(''), [rawText, setRawText] = useState(''), [confidence, setConfidence] = useState<number>();
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [excluded, setExcluded] = useState<string[]>([]), [confirmed, setConfirmed] = useState(false);
  const worker = useRef<Worker | null>(null), active = useRef(true), ocrPhase = useRef('');
  useEffect(() => { active.current = true; return () => { active.current = false; void worker.current?.terminate(); worker.current = null; }; }, []);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  function invalidate() { setPreview(null); setConfirmed(false); }
  async function upload(file: File) {
    invalidate(); setError(''); setText(''); setRawText(''); setConfidence(undefined); setFileName(''); setImageUrl(''); setImageLayout('text'); ocrPhase.current = '';
    const extension = file.name.split('.').pop()?.toLowerCase();
    const image = ['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '');
    if (!image && !['csv', 'txt', 'json'].includes(extension ?? '')) { setError('Choose a PNG, JPG, WebP, CSV, TXT or JSON file. Convert HEIC photos to JPG first.'); return; }
    if (file.size > (image ? 10_000_000 : MAX_SOURCE_LENGTH)) { setError(image ? 'Use a photo smaller than 10 MB.' : 'Use a text file smaller than 150 KB.'); return; }
    setBusy(true); setStatus(image ? 'Loading photo reader…' : 'Reading file…');
    try {
      let extracted: string;
      if (image) {
        const bitmap = await createImageBitmap(file);
        const pixels = bitmap.width * bitmap.height; bitmap.close();
        if (pixels > 20_000_000) throw new Error('Crop or resize this photo below 20 megapixels, then retry.');
        const { createWorker } = await import('tesseract.js');
        const engine = await createWorker('eng', 1, { logger: progress => { if (active.current) setStatus(`${ocrPhase.current || progress.status} · ${Math.round(progress.progress * 100)}%`); } });
        worker.current = engine;
        if (!active.current) { await engine.terminate(); return; }
        await engine.setParameters({ preserve_interword_spaces: '1' });
        const result = await readGolfImage(file, engine, message => { ocrPhase.current = message; if (active.current) setStatus(message); });
        extracted = result.text;
        if (active.current) { setConfidence(result.confidence); setRawText(result.rawText); setImageLayout(result.layout); setImageUrl(URL.createObjectURL(file)); }
      } else extracted = await file.text();
      if (!extracted.trim()) throw new Error('No text found. Try a sharper, cropped screenshot or a structured export.');
      if (extracted.length > MAX_SOURCE_LENGTH) throw new Error('Too much text. Split this export into smaller files.');
      if (active.current) { setText(extracted); if (!image) setRawText(extracted); setFileName(file.name.slice(0, 200)); setFormat(image ? 'image' : extension as ImportSource['format']); }
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Could not read this file. Try CSV or a clearer screenshot.'); }
    finally { await worker.current?.terminate(); worker.current = null; if (active.current) { setBusy(false); setStatus(''); } }
  }
  async function review() {
    setBusy(true); setError(''); invalidate();
    try {
      const response = await fetch('/api/club-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, format, club, distanceUnit, speedUnit, sampleType }) });
      const data = await response.json() as Preview & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not read these measurements.');
      if (active.current) { setPreview(data); setExcluded([]); }
    } catch (cause) { if (active.current) setError((cause as Error).message); }
    finally { if (active.current) setBusy(false); }
  }
  function correctReading(id: string, field: MetricField, input: string) {
    if (!preview) return false;
    const value = input === '' ? undefined : distanceFields.includes(field) ? storeDistance(Number(input), distanceUnit) : isSpeed(field) ? storeSpeed(Number(input), speedUnit) : Number(input);
    if (!clubMetricSchema.shape[field].safeParse(value).success) { setError(`${metricLabels[field]} is outside the supported range.`); return false; }
    const reading = preview.readings.find(row => row.id === id);
    const fixed = (preview.issues ?? []).filter(issue => issue.sourceRow === reading?.sourceRow && issue.field === field);
    setPreview({ ...preview, readings: preview.readings.map(row => row.id === id ? { ...row, [field]: value } : row), issues: (preview.issues ?? []).filter(issue => !fixed.includes(issue)), warnings: preview.warnings.filter(warning => !fixed.some(issue => issue.message === warning)) });
    setConfirmed(false); setError('');
    return true;
  }
  function add() {
    if (!preview || !confirmed) return;
    const readings = preview.readings.filter(reading => !excluded.includes(reading.id));
    if (!readings.length) { setError('Select at least one reading.'); return; }
    if (existing.length + readings.length > MAX_READINGS) { setError(`A session supports ${MAX_READINGS} readings. Use another session for the remaining shots.`); return; }
    if (sources.length >= 10 || sources.reduce((sum, source) => sum + source.rawText.length + (source.reviewedText?.length ?? 0), 0) + rawText.length + (text === rawText ? 0 : text.length) > 500_000) { setError('This session has reached its source-file limit. Import into a new session.'); return; }
    if (sources.some(source => source.rawText === rawText)) { setError('This file has already been added to this session.'); return; }
    const id = crypto.randomUUID();
    onImport(readings.map(reading => ({ ...reading, importId: id })), { id, fileName, format, rawText, ...(rawText !== text ? { reviewedText: text } : {}), distanceUnit, speedUnit, importedAt: new Date().toISOString(), ...(confidence !== undefined ? { ocrConfidence: confidence } : {}) });
    setImageUrl('');
    setOpen(false); setPreview(null); setText(''); setRawText(''); setFileName(''); setConfirmed(false); setError('');
  }
  return <div className="club-import">
    <button type="button" className="button" aria-expanded={open} onClick={() => setOpen(!open)}><Upload size={18}/>Import photo or file</button>
    {open && <div className="import-panel">
      <div className="sectionhead"><h3>Import club data</h3><button className="iconbtn" type="button" aria-label="Close importer" disabled={busy} onClick={() => setOpen(false)}><X size={18}/></button></div>
      <p className="muted">Choose the club, then a screenshot, photo or export. Club names and units in the file take priority. Review everything before adding it.</p>
      <div className="import-settings">
        <label className="field">Club<input list="golf-clubs" maxLength={80} value={club} disabled={busy} onChange={event => { setClub(event.target.value); invalidate(); }}/></label>
        <label className="field">Readings represent<select value={sampleType} disabled={busy} onChange={event => { setSampleType(event.target.value as ClubMetric['sampleType']); invalidate(); }}><option>Single shot</option><option>Average</option><option>Best</option></select></label>
        <label className="field">File distance units<select value={distanceUnit} disabled={busy} onChange={event => { setDistanceUnit(event.target.value as typeof distanceUnit); invalidate(); }}><option value="m">Metres</option><option value="yd">Yards</option></select></label>
        <label className="field">File speed units<select value={speedUnit} disabled={busy} onChange={event => { setSpeedUnit(event.target.value as typeof speedUnit); invalidate(); }}><option value="mph">mph</option><option value="kmh">km/h</option></select></label>
      </div>
      <label className="field import-upload">Upload photo, TXT, CSV or JSON<input type="file" disabled={busy} accept=".png,.jpg,.jpeg,.webp,.txt,.csv,.json,image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }}/></label>
      <p className="muted">Photos are read on your device. The first use downloads the OCR engine. Crop to the results and use a clear image. English labels supported.</p>
      {busy && <p role="status" className="import-status">{status || 'Preparing your review…'}</p>}
      {fileName && <>
        {imageUrl && <details><summary>Compare with uploaded photo</summary><Image src={imageUrl} alt="Uploaded results for comparison with extracted measurements" width={1000} height={600} unoptimized style={{ width: '100%', height: 'auto' }}/></details>}
        {imageLayout !== 'text' && <p className="import-warning">{imageLayout === 'simulator' ? 'Simulator shot table detected. Check the file speed and distance units above: this table does not label them. The average footer is excluded.' : 'Shot table detected from column positions. Check the headers and units; unlabelled measurements use your selected file units. Recognised summary rows are excluded. Unsupported columns are kept in the source text.'} Correct flagged values below, or leave them out. The original OCR text remains available.</p>}
        <p><strong>{fileName}</strong>{confidence !== undefined && <span className="import-warning"> · OCR confidence {Math.round(confidence)}% — verify every value</span>}</p>
        <details><summary>Check or correct extracted text</summary><label className="field">Source text<textarea aria-label="Extracted source text" maxLength={MAX_SOURCE_LENGTH} value={text} disabled={busy} onChange={event => { setText(event.target.value); invalidate(); }}/></label><p className="muted">Supported: named CSV/JSON columns, spaced tables, or labels such as Carry: 180. Missing measurements stay empty.</p></details>
        <button className="button" type="button" disabled={busy || !club.trim() || !text.trim()} onClick={() => void review()}>Review measurements</button>
      </>}
      {preview && <>
        <h3>{preview.readings.length} readings found</h3>
        {preview.warnings.length > 0 && <div role="alert" className="import-warning"><strong>{preview.warnings.length} values or rows need review.</strong><p>Open the corrections on each reading below. Unreadable values stay empty.</p><details><summary>Show extraction warnings</summary><ul>{preview.warnings.slice(0, 12).map((warning, index) => <li key={index}>{warning}</li>)}</ul>{preview.warnings.length > 12 && <p>{preview.warnings.length - 12} more warnings. Check the source text.</p>}</details></div>}
        <div className="import-preview">{preview.readings.map(reading => <ReadingReview key={reading.id} reading={reading} issues={(preview.issues ?? []).filter(issue => issue.sourceRow === reading.sourceRow)} included={!excluded.includes(reading.id)} distanceUnit={distanceUnit} speedUnit={speedUnit} onInclude={included => { setExcluded(previous => included ? previous.filter(id => id !== reading.id) : [...previous, reading.id]); setConfirmed(false); }} onCorrect={(field, value) => correctReading(reading.id, field, value)} onEditing={() => setConfirmed(false)}/>)}</div>
        <label className="import-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>I checked the values, units and sample types.</label>
        <button type="button" className="button primary" disabled={!confirmed || busy} onClick={add}>Add {preview.readings.length - excluded.length} readings to session</button>
        <p className="muted">You can edit the added measurements below. Save the session to keep them in your account.</p>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
    {sources.length > 0 && <details className="import-sources"><summary>{sources.length} imported source {sources.length === 1 ? 'file' : 'files'}</summary>{sources.map(source => <details key={source.id}><summary>{source.fileName}</summary><pre>{source.rawText}</pre>{source.reviewedText && <><p>Reviewed text</p><pre>{source.reviewedText}</pre></>}</details>)}</details>}
  </div>;
}
