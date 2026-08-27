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
 * Insert spaces between concatenated lowercase words.
 * Handles PDF extraction artifacts where spaces are dropped between words.
 * Uses common word-boundary detection: short word endings followed by
 * known word beginnings.
 */
function recoverJoinedWords(text: string): string {
  // Common words that PDF extraction may concatenate with the preceding word.
  // Process longer words first to avoid partial matches (e.g., "number" before "of").
  // Only split when the preceding text is 4+ letters AND does NOT end with a
  // common word suffix (to avoid splitting real words like "description").
  const knownWords = [
    "billed", "number", "current", "installment",
    "balance", "deposit", "advance", "account",
    "unpaid", "total", "due",
    "of", "to", "in", "the", "by",
  ];

  let result = text;

  for (const word of knownWords) {
    // Match: 4+ letters + this word, followed by space, end-of-string
    // Requires 4+ preceding letters to avoid false positives like "proof" → "pro of"
    const regex = new RegExp(
      `([a-z]{4,})(${word})(?=\s|$)`,
      "gi",
    );
    result = result.replace(regex, "$1 $2");
  }

  return result.replace(/\s{2,}/g, " ").trim();
}

/**
 * Normalize a field/key name for matching.
 * Lowercases, strips punctuation, collapses whitespace,
 * and recovers missing spaces from concatenated words.
 */
