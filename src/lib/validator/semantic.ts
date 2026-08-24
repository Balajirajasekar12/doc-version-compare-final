/**
 * Semantic Content Matcher
 *
 * Compares documents by their semantic content rather than physical line
 * position. Documents are normalized into a canonical representation:
 * key-value pairs, prose lines, tables, and structural elements.
 *
 * This replaces line-based matching where:
 *   PDF Line 1 == RTF Line 1  (WRONG)
 *
 * With content-based matching where:
 *   Both contain "Customer: ABC" → MATCH (regardless of position)
 */

import type { ComparisonMode, DiffRecord, DiffType, DocGroup, FormatInfo, ParsedDoc } from "./types";

// ── Canonical content representation ────────────────────────────────────────

/** A normalized content element extracted from any document format. */
export interface ContentElement {
  /** Normalized key for matching (lowercase, stripped). */
  normalizedKey: string;
  /** Human-readable label. */
  label: string;
  /** The actual value. */
  value: string;
  /** Original position hint (line number, cell address, etc.). */
  positionHint: string;
  /** Element type. */
  kind: "key_value" | "prose" | "table_header" | "table_cell" | "heading" | "list_item";
  /** Formatting info if available. */
  format?: FormatInfo;
  /** Sheet name for spreadsheet cells. */
  sheet?: string;
}

/** Result of matching two content element lists. */
export interface MatchResult {
  matched: Array<{
    baseline: ContentElement;
    comparing: ContentElement;
    identical: boolean;
  }>;
  missingInComparing: ContentElement[];
  addedInComparing: ContentElement[];
}

// ── Key-value line regex ────────────────────────────────────────────────────

// Use greedy match for key (not non-greedy) to capture full key like "Account"
// before the colon delimiter. The key must end at a colon or equals sign.
const KEY_VALUE_RE = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+)\s*[:=]\s*(.+)$/;
const HEADING_RE = /^#{1,6}\s+(.+)$/;
const LIST_RE = /^[\-•*]\s+(.+)$/;
const TABLE_SEP_RE = /^[|\-+:]+$/;
// Match pipe-delimited table rows: "Field | Value" or "Field | Value | Extra"
const PIPE_TABLE_RE = /^(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(.+?))?$/;

// ── Content extraction ──────────────────────────────────────────────────────

