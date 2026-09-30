import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMetricTable, type PositionedWord } from './ocr-metric-table.ts';
import { parseClubImport } from './club-import.ts';

const defaults = { club: '7-iron', distanceUnit: 'm' as const, speedUnit: 'mph' as const, sampleType: 'Single shot' as const, format: 'image' as const };
function word(text: string, x: number, y: number, confidence = 95): PositionedWord {
  return { text, confidence, bbox: { x0: x, x1: x + text.length * 7, y0: y, y1: y + 14 } };
}
function table(headers: string[], rows: string[][]) {
  return [...headers.flatMap((heading, index) => {
    let x = 100 + index * 210;
    return heading.split(' ').map(text => { const result = word(text, x, 20); x += text.length * 7 + 7; return result; });
  }), ...rows.flatMap((row, r) => row.filter(Boolean).length ? row.flatMap((text, c) => text ? [word(text, 100 + c * 210, 65 + r * 40)] : []) : [])];
}

test('positioned OCR accepts subsets, reordered columns and explicit source units', () => {
  const result = extractMetricTable(table(['Spin Rate', 'Carry (yd)', 'Ball Speed (km/h)'], [['6000', '160', '180'], ['6200', '165', '182']]));
  assert.ok(result);
  const parsed = parseClubImport({ ...defaults, text: result.text });
  assert.equal(parsed.readings.length, 2);
  assert.equal(parsed.readings[0].spin, 6000);
  assert.ok(Math.abs(parsed.readings[0].carry! - 146.304) < .001);
  assert.ok(Math.abs(parsed.readings[0].ballSpeed! - 111.8468) < .001);
});
test('unknown columns and missing cells do not shift adjacent metrics', () => {
  const result = extractMetricTable(table(['Carry', 'Unknown Metric', 'Ball Speed', 'Spin Rate'], [['180', '999', '126', '6000'], ['175', '888', '', '6200']]));
  assert.ok(result);
  const parsed = parseClubImport({ ...defaults, text: result.text });
  assert.equal(parsed.readings[0].ballSpeed, 126);
  assert.equal(parsed.readings[1].ballSpeed, undefined);
  assert.equal(parsed.readings[1].spin, 6200);
  assert.ok(result.text.includes('Unmapped: Unknown Metric'));
  assert.ok(parsed.issues.some(issue => issue.field === 'ballSpeed'));
});
test('summary labels outside the metric columns are excluded from individual shots', () => {
  const words = table(['Carry', 'Ball Speed'], [['180', '126'], ['175', '120'], ['177.5', '123']]);
  words.push(word('Avg.', 0, 145));
  const result = extractMetricTable(words);
  assert.equal(result?.rowCount, 2);
});
test('low confidence and invalid OCR characters stay flagged with original observations', () => {
  const words = table(['Carry', 'Ball Speed'], [['180', '126'], ['175', '12O']]);
  words.find(w => w.text === '180')!.confidence = 40;
  const result = extractMetricTable(words);
  assert.ok(result);
  const parsed = parseClubImport({ ...defaults, text: result.text });
  assert.equal(parsed.readings[0].carry, undefined);
  assert.equal(parsed.readings[1].ballSpeed, undefined);
  assert.equal(parsed.issues.length, 2);
  assert.ok(result.rawText.includes('180 [confidence 40%]'));
});
test('single-row summary screens and unrecognised headings use the existing fallback', () => {
  assert.equal(extractMetricTable(table(['Carry', 'Ball Speed'], [['180', '126']])), null);
  assert.equal(extractMetricTable(table(['Unknown', 'Unsupported'], [['180', '126'], ['175', '120']])), null);
});
test('ambiguous repeated metric columns are not silently merged', () => {
  assert.equal(extractMetricTable(table(['Carry', 'Ball Speed', 'Carry'], [['180', '126', '200'], ['175', '120', '190']])), null);
});
