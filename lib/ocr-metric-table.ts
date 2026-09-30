import { fieldFor, type MetricField } from './club-import.ts';
import type { OcrWord } from './simulator-table.ts';

export type PositionedWord = OcrWord & { confidence: number };
type Column = { name: string; field?: MetricField; left: number; right: number; center: number; bottom: number };
const cy = (word: OcrWord) => (word.bbox.y0 + word.bbox.y1) / 2;
const cx = (word: OcrWord) => (word.bbox.x0 + word.bbox.x1) / 2;
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Reconstruct horizontal tables using OCR positions, not whitespace or the
 * number/order of known columns. Unknown columns remain column boundaries. */
export function extractMetricTable(words: PositionedWord[]) {
  const usable = words.filter(word => word.text.trim() && word.bbox.y1 > word.bbox.y0 && word.bbox.x1 > word.bbox.x0);
  const heights = usable.map(word => word.bbox.y1 - word.bbox.y0).sort((a, b) => a - b);
  const height = heights[Math.floor(heights.length / 2)];
  if (!height) return null;
  // Try header bands from top to bottom; small vertical differences in a photo
  // do not have to share an OCR line/block.
  for (const anchor of [...usable].sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
    const header = usable.filter(word => Math.abs(cy(word) - cy(anchor)) < height * .8).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (header.length < 2 || header.some(word => /^[-+]?\d/.test(word.text))) continue;
    const columns: Column[] = [];
    for (let index = 0; index < header.length;) {
      let length = 1, field: MetricField | undefined;
      // Longest matching phrase wins (Total Carry rather than Total).
      for (let size = Math.min(4, header.length - index); size >= 1; size--) {
        const group = header.slice(index, index + size);
        if (group.some((word, i) => i && word.bbox.x0 - group[i - 1].bbox.x1 > height * 2)) continue;
        const found = fieldFor(group.map(word => word.text).join(' '));
        if (found) { field = found; length = size; break; }
      }
      // Group an unknown multiword header too. It still separates adjacent
      // known measurements from unsupported values in its physical column.
      if (!field) while (index + length < header.length && header[index + length].bbox.x0 - header[index + length - 1].bbox.x1 < height * 1.4) {
        const next = index + length;
        if ([1, 2, 3, 4].some(size => next + size <= header.length && fieldFor(header.slice(next, next + size).map(word => word.text).join(' ')))) break;
        length++;
      }
      const group = header.slice(index, index + length);
      const left = group[0].bbox.x0, right = group.at(-1)!.bbox.x1;
      columns.push({ name: group.map(word => word.text).join(' '), field, left, right, center: (left + right) / 2, bottom: Math.max(...group.map(word => word.bbox.y1)) });
      index += length;
    }
    const recognized = columns.filter(column => column.field);
    if (recognized.length < 2 || !recognized.some(column => ['carry', 'total', 'clubSpeed', 'ballSpeed'].includes(column.field!))) continue;
    if (new Set(recognized.map(column => column.field)).size !== recognized.length) continue;
    // Packed/overlapping headings cannot safely establish independent columns.
    if (columns.some((column, index) => index && column.left - columns[index - 1].right < height * .5)) continue;
    const bottom = Math.max(...columns.map(column => column.bottom));
    const rows: PositionedWord[][] = [];
    const outsideLeft = columns[0].center - (columns[1].center - columns[0].center) / 2;
    const last = columns.length - 1;
    const outsideRight = columns[last].center + (columns[last].center - columns[last - 1].center) / 2;
    for (const word of usable.filter(word => word.bbox.y0 > bottom + height * .4 && cx(word) > outsideLeft && cx(word) < outsideRight).sort((a, b) => cy(a) - cy(b))) {
      const row = rows.find(row => Math.abs(cy(row[0]) - cy(word)) < height * .75);
      if (row) row.push(word); else rows.push([word]);
    }
    // Keep source unit labels: the shared importer gives explicit units priority.
    const csv = [['Source row', 'Sample Type', ...columns.map(column => quote(column.field ? column.name : `Unmapped: ${column.name}`))].join(',')];
    const observations: string[] = [];
    const confidences: number[] = [];
    let count = 0;
    for (const row of rows) {
      if (usable.some(word => Math.abs(cy(word) - cy(row[0])) < height * .75 && /^(?:avg\.?|average|mean|median|summary|total)$/i.test(word.text.trim()))) continue;
      const cells = columns.map((column, index) => {
        const left = index ? (columns[index - 1].center + column.center) / 2 : outsideLeft;
        const right = index < last ? (column.center + columns[index + 1].center) / 2 : outsideRight;
        return row.filter(word => cx(word) >= left && cx(word) < right).sort((a, b) => a.bbox.x0 - b.bbox.x0);
      });
      // Require multiple positioned observations so label/value cards are not
      // confused with rows in a shot table.
      if (cells.filter((cell, index) => columns[index].field && cell.some(word => /\d/.test(word.text))).length < 2) continue;
      if (++count > 50) throw new Error('Use fewer than 50 visible rows per photo, or import the CSV export.');
      const values = cells.map((cell, index) => {
        const raw = cell.map(word => word.text).join(' ');
        if (!columns[index].field) return quote(raw);
        const confidence = cell.length ? Math.min(...cell.map(word => word.confidence)) : 0;
        confidences.push(confidence);
        observations.push(`Row ${count}, ${columns[index].name}: ${raw || '(empty)'} [confidence ${confidence}%]`);
        return quote(confidence < 70 || !raw ? `CHECK ${raw || 'unreadable'}` : raw);
      });
      csv.push([count, 'Single shot', ...values].join(','));
    }
    // One row may be a summary screen. Let the labelled-data fallback handle it
    // with the user's selected sample type instead of asserting individual shots.
    if (count < 2) continue;
    return { text: csv.join('\n'), rawText: observations.join('\n'), confidence: confidences.reduce((sum, value) => sum + value, 0) / confidences.length, rowCount: count };
  }
  return null;
}