/** Normalize a key for matching: lowercase, trim, collapse whitespace. */
function normalizeKey(field: string): string {
  return field
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Check if a line is a pipe-delimited table row. */
function isPipeTableRow(line: string): boolean {
  // Must have at least one pipe, and content on both sides
  if (!line.includes("|")) return false;
  const parts = line.split("|").map(p => p.trim());
  // At least 2 non-empty parts
  const nonEmpty = parts.filter(p => p !== "");
  return nonEmpty.length >= 2;
}

/**
 * Detect alternating key-value lines from RTF \cell extraction.
 * RTF tables produce lines like:
 *   Field
 *   Value
 *   Account
 *   1001
 *   Customer
 *   Customer Beta
 *
 * This detects the pattern and converts to pipe-delimited rows:
 *   Field | Value
 *   Account | 1001
 *   Customer | Customer Beta
 */function normalizeCellLines(inputLines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  // Lenient key-like check for table DETECTION (not header identification).
  // Accepts dates (2021-06-15), numbers (1000), multi-word keys, etc.
  function isKeyLike(s: string): boolean {
    return s.length > 0 && s.length < 50 &&
      /^[A-Za-z]/.test(s) &&
      !s.includes(":") && !s.includes("|");
  }
  // Strict alpha check for HEADER identification only.
  function isAlphaKey(s: string): boolean {
    return s.length > 0 && s.length < 30 &&
      /^[A-Za-z][A-Za-z ]*$/.test(s) &&
      !s.includes(":") && !s.includes("|");
  }
  // A value line is non-empty and reasonable length.
  function isValue(s: string): boolean {
    return s.length > 0 && s.length < 80 &&
      !s.includes(":") && !s.includes("|");
  }

  while (i < inputLines.length) {
    const trimmed = inputLines[i].trim();

    // Check if this could be a 2-column table header:
    // Two consecutive alpha-only lines (strict check for header).
    if (i + 1 < inputLines.length && isAlphaKey(trimmed)) {
      const nextTrimmed = inputLines[i + 1].trim();
      if (isAlphaKey(nextTrimmed)) {
        // Scan forward to find how many consecutive key-value pairs exist.
        // Stop at the first pair that doesn't look like key-value,
        // or when we run out of lines.  This is resilient to trailing
        // paragraphs that always appear in real documents.
        let rowCount = 0;
        let rowIdx = i + 2;
        let naturalEnd = true;
        while (rowIdx + 1 < inputLines.length) {
          const k = inputLines[rowIdx].trim();
          const v = inputLines[rowIdx + 1].trim();
          if (k === "" || v === "") { naturalEnd = false; break; }
          if (!isKeyLike(k)) { naturalEnd = false; break; }
          rowCount++;
          rowIdx += 2;
        }

        if (rowCount >= 1 && (naturalEnd || rowCount >= 2)) {
          // Convert to pipe-delimited rows using lenient key check
          result.push(`${trimmed} | ${nextTrimmed}`);
          rowIdx = i + 2;
          while (rowIdx + 1 < inputLines.length) {
            const k = inputLines[rowIdx].trim();
            const v = inputLines[rowIdx + 1].trim();
            if (k === "" || v === "") break;
            if (!isKeyLike(k)) break;
            result.push(`${k} | ${v}`);
            rowIdx += 2;
          }
          i = rowIdx;
          continue;
        }      }
    }

    // Fallback for alternating key-value lines where the value is NOT
    // an alpha key (e.g. "Client Number" → "016543" or
    // "Claims Paid Thru" → "07/31/2026 (Bill Cycle 5 of 5)").
    if (i + 1 < inputLines.length && isAlphaKey(trimmed) && trimmed.length <= 25) {
      const nextTrimmed = inputLines[i + 1].trim();
      // CRITICAL: Do NOT pair if the next line is already structured data:
      // - contains 2+ consecutive spaces (space-separated table row)
      // - contains pipe characters (already pipe-delimited)
      // - contains tab characters (already tab-delimited)
      // These should be parsed by extractKVFromText, not consumed here.
      const isStructuredData = /\S\s{2,}\S/.test(nextTrimmed) || nextTrimmed.includes("|") || nextTrimmed.includes("\t");
      if (isValue(nextTrimmed) && !isAlphaKey(nextTrimmed) && nextTrimmed.length <= 60 && !isStructuredData) {
        let fallbackCount = 0;
        let fbIdx = i + 2;
        let fbEnd = true;
        while (fbIdx + 1 < inputLines.length) {
          const k = inputLines[fbIdx].trim();
          const v = inputLines[fbIdx + 1].trim();
          if (k === "" || v === "") { fbEnd = false; break; }
          if (!isKeyLike(k) || !isValue(v)) { fbEnd = false; break; }
          // Also reject if the next value line is structured data
          if (/\S\s{2,}\S/.test(v) || v.includes("|") || v.includes("\t")) { fbEnd = false; break; }
          fallbackCount++;
          fbIdx += 2;
        }

        const isStandalonePair = fallbackCount === 0 && fbIdx <= i + 2;
        if (fallbackCount >= 1 && (fbEnd || fallbackCount >= 2)) {
          result.push(`${trimmed} | ${nextTrimmed}`);
          fbIdx = i + 2;
          while (fbIdx + 1 < inputLines.length) {
            const k = inputLines[fbIdx].trim();
            const v = inputLines[fbIdx + 1].trim();
            if (k === "" || v === "") break;
            if (!isKeyLike(k)) break;
            if (/\S\s{2,}\S/.test(v) || v.includes("|") || v.includes("\t")) break;
            result.push(`${k} | ${v}`);
            fbIdx += 2;
          }
          i = fbIdx;
          continue;
        } else if (isStandalonePair && trimmed.length <= 20 && nextTrimmed.length <= 40 && !/  /.test(nextTrimmed) && !/\t/.test(nextTrimmed)) {
          result.push(`${trimmed} | ${nextTrimmed}`);
          i += 2;
          continue;
        }
      }
    }


    result.push(inputLines[i]);
    i++;
  }

  return result;
}

/** Extract content elements from a text document. */
function extractTextElements(doc: ParsedDoc): ContentElement[] {
  const rawLines = doc.content?.type === "text" ? doc.content.lines : [];
  // Normalize RTF cell-produced lines into pipe-delimited format
  const lines = normalizeCellLines(rawLines);
  const elements: ContentElement[] = [];
  let proseIndex = 0;

  // First pass: detect if this document uses pipe-delimited tables
  const pipeLineIndices = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isPipeTableRow(trimmed)) {
      pipeLineIndices.add(i);
    }
  }

  // Group consecutive pipe lines into table blocks
  const pipeTableBlocks: Array<{ start: number; end: number; rows: string[][] }> = [];
  let currentBlock: { start: number; end: number; rows: string[][] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (pipeLineIndices.has(i)) {
      const trimmed = lines[i].trim();
      const cells = trimmed.split("|").map(c => c.trim());
      if (!currentBlock) {
        currentBlock = { start: i, end: i, rows: [cells] };
      } else {
        currentBlock.end = i;
        currentBlock.rows.push(cells);
      }
    } else {
      if (currentBlock) {
        pipeTableBlocks.push(currentBlock);
        currentBlock = null;
      }
    }
  }
  if (currentBlock) pipeTableBlocks.push(currentBlock);

  // Create a set of lines that belong to pipe table blocks
  const pipeTableLines = new Set<number>();
  for (const block of pipeTableBlocks) {
    for (let i = block.start; i <= block.end; i++) {
      pipeTableLines.add(i);
    }
  }

  // Process pipe table blocks as table cells
  // For pipe-delimited tables like:
  //   Field | Value
  //   Account | 1001
  //   Customer | Customer Beta
  // The first column is the field name, second column is the value
  //
  // IMPORTANT: The header row ("Field | Value") is SKIPPED from data extraction.
  // It only describes column names, not actual content.
  for (const block of pipeTableBlocks) {
    const firstRow = block.rows[0];
    const isHeader = firstRow && firstRow.length >= 2 &&
      firstRow.every(c => /^[A-Za-z]/.test(c));

    // Start from row 1 (skip header) or row 0 (no header)
    const startRow = isHeader ? 1 : 0;

    // Add header elements for content comparison.
    // Headers like "Field | Value" are meaningful content that should be
    // compared by their values, not by key-value matching.
    if (isHeader) {
      // Create a single prose element for the entire header row
      // This ensures "Field | Value" matches "Field | Value" regardless
      // of how each parser extracted it.
      const headerText = firstRow.join(" | ");
      elements.push({
        normalizedKey: `header#${proseIndex}`,
        label: headerText,
        value: headerText,
        positionHint: `Line ${block.start + 1}`,
        kind: "prose",
      });
      proseIndex++;
    }

    // Process data rows as key-value pairs (first column = key, second = value)
    for (let r = startRow; r < block.rows.length; r++) {
      const row = block.rows[r];
      if (row.length >= 2) {
        const key = row[0].trim();
        const value = row[1].trim();
        if (key !== "" && value !== "") {
          elements.push({
            normalizedKey: normalizeKey(key),
            label: key,
            value,
            positionHint: `Line ${block.start + 1 + r}`,
            kind: "key_value",
          });
        }
      }
    }
  }

  // Process remaining lines (not in pipe tables)
  for (let i = 0; i < lines.length; i++) {
    if (pipeTableLines.has(i)) continue;

    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") continue;

    // Skip table separator rows
    if (TABLE_SEP_RE.test(trimmed)) continue;

    // Check for heading
    const headingMatch = HEADING_RE.exec(trimmed);
    if (headingMatch) {
      elements.push({
        normalizedKey: normalizeKey(headingMatch[1]),
        label: trimmed,
        value: headingMatch[1].trim(),
        positionHint: `Line ${i + 1}`,
        kind: "heading",
      });
      continue;
    }

    // Check for list item
    const listMatch = LIST_RE.exec(trimmed);
    if (listMatch) {
      elements.push({
        normalizedKey: `list#${proseIndex}`,
        label: `List item · Line ${i + 1}`,
        value: listMatch[1].trim(),
        positionHint: `Line ${i + 1}`,
        kind: "list_item",
      });
      proseIndex++;
      continue;
    }

    // Check for key-value pair
    const kvMatch = KEY_VALUE_RE.exec(trimmed);
    if (kvMatch) {
      elements.push({
        normalizedKey: normalizeKey(kvMatch[1]),
        label: kvMatch[1].trim(),
        value: kvMatch[2].trim(),
        positionHint: `Line ${i + 1}`,
        kind: "key_value",
      });
      continue;
    }

    // Prose line
    elements.push({
      normalizedKey: `text#${proseIndex}`,
      label: trimmed,  // Use actual text content as label
      value: trimmed,
      positionHint: `Line ${i + 1}`,
      kind: "prose",
    });
    proseIndex++;
  }

  return elements;
}

