// Layout adaptor for the ten-column simulator results table. The normalized
// model and analytics remain independent of the display's column names.
export type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
export const simulatorHeaders = ['Ball Speed', 'Total Carry', 'Total Distance', 'Back Spin', 'Side Spin', 'Offline', 'HLA', 'VLA', 'Peak Height', 'Dist to Pin'] as const;
type Header = typeof simulatorHeaders[number];
export type TableLayout = { centers: number[]; headerBottom: number; characterHeight: number; inferredHeader: boolean };
const clean = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
export function detectSimulatorTable(words: OcrWord[]): TableLayout | null {
  const hits: { header: Header; x: number; y: number; bottom: number; height: number }[] = [];
  for (const first of words) {
    const height = first.bbox.y1 - first.bbox.y0;
    const y = (first.bbox.y0 + first.bbox.y1) / 2;
    const nearby = words.filter(word => Math.abs((word.bbox.y0 + word.bbox.y1) / 2 - y) < height * .8).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const index = nearby.indexOf(first);
    for (let size = 1; size <= 3; size++) {
      const group = nearby.slice(index, index + size); if (group.length !== size) continue;
      if (group.some((word, i) => i && word.bbox.x0 - group[i - 1].bbox.x1 > height * 1.8)) continue;
      let text = clean(group.map(word => word.text).join(' '));
      if (text === 'via') text = 'vla'; // Common OCR confusion for this header.
      const header = simulatorHeaders.find(candidate => clean(candidate) === text);
      if (header) hits.push({ header, x: (first.bbox.x0 + group[size - 1].bbox.x1) / 2, y, bottom: Math.max(...group.map(word => word.bbox.y1)), height });
    }
  }
  for (const anchor of hits) {
    const band = hits.filter(hit => Math.abs(hit.y - anchor.y) < anchor.height * 1.5);
    const selected = simulatorHeaders.map(header => band.find(hit => hit.header === header));
    // Require the full known layout. The only permitted missing header is VLA,
    // whose place is established by its HLA and Peak Height neighbours.
    const missing = selected.flatMap((hit, index) => hit ? [] : [index]);
    if (missing.length && (missing.length !== 1 || missing[0] !== 7)) continue;
    const centers = selected.map(hit => hit?.x ?? 0);
    if (missing.length) centers[7] = (centers[6] + centers[8]) / 2;
    const gaps = centers.slice(1).map((center, index) => center - centers[index]);
    const medianGap = [...gaps].sort((a, b) => a - b)[4];
    if (gaps.some(gap => gap < medianGap * .65 || gap > medianGap * 1.4)) continue;
    return { centers, headerBottom: Math.max(...band.map(hit => hit.bottom)), characterHeight: anchor.height, inferredHeader: !!missing.length };
  }
  return null;
}

export type PixelImage = { width: number; height: number; data: Uint8ClampedArray };
const lightness = (data: Uint8ClampedArray, offset: number) => .2126 * data[offset] + .7152 * data[offset + 1] + .0722 * data[offset + 2];
export function findTableRows(image: PixelImage, layout: TableLayout) {
  const gap = layout.centers[1] - layout.centers[0];
  const left = Math.max(0, Math.floor(layout.centers[0] - gap * .35));
  const right = Math.min(image.width, Math.ceil(layout.centers[8] + gap * .35));
  const start = Math.ceil(layout.headerBottom + layout.characterHeight * .5);
  const background: number[] = [];
  for (let y = start; y < image.height; y += 4) for (let x = left; x < right; x += 8) background.push(lightness(image.data, (y * image.width + x) * 4));
  background.sort((a, b) => a - b);
  const threshold = background[Math.floor(background.length * .7)] - 55;
  const bands: { start: number; end: number }[] = [];
  let seenBody = false;
  for (let y = start; y < image.height; y++) {
    let count = 0, run = 0, bright = 0;
    for (let x = left; x < right; x++) {
      const value = lightness(image.data, (y * image.width + x) * 4);
      if (value > 140) bright++;
      if (value < threshold) run++;
      else { if (run <= 12) count += run; run = 0; }
    }
    if (run <= 12) count += run;
    if (bright > (right - left) * .7) seenBody = true;
    // The dark Avg footer is a summary, not another individual shot.
    if (seenBody && bright < (right - left) * .2) break;
    if (count > Math.max(10, (right - left) * .012)) {
      const previous = bands.at(-1);
      if (previous && y - previous.end <= 3) previous.end = y;
      else bands.push({ start: y, end: y });
    }
  }
  const candidates = bands.filter(band => band.end - band.start >= 3 && band.end - band.start < layout.characterHeight * 2.5);
  if (candidates.length < 3) return candidates;
  const gaps = candidates.slice(1).map((band, index) => band.start - candidates[index].start).sort((a, b) => a - b);
  const typicalGap = gaps[Math.floor(gaps.length / 2)];
  // A tilted dark footer can look like a short extra row just below the last
  // shot. Never include a band squeezed into less than half the normal spacing.
  return candidates.filter((band, index) => !index || band.start - candidates[index - 1].start >= typicalGap * .6);
}

export function enhanceCell(image: PixelImage) {
  const values = Array.from({ length: image.width * image.height }, (_, index) => lightness(image.data, index * 4)).sort((a, b) => a - b);
  const low = values[Math.floor(values.length * .01)], high = values[Math.floor(values.length * .99)];
  const output = new Uint8ClampedArray(image.data.length);
  for (let offset = 0; offset < output.length; offset += 4) {
    const value = high - low < 15 ? 255 : Math.max(0, Math.min(255, (lightness(image.data, offset) - low) * 255 / (high - low)));
    output[offset] = output[offset + 1] = output[offset + 2] = value; output[offset + 3] = 255;
  }
  return output;
}
