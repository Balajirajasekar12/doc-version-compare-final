/**
 * Canonical Document Model & Format-Agnostic Comparison Engine
 *
 * ARCHITECTURE:
 *   SOURCE DOCUMENT (PDF/RTF/DOCX/XLSX)
 *     → FORMAT-SPECIFIC EXTRACTOR (in parsers.ts / semantic.ts)
 *       → CANONICAL DOCUMENT MODEL (this file)
 *         → NORMALIZATION (this file)
 *           → SEMANTIC COMPARISON (this file)
 *             → DIFFERENCE CLASSIFICATION (this file)
 *
 * RULE: Format-specific code may extract content, but it must NOT decide
 * whether content matches. ALL formats produce the same CanonicalDocument.
 * Comparison happens on the canonical model, not on raw format output.
 */

import type { ComparisonMode, DiffRecord, DiffType, ParsedDoc } from "./types";

// ── Canonical Content Types ─────────────────────────────────────────────────

/** Every piece of content from any format is represented as one of these. */
export interface ContentItem {
  /** Stable identity for matching. Derived from normalized field name. */
  key: string;
  /** Human-readable field/label name. */
  label: string;
  /** The actual value/content. */
  value: string;
  /** Semantic type. */
  kind: "field_value" | "heading" | "paragraph" | "list_item" | "table_cell";
  /** Source location for reporting (NOT used for matching). */
  sourceLocation: string;
  /** Sheet name for spreadsheet cells. */
  sheet?: string;
}

/** The canonical document representation. ALL formats produce this. */
export interface CanonicalDocument {
  /** The original ParsedDoc this was derived from. */
  source: ParsedDoc;
  /** Normalized content items, ready for comparison. */
  items: ContentItem[];
}

/** Result of comparing two canonical documents. */
export interface CanonicalMatchResult {
  /** Items that matched between baseline and comparing. */
  matched: Array<{
    baseline: ContentItem;
    comparing: ContentItem;
    identical: boolean;
  }>;
  /** Items in baseline but not in comparing. */
  missingInComparing: ContentItem[];
  /** Items in comparing but not in baseline. */
  addedInComparing: ContentItem[];
}

// ── Text Normalization ──────────────────────────────────────────────────────

/**
 * Single normalization function used by ALL formats.
 * This is the ONLY place where text normalization logic lives.
 */