export function normalizeKey(field: string): string {
  let result = field
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // Try to recover spaces between concatenated words
  const recovered = recoverJoinedWords(result);
  // Use the recovered version if it actually changed something
  if (recovered !== result) {
    result = recovered.replace(/\s{2,}/g, " ").trim();
  }

  return result;
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

  // Pattern 1: Pipe-delimited — "Field | Value" or "Field | Value | Extra"
  // But ONLY if the first part doesn't contain a colon (which would mean
  // it's a sentence like "Account: 1000 | Synthetic data" with pipes as
  // visual separators, not a table row).
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map(p => p.trim()).filter(p => p !== "");
    if (parts.length >= 2) {
      // If first part has a colon, this is a sentence with pipe separators.
      // Fall through to colon/other extraction patterns below.
      if (!parts[0].includes(":")) {
        // Check if this is a header row (all alpha-only, short)
        // Header rows have SHORT parts (e.g., "Field | Value").
        // Longer values like "Customer Alpha" mean this is a data row.
        const isHeader = parts.length === 2 &&
          parts.every(p =>
            p.length <= 10 && /^[A-Za-z][A-Za-z ]*$/.test(p)
          );
        // Multi-column table header: 3+ parts, all short alpha/numeric text.
        // e.g. "Group | Total | Total Numberof Installment | Billed to Date | ..."
        const isMultiColTable = parts.length > 2 &&
          parts.every(p =>
            p.length <= 35 && /^[A-Za-z][A-Za-z0-9 /-]*$/.test(p)
          );
        if (!isHeader && !isMultiColTable) {
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

  // Pattern 3b: Tab-separated table data — "Field\tValue"
  // RTF \cell extraction produces tab-separated key-value rows.
  const tabMatch = /^([A-Za-z][A-Za-z _/().\-&'*]{0,30}?)\t(.+)$/.exec(trimmed);
  if (tabMatch) {
    const field = tabMatch[1].trim();
    const value = tabMatch[2].trim();
    if (field.length > 0 && field.length <= 30 && /^[A-Za-z]/.test(field)) {
      // Skip table headers: both parts short and alpha-only
      const isHeader = field.length <= 8 && value.length <= 8 &&
        /^[A-Za-z][A-Za-z ]*$/.test(field) && /^[A-Za-z][A-Za-z ]*$/.test(value);
      // Label-label pair: both parts are pure alpha text with spaces
      // (e.g., "Client Number\tClient Name" — two adjacent labels, not a field_value)
      const isLabelLabel = /^[A-Za-z][A-Za-z ]+$/.test(field) &&
        /^[A-Za-z][A-Za-z ]+$/.test(value) &&
        !/[0-9]/.test(value) && !/[0-9]/.test(field);
      if (!isHeader && !isLabelLabel) {
        pairs.push({ field, value });
      }
    }
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
      // Label-label pair: both parts are alpha-only text that look like
      // field labels (e.g., "Client Number    Client Name").
      // A real value should contain digits, dates, currency, or be
      // materially different from a label.
      const isLabelLabel = /^[A-Za-z][A-Za-z ]+$/.test(field) &&
        /^[A-Za-z][A-Za-z ]+$/.test(value) &&
        !/[0-9]/.test(value) &&
        value.length <= 40 && field.length <= 30;
      if (!isHeader && !isLabelLabel) {
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
          // Stop if value is a pure alpha key — likely a section header, not data.
          // e.g. "Due Date" → "ADVANCE DEPOSIT" should not be a data row.
          if (isAlphaKey(v)) { naturalEnd = false; break; }
          rowCount++;
          rowIdx += 2;
        }

        // Accept as table if:
        // - We found >= 1 valid data rows (all with non-alpha values), AND
        // - We reached end of input naturally OR found >= 2 data rows
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
      const isStructuredData = /\S\s{2,}\S/.test(nextTrimmed) || nextTrimmed.includes("|") || nextTrimmed.includes("	");
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
          if (/\S\s{2,}\S/.test(v) || v.includes("|") || v.includes("	")) { fbEnd = false; break; }
          fallbackCount++;
          fbIdx += 2;
        }

        // Accept if:
        // 1. Multiple pairs found (table pattern), OR
        // 2. Single pair but key is short alpha and value is non-alpha
        //    (handles standalone fields like "Claims Paid Thru" → "07/31/2026...")
        // SAFETY: If the loop ended naturally (fbEnd=true) and the LAST pair's
        // value is a pure alpha key (e.g. "ADVANCE DEPOSIT"), it's likely a
        // section header that got swept in, not actual data.  Trim it.
        if (fbEnd && fallbackCount >= 1) {
          const lastK = inputLines[fbIdx - 2]?.trim();
          const lastV = inputLines[fbIdx - 1]?.trim();
          if (lastV && isAlphaKey(lastV) && isAlphaKey(lastK)) {
            fbIdx -= 2;
            fallbackCount--;
          }
        }
        // Accept standalone pairs when we found exactly 1 pair (fallbackCount=1)
        // and the scan stopped because the next value looked like a key.
        // This handles cases like:
        //   "Client Number" → "016543"
        //   "Client Name" → "Borough Of Ridgway"  (stops here: alpha key)
        const isStandalonePair = (fallbackCount === 0 || fallbackCount === 1) && fbIdx <= i + 2;
        if (fallbackCount >= 1 && (fbEnd || fallbackCount >= 2)) {
          // Emit without header — first pair is data
          // Save the trimmed end position so emit loop stops at the right place
          const emitEnd = fbIdx;
          result.push(`${trimmed} | ${nextTrimmed}`);
          fbIdx = i + 2;
          while (fbIdx + 1 < emitEnd) {
            const k = inputLines[fbIdx].trim();
            const v = inputLines[fbIdx + 1].trim();
            if (k === "" || v === "") break;
            if (!isKeyLike(k)) break;
            // Skip pairs where value is ALL CAPS alpha — likely section headers
            // e.g. "ADVANCE DEPOSIT", "OTHER FEES" but not "Balaji Rajasekar"
            const isAllCapsValue = /^[A-Z][A-Z ]+$/.test(v) && !/[a-z]/.test(v);
            if (isAllCapsValue) { break; }
            if (/\S\s{2,}\S/.test(v) || v.includes("|") || v.includes("	")) break;
            result.push(`${k} | ${v}`);
            fbIdx += 2;
          }
          i = fbIdx;
          continue;
        } else if (isStandalonePair && trimmed.length <= 20 && nextTrimmed.length <= 40 && !/  /.test(nextTrimmed) && !/\t/.test(nextTrimmed) && !isAlphaKey(nextTrimmed)) {
          // Single standalone pair: short key + short non-alpha value
          // Exclude pure-alpha values (likely section headers, not real values)
          // e.g. "Due Date" should NOT pair with "ADVANCE DEPOSIT"
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
    return true;
  });
}

function textToCanonical(doc: ParsedDoc): ContentItem[] {
  const rawLines = doc.content?.type === "text" ? doc.content.lines : [];
  const filtered = filterArtifactLines(rawLines);
  const lines = normalizeCellLines(filtered);

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
    const is2ColHeader = block.rows.length >= 2 &&
      firstRow && firstRow.length === 2 &&
      firstRow.every(c => c.length <= 10 && /^[A-Za-z][A-Za-z ]*$/.test(c));
    // Multi-column table header: 3+ columns, all short alpha/numeric text.
    // e.g., "Group | Total | Total Number of Installment | Billed to Date | ..."
    const isMultiColHeader = block.rows.length >= 2 &&
      firstRow && firstRow.length > 2 &&
      firstRow.every(c => c.length <= 35 && /^[A-Za-z][A-Za-z0-9 /-]*$/.test(c));
    const isHeader = is2ColHeader || isMultiColHeader;
    const startRow = isHeader ? 1 : 0;

    // Header becomes a paragraph (not data), but skip generic table headers
    // like "Field | Value" which are structural metadata, not content.
    if (isHeader) {
      const headerText = firstRow.join(" ").toLowerCase();
      const isGenericHeader = /^(field|column|name|label|header|key)( (field|column|name|label|header|key|value|data))?$/i.test(headerText);
      if (!isGenericHeader) {
        items.push({
          key: normalizeKey(firstRow.join(" ")),
          label: firstRow.join(" | "),
          value: firstRow.join(" | "),
          kind: "paragraph",
          sourceLocation: `Line ${block.start + 1}`,
        });
      }
    }

    // Data rows: for multi-column tables (3+ columns), convert each row
    // to a paragraph with all cell values. For 2-column tables, keep as
    // field_value pairs.
    for (let r = startRow; r < block.rows.length; r++) {
      const row = block.rows[r];
      if (row.length >= 2) {
        const field = row[0].trim();
        const value = row[1].trim();
        if (field !== "" && value !== "") {
          if (isMultiColHeader || row.length > 2) {
            // Multi-column row: emit as paragraph with all non-empty cells
            const allCells = row.filter(c => c.trim() !== "").join(", ");
            items.push({
              key: normalizeKey(field),
              label: field,
              value: allCells,
              kind: "paragraph",
              sourceLocation: `Line ${block.start + 1 + r}`,
            });
          } else {
            items.push({
              key: normalizeKey(field),
              label: field,
              value,
              kind: "field_value",
              sourceLocation: `Line ${block.start + 1 + r}`,
            });
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

  return items;
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

  // Filter extraction artifacts: phantom items that PDF extraction creates
  // but don't represent real document content (e.g., page markers, internal IDs).
  const filtered = rawItems.filter(item => {
    // Remove field_value items where key looks like a page reference (e.g., "pg1")
    // and value looks like an internal identifier (e.g., "KEY_1")
    if (item.kind === "field_value") {
      const keyLower = item.key.toLowerCase();
      const valLower = normalizeText(item.value).toLowerCase();
      // Page reference artifacts: key starts with "pg" followed by digits
      if (/^pg\s*\d+$/.test(keyLower) && /^(key|id|ref|item)[-_]?\w+$/i.test(item.value.trim())) return false;
      // Internal reference artifacts: very short key + value is a code-like identifier
      if (keyLower.length <= 3 && /^[a-z]\d+$/i.test(keyLower) && /^(key|id|ref|item|pg)[- _]?\w+$/i.test(item.value.trim())) return false;
    }
    return true;
  });

  // Deduplicate before returning
  const items = deduplicateItems(filtered);

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

    // Word-joining equivalence: recover missing spaces and compare
    // Handles PDF artifacts like "Current InstallmentDue" vs "Current Installment Due"
    const ra = recoverJoinedWords(sa);
    const rb = recoverJoinedWords(sb);
    if (ra === rb) return true;

    // Also compare after removing all spaces (handles spacing-only differences)
    const stripSpaces = (s: string) => s.replace(/\s+/g, "");
    if (stripSpaces(ra) === stripSpaces(rb)) return true;

    return false;
  }

  // Helper: fuzzy key matching — check if two keys represent the same field
  // even when word-joining differences exist.
  function keysFuzzyMatch(a: string, b: string): boolean {
    if (a === b) return true;
    // Tokenize both keys and check if they have the same word set
    const tokensA = a.split(/[^a-z0-9]+/).filter(t => t.length > 0);
    const tokensB = b.split(/[^a-z0-9]+/).filter(t => t.length > 0);
    if (tokensA.length === 0 || tokensB.length === 0) return false;
    // Same number of tokens and same tokens (order-independent)
    if (tokensA.length === tokensB.length) {
      const sortedA = [...tokensA].sort().join(" ");
      const sortedB = [...tokensB].sort().join(" ");
      if (sortedA === sortedB) return true;
    }
    // One is a prefix/subset of the other (handles extra tokens from extraction)
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const intersection = [...setA].filter(t => setB.has(t));
    const smaller = Math.min(setA.size, setB.size);
    if (smaller > 0 && intersection.length >= smaller * 0.7) return true;
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

  // Phase 1b: REMOVED — fuzzy key matching at 70% threshold created false
  // VALUE_MISMATCHES by matching keys like "advance deposit" to "advance deposit
  // total" when the values were completely different. Cross-format content dedup
  // (Phase 8) handles this correctly instead.

  // Phase 2: Match remaining items by normalized text content.
  // Handles paragraphs, list_items, and any unmatched items.
  const remainingBaseline = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));
  const remainingComparing = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }));

  const usedComp = new Set<number>();
  for (const { el: bEl, idx: bIdx } of remainingBaseline) {
    // Skip field_value items — let Phase 3/4 handle them with key-aware matching.
    // Without this guard, a field_value's VALUE would match a paragraph that
    // happens to contain the same text, consuming both and preventing the
    // correct key-based match in Phase 3.
    if (bEl.kind === "field_value" || bEl.kind === "heading") continue;
    for (const { el: cEl, idx: cIdx } of remainingComparing) {
      if (usedComp.has(cIdx)) continue;
      // Also skip comparing field_value items — they should be matched by Phase 3/4
      if (cEl.kind === "field_value" || cEl.kind === "heading") continue;
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
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
    let matchedThis = false;
    for (const { el: cEl, idx: cIdx } of unmatchedKVComparing) {
      if (usedComp.has(cIdx)) continue;
      if (!unmatchedComparing.has(cIdx)) continue;
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();

      // Strategy 1: Containment — paragraph text contains the field value or vice versa
      if (bNorm.includes(cNorm) || cNorm.includes(bNorm)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        matchedThis = true;
        break;
      }

      // Strategy 2: Key match — paragraph text matches the field_value's KEY.
      // This handles split field_values where PDF extracts "Claims Paid Thru"
      // as a paragraph while DOCX extracts it as field_value("claims paid thru",
      // "07/31/2026"). The paragraph IS the field label.
      const fieldKeyTokens = normalizeKey(cEl.label).split(/[^a-z0-9]+/).filter(t => t.length > 0);
      const paraTokens = bNorm.split(/[^a-z0-9]+/).filter(t => t.length > 0);
      const isKeyMatch = fieldKeyTokens.length > 0 && paraTokens.length > 0 &&
        fieldKeyTokens.every(t => paraTokens.includes(t));
      if (isKeyMatch && paraTokens.length <= fieldKeyTokens.length + 2) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        matchedThis = true;
        // Also consume the NEXT paragraph if it matches the field_value's value.
        // This handles split values like "Claims Paid Thru" + "07/31/2026..."
        const cValNorm = normalizeValue(cEl.value, mode).toLowerCase();
        if (cValNorm.length >= 3 && bIdx + 1 < baseline.items.length) {
          const nextIdx = bIdx + 1;
          if (unmatchedBaseline.has(nextIdx)) {
            const nextEl = baseline.items[nextIdx];
            const nextNorm = normalizeValue(nextEl.value, mode).toLowerCase();
            if (valuesEqual(nextNorm, cValNorm) || cValNorm.includes(nextNorm) || nextNorm.includes(cValNorm)) {
              matched.push({ baseline: nextEl, comparing: cEl, identical: true });
              unmatchedBaseline.delete(nextIdx);
            }
          }
        }
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
    if (!unmatchedComparing.has(cIdx)) continue;
    const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
    for (const { el: bEl, idx: bIdx } of unmatchedKVBaseline) {
      if (usedComp.has(bIdx)) continue;
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bNorm = normalizeValue(bEl.value, mode).toLowerCase();

      // Strategy 1: Containment
      if (bNorm.includes(cNorm) || cNorm.includes(bNorm)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(bIdx);
        break;
      }

      // Strategy 2: Key match — paragraph matches the field_value's KEY
      const fieldKeyTokens = normalizeKey(bEl.label).split(/[^a-z0-9]+/).filter(t => t.length > 0);
      const paraTokens = cNorm.split(/[^a-z0-9]+/).filter(t => t.length > 0);
      const isKeyMatch = fieldKeyTokens.length > 0 && paraTokens.length > 0 &&
        fieldKeyTokens.every(t => paraTokens.includes(t));
      if (isKeyMatch && paraTokens.length <= fieldKeyTokens.length + 2) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedComparing.delete(cIdx);
        unmatchedBaseline.delete(bIdx);
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

  // Phase 6b: Match consecutive paragraphs against field_value items.
  // When PDF produces "Claims Paid Thru" + "07/31/2026 (Bill Cycle 5 of 5)"
  // as two paragraphs, but RTF produces field_value("claims paid thru",
  // "07/31/2026"), match the COMBINED paragraphs against the field_value.
  // Strategy: for each unmatched paragraph, combine it with adjacent
  // paragraphs and check if the combined text matches a field_value.
  const unmatchedKVComp6b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const unmatchedParaBase6b = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }));

  for (const { el: bEl, idx: bIdx } of unmatchedParaBase6b) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
    if (bNorm.length < 3) continue;

    // Try matching single paragraph against field_value's value
    for (const { el: cEl, idx: cIdx } of unmatchedKVComp6b) {
      if (!unmatchedComparing.has(cIdx)) continue;
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
      if (bNorm.includes(cNorm) && cNorm.length >= 3) {
        matched.push({ baseline: bEl, comparing: cEl, identical: bNorm.includes(cNorm) });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        break;
      }
    }

    // Also try: combine this paragraph with the NEXT unmatched paragraph
    // and check if the combined text matches a field_value.
    // This handles PDF splitting "Claims Paid Thru" + "07/31/2026..."
    if (unmatchedBaseline.has(bIdx)) {
      const nextIdx = bIdx + 1;
      if (nextIdx < baseline.items.length && unmatchedBaseline.has(nextIdx)) {
        const nextEl = baseline.items[nextIdx];
        const nextNorm = normalizeValue(nextEl.value, mode).toLowerCase();
        const combinedNorm = `${bNorm} ${nextNorm}`;
        for (const { el: cEl, idx: cIdx } of unmatchedKVComp6b) {
          if (!unmatchedComparing.has(cIdx)) continue;
          const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
          // Check if combined text contains the field_value's key+value
          const keyTokens = normalizeKey(cEl.label).split(/[^a-z0-9]+/).filter(t => t.length > 0);
          const keyInCombined = keyTokens.some(t => combinedNorm.includes(t));
          if (keyInCombined && (combinedNorm.includes(cNorm) || cNorm.includes(bNorm) || cNorm.includes(nextNorm))) {
            matched.push({ baseline: bEl, comparing: cEl, identical: false });
            unmatchedBaseline.delete(bIdx);
            unmatchedBaseline.delete(nextIdx);
            unmatchedComparing.delete(cIdx);
            break;
          }
        }
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

  // For each unmatched baseline item, find ALL unmatched comparing items
  // whose tokens significantly overlap with the baseline tokens.
  // Uses bidirectional overlap: at least 50% of the smaller token set
  // must appear in the larger, and the union must cover ≥50% of baseline.
  for (const { el: bEl, idx: bIdx } of unmatchedBaseArr) {
    if (!unmatchedBaseline.has(bIdx)) continue;
    const bTokens = tokenizeForMatch(bEl.value);
    if (bTokens.size < 2) continue; // Need at least 2 tokens to compare

    const matchingComp: Array<{ el: ContentItem; idx: number }> = [];
    const compTokenUnion = new Set<string>();
    for (const { el: cEl, idx: cIdx } of unmatchedCompArr) {
      if (!unmatchedComparing.has(cIdx)) continue;
      const cTokens = tokenizeForMatch(cEl.value);
      if (cTokens.size === 0) continue;
      // Check token overlap: at least 50% of the smaller set's tokens
      // must appear in the larger set.  This allows genuine value changes
      // (e.g., "rajasekar" → "kumar") to still match.
      const intersection = Array.from(cTokens).filter(t => bTokens.has(t)).length;
      const smaller = Math.min(bTokens.size, cTokens.size);
      const overlapRatio = smaller > 0 ? intersection / smaller : 0;
      if (overlapRatio >= 0.5) {
        // SAFETY: When matching a field_value against a paragraph/list_item,
        // require that the paragraph contains at least one token from the
        // field_value's VALUE (not just its key).  Otherwise a bare label
        // like "Due Date" would match field_value("due date", "08/15/2026")
        // purely on key tokens, hiding genuine missing content.
        if (bEl.kind === "field_value" && (cEl.kind === "paragraph" || cEl.kind === "list_item")) {
          const valueTokens = tokenizeForMatch(bEl.value);
          const keyTokens = new Set(normalizeKey(bEl.label).split(/[^a-z0-9]+/).filter(t => t.length > 0));
          const valueOnlyTokens = Array.from(valueTokens).filter(t => !keyTokens.has(t));
          if (valueOnlyTokens.length > 0) {
            const hasValueOverlap = valueOnlyTokens.some(t => cTokens.has(t));
            if (!hasValueOverlap) continue;
          }
        } else if (cEl.kind === "field_value" && (bEl.kind === "paragraph" || bEl.kind === "list_item")) {
          const valueTokens = tokenizeForMatch(cEl.value);
          const keyTokens = new Set(normalizeKey(cEl.label).split(/[^a-z0-9]+/).filter(t => t.length > 0));
          const valueOnlyTokens = Array.from(valueTokens).filter(t => !keyTokens.has(t));
          if (valueOnlyTokens.length > 0) {
            const hasValueOverlap = valueOnlyTokens.some(t => bTokens.has(t));
            if (!hasValueOverlap) continue;
          }
        }
        matchingComp.push({ el: cEl, idx: cIdx });
        for (const t of cTokens) compTokenUnion.add(t);
      }
    }
    if (matchingComp.length >= 1) {
      // Check coverage: comparing tokens cover at least 50% of baseline tokens
      const overlap = Array.from(bTokens).filter(t => compTokenUnion.has(t)).length;
      const coverage = overlap / bTokens.size;
      if (coverage >= 0.5) {
        matched.push({
          baseline: bEl,
          comparing: matchingComp[0].el,
          identical: valuesEqual(bEl.value, matchingComp.map(c => normalizeText(c.el.value)).join(' ')),
        });
        unmatchedBaseline.delete(bIdx);
        for (const { idx: cIdx } of matchingComp) {
          unmatchedComparing.delete(cIdx);
        }
      }
    }
  }

  // Same in reverse: matching comparing items against groups of baseline items
  const unmatchedCompArr2 = Array.from(unmatchedComparing).map(i => ({ el: comparing.items[i], idx: i }));
  const unmatchedBaseArr2 = Array.from(unmatchedBaseline).map(i => ({ el: baseline.items[i], idx: i }));

  for (const { el: cEl, idx: cIdx } of unmatchedCompArr2) {
    if (!unmatchedComparing.has(cIdx)) continue;
    const cTokens = tokenizeForMatch(cEl.value);
    if (cTokens.size < 2) continue;

    const matchingBase: Array<{ el: ContentItem; idx: number }> = [];
    const baseTokenUnion = new Set<string>();
    for (const { el: bEl, idx: bIdx } of unmatchedBaseArr2) {
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bTokens = tokenizeForMatch(bEl.value);
      if (bTokens.size === 0) continue;
      // Bidirectional token overlap (same as forward direction)
      const intersection = Array.from(bTokens).filter(t => cTokens.has(t)).length;
      const smaller = Math.min(bTokens.size, cTokens.size);
      const overlapRatio = smaller > 0 ? intersection / smaller : 0;
      if (overlapRatio >= 0.5) {
        // SAFETY: Same guard as forward — when matching field_value against
        // paragraph/list_item, require value token overlap (not just key).
        if (cEl.kind === "field_value" && (bEl.kind === "paragraph" || bEl.kind === "list_item")) {
          const valueTokens = tokenizeForMatch(cEl.value);
          const keyTokens = new Set(normalizeKey(cEl.label).split(/[^a-z0-9]+/).filter(t => t.length > 0));
          const valueOnlyTokens = Array.from(valueTokens).filter(t => !keyTokens.has(t));
          if (valueOnlyTokens.length > 0) {
            const hasValueOverlap = valueOnlyTokens.some(t => bTokens.has(t));
            if (!hasValueOverlap) continue;
          }
        } else if (bEl.kind === "field_value" && (cEl.kind === "paragraph" || cEl.kind === "list_item")) {
          const valueTokens = tokenizeForMatch(bEl.value);
          const keyTokens = new Set(normalizeKey(bEl.label).split(/[^a-z0-9]+/).filter(t => t.length > 0));
          const valueOnlyTokens = Array.from(valueTokens).filter(t => !keyTokens.has(t));
          if (valueOnlyTokens.length > 0) {
            const hasValueOverlap = valueOnlyTokens.some(t => cTokens.has(t));
            if (!hasValueOverlap) continue;
          }
        }
        matchingBase.push({ el: bEl, idx: bIdx });
        for (const t of bTokens) baseTokenUnion.add(t);
      }
    }
    if (matchingBase.length >= 1) {
      const overlap = Array.from(cTokens).filter(t => baseTokenUnion.has(t)).length;
      const coverage = overlap / cTokens.size;
      if (coverage >= 0.5) {
        matched.push({
          baseline: matchingBase[0].el,
          comparing: cEl,
          identical: valuesEqual(cEl.value, matchingBase.map(b => normalizeText(b.el.value)).join(' ')),
        });
        unmatchedComparing.delete(cIdx);
        for (const { idx: bIdx } of matchingBase) {
          unmatchedBaseline.delete(bIdx);
        }
      }
    }
  }

  // Phase 8: Comprehensive cross-format content dedup.
  // Catches remaining unmatched items where different formats produced different
  // structural representations of the same content (swapped key/value, wrong
  // pairings, format artifacts). Computes word-level similarity across ALL
  // text of each item (key + label + value).
  {
    function contentWords(el: ContentItem): Set<string> {
      const raw = `${el.key} ${normalizeKey(el.label)} ${normalizeText(el.value)}`.toLowerCase();
      return new Set(raw.split(/[^a-z0-9]+/).filter(t => t.length > 1));
    }

    function wordOverlap(a: Set<string>, b: Set<string>): number {
      if (a.size === 0 || b.size === 0) return 0;
      let inter = 0;
      for (const w of a) if (b.has(w)) inter++;
      return inter / Math.min(a.size, b.size);
    }

    const unmatchedBaseArr8 = Array.from(unmatchedBaseline)
      .map(i => ({ el: baseline.items[i], idx: i }));
    const unmatchedCompArr8 = Array.from(unmatchedComparing)
      .map(i => ({ el: comparing.items[i], idx: i }));

    // Pre-compute word sets
    const baseWordSets = new Map<number, Set<string>>();
    for (const { el, idx } of unmatchedBaseArr8) baseWordSets.set(idx, contentWords(el));
    const compWordSets = new Map<number, Set<string>>();
    for (const { el, idx } of unmatchedCompArr8) compWordSets.set(idx, contentWords(el));

    // For each unmatched baseline item, find the best matching comparing item
    for (const { el: bEl, idx: bIdx } of unmatchedBaseArr8) {
      if (!unmatchedBaseline.has(bIdx)) continue;
      const bWords = baseWordSets.get(bIdx)!;
      if (bWords.size < 1) continue;

      let bestMatch: { idx: number; score: number } | null = null;
      for (const { idx: cIdx } of unmatchedCompArr8) {
        if (!unmatchedComparing.has(cIdx)) continue;
        const cWords = compWordSets.get(cIdx)!;
        if (cWords.size < 1) continue;
        const overlap = wordOverlap(bWords, cWords);
        if (overlap >= 0.35) {
          // Prefer exact value match, then higher overlap, then kind match
          const valMatch = valuesEqual(bEl.value, comparing.items[cIdx].value) ? 10 : 0;
          const kindMatch = bEl.kind === comparing.items[cIdx].kind ? 2 : 0;
          const score = valMatch + kindMatch + overlap;
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { idx: cIdx, score };
          }
        }
      }
      if (bestMatch) {
        const cEl = comparing.items[bestMatch.idx];
        matched.push({
          baseline: bEl,
          comparing: cEl,
          identical: valuesEqual(bEl.value, cEl.value) ||
                     wordOverlap(bWords, contentWords(cEl)) >= 0.6,
        });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(bestMatch.idx);
      }
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