/** Column letters helper. */
function colLetters(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Check if a row looks like a header row. */
function hasHeaderRow(rows: string[][]): boolean {
  const row = rows[0];
  if (!row) return false;
  const cells = row.map((c) => c.trim()).filter((c) => c !== "");
  if (cells.length < 2) return false;
  if (!/^[A-Za-z]/.test(cells[0])) return false;
  return !cells.some((c) => /^[-+]?\d+(\.\d+)?$/.test(c));
}

/** Extract content elements from a spreadsheet document. */
function extractSheetElements(doc: ParsedDoc): ContentElement[] {
  if (doc.content?.type !== "sheet") return [];
  const elements: ContentElement[] = [];

  for (const sheet of doc.content.sheets) {
    const rows = sheet.rows;
    if (hasHeaderRow(rows)) {
      const headers = rows[0].map((h, c) => h.trim() || colLetters(c));
      const seen = new Map<string, number>();
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every((c) => c.trim() === "")) continue;
        for (let c = 0; c < headers.length; c++) {
          const value = (row[c] ?? "").trim();
          if (value === "") continue;
          const base = headers[c];
          const n = seen.get(base) ?? 0;
          seen.set(base, n + 1);
          const key = normalizeKey(n > 0 ? `${base} #${n}` : base);
          elements.push({
            normalizedKey: key,
            label: n > 0 ? `${base} #${n}` : base,
            value,
            positionHint: `${sheet.name} · ${colLetters(c)}${r + 1}`,
            kind: "table_cell",
            sheet: sheet.name,
          });
        }
      }
    } else {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const value = row[c].trim();
          if (value === "") continue;
          const addr = `${colLetters(c)}${r + 1}`;
          elements.push({
            normalizedKey: `cell#${r}#${c}`,
            label: addr,
            value,
            positionHint: `${sheet.name} · ${addr}`,
            kind: "table_cell",
            sheet: sheet.name,
          });
        }
      }
    }
  }

  return elements;
}

