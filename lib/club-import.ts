import Papa from 'papaparse';
import { z } from 'zod';
import { storeDistance, storeSpeed, type DistanceUnit, type SpeedUnit } from './preferences.ts';

export const MAX_READINGS = 500;
export const MAX_SOURCE_LENGTH = 150_000;
export const clubMetricSchema = z.object({
  id: z.string().min(1).max(100), club: z.string().trim().min(1).max(80),
  sampleType: z.enum(['Average', 'Best', 'Single shot']),
  clubSpeed: z.number().min(0).max(250).optional(), ballSpeed: z.number().min(0).max(300).optional(),
  smash: z.number().min(0).max(2).optional(), launch: z.number().min(-20).max(90).optional(),
  spin: z.number().min(0).max(20000).optional(), carry: z.number().min(0).max(600).optional(),
  total: z.number().min(0).max(600).optional(), notes: z.string().max(500).optional(),
  importId: z.string().max(100).optional(), sourceRow: z.number().int().positive().optional(),
});
export type ClubMetric = z.infer<typeof clubMetricSchema>;
export const importSourceSchema = z.object({
  id: z.string().min(1).max(100), fileName: z.string().max(200),
  format: z.enum(['csv', 'json', 'txt', 'image']), rawText: z.string().max(MAX_SOURCE_LENGTH),
  reviewedText: z.string().max(MAX_SOURCE_LENGTH).optional(),
  distanceUnit: z.enum(['m', 'yd']), speedUnit: z.enum(['mph', 'kmh']),
  importedAt: z.string().datetime(), ocrConfidence: z.number().min(0).max(100).optional(),
});
export type ImportSource = z.infer<typeof importSourceSchema>;
export const importRequestSchema = z.object({
  text: z.string().min(1).max(MAX_SOURCE_LENGTH), format: importSourceSchema.shape.format,
  club: z.string().trim().min(1).max(80), distanceUnit: z.enum(['m', 'yd']),
  speedUnit: z.enum(['mph', 'kmh']), sampleType: clubMetricSchema.shape.sampleType,
});
type ImportOptions = z.infer<typeof importRequestSchema>;
export const metricFields = ['carry', 'total', 'clubSpeed', 'ballSpeed', 'smash', 'launch', 'spin'] as const;
type MetricField = typeof metricFields[number];
const aliases: Record<MetricField, string[]> = {
  carry: ['carry', 'carrydistance'], total: ['total', 'totaldistance', 'distance'],
  clubSpeed: ['clubspeed', 'clubheadspeed', 'headspeed', 'chs'], ballSpeed: ['ballspeed', 'bs'],
  smash: ['smash', 'smashfactor'], launch: ['launch', 'launchangle', 'launchv', 'vertlaunch', 'vertical launch'],
  spin: ['spin', 'spinrate', 'backspin', 'totalspin'],
};
function keyName(value: string) {
  return value.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/(?:km\/h|kmh|mph|yards?|yds?|metres?|meters?|rpm|deg|°)\s*$/i, '').replace(/[^a-z]/g, '');
}
function fieldFor(key: string): MetricField | undefined {
  return metricFields.find(field => aliases[field].some(alias => keyName(alias) === keyName(key)));
}
function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim() || /^(?:n\/a|na|--?|—)$/i.test(value.trim())) return undefined;
  // Do not turn OCR letters into guessed numbers, or accept a partially read value.
  const match = value.trim().match(/^([-+]?\d+(?:[.,]\d+)?)(?:\s*(?:m|yd|yds|yards?|mph|km\/h|kmh|rpm|deg|°))?$/i);
  return match ? Number(/^[-+]?\d{1,3},\d{3}$/.test(match[1]) ? match[1].replace(',', '') : match[1].replace(',', '.')) : undefined;
}
function textRows(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  // OCR often preserves wide column gaps in tables.
  const tableLines = lines.map(line => line.replace(/\s{2,}|\s*\|\s*/g, '\t'));
  const headerIndex = tableLines.findIndex(line => line.split('\t').filter(fieldFor).length >= 2);
  const tabular = tableLines.slice(Math.max(0, headerIndex)).join('\n');
  const table = Papa.parse<Record<string, string>>(tabular, { header: true, delimiter: '\t', skipEmptyLines: true });
  if ((table.meta.fields ?? []).filter(fieldFor).length >= 2) {
    if (table.errors.some(error => error.code === 'TooManyFields' || error.code === 'TooFewFields')) throw new Error('The table columns could not be aligned. Correct the extracted text, or upload a CSV.');
    return table.data;
  }
  // OCR may collapse all column gaps. Only accept a numeric row when it matches
  // every recognised header, rather than shifting values into the wrong columns.
  const headerPattern = /\b(?:club\s*(?:head\s*)?speed|ball\s*speed|smash(?:\s*factor)?|launch(?:\s*angle)?|(?:back\s*)?spin(?:\s*rate)?|carry(?:\s*distance)?|total(?:\s*distance)?)\b(?:\s*\((?:m|yd|mph|km\/h|rpm|°)\))?/gi;
  for (let index = 0; index < lines.length; index++) {
    const headers = [...lines[index].matchAll(headerPattern)].map(match => match[0]);
    if (headers.length < 2 || /\d/.test(lines[index])) continue;
    const observations: Record<string, unknown>[] = [];
    for (const line of lines.slice(index + 1)) {
      const values = line.split(/\s+/);
      if (!values.some(value => numeric(value) !== undefined)) continue;
      if (values.length !== headers.length) throw new Error('The table columns could not be aligned. Correct the extracted text, or upload a CSV.');
      observations.push(Object.fromEntries(headers.map((header, column) => [header, values[column]])));
    }
    if (observations.length) return observations;
  }
  const rows: Record<string, unknown>[] = [];
  let row: Record<string, unknown> = {};
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const inline = line.match(/^(.+?)\s*[:=\t]\s*([-+]?\d.*)$/) ?? line.match(/^(.+?)\s+([-+]?\d+(?:[.,]\d+)?(?:\s*(?:m|yd|mph|km\/h|rpm|°))?)$/i);
    let key = inline?.[1]; let value = inline?.[2];
    if (!key && fieldFor(line) && numeric(lines[index + 1]) !== undefined) { key = line; value = lines[++index]; }
    if (!key || !fieldFor(key)) continue;
    if (Object.keys(row).some(existing => fieldFor(existing) === fieldFor(key!))) { rows.push(row); row = {}; }
    row[key] = value;
  }
  if (Object.keys(row).length) rows.push(row);
  return rows;
}