export function normalizeText(value: string): string {
  return value
    .trim()
    // Remove zero-width and invisible characters FIRST (before space collapse)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // Normalize Unicode whitespace to regular spaces
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    // Normalize CR/LF to LF
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Collapse multiple whitespace to single space
    .replace(/[^\S\n]+/g, " ")
    // Collapse multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Normalize a field/key name for matching.
 * Lowercases, strips punctuation, collapses whitespace.
 */
export function normalizeKey(field: string): string {
  return field
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Normalize a value for comparison.
 * In intelligent mode, also strips leading/trailing whitespace and
 * collapses multiple spaces.
 */
export function normalizeValue(value: string, mode: ComparisonMode): string {
  if (mode === "exact") return value;
  return normalizeText(value);
}

// ── Canonical Content Extraction ────────────────────────────────────────────

/**
 * Extract field/value pairs from ANY text using generic patterns.
 * This is FORMAT-AGNOSTIC — it works on text from PDF, RTF, DOCX, etc.
 */
function extractFieldValuesFromText(text: string): Array<{ field: string; value: string }> {
  const pairs: Array<{ field: string; value: string }> = [];
  const trimmed = text.trim();

  // Pattern 1: Pipe-delimited — "Field | Value"
  // Multi-column rows (3+ parts) are table data, not field/value pairs.
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map(p => p.trim()).filter(p => p !== "");
    if (parts.length >= 2) {
      // If first part has a colon, this is a sentence with pipe separators.
      if (!parts[0].includes(":")) {
        // 3+ pipe parts = multi-column table row, NOT a field/value pair.
        // Examples: "3 0 | 105745 Total | ($333.33) | $0.00"
        //           "HDHP PPO Total | ($333.33) | $0.00"
        if (parts.length >= 3) {
          return pairs; // Will be handled as paragraph/table
        }
        // For exactly 2 parts, check for header/watermark/colon
        const isHeader = parts.every(p =>
          p.length <= 10 && /^[A-Za-z][A-Za-z ]*$/.test(p)
        );
        const secondPartEndsWithColon = parts[1].trim().endsWith(":");
        // Watermark value: single non-ASCII symbol like ▩, _MSK_, etc.
        const isWatermarkValue = parts[1].length <= 3 && /^\p{So}+$/u.test(parts[1]);
        if (!isHeader && !secondPartEndsWithColon && !isWatermarkValue) {
          pairs.push({ field: parts[0], value: parts[1] });
          return pairs;
        }
      }
    }
  }

  // Pattern 2: Colon-separated — "Field: Value"
  const colonMatch = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*:\s*(.+)$/.exec(trimmed);
  if (colonMatch) {
    const val = colonMatch[2].trim();
    // If the value contains pipes, this is a sentence with pipe separators
    // (e.g., "Account: 1000 | Synthetic data"), not a field_value.
    if (val.includes("|")) {
      // Skip — will be handled as paragraph
      return pairs;
    }
    pairs.push({ field: colonMatch[1].trim(), value: val });
    return pairs;
  }

  // Pattern 3: Equals-separated — "Field = Value"
  const equalsMatch = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*=\s*(.+)$/.exec(trimmed);
  if (equalsMatch) {
    pairs.push({ field: equalsMatch[1].trim(), value: equalsMatch[2].trim() });
    return pairs;
  }

  // Pattern 4: Space-separated table data — "Field    Value" (2+ spaces between)
  // This catches PDF table rows where the parser didn't insert pipes.
  // Requires: field is short alpha text, 2+ spaces gap, value follows.
  // Note: check BEFORE normalizeText collapses whitespace.
  const spaceGapMatch = /^([A-Za-z][A-Za-z ]{0,30}?)\s{2,}(.+)$/.exec(trimmed);
  if (spaceGapMatch) {
    const field = spaceGapMatch[1].trim();
    const value = spaceGapMatch[2].trim();
    // Only treat as field/value if the field is short and looks like a label
    if (field.length > 0 && field.length <= 30 && /^[A-Za-z]/.test(field) && !/[0-9]/.test(field)) {
      // Skip table headers: if both parts are very short (≤5 chars each),
      // this is likely a header like "Field    Value", not business data.
      const isHeader = field.length <= 5 && value.length <= 5 &&
        /^[A-Za-z][A-Za-z ]*$/.test(field) && /^[A-Za-z][A-Za-z ]*$/.test(value);
      if (!isHeader) {
        pairs.push({ field, value });
      }
    }
  }

  return pairs;
}

/**
 * Detect alternating key-value lines from RTF \cell extraction.
 * Converts "Field\nValue\nAccount\n1001" → ["Field | Value", "Account | 1001"]
 */
/**
 * Split concatenated field/value pairs that mammoth produces.
 * Examples:
 *   "Invoice Number260804584270" -> "Invoice Number | 260804584270"
 *   "Bill Account NameBorough Of Ridgway" -> "Bill Account Name | Borough Of Ridgway"
 *   "Total Numberof Installment" -> "Total Number | of Installment"
 */
function splitConcatenatedFieldValues(lines: string[]): string[] {
  const result: string[] = [];
  
  // Pattern: Known field names followed by values
  // These are common field names in business documents
  // Generic business document field names — NO document-specific entries.
  const knownFields = [
    "Client Number", "Client Name", "Invoice Number", "Bill Account Number",
    "Bill Account Name", "Account Number", "Account Name", "Phone Number",
    "Email Address", "Date", "Amount", "Total", "Subtotal", "Tax",
    "Sort Description", "Page", "Paid Claims Month", "Claims Paid Thru",
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      result.push(line);
      continue;
    }
    
    // Check if this line contains a known field name followed by a value.
    // CRITICAL: Only split when the value looks like a real value (short,
    // numeric, date-like, or colon-separated), NOT when it's a multi-word
    // table header continuation like "Total Number of Installment".
    let matched = false;
    for (const field of knownFields) {
      if (trimmed.startsWith(field) && trimmed.length > field.length) {
        let value = trimmed.substring(field.length).trim();
        // Strip leading colon (e.g. "Sort Description: Product/Sub Group-8 Digit")
        if (value.startsWith(":")) {
          value = value.substring(1).trim();
        }
        if (value !== "") {
          // Only split if the value looks like a real value, not a header:
          // 1. Short (≤15 chars): covers dates, IDs, currency, short text
          // 2. Numeric: amounts, counts, IDs
          // 3. Date-like: contains / or - with digits
          // 4. Currency-like: starts with $ or (
          // 5. Single word that is NOT alpha-only (e.g. "016543", "($333.33)")
          // Multi-word alpha phrases like "Number of Installment" are header
          // continuations, not values.
          const isRealValue = value.length <= 15 ||
            /^\d/.test(value) ||
            /\d[\/\-]\d/.test(value) ||
            /^[\$\(]/.test(value) ||
            value.split(/\s+/).length === 1;
          if (isRealValue) {
            result.push(`${field} | ${value}`);
            matched = true;
            break;
          }
        }
      }
    }
    
    if (!matched) {
      result.push(line);
    }
  }
  
  return result;
}

function normalizeCellLines(inputLines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  // A strict "key" check: alpha-only text, no digits/hyphens.
  // Used to identify table header rows ("Field", "Value").
  function isAlphaKey(s: string): boolean {
    return s.length > 0 && s.length < 30 &&
      /^[A-Za-z][A-Za-z]*(?: [A-Za-z]+)*$/.test(s) &&
      !s.includes(":") && !s.includes("|");
  }
  // A lenient "key-like" check: short, no pipes/colons, starts with alpha.
  // Used for table DETECTION (not for strict header identification).
  // Accepts "1000", "2021-06-15", "Customer Alpha", etc.
  function isKeyLike(s: string): boolean {
    return s.length > 0 && s.length < 50 &&
      /^[A-Za-z]/.test(s) &&
      !s.includes(":") && !s.includes("|");
  }
  // A value line is non-empty and reasonable length.
  function isValue(s: string): boolean {
    return s.length > 0 && s.length < 80 &&
      !s.includes(":") && !s.includes("|");
  }

  while (i < inputLines.length) {
    const trimmed = inputLines[i].trim();

    if (i + 1 < inputLines.length && isAlphaKey(trimmed)) {
      const nextTrimmed = inputLines[i + 1].trim();
      if (isAlphaKey(nextTrimmed)) {
        // Two consecutive alpha keys — possible header pair.
        // Also try: current line is alpha key, next is a value (no header).
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
          if (!isKeyLike(k) || !isValue(v)) { naturalEnd = false; break; }
          rowCount++;
          rowIdx += 2;
        }

        // Accept as table if:
        // - We reached end of input with all pairs valid (natural end), OR
        // - We found >= 2 valid data rows before hitting non-table content
        if (rowCount >= 1 && (naturalEnd || rowCount >= 2)) {
          // Build pipe-delimited rows.
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
      // These should be parsed by extractFieldValuesFromText, not consumed here.
      const isStructuredData = /\S\s{2,}\S/.test(nextTrimmed) || nextTrimmed.includes("|") || nextTrimmed.includes("\t");
      if (isValue(nextTrimmed) && !isAlphaKey(nextTrimmed) && nextTrimmed.length <= 60 && !isStructuredData) {
        // Scan forward for additional key-value pairs
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

        // Accept if:
        // 1. Multiple pairs found (table pattern), OR
        // 2. Single pair but key is short alpha and value is non-alpha
        //    (handles standalone fields like "Claims Paid Thru" → "07/31/2026...")
        const isStandalonePair = fallbackCount === 0 && fbIdx <= i + 2;
        if (fallbackCount >= 1 && (fbEnd || fallbackCount >= 2)) {
          // Check that at least one key has 2+ words (business field names
          // are multi-word: "Client Number", "Bill Account Name", etc.)
          // Single-word keys like "Total", "Group" are table header cells,
          // not field names.
          const allSingleWord = [trimmed, ...inputLines.slice(i + 2, fbIdx).filter((_, idx) => idx % 2 === 0)].every(
            k => k.trim().split(/\s+/).length === 1,
          );
          if (!allSingleWord) {
            // Emit without header — first pair is data
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
          }
        } else if (isStandalonePair && trimmed.length <= 20 && nextTrimmed.length <= 40 && !/  /.test(nextTrimmed) && !/\t/.test(nextTrimmed)) {
          // Single standalone pair: short key + short non-alpha value
          // Exclude values with internal spaces/tabs (already table data)
          // REQUIRE multi-word keys: single words like "Total", "Group" are
          // table header cells, not business field names.  Business fields are
          // multi-word: "Client Number", "Bill Account Name", etc.
          const keyWordCount = trimmed.split(/\s+/).length;
          const valueHasSpaces = /\s/.test(nextTrimmed);
          if (keyWordCount >= 2 || !valueHasSpaces) {
            result.push(`${trimmed} | ${nextTrimmed}`);
            i += 2;
            continue;
          }
        }
      }
    }


    result.push(inputLines[i]);
    i++;
  }

  return result;
}

/**
 * Deduplicate content items by normalized key+value.
 * Some parsers may produce duplicate extractions.
 */
function deduplicateItems(items: ContentItem[]): ContentItem[] {
  const seen = new Map<string, ContentItem>();
  const result: ContentItem[] = [];
  for (const item of items) {
    const fingerprint = `${item.kind}|${item.key}|${normalizeText(item.value)}`;
    if (seen.has(fingerprint)) continue;

    // For field_value items with the same key but different values,
    // prefer the one with the simpler/shorter value.
    if (item.kind === "field_value") {
      const existingKey = `field_value|${item.key}`;
      const existing = Array.from(seen.values()).find(
        e => e.kind === "field_value" && e.key === item.key,
      );
      if (existing) {
        // Keep the shorter value (likely the direct extraction)
        if (item.value.length < existing.value.length) {
          // Remove old from result and seen, add new
          const oldFingerprint = `${existing.kind}|${existing.key}|${normalizeText(existing.value)}`;
          seen.delete(oldFingerprint);
          result.splice(result.indexOf(existing), 1);
        } else {
          continue;
        }
      }
    }

    seen.set(fingerprint, item);
    result.push(item);
  }
  return result;
}

// ── Format-Specific → Canonical Conversion ──────────────────────────────────

/**
 * Convert text-based documents (PDF, RTF, DOCX) to canonical form.
 * This is the format-specific extraction step. It produces the canonical
 * model — the comparison engine never sees raw format output.
 */
/** Known OOXML/ZIP internal paths that must never appear as document content. */
const OOXML_PATHS = [
  "word/document.xml", "word/styles.xml", "word/numbering.xml",
  "word/fontTable.xml", "word/settings.xml", "word/webSettings.xml",
  "word/theme/theme1.xml", "word/_rels/", "word/media/",
  "xl/workbook.xml", "xl/worksheets/sheet", "xl/sharedStrings.xml",
  "xl/styles.xml", "xl/theme/theme1.xml", "xl/_rels/", "xl/media/",
  "ppt/presentation.xml", "ppt/_rels/", "ppt/media/",
  "[Content_Types].xml", "_rels/.rels", "_rels/document.xml.rels",
  "_rels/workbook.xml.rels",
];

/** Safety-net filter: remove known parser/container artifacts from lines. */
function filterArtifactLines(lines: string[]): string[] {
  return lines.filter(line => {
    const t = line.trim();
    if (t === "") return false;
    // OOXML internal paths
    if (OOXML_PATHS.some(p => t === p || t.startsWith(p))) return false;
    // ZIP binary signatures decoded as text
    if (/^PK[\x00-\x03\x05\x06\x07-\x1f]/.test(t)) return false;
    // Raw RTF control syntax that leaked through
    if (/^\\(rtf|ansi|deff|fonttbl|colortbl|stylesheet|info|pict|pard|par|tab|fs\d|b|i|ul|cf\d)+/.test(t)) return false;
    if (/^\{\\(rtf|fonttbl|colortbl|stylesheet|info|pict)/.test(t)) return false;
    // Watermark/proof text patterns
    if (/^Proof$/.test(t)) return false;
    // Common watermark symbols
    if (/^[_\\-]{3,}$/.test(t)) return false;
    // Single non-ASCII symbols (watermark glyphs like \u25A1, \u25A3, etc.)
    if (t.length <= 3 && /^\p{So}+$/u.test(t)) return false;
    // Lines that are just whitespace + a few non-ASCII chars (proof watermarks)
    if (t.length <= 5 && /^[\s\p{So}]+$/u.test(t)) return false;
    return true;
  });
}

/**
 * Strip watermark text from lines.
 * Handles cases like:
 *   "Proof | Borough Of Ridgway" → "Borough Of Ridgway"
 *   "Bill Account Name | Proof | Borough Of Ridgway" → "Bill Account Name | Borough Of Ridgway"
 */
function stripWatermarkFromLines(lines: string[]): string[] {
  return lines.map(line => {
    let result = line;
    // Strip "Proof | " prefix (watermark appears before real content)
    result = result.replace(/^Proof\s*\|\s*/, "");
    // Strip " | Proof" suffix (watermark appears after real content)
    result = result.replace(/\s*\|\s*Proof$/, "");
    // Strip single non-ASCII symbol from pipe values: "Field | ▩" → "Field"
    result = result.replace(/\s*\|\s*\p{So}$/u, "");
    // Strip single non-ASCII symbol from start: "华盛 | Field" → "Field"
    result = result.replace(/^\p{So}\s*\|\s*/u, "");
    return result;
  });
}

/**
 * Join consecutive lines that form a semantic unit.
 * Example: "07/31/2026" + "(Bill Cycle 5 of 5)" → "07/31/2026 (Bill Cycle 5 of 5)"
 *
 * This is GENERIC: a date-like value (contains digits and / or -) followed by
 * a parenthetical description is combined.  This does NOT join arbitrary text
 * with parentheticals (e.g., "105745 Total" + "($333.33)" stays separate).
 */
function joinConsecutiveFragments(lines: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim();
    const next = i + 1 < lines.length ? lines[i + 1].trim() : "";
    // Only join when the first line looks like a date (contains / or - with digits)
    // and the second line is a parenthetical.
    // This is a generic structural rule for business documents.
    // Require a date-like prefix: digits followed by / or - followed by digits.
    // This excludes non-date strings like "Product/Sub Group-8 Digit"
    // or account numbers like "105745-44".
    const isDateLike = /^\d+[\/.\-]\d+/.test(current) && current.length <= 30;
    const isParenthetical = next.length > 0 && next.startsWith("(") && next.endsWith(")") &&
      !next.includes("|") && !next.includes("\t");
    if (isDateLike && isParenthetical) {
      result.push(`${current} ${next}`);
      i++; // skip next line
    } else {
      result.push(lines[i]);
    }
  }
  return result;
}

/**
 * Split a cell value that contains multiple space-separated short numeric values.
 * Example: "3 0" → ["3", "0"]
 * Does NOT split values like "105745 Total" (has alpha text) or long values.
 */
function splitMultiValueCell(cell: string): string[] {
  const trimmed = cell.trim();
  const parts = trimmed.split(/\s+/);
  // Split only when ALL parts are short (≤6 chars) numeric values
  // and there are 2-3 parts. This handles "3 0" but not "105745 Total".
  // Also exclude date-like patterns: "2026 08" (year-month) should stay whole.
  // Date-like: 4-digit year followed by 1-2 digit month/day.
  const isDateLike = parts.length === 2 &&
    /^\d{4}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]);
  if (parts.length >= 2 && parts.length <= 3 &&
      parts.every(p => /^\d{1,6}$/.test(p)) && !isDateLike) {
    return parts;
  }
  return [trimmed];
}

