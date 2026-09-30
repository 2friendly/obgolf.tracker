'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { Worker } from 'tesseract.js';
import { MAX_READINGS, MAX_SOURCE_LENGTH, metricFields, type ClubMetric, type ImportSource } from '@/lib/club-import';
import { displayDistance, displaySpeed, rounded, type UserPreferences } from '@/lib/preferences';

type Preview = { readings: ClubMetric[]; warnings: string[]; sourceRows: number };
export function ClubImport({ preferences, existing, sources, onImport }: {
  preferences: UserPreferences; existing: ClubMetric[]; sources: ImportSource[];
  onImport: (readings: ClubMetric[], source: ImportSource) => void;
}) {
  const [open, setOpen] = useState(false), [club, setClub] = useState('Driver');
  const [distanceUnit, setDistanceUnit] = useState(preferences.distanceUnit), [speedUnit, setSpeedUnit] = useState(preferences.speedUnit);
  const [sampleType, setSampleType] = useState<ClubMetric['sampleType']>('Single shot');
  const [fileName, setFileName] = useState(''), [format, setFormat] = useState<ImportSource['format']>('csv');
  const [text, setText] = useState(''), [rawText, setRawText] = useState(''), [confidence, setConfidence] = useState<number>();
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [excluded, setExcluded] = useState<string[]>([]), [confirmed, setConfirmed] = useState(false);
  const worker = useRef<Worker | null>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; void worker.current?.terminate(); worker.current = null; }; }, []);
  function invalidate() { setPreview(null); setConfirmed(false); }
  async function upload(file: File) {
    invalidate(); setError(''); setText(''); setRawText(''); setConfidence(undefined); setFileName('');
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
        const engine = await createWorker('eng', 1, { logger: progress => { if (active.current) setStatus(`${progress.status} · ${Math.round(progress.progress * 100)}%`); } });
        worker.current = engine;
        if (!active.current) { await engine.terminate(); return; }
        await engine.setParameters({ preserve_interword_spaces: '1' });
        const result = await engine.recognize(file);
        extracted = result.data.text;
        if (active.current) setConfidence(result.data.confidence);
      } else extracted = await file.text();
      if (!extracted.trim()) throw new Error('No text found. Try a sharper, cropped screenshot or a structured export.');
      if (extracted.length > MAX_SOURCE_LENGTH) throw new Error('Too much text. Split this export into smaller files.');
      if (active.current) { setText(extracted); setRawText(extracted); setFileName(file.name.slice(0, 200)); setFormat(image ? 'image' : extension as ImportSource['format']); }
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
  function add() {
    if (!preview || !confirmed) return;
    const readings = preview.readings.filter(reading => !excluded.includes(reading.id));
    if (!readings.length) { setError('Select at least one reading.'); return; }
    if (existing.length + readings.length > MAX_READINGS) { setError(`A session supports ${MAX_READINGS} readings. Use another session for the remaining shots.`); return; }
    if (sources.length >= 10 || sources.reduce((sum, source) => sum + source.rawText.length + (source.reviewedText?.length ?? 0), 0) + rawText.length + (text === rawText ? 0 : text.length) > 500_000) { setError('This session has reached its source-file limit. Import into a new session.'); return; }
    if (sources.some(source => source.rawText === rawText)) { setError('This file has already been added to this session.'); return; }
    const id = crypto.randomUUID();
    onImport(readings.map(reading => ({ ...reading, importId: id })), { id, fileName, format, rawText, ...(rawText !== text ? { reviewedText: text } : {}), distanceUnit, speedUnit, importedAt: new Date().toISOString(), ...(confidence !== undefined ? { ocrConfidence: confidence } : {}) });
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
        <p><strong>{fileName}</strong>{confidence !== undefined && <span className="import-warning"> · OCR confidence {Math.round(confidence)}% — verify every value</span>}</p>
        <details><summary>Check or correct extracted text</summary><label className="field">Source text<textarea aria-label="Extracted source text" maxLength={MAX_SOURCE_LENGTH} value={text} disabled={busy} onChange={event => { setText(event.target.value); invalidate(); }}/></label><p className="muted">Supported: named CSV/JSON columns, spaced tables, or labels such as Carry: 180. Missing measurements stay empty.</p></details>
        <button className="button" type="button" disabled={busy || !club.trim() || !text.trim()} onClick={() => void review()}>Review measurements</button>
      </>}
      {preview && <>
        <h3>{preview.readings.length} readings found</h3>
        {preview.warnings.length > 0 && <div role="alert" className="import-warning"><strong>Some values need attention.</strong><ul>{preview.warnings.slice(0, 12).map((warning, index) => <li key={index}>{warning}</li>)}</ul>{preview.warnings.length > 12 && <p>{preview.warnings.length - 12} more warnings. Check the source text.</p>}</div>}
        <div className="import-preview">{preview.readings.map(reading => <label className="import-reading" key={reading.id}><input type="checkbox" checked={!excluded.includes(reading.id)} onChange={event => { setExcluded(previous => event.target.checked ? previous.filter(id => id !== reading.id) : [...previous, reading.id]); setConfirmed(false); }}/><span><strong>Row {reading.sourceRow} · {reading.club} · {reading.sampleType}</strong><span className="import-values">{metricFields.filter(field => reading[field] !== undefined).map(field => { const distance = field === 'carry' || field === 'total'; const speed = field === 'clubSpeed' || field === 'ballSpeed'; const value = distance ? displayDistance(reading[field], distanceUnit) : speed ? displaySpeed(reading[field], speedUnit) : reading[field]; return <span key={field}>{field.replace(/([A-Z])/g, ' $1')}: {rounded(value, field === 'smash' ? 2 : 1)}{distance ? ` ${distanceUnit}` : speed ? ` ${speedUnit === 'kmh' ? 'km/h' : 'mph'}` : field === 'spin' ? ' rpm' : field === 'launch' ? '°' : ''}</span>; })}</span></span></label>)}</div>
        <label className="import-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>I checked the values, units and sample types.</label>
        <button type="button" className="button primary" disabled={!confirmed || busy} onClick={add}>Add {preview.readings.length - excluded.length} readings to session</button>
        <p className="muted">You can edit the added measurements below. Save the session to keep them in your account.</p>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
    {sources.length > 0 && <details className="import-sources"><summary>{sources.length} imported source {sources.length === 1 ? 'file' : 'files'}</summary>{sources.map(source => <details key={source.id}><summary>{source.fileName}</summary><pre>{source.rawText}</pre>{source.reviewedText && <><p>Reviewed text</p><pre>{source.reviewedText}</pre></>}</details>)}</details>}
  </div>;
}