export function parseClubImport(input: ImportOptions) {
  const options = importRequestSchema.parse(input);
  const { text, format } = options;
  let rows: Record<string, unknown>[];
  if (format === 'json') {
    const parsed: unknown = JSON.parse(text);
    const object = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    const entries = Array.isArray(parsed) ? parsed : object.shots ?? object.clubMetrics ?? object.readings ?? [parsed];
    if (!Array.isArray(entries) || entries.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('JSON must contain objects, or a shots/readings array.');
    rows = entries as Record<string, unknown>[];
  } else if (format === 'csv') {
    const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: header => header.trim() });
    if (parsed.errors.some(error => error.code !== 'UndetectableDelimiter')) throw new Error('CSV columns do not match the header. Check the delimiter and quoted values.');
    rows = parsed.data;
  } else {
    // TXT exports can be CSV, tabular text or labelled measurements.
    const csv = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });
    rows = !csv.errors.some(error => error.code !== 'UndetectableDelimiter') && (csv.meta.fields ?? []).some(fieldFor) && csv.data.length ? csv.data : textRows(text);
  }
  if (rows.length > MAX_READINGS) throw new Error(`Import at most ${MAX_READINGS} readings at a time. Split this export into smaller files.`);
  const warnings: string[] = [];
  const readings: ClubMetric[] = [];
  rows.forEach((row, index) => {
    const reading: ClubMetric = { id: crypto.randomUUID(), club: options.club, sampleType: options.sampleType, sourceRow: index + 1 };
    for (const [key, raw] of Object.entries(row)) {
      if (keyName(key) === 'notes' && typeof raw === 'string') { reading.notes = raw.slice(0, 500); continue; }
      if (keyName(key) === 'club' || keyName(key) === 'clubname') { if (typeof raw === 'string' && raw.trim()) reading.club = raw.trim(); continue; }
      if (['sampletype', 'type', 'shot', 'shotnumber'].includes(keyName(key))) {
        const label = String(raw).trim().toLowerCase();
        if (['average', 'avg', 'mean'].includes(label)) reading.sampleType = 'Average';
        else if (label === 'best') reading.sampleType = 'Best';
        else if (['single shot', 'single', 'shot'].includes(label)) reading.sampleType = 'Single shot';
        continue;
      }
      const field = fieldFor(key); if (!field) continue;
      let value = numeric(raw);
      if (value === undefined) { if (raw !== undefined && raw !== null && String(raw).trim() && !/^(?:n\/a|na|--?|—)$/i.test(String(raw).trim())) warnings.push(`Row ${index + 1}: check ${key} (${String(raw).slice(0, 40)}).`); continue; }
      const unitText = `${key} ${typeof raw === 'string' ? raw : ''}`;
      if (field === 'carry' || field === 'total') {
        const unit: DistanceUnit = /\b(yds?|yards?)\b/i.test(unitText) ? 'yd' : /\b(m|metres?|meters?)\b/i.test(unitText) ? 'm' : options.distanceUnit;
        value = storeDistance(value, unit);
      }
      if (field === 'clubSpeed' || field === 'ballSpeed') {
        const unit: SpeedUnit = /km\/?h/i.test(unitText) ? 'kmh' : /mph/i.test(unitText) ? 'mph' : options.speedUnit;
        value = storeSpeed(value, unit);
      }
      const checked = clubMetricSchema.shape[field].safeParse(value);
      if (checked.success) reading[field] = value;
      else warnings.push(`Row ${index + 1}: ${key} is outside the supported range; correct it before importing.`);
    }
    if (metricFields.some(field => reading[field] !== undefined)) {
      const valid = clubMetricSchema.safeParse(reading);
      if (valid.success) readings.push(valid.data); else warnings.push(`Row ${index + 1}: invalid club name; row skipped.`);
    } else warnings.push(`Row ${index + 1}: no recognised measurements; row skipped.`);
  });
  if (!readings.length) throw new Error('No measurements recognised. Use headers such as Carry, Club Speed, Ball Speed, Smash Factor, Launch Angle and Spin Rate, or labelled text such as “Carry: 180”.');
  return { readings, warnings, sourceRows: rows.length };
}