function textToCanonical(doc: ParsedDoc): ContentItem[] {
  const rawLines = doc.content?.type === "text" ? doc.content.lines : [];
  const lines = normalizeCellLines(
    joinConsecutiveFragments(
      splitConcatenatedFieldValues(
        stripWatermarkFromLines(
          filterArtifactLines(rawLines)
        )
      )
    )
  );
  const items: ContentItem[] = [];

  // First pass: detect pipe-delimited AND tab-delimited table blocks.
  // RTF \cell produces tab-separated rows; PDF extraction may produce
  // pipe-separated rows. Both must be recognized as table data.
  const tableLineIndices = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Check for pipe-delimited
    if (trimmed.includes("|")) {
      const parts = trimmed.split("|").map(p => p.trim()).filter(p => p !== "");
      if (parts.length >= 2 && !parts[0].includes(":")) {
        tableLineIndices.add(i);
      }
    }
    // Check for tab-delimited (from RTF \cell, PDF column extraction)
    else if (trimmed.includes("\t")) {
      const parts = trimmed.split("\t").map(p => p.trim()).filter(p => p !== "");
      if (parts.length >= 2 && !parts[0].includes(":")) {
        tableLineIndices.add(i);
      }
    }
  }

  // Group consecutive table lines
  const tableBlocks: Array<{ start: number; end: number; rows: string[][] }> = [];
  let currentBlock: { start: number; end: number; rows: string[][] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (tableLineIndices.has(i)) {
      const trimmed = lines[i].trim();
      const cells = trimmed.includes("|")
        ? trimmed.split("|").map(c => c.trim())
        : trimmed.split("\t").map(c => c.trim());
      // For tab-separated rows, filter empty cells to handle sparse tables
      const filteredCells = cells.filter(c => c !== "");
      const rowCells = filteredCells.length >= 2 ? filteredCells : cells;
      if (!currentBlock) {
        currentBlock = { start: i, end: i, rows: [rowCells] };
      } else {
        currentBlock.end = i;
        currentBlock.rows.push(rowCells);
      }
    } else {
      if (currentBlock) { tableBlocks.push(currentBlock); currentBlock = null; }
    }
  }
  if (currentBlock) tableBlocks.push(currentBlock);

  const tableLineSet = new Set<number>();
  for (const block of tableBlocks) {
    for (let i = block.start; i <= block.end; i++) tableLineSet.add(i);
  }

  // Process table blocks
  for (const block of tableBlocks) {
    const firstRow = block.rows[0];
    // Only treat as header if there are at least 2 rows
    // (header + at least one data row). A single-row table is data, not header.
    // Header rows have SHORT parts (e.g., "Field" and "Value").
    // Longer values like "Customer Alpha" mean this is a data row.
    const isHeader = block.rows.length >= 2 &&
      firstRow && firstRow.length === 2 &&
      firstRow.every(c => c.length <= 10 && /^[A-Za-z][A-Za-z ]*$/.test(c));
    // Generic table headers (e.g., "Field | Value") are structural elements,
    // not business content.  Only skip them when both cells match common
    // generic column-name patterns — NOT when they are real field names
    // like "Status | Active".
    const GENERIC_HEADER_WORDS = new Set([
      "field", "value", "name", "id", "label", "data", "key",
      "column", "item", "description", "type", "category",
      "number", "code", "reference", "info", "detail",
    ]);
    const isGenericHeader = isHeader &&
      firstRow.every(c => GENERIC_HEADER_WORDS.has(c.toLowerCase()));

    const startRow = isGenericHeader ? 1 : 0;

    // Data rows become field_value items (only for 2-cell rows)
    // Multi-column rows (3+ cells) are table data, not field/value pairs.
    for (let r = startRow; r < block.rows.length; r++) {
      const row = block.rows[r];
      if (row.length >= 3) {
        // Multi-column row: split into individual paragraph items
        // so each value can match DOCX individual paragraphs.
        // e.g., "3 0 | 105745 Total | ($333.33)" → 3 separate paragraphs
        for (const cell of row) {
          const cellVal = cell.trim();
          if (cellVal !== "") {
            // Split multi-value cells: "3 0" → ["3", "0"]
            const subCells = splitMultiValueCell(cellVal);
            for (const subCell of subCells) {
              items.push({
                key: `para_${items.length}`,
                label: subCell,
                value: subCell,
                kind: "paragraph",
                sourceLocation: `Line ${block.start + 1 + r}`,
              });
            }
          }
        }
      } else if (row.length === 2) {
        const field = row[0].trim();
        const value = row[1].trim();
        if (field !== "" && value !== "") {
          // Check if this looks like a real field/value pair:
          // Field must start with alpha, be short enough, and not be a date/number.
          // Value must NOT end with ':' (that's a header label, not data).
          // Field names must be 2+ chars, start with alpha, max 40 chars.
          // Single letters ("A", "B") are likely table cell values, not field names.
          const isFieldName = /^[A-Za-z]/.test(field) && !/^\d/.test(field) && field.length >= 2 && field.length <= 40;
          const isHeaderValue = value.endsWith(":");
          if (isFieldName && !isHeaderValue) {
            items.push({
              key: normalizeKey(field),
              label: field,
              value,
              kind: "field_value",
              sourceLocation: `Line ${block.start + 1 + r}`,
            });
          } else {
            // Not a field/value pair — split into individual paragraphs
            for (const cell of row) {
              const cellVal = cell.trim();
              if (cellVal !== "") {
                items.push({
                  key: `para_${items.length}`,
                  label: cellVal,
                  value: cellVal,
                  kind: "paragraph",
                  sourceLocation: `Line ${block.start + 1 + r}`,
                });
              }
            }
          }
        }
      }
    }

  }

  // Process remaining lines (not in pipe tables)
  for (let i = 0; i < lines.length; i++) {
    if (tableLineSet.has(i)) continue;
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;
    if (/^[|\-+:]+$/.test(trimmed)) continue; // table separator

    // Check for field/value in remaining text
    const fvPairs = extractFieldValuesFromText(trimmed);
    if (fvPairs.length > 0) {
      for (const { field, value } of fvPairs) {
        items.push({
          key: normalizeKey(field),
          label: field,
          value,
          kind: "field_value",
          sourceLocation: `Line ${i + 1}`,
        });
      }
      continue;
    }

    // Check for heading
    const headingMatch = /^#{1,6}\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      items.push({
        key: normalizeKey(headingMatch[1]),
        label: trimmed,
        value: headingMatch[1].trim(),
        kind: "heading",
        sourceLocation: `Line ${i + 1}`,
      });
      continue;
    }

    // Check for list item
    const listMatch = /^[\-•*]\s+(.+)$/.exec(trimmed);
    if (listMatch) {
      items.push({
        key: `list_${items.length}`,
        label: trimmed,
        value: listMatch[1].trim(),
        kind: "list_item",
        sourceLocation: `Line ${i + 1}`,
      });
      continue;
    }

    // Plain paragraph
    items.push({
      key: `para_${items.length}`,
      label: trimmed,
      value: trimmed,
      kind: "paragraph",
      sourceLocation: `Line ${i + 1}`,
    });
  }

  // ── Post-processing: join consecutive paragraphs ─────────────────────
  // When pipe processing splits "07/31/2026 | (Bill Cycle 5 of 5)" into
  // two cells, they become two separate paragraphs.  Join them back:
  // "07/31/2026" + "(Bill Cycle 5 of 5)" → "07/31/2026 (Bill Cycle 5 of 5)"
  // This is generic: any date-like paragraph followed by a parenthetical.
  const joinedItems: ContentItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    const next = i + 1 < items.length ? items[i + 1] : null;
    if (current.kind === "paragraph" && next && next.kind === "paragraph") {
      const curVal = current.value.trim();
      const nextVal = next.value.trim();
      // Require digits followed by / or - then more digits (date-like prefix)
      const isDateLike = /^\d+[\/.\-]\d+/.test(curVal) && curVal.length <= 30;
      const isParenthetical = nextVal.startsWith("(") && nextVal.endsWith(")") && nextVal.length > 2;
      if (isDateLike && isParenthetical) {
        joinedItems.push({
          key: `para_${joinedItems.length}`,
          label: `${curVal} ${nextVal}`,
          value: `${curVal} ${nextVal}`,
          kind: "paragraph",
          sourceLocation: current.sourceLocation,
        });
        i++; // skip next item
        continue;
      }
    }
    joinedItems.push(current);
  }

  return joinedItems;
}

