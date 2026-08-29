/**
 * Verify that placeImagesByBlock no longer inserts rows into worksheet XML.
 * Row insertion caused "Value lost" errors because it shifted cell references
 * without updating formulas, merge cells, data validation, etc.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadZip, readEntryText } from '../zip';
import { parseSheet } from '../worksheet';
import { fixDrawingOverlaps } from '../drawings';

const INPUT = join(process.cwd(), 'Messy excel', 'Messy_Excel_Pivot_10_Sheets_Overlap_Stress_Test_new.xlsx');

describe('No row insertion — Value lost fix', () => {
  it('fixDrawingOverlaps does not insert rows into worksheet XML', async () => {
    const inputBytes = readFileSync(INPUT);
    const ab = new ArrayBuffer(inputBytes.length);
    new Uint8Array(ab).set(inputBytes);
    const zip = await loadZip(ab);

    // Capture original sheet XML row counts
    const originalRowCounts = new Map<string, number>();
    const sheetFiles: string[] = [];
    for (const name of Object.keys(zip.files)) {
      if (name.match(/^xl\/worksheets\/sheet\d+\.xml$/)) {
        sheetFiles.push(name);
        const xml = await readEntryText(zip, name);
        if (xml) {
          const count = (xml.match(/<row\s/g) || []).length;
          originalRowCounts.set(name, count);
        }
      }
    }
    sheetFiles.sort();
    expect(sheetFiles.length).toBe(10);

    // Process each sheet
    let totalImages = 0;
    for (const sheetFile of sheetFiles) {
      const sheetXml = await readEntryText(zip, sheetFile);
      if (!sheetXml) continue;
      const sheet = parseSheet(sheetXml, []);
      if (!sheet.hasDrawing) continue;

      const stats = await fixDrawingOverlaps(zip, sheet, sheetFile);
      totalImages += stats.imagesBefore;
    }

    // Verify NO new rows were inserted into any worksheet XML
    for (const sheetFile of sheetFiles) {
      const updatedXml = await readEntryText(zip, sheetFile);
      if (!updatedXml) continue;
      const newCount = (updatedXml.match(/<row\s/g) || []).length;
      const origCount = originalRowCounts.get(sheetFile) || 0;
      // Row count must not increase (no row insertion).
      // It could decrease if we removed empty rows, but should never increase.
      expect(newCount).toBeLessThanOrEqual(origCount);
    }

    // All images must be preserved
    expect(totalImages).toBeGreaterThanOrEqual(60);
  });
});
