import type { Worker } from 'tesseract.js';
import { detectSimulatorTable, enhanceCell, findTableRows, simulatorHeaders } from './simulator-table';

function canvas(width: number, height: number) {
  const element = document.createElement('canvas'); element.width = width; element.height = height;
  const context = element.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Your browser cannot prepare this image. Try a CSV export.');
  return { element, context };
}
export async function readGolfImage(file: File, worker: Worker, onProgress: (message: string) => void) {
  const { PSM } = await import('tesseract.js');
  const bitmap = await createImageBitmap(file);
  try {
    const original = canvas(bitmap.width, bitmap.height); original.context.drawImage(bitmap, 0, 0);
    const scale = Math.min(3, 3000 / bitmap.width, Math.sqrt(12_000_000 / (bitmap.width * bitmap.height)));
    const enlarged = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    enlarged.context.imageSmoothingQuality = 'high'; enlarged.context.drawImage(bitmap, 0, 0, enlarged.element.width, enlarged.element.height);
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    onProgress('Finding table columns…');
    const { data } = await worker.recognize(enlarged.element, {}, { text: true, blocks: true });
    const words = data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words))) ?? [];
    const detected = detectSimulatorTable(words);
    if (!detected) {
      // Keep the established label/table reader for other layouts.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const result = await worker.recognize(enlarged.element);
      return { text: result.data.text, rawText: result.data.text, confidence: result.data.confidence, table: false };
    }
    const layout = { ...detected, centers: detected.centers.map(center => center / scale), headerBottom: detected.headerBottom / scale, characterHeight: detected.characterHeight / scale };
    const rows = findTableRows(original.context.getImageData(0, 0, bitmap.width, bitmap.height), layout);
    if (!rows.length) throw new Error('The table headers were found, but no shot rows could be located. Crop to the table or use Export CSV.');
    if (rows.length > 50) throw new Error('Crop to fewer than 50 visible rows per photo, or use Export CSV for the full session.');
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const csvRows = [['Source row', 'Sample Type', ...simulatorHeaders].join(',')];
    const sourceCells: string[] = [];
    const confidences: number[] = [];
    for (const [index, row] of rows.entries()) {
      const cells: string[] = [];
      for (const [column, center] of layout.centers.entries()) {
        onProgress(`Reading shot ${index + 1} of ${rows.length} · column ${column + 1} of ${simulatorHeaders.length}`);
        const spacing = column ? center - layout.centers[column - 1] : layout.centers[1] - center;
        // Right-aligned pin distances include a unit suffix and move left in
        // photographed perspective; their cell needs a wider left margin.
        const left = Math.max(0, Math.round(center - spacing * (column === 9 ? .6 : .38)));
        const top = Math.max(0, row.start - 1);
        const width = Math.min(bitmap.width - left, Math.round(spacing * (column === 9 ? .85 : .76)));
        const height = Math.min(bitmap.height - top, row.end - row.start + 5);
        const cell = canvas(width, height);
        const pixels = original.context.getImageData(left, top, width, height);
        pixels.data.set(enhanceCell(pixels)); cell.context.putImageData(pixels, 0, 0);
        const enlargedCell = canvas(width * 6, height * 6);
        enlargedCell.context.imageSmoothingQuality = 'high'; enlargedCell.context.drawImage(cell.element, 0, 0, width * 6, height * 6);
        const result = await worker.recognize(enlargedCell.element);
        const rawValue = result.data.text.trim().replace(/\s+/g, ' ');
        const value = rawValue.replace(/^\|\s*|\s*\|$/g, '').replace(/\b(?:mirs|mitrs|mrs)\b$/i, 'mtrs');
        const confidence = result.data.confidence;
        confidences.push(confidence);
        sourceCells.push(`Row ${index + 1}, ${simulatorHeaders[column]}: ${rawValue || '(empty)'} [confidence ${confidence}%]`);
        // Preserve uncertain candidates in source text, but never turn them into
        // trusted numeric observations. The parser flags these cells for review.
        const candidate = confidence < 70 || !value ? `CHECK ${value || 'unreadable'}` : value;
        cells.push(`"${candidate.replace(/"/g, '""')}"`);
      }
      csvRows.push([index + 1, 'Single shot', ...cells].join(','));
    }
    const note = 'Detected simulator shot table. Confirm distance and speed units; headers do not specify them. The dark summary footer is excluded to avoid counting averages as shots.';
    return { text: csvRows.join('\n'), rawText: `${note}\n${detected.inferredHeader ? 'VLA header position inferred from the complete neighbouring columns; verify the layout.\n' : ''}\nInitial OCR:\n${data.text}\nCell extraction:\n${sourceCells.join('\n')}`, confidence: confidences.reduce((sum, value) => sum + value, 0) / confidences.length, table: true };
  } finally { bitmap.close(); }
}