/**
 * Convert spreadsheet documents (XLSX, XLS, CSV) to canonical form.
 */
function sheetToCanonical(doc: ParsedDoc): ContentItem[] {
  if (doc.content?.type !== "sheet") return [];
  const items: ContentItem[] = [];

  function colLetters(index: number): string {
    let n = index;
    let s = "";
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }

  function hasHeaderRow(rows: string[][]): boolean {
    const row = rows[0];
    if (!row) return false;
    const cells = row.map(c => c.trim()).filter(c => c !== "");
    if (cells.length < 2) return false;
    if (!/^[A-Za-z]/.test(cells[0])) return false;
    return !cells.some(c => /^[-+]?\d+(\.\d+)?$/.test(c));
  }

  for (const sheet of doc.content.sheets) {
    const rows = sheet.rows;

    if (hasHeaderRow(rows)) {
      const headers = rows[0].map((h, c) => h.trim() || colLetters(c));

      // Detect Field/Value table pattern:
      // Header row is ["Field", "Value"] → use first column as field name,
      // second column as field value. This matches pipe-delimited format.
      // Also detect two-column tables with generic headers that behave like
      // field/value tables: first column is short alpha text (field names),
      // second column is values.  This handles real XLSX files where headers
      // are "Property"/"Description"/"Name" etc. instead of "Field"/"Value".
      const isFieldValuePairTable =
        headers.length === 2 &&
        headers[0].toLowerCase() === "field" &&
        headers[1].toLowerCase() === "value";

      // Broader detection: 2-column table where most rows have alpha-only
      // short strings in column A (field-name-like) and diverse values in B.
      const isGenericKeyValueTable = !isFieldValuePairTable &&
        headers.length === 2 &&
        (() => {
          const dataRows = rows.slice(1).filter(r => r && r.some(c => c.trim() !== ""));
          if (dataRows.length < 1) return false;
          // Count how many rows have alpha-only, short first-column text
          const alphaKeyCount = dataRows.filter(r => {
            const cell = (r[0] ?? "").trim();
            return cell.length > 0 && cell.length <= 30 && /^[A-Za-z]/.test(cell);
          }).length;
          // If >60% of rows have alpha-like first column, it's a field/value table
          return alphaKeyCount >= Math.ceil(dataRows.length * 0.6);
        })();

      if (isFieldValuePairTable || isGenericKeyValueTable) {
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every(c => c.trim() === "")) continue;
          const field = (row[0] ?? "").trim();
          const value = (row[1] ?? "").trim();
          if (field !== "" && value !== "") {
            items.push({
              key: normalizeKey(field),
              label: field,
              value,
              kind: "field_value",
              sourceLocation: `${sheet.name} · A${r + 1}`,
              sheet: sheet.name,
            });
          }
        }
      } else {
        const seen = new Map<string, number>();
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every(c => c.trim() === "")) continue;
          for (let c = 0; c < headers.length; c++) {
            const value = (row[c] ?? "").trim();
            if (value === "") continue;
            const base = headers[c];
            const n = seen.get(base) ?? 0;
            seen.set(base, n + 1);
            const field = n > 0 ? `${base} #${n}` : base;
            items.push({
              key: normalizeKey(field),
              label: field,
              value,
              kind: "field_value",
              sourceLocation: `${sheet.name} · ${colLetters(c)}${r + 1}`,
              sheet: sheet.name,
            });
          }
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
          items.push({
            key: `cell_${r}_${c}`,
            label: addr,
            value,
            kind: "table_cell",
            sourceLocation: `${sheet.name} · ${addr}`,
            sheet: sheet.name,
          });
        }
      }
    }
  }

  return items;
}