/**
 * Extract key-value pairs from a text line that might contain them.
 * Handles pipe-delimited ("Field | Value"), colon-separated
 * ("Field: Value"), and equals-separated ("Field = Value") formats.
 *
 * Returns an array of {key, value} pairs found in the text.
 * Returns empty array if no structured content is found.
 */
function extractKVFromText(text: string): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];
  const trimmed = text.trim();

  // Pattern 1: Pipe-delimited — "Field | Value" or "Field | Value | Extra"
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map(p => p.trim()).filter(p => p !== "");
    if (parts.length >= 2) {
      // Header row check: if all parts are alpha-only and short, it's likely
      // a table header ("Field | Value"), not data. Skip.
      const isHeader = parts.every(p => p.length < 30 && /^[A-Za-z]/.test(p) && !/[0-9]/.test(p));
      if (!isHeader) {
        // First column is key, second column is value (ignore extras)
        pairs.push({ key: parts[0], value: parts[1] });
      }
    }
    return pairs; // If pipe found, don't try other patterns
  }

  // Pattern 2: Colon-separated — "Field: Value" or "Field : Value"
  const colonMatch = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*:\s*(.+)$/.exec(trimmed);
  if (colonMatch) {
    pairs.push({ key: colonMatch[1].trim(), value: colonMatch[2].trim() });
    return pairs;
  }

  // Pattern 3: Equals-separated — "Field = Value"
  const equalsMatch = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*=\s*(.+)$/.exec(trimmed);
  if (equalsMatch) {
    pairs.push({ key: equalsMatch[1].trim(), value: equalsMatch[2].trim() });
    return pairs;
  }

  return pairs;
}

/**
 * Enhance a list of content elements by extracting key-value pairs from
 * prose elements. This ensures that even if the parser failed to detect
 * pipe-delimited table structure, the matcher can still find the
 * field/value content.
 *
 * For example, a prose element "Region | South" will be converted to
 * a key_value element with key="Region", value="South".
 */
function enhanceWithExtractedKV(elements: ContentElement[]): ContentElement[] {
  const result: ContentElement[] = [];

  for (const el of elements) {
    if (el.kind === "prose") {
      const pairs = extractKVFromText(el.value);
      if (pairs.length > 0) {
        // Replace prose with extracted key_value elements.
        // Do NOT keep the original prose — it would be compared against
        // unmatched KV cells in Phase 3 and cause false MISSING_CONTENT.
        for (const { key, value } of pairs) {
          result.push({
            normalizedKey: normalizeKey(key),
            label: key,
            value,
            positionHint: el.positionHint,
            kind: "key_value",
          });
        }
      } else {
        result.push(el);
      }
    } else {
      result.push(el);
    }
  }

  return result;
}

/** Extract content elements from any document. */
export function extractElements(doc: ParsedDoc): ContentElement[] {
  const raw = doc.content?.type === "sheet"
    ? extractSheetElements(doc)
    : extractTextElements(doc);
  // Enhance prose elements by extracting key-value pairs from them.
  // This handles cases where the parser didn't detect table structure
  // but the text content contains pipe-delimited or colon-separated data.
  return enhanceWithExtractedKV(raw);
}

// ── Semantic matching ───────────────────────────────────────────────────────

/**
 * Apply intelligent normalization to a value for comparison.
 * Trims whitespace, collapses multiple spaces, normalizes line breaks.
 */
function normalizeForComparison(value: string, mode: ComparisonMode): string {
  if (mode === "exact") return value;

  // Intelligent normalization
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, ""); // Zero-width chars
}

/**
 * Strip delimiters and normalize for aggressive content comparison.
 * Handles PDF vs RTF structural differences.
 */
function aggressiveNormalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[|;,\-_:=/\\]+/g, " ") // Strip common delimiters
    .replace(/\s+/g, " ")            // Collapse whitespace
    .trim();
}

/**
 * Extract sorted unique words from a string for token-based matching.
 */
function extractTokens(value: string): string[] {
  const norm = aggressiveNormalize(value);
  return norm
    .split(" ")
    .filter((w) => w.length > 0)
    .sort();
}

/**
 * Compare two normalized strings for equality under the given mode.
 */
function valuesMatch(a: string, b: string, mode: ComparisonMode): boolean {
  // Direct comparison first
  if (normalizeForComparison(a, mode) === normalizeForComparison(b, mode)) {
    return true;
  }

  // Aggressive normalization fallback (handles delimiter differences)
  if (mode === "intelligent") {
    if (aggressiveNormalize(a) === aggressiveNormalize(b)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two text values contain the same set of meaningful tokens.
 * This handles cases where PDF concatenates table cells into one line
 * while RTF puts each cell on a separate line.
 */
function tokensMatch(a: string, b: string): boolean {
  const tokensA = extractTokens(a);
  const tokensB = extractTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  // Both must have the same set of meaningful tokens
  if (tokensA.length !== tokensB.length) return false;
  return tokensA.every((t, i) => t === tokensB[i]);
}

/**
 * Check if a prose line's token set equals the union of key-value tokens.
 * This handles PDF output where table cells are concatenated into a single
 * prose line, while RTF correctly extracts each cell as a key-value pair.
 *
 * Example:
 *   PDF prose: "Account 1000 Customer Customer Alpha Region South"
 *   RTF cells: {account: "1000", customer: "Customer Alpha", region: "South"}
 *   Token union of cells: {1000, account, alpha, customer, customer, region, south}
 *   Token set of prose: {1000, account, alpha, customer, customer, region, south}
 *   → MATCH
 */
function matchesAggregatedCells(
  proseValue: string,
  cells: ContentElement[],
): boolean {
  const proseTokens = extractTokens(proseValue);
  if (proseTokens.length === 0) return false;
  if (cells.length === 0) return false;

  // Collect tokens from ALL cell content: both keys AND values.
  // A key-value pair like {key: "Customer", value: "Customer Alpha"}
  // contributes tokens from both "customer" (key) and "customer alpha" (value).
  // This is correct because the PDF prose line contains ALL words from the table,
  // including field names (keys) and their values.
  const cellTokens = new Set<string>();
  for (const cell of cells) {
    for (const t of extractTokens(cell.label)) cellTokens.add(t);
    for (const t of extractTokens(cell.value)) cellTokens.add(t);
  }

  if (cellTokens.size === 0) return false;

  // Bidirectional check: every prose token must be in cell tokens
  // AND every cell token must appear in the prose.
  // This ensures the content is semantically equivalent.
  if (proseTokens.length < cellTokens.size) return false;
  if (proseTokens.length > cellTokens.size * 2) return false;
  // All prose tokens must exist in cell tokens
  return proseTokens.every((t) => cellTokens.has(t));
}

/**
 * Match elements from a baseline against elements from a comparing document.
 *
 * Strategy:
 * 1. For key-value elements: match by normalized key
 * 2. For table cells: match by normalized key (column name)
 * 3. For prose elements: match by content value
 * 4. Position is NOT used as primary matching key
 *
 * This is semantic matching — physical position is NOT the primary key.
 */
export function matchElements(
  baselineInput: ContentElement[],
  comparingInput: ContentElement[],
  mode: ComparisonMode,
): MatchResult {
  // Enhance both sides by extracting key-value pairs from prose elements.
  // This ensures that even if elements were created manually (e.g., in tests)
  // or the parser failed to detect table structure, the matcher can still
  // find and compare structured content.
  const baseline = enhanceWithExtractedKV(baselineInput);
  const comparing = enhanceWithExtractedKV(comparingInput);

  const matched: MatchResult["matched"] = [];
  const unmatchedBaseline = new Set(baseline.map((_, i) => i));
  const unmatchedComparing = new Set(comparing.map((_, i) => i));

  // Phase 1: Match key-value pairs, headings, and table cells by normalized key
  const kvBaseline = baseline
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => el.kind === "key_value" || el.kind === "heading" || el.kind === "table_cell" || el.kind === "table_header");
  const kvComparing = comparing
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => el.kind === "key_value" || el.kind === "heading" || el.kind === "table_cell" || el.kind === "table_header");

  const usedComparingKV = new Set<number>();
  for (const { el: bEl, i: bIdx } of kvBaseline) {
    let bestMatch: { el: ContentElement; i: number } | null = null;
    for (const { el: cEl, i: cIdx } of kvComparing) {
      if (usedComparingKV.has(cIdx)) continue;
      if (bEl.normalizedKey === cEl.normalizedKey) {
        bestMatch = { el: cEl, i: cIdx };
        break;
      }
    }
    if (bestMatch) {
      matched.push({
        baseline: bEl,
        comparing: bestMatch.el,
        identical: valuesMatch(bEl.value, bestMatch.el.value, mode),
      });
      unmatchedBaseline.delete(bIdx);
      unmatchedComparing.delete(bestMatch.i);
      usedComparingKV.add(bestMatch.i);
    }
  }

  // Phase 2: Match remaining elements by content value (for prose and unmatched items)
  const remainingBaseline = baseline
    .map((el, idx) => ({ el, idx }))
    .filter(({ idx }) => unmatchedBaseline.has(idx));
  const remainingComparing = comparing
    .map((el, idx) => ({ el, idx }))
    .filter(({ idx }) => unmatchedComparing.has(idx));

  const usedComp = new Set<number>();
  for (const { el: bEl, idx: bIdx } of remainingBaseline) {
    let bestMatch: { el: ContentElement; idx: number } | null = null;
    for (const { el: cEl, idx: cIdx } of remainingComparing) {
      if (usedComp.has(cIdx)) continue;
      if (valuesMatch(bEl.value, cEl.value, mode)) {
        bestMatch = { el: cEl, idx: cIdx };
        break;
      }
    }
    if (bestMatch) {
      matched.push({
        baseline: bEl,
        comparing: bestMatch.el,
        identical: true,
      });
      unmatchedBaseline.delete(bIdx);
      unmatchedComparing.delete(bestMatch.idx);
      usedComp.add(bestMatch.idx);
    }
  }

  // Phase 3: Match prose lines against aggregated key-value cells.
  // This handles PDF output where table cells get concatenated into one prose line
  // while RTF correctly extracts each cell as separate key-value pairs.
  //
  // Example:
  //   PDF (baseline): prose line = "Account 1000 Customer Customer Alpha Region South"
  //   RTF (comparing): cells = [Account→1000, Customer→Customer Alpha, Region→South]
  //   Token set of prose = Token set of all cells combined → MATCH
  const unmatchedKVComparing = Array.from(unmatchedComparing)
    .map((i) => ({ el: comparing[i], idx: i }))
    .filter(({ el }) => el.kind === "key_value" || el.kind === "table_cell" || el.kind === "table_header");
  const unmatchedKVBaseline = Array.from(unmatchedBaseline)
    .map((i) => ({ el: baseline[i], idx: i }))
    .filter(({ el }) => el.kind === "key_value" || el.kind === "table_cell" || el.kind === "table_header");

  // Try matching unmatched prose in baseline against aggregated KV cells in comparing
  const usedCompPhase3 = new Set<number>();
  const unmatchedProseBaseline = Array.from(unmatchedBaseline)
    .map((i) => ({ el: baseline[i], idx: i }))
    .filter(({ el }) => (el.kind === "prose" || el.kind === "list_item") && !usedCompPhase3.has(-1));

  for (const { el: bEl, idx: bIdx } of unmatchedProseBaseline) {
    if (unmatchedKVComparing.length === 0) break;
    if (matchesAggregatedCells(bEl.value, unmatchedKVComparing.map((c) => c.el))) {
      // Mark all those comparing cells as matched
      for (const { idx: cIdx } of unmatchedKVComparing) {
        unmatchedComparing.delete(cIdx);
        usedCompPhase3.add(cIdx);
      }
      unmatchedBaseline.delete(bIdx);
      // Add individual matched pairs
      for (const { el: cEl } of unmatchedKVComparing) {
        matched.push({
          baseline: bEl,
          comparing: cEl,
          identical: true,
        });
      }
      break;
    }
  }

  // Try matching unmatched prose in comparing against aggregated KV cells in baseline
  const unmatchedProseComparing = Array.from(unmatchedComparing)
    .map((i) => ({ el: comparing[i], idx: i }))
    .filter(({ el }) => el.kind === "prose" || el.kind === "list_item");

  for (const { el: cEl, idx: cIdx } of unmatchedProseComparing) {
    if (unmatchedKVBaseline.length === 0) break;
    if (matchesAggregatedCells(cEl.value, unmatchedKVBaseline.map((b) => b.el))) {
      for (const { idx: bIdx } of unmatchedKVBaseline) {
        unmatchedBaseline.delete(bIdx);
      }
      unmatchedComparing.delete(cIdx);
      for (const { el: bEl } of unmatchedKVBaseline) {
        matched.push({
          baseline: bEl,
          comparing: cEl,
          identical: true,
        });
      }
      break;
    }
  }

  // Phase 4: Token-based matching for remaining unmatched prose elements only.
  // STRICT: tokens must match exactly (same count, same set)
  const remainingProseBaseline = Array.from(unmatchedBaseline)
    .map((i) => ({ el: baseline[i], idx: i }))
    .filter(({ el }) => el.kind === "prose" || el.kind === "list_item");
  const remainingProseComparing = Array.from(unmatchedComparing)
    .map((i) => ({ el: comparing[i], idx: i }))
    .filter(({ el }) => el.kind === "prose" || el.kind === "list_item");

  const usedCompPhase4 = new Set<number>();
  for (const { el: bEl, idx: bIdx } of remainingProseBaseline) {
    for (const { el: cEl, idx: cIdx } of remainingProseComparing) {
      if (usedCompPhase4.has(cIdx)) continue;
      if (tokensMatch(bEl.value, cEl.value)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedCompPhase4.add(cIdx);
        break;
      }
    }
  }

  // Collect remaining unmatched as missing/added
  const missingInComparing = Array.from(unmatchedBaseline).map((i) => baseline[i]);
  const addedInComparing = Array.from(unmatchedComparing).map((i) => comparing[i]);

  return { matched, missingInComparing, addedInComparing };
}

// ── Difference generation ───────────────────────────────────────────────────

let diffCounter = 0;
function nextDiffId(prefix: string): string {
  diffCounter++;
  return `${prefix}-${diffCounter}`;
}

/**
 * Generate semantic DiffRecords from a match result.
 * Produces detailed, non-vague descriptions.
 */
export function generateSemanticDiffs(
  group: { id: string; account: string; stem: string },
  baselineDoc: ParsedDoc,
  comparingDoc: ParsedDoc,
  matchResult: MatchResult,
  comparisonPair: import("./types").ComparisonPair,
  mode: ComparisonMode = "intelligent",
): DiffRecord[] {
  const records: DiffRecord[] = [];

  // Value mismatches (matched elements that differ)
  for (const { baseline, comparing, identical } of matchResult.matched) {
    if (identical) continue;

    let diffType: DiffType = "value_mismatch";
    let detailedDescription = "";

    if (baseline.kind === "key_value" || baseline.kind === "heading") {
      diffType = "value_mismatch";
      detailedDescription = generateValueMismatchDescription(
        baselineDoc.ext,
        comparingDoc.ext,
        baseline,
        comparing,
      );
    } else if (baseline.kind === "table_cell" || baseline.kind === "table_header") {
      diffType = "cell_changed";
      detailedDescription = generateCellMismatchDescription(
        baselineDoc.ext,
        comparingDoc.ext,
        baseline,
        comparing,
      );
    } else {
      diffType = "text_changed";
      detailedDescription = generateTextMismatchDescription(
        baselineDoc.ext,
        comparingDoc.ext,
        baseline,
        comparing,
      );
    }

    records.push({
      id: nextDiffId("sem"),
      groupId: group.id,
      groupLabel: group.stem,
      account: group.account,
      docType: baselineDoc.ext,
      differenceType: diffType,
      comparisonPair,
      comparisonMode: "reference",
      locationSignature: `semantic|${baseline.normalizedKey}|${baseline.positionHint}`,
      locationLabel: baseline.label,
      referenceText: baseline.value,
      referenceFile: baselineDoc.fileName,
      baselineFormat: comparisonPair.baselineFormat,
      comparingFormat: comparisonPair.comparingFormat,
      comparingFile: comparingDoc.fileName,
      referenceVersion: baselineDoc.versionTag,
      versions: [
        {
          docId: comparingDoc.id,
          fileName: comparingDoc.fileName,
          versionTag: comparingDoc.versionTag,
          kind: "changed",
          text: comparing.value,
          segments: generateWordDiff(baseline.value, comparing.value),
        },
      ],
      detailedDescription,
    });
  }

  // Missing content
  for (const element of matchResult.missingInComparing) {
    const locationHint = element.positionHint !== "" ? element.positionHint : "location unknown";
    records.push({
      id: nextDiffId("sem"),
      groupId: group.id,
      groupLabel: group.stem,
      account: group.account,
      docType: baselineDoc.ext,
      differenceType: "missing_content",
      comparisonPair,
      comparisonMode: "reference",
      locationSignature: `missing|${element.normalizedKey}`,
      locationLabel: element.label,
      referenceText: element.value,
      referenceFile: baselineDoc.fileName,
      baselineFormat: comparisonPair.baselineFormat,
      comparingFormat: comparisonPair.comparingFormat,
      comparingFile: comparingDoc.fileName,
      referenceVersion: baselineDoc.versionTag,
      versions: [
        {
          docId: comparingDoc.id,
          fileName: comparingDoc.fileName,
          versionTag: comparingDoc.versionTag,
          kind: "removed",
          text: "",
        },
      ],
      detailedDescription:
        `The baseline ${baselineDoc.ext.toUpperCase()} contains the field "${element.label}" ` +
        `with the value "${element.value}" at ${locationHint}. ` +
        `The comparing ${comparingDoc.ext.toUpperCase()} does not contain this content. ` +
        `Because the content is missing from the comparing document, this difference ` +
        `has been classified as MISSING_CONTENT.`,
    });
  }

  // Added content
  for (const element of matchResult.addedInComparing) {
    const locationHint = element.positionHint !== "" ? element.positionHint : "location unknown";
    records.push({
      id: nextDiffId("sem"),
      groupId: group.id,
      groupLabel: group.stem,
      account: group.account,
      docType: baselineDoc.ext,
      differenceType: "added_content",
      comparisonPair,
      comparisonMode: "reference",
      locationSignature: `added|${element.normalizedKey}`,
      locationLabel: element.label,
      referenceText: "",
      referenceFile: baselineDoc.fileName,
      baselineFormat: comparisonPair.baselineFormat,
      comparingFormat: comparisonPair.comparingFormat,
      comparingFile: comparingDoc.fileName,
      referenceVersion: baselineDoc.versionTag,
      versions: [
        {
          docId: comparingDoc.id,
          fileName: comparingDoc.fileName,
          versionTag: comparingDoc.versionTag,
          kind: "added",
          text: element.value,
        },
      ],
      detailedDescription:
        `The comparing ${comparingDoc.ext.toUpperCase()} contains the field "${element.label}" ` +
        `with the value "${element.value}" at ${locationHint} ` +
        `that is not present in the baseline ${baselineDoc.ext.toUpperCase()}. ` +
        `This is classified as ADDED_CONTENT.`,
    });
  }

  return records;
}

// ── Description generators ──────────────────────────────────────────────────

function generateValueMismatchDescription(
  baselineFormat: string,
  comparingFormat: string,
  baseline: ContentElement,
  comparing: ContentElement,
): string {
  return (
    `The baseline ${baselineFormat.toUpperCase()} contains the field "${baseline.label}" ` +
    `with the value "${baseline.value}". ` +
    `The comparing ${comparingFormat.toUpperCase()} contains the same field with ` +
    `the value "${comparing.value}". Since the values are different, this has been ` +
    `identified as a VALUE_MISMATCH. ` +
    `Baseline location: ${baseline.positionHint}. ` +
    `Comparing location: ${comparing.positionHint}.`
  );
}

function generateCellMismatchDescription(
  baselineFormat: string,
  comparingFormat: string,
  baseline: ContentElement,
  comparing: ContentElement,
): string {
  return (
    `The baseline ${baselineFormat.toUpperCase()} contains "${baseline.label}" ` +
    `with the value "${baseline.value}" at ${baseline.positionHint}. ` +
    `The comparing ${comparingFormat.toUpperCase()} contains "${comparing.label}" ` +
    `with the value "${comparing.value}" at ${comparing.positionHint}. ` +
    `The values do not match.`
  );
}

function generateTextMismatchDescription(
  baselineFormat: string,
  comparingFormat: string,
  baseline: ContentElement,
  comparing: ContentElement,
): string {
  return (
    `The baseline ${baselineFormat.toUpperCase()} contains the text "${baseline.value}" ` +
    `at ${baseline.positionHint}. The comparing ${comparingFormat.toUpperCase()} ` +
    `contains "${comparing.value}" at ${comparing.positionHint}. ` +
    `The text content differs.`
  );
}

// ── Word diff helper ────────────────────────────────────────────────────────

function generateWordDiff(
  baseline: string,
  comparing: string,
): import("./types").WordSeg[] {
  // Simple word-level diff
  const baseWords = baseline.split(/(\s+)/);
  const compWords = comparing.split(/(\s+)/);
  const segments: import("./types").WordSeg[] = [];

  // Use LCS-like approach for word alignment
  let bi = 0;
  let ci = 0;

  while (bi < baseWords.length || ci < compWords.length) {
    if (bi < baseWords.length && ci < compWords.length) {
      if (baseWords[bi] === compWords[ci]) {
        segments.push({ value: baseWords[bi] });
        bi++;
        ci++;
      } else {
        segments.push({ value: baseWords[bi], removed: true });
        segments.push({ value: compWords[ci], added: true });
        bi++;
        ci++;
      }
    } else if (bi < baseWords.length) {
      segments.push({ value: baseWords[bi], removed: true });
      bi++;
    } else {
      segments.push({ value: compWords[ci], added: true });
      ci++;
    }
  }

  return segments;
}

/**
 * Reset the diff counter (for testing).
 */
export function resetDiffCounter(): void {
  diffCounter = 0;
}
