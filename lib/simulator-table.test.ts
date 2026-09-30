import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSimulatorTable, enhanceCell, findTableRows, simulatorHeaders, type OcrWord } from './simulator-table.ts';

function headerWords(omitVla = false): OcrWord[] {
  return simulatorHeaders.flatMap((header, column) => {
    if (omitVla && header === 'VLA') return [];
    const parts = header.split(' ');
    const width = 7 * header.length;
    const left = 142 + column * 87 - width / 2;
    let offset = 0;
    return parts.map(text => { const x0 = left + offset; offset += (text.length + 1) * 7; return { text, bbox: { x0, y0: 49, x1: x0 + text.length * 7, y1: 58 } }; });
  });
}
test('detects the screenshot layout by headers, without mistaking club/shot columns for metrics', () => {
  const layout = detectSimulatorTable(headerWords());
  assert(layout);
  assert.equal(layout.centers.length, 10);
  assert.equal(layout.centers[0], 142);
  assert.equal(layout.inferredHeader, false);
});
test('requires the complete layout and only permits the known missing VLA header', () => {
  const layout = detectSimulatorTable(headerWords(true));
  assert(layout);
  assert.equal(layout.inferredHeader, true);
  assert.equal(layout.centers[7], (layout.centers[6] + layout.centers[8]) / 2);
  assert.equal(detectSimulatorTable(headerWords().filter(word => word.text !== 'Offline')), null);
  const swapped = headerWords().map(word => word.text === 'HLA' ? { ...word, bbox: { ...word.bbox, x0: 0, x1: 10 } } : word);
  assert.equal(detectSimulatorTable(swapped), null);
});
test('row detection follows uneven photographed rows and excludes the dark summary footer', () => {
  const layout = detectSimulatorTable(headerWords())!;
  const width = 1000, height = 500, data = new Uint8ClampedArray(width * height * 4).fill(220);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  const starts = [74, 114, 155, 196, 235, 275, 313, 352, 390, 427];
  for (const start of starts) for (let y = start; y < start + 8; y++) for (let x = 120; x < 865; x += 15) {
    const offset = (y * width + x) * 4; data[offset] = data[offset + 1] = data[offset + 2] = 125;
  }
  for (let y = 451; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4; data[offset] = data[offset + 1] = data[offset + 2] = 25;
  }
  // Simulate the photographed footer's upper edge; it must not become row 11.
  for (let y = 447; y < 451; y++) for (let x = 120; x < 865; x += 15) {
    const offset = (y * width + x) * 4; data[offset] = data[offset + 1] = data[offset + 2] = 125;
  }
  assert.deepEqual(findTableRows({ data, width, height }, layout).map(row => row.start), starts);
});
test('local contrast stretches pale-background numbers and does not invent ink in empty cells', () => {
  const data = new Uint8ClampedArray(100 * 4).fill(210);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = 255;
  for (let pixel = 0; pixel < 10; pixel++) for (let channel = 0; channel < 3; channel++) data[pixel * 4 + channel] = 125;
  const result = enhanceCell({ width: 10, height: 10, data });
  assert.equal(result[0], 0); assert.equal(result[60], 255); assert.equal(result[3], 255);
  assert(enhanceCell({ width: 10, height: 10, data: new Uint8ClampedArray(400).fill(210) }).every(value => value === 255));
});
