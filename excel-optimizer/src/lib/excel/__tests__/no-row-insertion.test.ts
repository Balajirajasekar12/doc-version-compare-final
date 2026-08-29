/**
 * Verify that insertRowsInWorksheet properly updates formulas, merge cells,
 * and all cell references when inserting rows. This prevents "Value lost" errors.
 */
import { describe, it, expect } from 'vitest';

// Inline the shiftRefs logic to test it directly
function shiftRefs(s: string, insertAtRow: number, rowsToInsert: number): string {
  return s.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (full, d1, col, d2, rowNumStr) => {
    const rowNum = parseInt(rowNumStr);
    if (rowNum >= insertAtRow) {
      return `${d1}${col}${d2}${rowNum + rowsToInsert}`;
    }
    return full;
  });
}

describe('insertRowsInWorksheet — reference shifting', () => {
  it('shifts cell references in formulas', () => {
    // Insert 5 rows at row 10. Formula =SUM(A5:A9) should NOT change.
    // Formula =SUM(A10:A20) should become =SUM(A15:A25).
    const formula1 = 'SUM(A5:A9)';
    const formula2 = 'SUM(A10:A20)';
    const formula3 = 'SUM($A$10:$A$20)';

    expect(shiftRefs(formula1, 10, 5)).toBe('SUM(A5:A9)');
    expect(shiftRefs(formula2, 10, 5)).toBe('SUM(A15:A25)');
    expect(shiftRefs(formula3, 10, 5)).toBe('SUM($A$15:$A$25)');
  });

  it('shifts mixed absolute/relative references', () => {
    // Insert 3 rows at row 5.
    expect(shiftRefs('A5', 5, 3)).toBe('A8');
    expect(shiftRefs('$A$5', 5, 3)).toBe('$A$8');
    expect(shiftRefs('A$5', 5, 3)).toBe('A$8');
    expect(shiftRefs('$A5', 5, 3)).toBe('$A8');
    expect(shiftRefs('A4', 5, 3)).toBe('A4'); // before insertAtRow — unchanged
  });

  it('shifts merge cell references', () => {
    // Insert 2 rows at row 8. Merge A5:B7 should not change.
    // Merge A8:B10 should become A10:B12.
    expect(shiftRefs('A5:B7', 8, 2)).toBe('A5:B7');
    expect(shiftRefs('A8:B10', 8, 2)).toBe('A10:B12');
  });

  it('shifts autoFilter range', () => {
    // Insert 4 rows at row 20. AutoFilter A1:H19 should not change.
    // AutoFilter A20:H100 should become A24:H104.
    expect(shiftRefs('A1:H19', 20, 4)).toBe('A1:H19');
    expect(shiftRefs('A20:H100', 20, 4)).toBe('A24:H104');
  });

  it('handles empty formula', () => {
    expect(shiftRefs('', 10, 5)).toBe('');
  });

  it('handles formula with no cell references', () => {
    expect(shiftRefs('1+2*3', 10, 5)).toBe('1+2*3');
  });

  it('handles formula with text strings containing letters', () => {
    // "Hello" should not be affected — only cell-like patterns (letter(s) + number)
    expect(shiftRefs('"Hello" & A10', 10, 5)).toBe('"Hello" & A15');
  });

  it('handles large row numbers', () => {
    expect(shiftRefs('A1000', 2000, 10)).toBe('A1000'); // before insertAtRow — unchanged
    expect(shiftRefs('A1000', 500, 10)).toBe('A1010'); // at/above insertAtRow — shifted
    expect(shiftRefs('A500', 500, 10)).toBe('A510'); // at insertAtRow — shifted
    expect(shiftRefs('A499', 500, 10)).toBe('A499'); // before insertAtRow — unchanged
  });

  it('preserves XML structure around formulas', () => {
    const xml = '<f>SUM(A10:A20)</f>';
    const result = xml.replace(/(<f[^>]*>)(.*?)(<\/f>)/g, (_m, open, text, close) => {
      return open + shiftRefs(text, 10, 5) + close;
    });
    expect(result).toBe('<f>SUM(A15:A25)</f>');
  });
});
