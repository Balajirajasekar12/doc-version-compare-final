/**
 * Cell reference utilities (A1 notation). Column indices are 1-based.
 */

const COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function colToName(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = COL_LETTERS[rem] + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function nameToCol(name: string): number {
  let col = 0;
  for (let i = 0; i < name.length; i++) {
    col = col * 26 + (name.charCodeAt(i) - 64);
  }
  return col;
}

export interface RC {
  row: number; // 1-based
  col: number; // 1-based
}

/** "A1" → { row: 1, col: 1 }. Returns null for invalid refs. */
export function refToRC(ref: string): RC | null {
  const m = /^([A-Za-z]{1,3})(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { row: parseInt(m[2], 10), col: nameToCol(m[1].toUpperCase()) };
}

export function rcToRef(row: number, col: number): string {
  return colToName(col) + row;
}

export interface Rect {
  row1: number;
  col1: number;
  row2: number;
  col2: number;
}

/** "A1:F20" → rect. Returns null for invalid refs. */
export function rangeToRect(ref: string): Rect | null {
  const parts = ref.split(":");
  if (parts.length === 1) {
    const rc = refToRC(parts[0]);
    return rc ? { row1: rc.row, col1: rc.col, row2: rc.row, col2: rc.col } : null;
  }
  const a = refToRC(parts[0]);
  const b = refToRC(parts[1]);
  if (!a || !b) return null;
  return {
    row1: Math.min(a.row, b.row),
    col1: Math.min(a.col, b.col),
    row2: Math.max(a.row, b.row),
    col2: Math.max(a.col, b.col),
  };
}

export function rectToRef(rect: Rect): string {
  if (rect.row1 === rect.row2 && rect.col1 === rect.col2) {
    return rcToRef(rect.row1, rect.col1);
  }
  return `${rcToRef(rect.row1, rect.col1)}:${rcToRef(rect.row2, rect.col2)}`;
}