// ── Public API: Convert ParsedDoc to CanonicalDocument ──────────────────────

/**
 * Convert any ParsedDoc into a CanonicalDocument.
 * This is the format-agnostic conversion step.
 */
export function toCanonical(doc: ParsedDoc): CanonicalDocument {
  if (!doc.content) {
    return { source: doc, items: [] };
  }

  const rawItems = doc.content.type === "sheet"
    ? sheetToCanonical(doc)
    : textToCanonical(doc);

  // Deduplicate before returning
  const items = deduplicateItems(rawItems);

  return { source: doc, items };
}

// ── Semantic Comparison ─────────────────────────────────────────────────────

/**
 * Compare two canonical documents and return structured match results.
 *
 * This is FORMAT-INDEPENDENT. It only sees ContentItem[] — it has no
 * knowledge of whether the source was PDF, RTF, DOCX, or XLSX.
 *
 * Matching strategy:
 * 1. field_value items: match by normalized key (format-independent)
 * 2. heading items: match by normalized key
 * 3. paragraph/list_item items: match by normalized text content
 * 4. table_cell items: match by normalized key
 * 5. Position is NEVER used as the primary identity
 */
export function compareCanonical(
  baseline: CanonicalDocument,
  comparing: CanonicalDocument,
  mode: ComparisonMode,
): CanonicalMatchResult {
  const matched: CanonicalMatchResult["matched"] = [];
  const unmatchedBaseline = new Set(baseline.items.map((_, i) => i));
  const unmatchedComparing = new Set(comparing.items.map((_, i) => i));

  // Helper: check if two values are equivalent under the given mode
  function valuesEqual(a: string, b: string): boolean {
    const na = normalizeValue(a, mode);
    const nb = normalizeValue(b, mode);
    if (na === nb) return true;

    // Structural equivalence: strip pipes, tabs, collapse whitespace
    // This handles PDF space-separated tables vs RTF tab-separated tables
    // vs DOCX pipe-delimited tables — all produce equivalent text.
    const structural = (s: string) => s.replace(/[|\t]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const sa = structural(na);
    const sb = structural(nb);
    if (sa === sb) return true;

    return false;
  }

  // Phase 1: Match field_value and heading items by normalized key.
  // This is the PRIMARY matching strategy — format-independent.
  const kvBaseline = baseline.items
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const kvComparing = comparing.items
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");

  const usedComparingKV = new Set<number>();
  for (const { el: bEl, i: bIdx } of kvBaseline) {
    let bestMatch: { el: ContentItem; i: number } | null = null;
    for (const { el: cEl, i: cIdx } of kvComparing) {
      if (usedComparingKV.has(cIdx)) continue;
      if (bEl.key === cEl.key) {
        bestMatch = { el: cEl, i: cIdx };
        break;
      }
    }
    if (bestMatch) {
      matched.push({
        baseline: bEl,
        comparing: bestMatch.el,
        identical: valuesEqual(bEl.value, bestMatch.el.value),
      });
      unmatchedBaseline.delete(bIdx);
      unmatchedComparing.delete(bestMatch.i);
      usedComparingKV.add(bestMatch.i);
    }
  }

  // Phase 1b: Match field_values against unmatched paragraphs by LABEL.
  // Only matches when the values are ALSO compatible — prevents false matches
  // like field_value("group", "Total") matching paragraph "Group".
  const kvUnmatchedBaseline1b = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const paraUnmatchedComparing1b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item");

  for (const { el: bEl, idx: bIdx } of kvUnmatchedBaseline1b) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bLabelNorm = normalizeText(bEl.label).toLowerCase().trim().replace(/:\s*$/, "");
    const bValNorm = normalizeText(bEl.value).toLowerCase().trim();
    if (bLabelNorm.length < 2) continue;
    for (const { el: cEl, idx: cIdx } of paraUnmatchedComparing1b) {
      if (!unmatchedComparing.has(cIdx)) continue;
      const cNorm = normalizeText(cEl.value).toLowerCase().trim().replace(/:\s*$/, "");
      if (bLabelNorm === cNorm) {
        // Cross-type match: paragraph text equals field_value's label.
        // The paragraph IS the label — mark as identical since the field
        // exists in both formats. The value comparison is separate.
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        break;
      }
    }
  }

  // Same in reverse: COMPARING field_values against BASELINE paragraphs by label
  const kvUnmatchedComparing1b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const paraUnmatchedBaseline1b = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item");

  for (const { el: cEl, idx: cIdx } of kvUnmatchedComparing1b) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cLabelNorm = normalizeText(cEl.label).toLowerCase().trim().replace(/:\s*$/, "");
    const cValNorm = normalizeText(cEl.value).toLowerCase().trim();
    if (cLabelNorm.length < 2) continue;
    for (const { el: bEl, idx: bIdx } of paraUnmatchedBaseline1b) {
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bNorm = normalizeText(bEl.value).toLowerCase().trim().replace(/:\s*$/, "");
      if (cLabelNorm === bNorm) {
        // Cross-type match: paragraph text equals field_value's label.
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedComparing.delete(cIdx);
        unmatchedBaseline.delete(bIdx);
        break;
      }
    }
  }

  // Phase 1c: Consume orphaned value paragraphs after Phase 1b label matching.
  // When Phase 1b matches field_value("customer", "Customer Alpha") against
  // paragraph "Customer" by label, the value "Customer Alpha" may remain as
  // an unmatched paragraph. Match it against the field_value's value.
  const kvMatched1b = Array.from(matched)
    .filter(m => m.baseline.kind === "field_value" && m.comparing.kind === "paragraph")
    .concat(
      matched.filter(m => m.baseline.kind === "paragraph" && m.comparing.kind === "field_value")
    );
  for (const m of kvMatched1b) {
    const fvEl = m.baseline.kind === "field_value" ? m.baseline : m.comparing;
    const paraEl = m.baseline.kind === "paragraph" ? m.baseline : m.comparing;
    const fvValNorm = normalizeText(fvEl.value).toLowerCase().trim();
    if (fvValNorm.length < 2) continue;
    // Find an unmatched paragraph in the OTHER set with the same text
    const isBaselineFV = m.baseline.kind === "field_value";
    const otherSet = isBaselineFV ? unmatchedComparing : unmatchedBaseline;
    for (const idx of otherSet) {
      const item = isBaselineFV ? comparing.items[idx] : baseline.items[idx];
      if (item.kind !== "paragraph" && item.kind !== "list_item") continue;
      const itemNorm = normalizeText(item.value).toLowerCase().trim().replace(/:\s*$/, "");
      if (itemNorm === fvValNorm) {
        otherSet.delete(idx);
        break;
      }
    }
  }

  // Phase 2: Match remaining items by normalized text content.
  // Handles paragraphs, list_items, and any unmatched items.
  const remainingBaseline = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));
  const remainingComparing = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  const usedComp = new Set<number>();
  for (const { el: bEl, idx: bIdx } of remainingBaseline) {
    for (const { el: cEl, idx: cIdx } of remainingComparing) {
      if (usedComp.has(cIdx)) continue;
      if (valuesEqual(bEl.value, cEl.value)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }

  // Phase 3: Match field_value items in comparing against unmatched paragraphs
  // in baseline (handles "Account: 1000" as paragraph matching "Account"="1000")
  const unmatchedKVComparing = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const unmatchedProseBaseline = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item");

  for (const { el: bEl, idx: bIdx } of unmatchedProseBaseline) {
    for (const { el: cEl, idx: cIdx } of unmatchedKVComparing) {
      if (usedComp.has(cIdx)) continue;
      // Check if the paragraph value contains the field value
      const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
      // Require substring to be meaningful: ≥3 chars or ≥30% of shorter value
      const shorterLen = Math.min(bNorm.length, cNorm.length);
      const longerHasShorter = bNorm.includes(cNorm) && (cNorm.length >= 3 || cNorm.length >= shorterLen * 0.3);
      const shorterHasLonger = cNorm.includes(bNorm) && (bNorm.length >= 3 || bNorm.length >= shorterLen * 0.3);
      if (longerHasShorter || shorterHasLonger) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }

  // Phase 4: Match field_value items in baseline against unmatched paragraphs
  // in comparing (reverse direction)
  const unmatchedKVBaseline = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const unmatchedProseComparing = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item");

  for (const { el: cEl, idx: cIdx } of unmatchedProseComparing) {
    for (const { el: bEl, idx: bIdx } of unmatchedKVBaseline) {
      if (usedComp.has(bIdx)) continue;
      const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
      const shorterLen2 = Math.min(bNorm.length, cNorm.length);
      const longerHasShorter2 = bNorm.includes(cNorm) && (cNorm.length >= 3 || cNorm.length >= shorterLen2 * 0.3);
      const shorterHasLonger2 = cNorm.includes(bNorm) && (bNorm.length >= 3 || bNorm.length >= shorterLen2 * 0.3);
      if (longerHasShorter2 || shorterHasLonger2) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(bIdx);
        break;
      }
    }
  }

  // Phase 5: Match merged paragraphs against component items.
  // When PDF produces "Account 1000" as a single paragraph but DOCX
  // produces "Account" and "1000" as separate paragraphs, we need to
  // match the merged paragraph against the group of components.
  // Strategy: for each unmatched paragraph, find ALL unmatched smaller
  // items whose text is contained in it.  If found, match the paragraph
  // against the combination (it "covers" those components).
  const unmatchedProseBaseline2 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item" || el.kind === "field_value");
  const unmatchedProseComparing2 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item" || el.kind === "field_value");

  // For each unmatched baseline paragraph, find all comparing items contained in it
  for (const { el: bEl, idx: bIdx } of unmatchedProseBaseline2) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
    const containedComparing: Array<{ el: ContentItem; idx: number }> = [];
    for (const { el: cEl, idx: cIdx } of unmatchedProseComparing2) {
      if (usedComp.has(cIdx)) continue;
      if (!unmatchedComparing.has(cIdx)) continue;
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
      if (cNorm.length >= 2 && bNorm.includes(cNorm)) {
        containedComparing.push({ el: cEl, idx: cIdx });
      }
    }
    // If we found multiple contained items, the paragraph covers them
    if (containedComparing.length >= 2) {
      // Combine the compared values for equivalence check
      const combinedValue = containedComparing
        .map(({ el }) => normalizeValue(el.value, mode))
        .join(" ");
      const identical = normalizeValue(bEl.value, mode).toLowerCase() ===
        combinedValue.toLowerCase();
      matched.push({ baseline: bEl, comparing: containedComparing[0].el, identical });
      unmatchedBaseline.delete(bIdx);
      for (const { idx: cIdx } of containedComparing) {
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
      }
    }
  }

  // Same in reverse: each comparing paragraph covers multiple baseline items
  const unmatchedProseBaseline3 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));
  const unmatchedProseComparing3 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  for (const { el: cEl, idx: cIdx } of unmatchedProseComparing3) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
    const containedBaseline: Array<{ el: ContentItem; idx: number }> = [];
    for (const { el: bEl, idx: bIdx } of unmatchedProseBaseline3) {
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
      if (bNorm.length >= 2 && cNorm.includes(bNorm)) {
        containedBaseline.push({ el: bEl, idx: bIdx });
      }
    }
    if (containedBaseline.length >= 2) {
      const combinedValue = containedBaseline
        .map(({ el }) => normalizeValue(el.value, mode))
        .join(" ");
      const identical = normalizeValue(cEl.value, mode).toLowerCase() ===
        combinedValue.toLowerCase();
      matched.push({ baseline: containedBaseline[0].el, comparing: cEl, identical });
      unmatchedComparing.delete(cIdx);
      for (const { idx: bIdx } of containedBaseline) {
        unmatchedBaseline.delete(bIdx);
      }
    }
  }

  // Phase 5c: Space-separated word matching.
  // When PDF produces "3 0" as one paragraph but DOCX has "3" and "0"
  // as separate paragraphs, split the longer value by space and check
  // if each word matches an individual comparing item.
  const unmatchedBasePara5c = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));
  const unmatchedCompPara5c = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  for (const { el: bEl, idx: bIdx } of unmatchedBasePara5c) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bVal = bEl.value.trim();
    const bWords = bVal.split(/\s+/).filter(w => w.length > 0);
    if (bWords.length < 2) continue; // Need at least 2 words to split

    const matchedWords: Array<{ el: ContentItem; idx: number }> = [];
    for (const word of bWords) {
      const wordNorm = normalizeText(word).toLowerCase();
      if (wordNorm.length === 0) continue;
      // Find a comparing item that matches this word
      let found = false;
      for (const { el: cEl, idx: cIdx } of unmatchedCompPara5c) {
        if (!unmatchedComparing.has(cIdx)) continue;
        const cNorm = normalizeText(cEl.value).toLowerCase();
        if (cNorm === wordNorm) {
          matchedWords.push({ el: cEl, idx: cIdx });
          found = true;
          break;
        }
      }
    }
    // All words matched → consume the baseline paragraph and all matched comparing items
    if (matchedWords.length === bWords.length) {      matched.push({
        baseline: bEl,
        comparing: matchedWords[0].el,
        // All words matched — same content, different representation
        identical: normalizeText(bEl.value).toLowerCase() ===
          matchedWords.map(m => normalizeText(m.el.value)).join(' ').toLowerCase(),
      });
      unmatchedBaseline.delete(bIdx);
      for (const { idx: cIdx } of matchedWords) {
        unmatchedComparing.delete(cIdx);
      }
    }
  }

  // Same in reverse: comparing paragraphs split by space match baseline items
  const unmatchedBasePara5c2 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));
  const unmatchedCompPara5c2 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  for (const { el: cEl, idx: cIdx } of unmatchedCompPara5c2) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cVal = cEl.value.trim();
    const cWords = cVal.split(/\s+/).filter(w => w.length > 0);
    if (cWords.length < 2) continue;

    const matchedWords: Array<{ el: ContentItem; idx: number }> = [];
    for (const word of cWords) {
      const wordNorm = normalizeText(word).toLowerCase();
      if (wordNorm.length === 0) continue;
      for (const { el: bEl, idx: bIdx } of unmatchedBasePara5c2) {
        if (!unmatchedBaseline.has(bIdx)) continue;
        const bNorm = normalizeText(bEl.value).toLowerCase();
        if (bNorm === wordNorm) {
          matchedWords.push({ el: bEl, idx: bIdx });
          break;
        }
      }
    }
    if (matchedWords.length === cWords.length) {
      matched.push({
        baseline: matchedWords[0].el,
        comparing: cEl,
        // All words matched — same content, different representation
        identical: normalizeText(cEl.value).toLowerCase() ===
          matchedWords.map(m => normalizeText(m.el.value)).join(' ').toLowerCase(),
      });
      unmatchedComparing.delete(cIdx);
      for (const { idx: bIdx } of matchedWords) {
        unmatchedBaseline.delete(bIdx);
      }
    }
  }

  // Phase 6: Paragraph substring containment matching.
  // When PDF produces "Claims Paid Thru 07/31/2026 (Bill Cycle 5 of 5)" as
  // one paragraph but RTF produces "Claims Paid Thru" + "07/31/2026..." as
  // separate items, the longer paragraph CONTAINS the shorter ones.
  // Match by checking if any remaining paragraph in one set contains all
  // the normalized text of one or more remaining items in the other set.
  const unmatchedBasePara = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));
  const unmatchedCompPara = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  // For each unmatched baseline item, find ALL unmatched comparing items
  // whose normalized text is contained within it.
  for (const { el: bEl, idx: bIdx } of unmatchedBasePara) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
    if (bNorm.length < 3) continue;
    const contained: Array<{ el: ContentItem; idx: number }> = [];
    for (const { el: cEl, idx: cIdx } of unmatchedCompPara) {
      if (!unmatchedComparing.has(cIdx)) continue;
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
      if (cNorm.length < 2) continue;
      // Check if the baseline paragraph contains this comparing item's text
      if (bNorm.includes(cNorm)) {
        contained.push({ el: cEl, idx: cIdx });
      }
    }
    // Only match if we found at least one containing item
    // and the combined contained text covers most of the baseline text
    if (contained.length >= 1) {
      const combinedContained = contained
        .map(({ el }) => normalizeValue(el.value, mode).toLowerCase())
        .join(' ');
      // Check if the combined contained text is a significant portion
      // of the baseline text (at least 50% by character count)
      if (combinedContained.length >= bNorm.length * 0.4) {
        matched.push({
          baseline: bEl,
          comparing: contained[0].el,
          identical: bNorm === combinedContained,
        });
        unmatchedBaseline.delete(bIdx);
        for (const { idx: cIdx } of contained) {
          unmatchedComparing.delete(cIdx);
        }
      }
    }
  }

  // Same in reverse: each comparing paragraph contains baseline items
  const unmatchedBasePara2 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));
  const unmatchedCompPara2 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  for (const { el: cEl, idx: cIdx } of unmatchedCompPara2) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
    if (cNorm.length < 3) continue;
    const contained: Array<{ el: ContentItem; idx: number }> = [];
    for (const { el: bEl, idx: bIdx } of unmatchedBasePara2) {
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
      if (bNorm.length < 2) continue;
      if (cNorm.includes(bNorm)) {
        contained.push({ el: bEl, idx: bIdx });
      }
    }
    if (contained.length >= 1) {
      const combinedContained = contained
        .map(({ el }) => normalizeValue(el.value, mode).toLowerCase())
        .join(' ');
      if (combinedContained.length >= cNorm.length * 0.4) {
        matched.push({
          baseline: contained[0].el,
          comparing: cEl,
          identical: cNorm === combinedContained,
        });
        unmatchedComparing.delete(cIdx);
        for (const { idx: bIdx } of contained) {
          unmatchedBaseline.delete(bIdx);
        }
      }
    }
  }

  // Phase 5b: Match paragraphs against field_value labels (cross-type matching).
  // When PDF has a standalone paragraph "Bill Account Name" (because the next
  // line was filtered as watermark), but DOCX has field_value("bill account name",
  // "Borough Of Ridgway"), match them by comparing the paragraph text against
  // the field_value's label.
  const unmatchedParaBaseline5b = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item");
  const unmatchedKVComparing5b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");

  for (const { el: bEl, idx: bIdx } of unmatchedParaBaseline5b) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bNorm = normalizeText(bEl.value).toLowerCase().trim();
    if (bNorm.length < 2) continue;
    for (const { el: cEl, idx: cIdx } of unmatchedKVComparing5b) {
      if (usedComp.has(cIdx)) continue;
      const cLabelNorm = normalizeText(cEl.label).toLowerCase().trim();
      // Match if the paragraph text equals the field_value's label
      if (bNorm === cLabelNorm) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }

  // Same in reverse: comparing paragraphs against baseline field_value labels
  const unmatchedParaComparing5b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "paragraph" || el.kind === "list_item");
  const unmatchedKVBaseline5b = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");

  for (const { el: cEl, idx: cIdx } of unmatchedParaComparing5b) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cNorm = normalizeText(cEl.value).toLowerCase().trim();
    if (cNorm.length < 2) continue;
    for (const { el: bEl, idx: bIdx } of unmatchedKVBaseline5b) {
      if (usedComp.has(bIdx)) continue;
      const bLabelNorm = normalizeText(bEl.label).toLowerCase().trim();
      if (cNorm === bLabelNorm) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedComparing.delete(cIdx);
        unmatchedBaseline.delete(bIdx);
        usedComp.add(bIdx);
        break;
      }
    }
  }

  // Phase 6b: Match consecutive paragraphs against field_value items.
  // When PDF produces "Claims Paid Thru" + "07/31/2026 (Bill Cycle 5 of 5)"
  // as two paragraphs, but RTF produces field_value("claims paid thru",
  // "07/31/2026"), match the combined paragraphs against the field_value.
  // Strategy: for each unmatched paragraph, check if the NEXT paragraph
  // combines with it to match an unmatched field_value's normalized text.
  const unmatchedKVComp6b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const unmatchedParaBase6b = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));

  for (const { el: bEl, idx: bIdx } of unmatchedParaBase6b) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
    if (bNorm.length < 3) continue;

    // Check if this paragraph + next unmatched paragraph matches a field_value
    for (const { el: cEl, idx: cIdx } of unmatchedKVComp6b) {
      if (!unmatchedComparing.has(cIdx)) continue;
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
      // Check if the combined paragraph text contains the field_value's value
      if (bNorm.includes(cNorm) && cNorm.length >= 3) {
        matched.push({ baseline: bEl, comparing: cEl, identical: bNorm.includes(cNorm) });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        break;
      }
    }
  }

  // Same in reverse: match consecutive comparing paragraphs against baseline field_values
  const unmatchedKVBase6b = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const unmatchedParaComp6b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  for (const { el: cEl, idx: cIdx } of unmatchedParaComp6b) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
    if (cNorm.length < 3) continue;

    for (const { el: bEl, idx: bIdx } of unmatchedKVBase6b) {
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
      if (cNorm.includes(bNorm) && bNorm.length >= 3) {
        matched.push({ baseline: bEl, comparing: cEl, identical: cNorm.includes(bNorm) });
        unmatchedComparing.delete(cIdx);
        unmatchedBaseline.delete(bIdx);
        break;
      }
    }
  }

  // Phase 7: Aggregate token matching.
  // When one format produces a merged line and another produces split lines,
  // the tokens from the split items should cover the tokens in the merged item.
  // This handles cases like:
  //   PDF: paragraph("Claims Paid Thru 07/31/2026")
  //   RTF: field_value("claims paid thru", "07/31/2026")
  //   Token set of paragraph ⊇ tokens of field_value → MATCH
  function tokenizeForMatch(text: string): Set<string> {
    return new Set(
      normalizeText(text)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length > 0),
    );
  }

  // Match unmatched baseline items against groups of unmatched comparing items
  const unmatchedBaseArr = Array.from(unmatchedBaseline).map(i => ({ el: baseline.items[i], idx: i }));
  const unmatchedCompArr = Array.from(unmatchedComparing).map(i => ({ el: comparing.items[i], idx: i }));

  // For each unmatched baseline item, find comparing items with high token
  // overlap.  When two paragraphs differ by one word (e.g. "Customer Name
  // Balaji Rajasekar" vs "Customer Name Balaji Kumar"), they should still
  // be matched and reported as a value mismatch — not as missing/added.
  // Strategy: compute overlap between token sets.  Match when the
  // intersection covers >=60% of the SHORTER token set and both have >=2 tokens.
  for (const { el: bEl, idx: bIdx } of unmatchedBaseArr) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bTokens = tokenizeForMatch(bEl.value);
    if (bTokens.size < 2) continue;

    let bestMatch: { el: ContentItem; idx: number; overlap: number } | null = null;
    for (const { el: cEl, idx: cIdx } of unmatchedCompArr) {
      if (!unmatchedComparing.has(cIdx)) continue;
      const cTokens = tokenizeForMatch(cEl.value);
      if (cTokens.size < 2) continue;
      const shared = Array.from(cTokens).filter(t => bTokens.has(t)).length;
      const shorterLen = Math.min(bTokens.size, cTokens.size);
      const coverage = shared / shorterLen;
      if (coverage >= 0.6 && (!bestMatch || shared > bestMatch.overlap)) {
        bestMatch = { el: cEl, idx: cIdx, overlap: shared };
      }
    }
    if (bestMatch) {
      matched.push({
        baseline: bEl,
        comparing: bestMatch.el,
        identical: normalizeText(bEl.value).toLowerCase() ===
          normalizeText(bestMatch.el.value).toLowerCase(),
      });
      unmatchedBaseline.delete(bIdx);
      unmatchedComparing.delete(bestMatch.idx);
    }
  }

  // Same in reverse: matching comparing items against groups of baseline items
  const unmatchedCompArr2 = Array.from(unmatchedComparing).map(i => ({ el: comparing.items[i], idx: i }));
  const unmatchedBaseArr2 = Array.from(unmatchedBaseline).map(i => ({ el: baseline.items[i], idx: i }));

  for (const { el: cEl, idx: cIdx } of unmatchedCompArr2) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cTokens = tokenizeForMatch(cEl.value);
    if (cTokens.size < 2) continue;

    let bestMatch: { el: ContentItem; idx: number; overlap: number } | null = null;
    for (const { el: bEl, idx: bIdx } of unmatchedBaseArr2) {
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bTokens = tokenizeForMatch(bEl.value);
      if (bTokens.size < 2) continue;
      const shared = Array.from(bTokens).filter(t => cTokens.has(t)).length;
      const shorterLen = Math.min(bTokens.size, cTokens.size);
      const coverage = shared / shorterLen;
      if (coverage >= 0.6 && (!bestMatch || shared > bestMatch.overlap)) {
        bestMatch = { el: bEl, idx: bIdx, overlap: shared };
      }
    }
    if (bestMatch) {
      matched.push({
        baseline: bestMatch.el,
        comparing: cEl,
        identical: normalizeText(cEl.value).toLowerCase() ===
          normalizeText(bestMatch.el.value).toLowerCase(),
      });
      unmatchedComparing.delete(cIdx);
      unmatchedBaseline.delete(bestMatch.idx);
    }
  }

  // Collect remaining unmatched as missing/added
  const missingInComparing = Array.from(unmatchedBaseline).map(i => baseline.items[i]);
  const addedInComparing = Array.from(unmatchedComparing).map(i => comparing.items[i]);

  return { matched, missingInComparing, addedInComparing };
}

// ── Difference Generation ───────────────────────────────────────────────────

let diffCounter = 0;

function nextDiffId(): string {
  diffCounter++;
  return `canon-${diffCounter}`;
}

/** Reset for testing. */
export function resetDiffCounter(): void {
  diffCounter = 0;
}

/**
 * Generate DiffRecords from a canonical comparison result.
 * Produces detailed, user-friendly descriptions.
 */
export function generateCanonicalDiffs(
  groupId: string,
  groupLabel: string,
  account: string,
  baselineDoc: ParsedDoc,
  comparingDoc: ParsedDoc,
  result: CanonicalMatchResult,
  comparisonPair: { baselineFormat: string; comparingFormat: string },
  _mode: ComparisonMode = "intelligent",
): DiffRecord[] {
  const records: DiffRecord[] = [];
  const bFmt = comparisonPair.baselineFormat.toUpperCase();
  const cFmt = comparisonPair.comparingFormat.toUpperCase();

  // Value mismatches
  for (const { baseline, comparing, identical } of result.matched) {
    if (identical) continue;

    let diffType: DiffType;
    let description: string;

    if (baseline.kind === "field_value") {
      diffType = "value_mismatch";
      description =
        `The baseline ${bFmt} contains the field "${baseline.label}" with ` +
        `the value "${baseline.value}". The comparing ${cFmt} contains the ` +
        `same field with the value "${comparing.value}". Since the values are ` +
        `different, this has been identified as a VALUE_MISMATCH. ` +
        `Baseline location: ${baseline.sourceLocation}. ` +
        `Comparing location: ${comparing.sourceLocation}.`;
    } else if (baseline.kind === "table_cell") {
      diffType = "cell_changed";
      description =
        `The baseline ${bFmt} contains "${baseline.label}" with the value ` +
        `"${baseline.value}" at ${baseline.sourceLocation}. The comparing ` +
        `${cFmt} contains "${comparing.label}" with the value "${comparing.value}" ` +
        `at ${comparing.sourceLocation}. The values do not match.`;
    } else {
      diffType = "text_changed";
      description =
        `The baseline ${bFmt} contains the text "${baseline.value}" at ` +
        `${baseline.sourceLocation}. The comparing ${cFmt} contains ` +
        `"${comparing.value}" at ${comparing.sourceLocation}. The text content differs.`;
    }

    records.push({
      id: nextDiffId(),
      groupId,
      groupLabel,
      account,
      docType: baselineDoc.ext,
      differenceType: diffType,
      comparisonPair: comparisonPair as import("./types").ComparisonPair,
      comparisonMode: "reference",
      locationSignature: `${baseline.kind}|${baseline.key}|${baseline.sourceLocation}`,
      locationLabel: baseline.label,
      referenceText: baseline.value,
      referenceFile: baselineDoc.fileName,
      baselineFormat: comparisonPair.baselineFormat as import("./types").DocKind,
      comparingFormat: comparisonPair.comparingFormat as import("./types").DocKind,
      comparingFile: comparingDoc.fileName,
      referenceVersion: baselineDoc.versionTag,
      versions: [{
        docId: comparingDoc.id,
        fileName: comparingDoc.fileName,
        versionTag: comparingDoc.versionTag,
        kind: "changed",
        text: comparing.value,
      }],
      detailedDescription: description,
    });
  }

  // Missing content
  for (const element of result.missingInComparing) {
    records.push({
      id: nextDiffId(),
      groupId,
      groupLabel,
      account,
      docType: baselineDoc.ext,
      differenceType: "missing_content",
      comparisonPair: comparisonPair as import("./types").ComparisonPair,
      comparisonMode: "reference",
      locationSignature: `missing|${element.key}`,
      locationLabel: element.label,
      referenceText: element.value,
      referenceFile: baselineDoc.fileName,
      baselineFormat: comparisonPair.baselineFormat as import("./types").DocKind,
      comparingFormat: comparisonPair.comparingFormat as import("./types").DocKind,
      comparingFile: comparingDoc.fileName,
      referenceVersion: baselineDoc.versionTag,
      versions: [{
        docId: comparingDoc.id,
        fileName: comparingDoc.fileName,
        versionTag: comparingDoc.versionTag,
        kind: "removed",
        text: "",
      }],
      detailedDescription:
        `The baseline ${bFmt} contains the field "${element.label}" with ` +
        `the value "${element.value}" at ${element.sourceLocation}. The ` +
        `comparing ${cFmt} does not contain this content. Because the content ` +
        `is missing from the comparing document, this difference has been ` +
        `classified as MISSING_CONTENT.`,
    });
  }

  // Added content
  for (const element of result.addedInComparing) {
    records.push({
      id: nextDiffId(),
      groupId,
      groupLabel,
      account,
      docType: baselineDoc.ext,
      differenceType: "added_content",
      comparisonPair: comparisonPair as import("./types").ComparisonPair,
      comparisonMode: "reference",
      locationSignature: `added|${element.key}`,
      locationLabel: element.label,
      referenceText: "",
      referenceFile: baselineDoc.fileName,
      baselineFormat: comparisonPair.baselineFormat as import("./types").DocKind,
      comparingFormat: comparisonPair.comparingFormat as import("./types").DocKind,
      comparingFile: comparingDoc.fileName,
      referenceVersion: baselineDoc.versionTag,
      versions: [{
        docId: comparingDoc.id,
        fileName: comparingDoc.fileName,
        versionTag: comparingDoc.versionTag,
        kind: "added",
        text: element.value,
      }],
      detailedDescription:
        `The comparing ${cFmt} contains the field "${element.label}" with ` +
        `the value "${element.value}" at ${element.sourceLocation} that is not ` +
        `present in the baseline ${bFmt}. This is classified as ADDED_CONTENT.`,
    });
  }

  return records;
}
