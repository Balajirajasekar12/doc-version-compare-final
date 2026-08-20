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
        if (!isHeader) {
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

  // Pattern 4: Space-separated table data — "Field  Value" (2+ spaces between)
  // This catches PDF table rows where the parser didn't insert pipes.
  const spaceGapMatch = /^([A-Za-z][A-Za-z ]{0,30}?)\s{2,}(.+)$/.exec(trimmed);
  if (spaceGapMatch) {
    const field = spaceGapMatch[1].trim();
    const value = spaceGapMatch[2].trim();
    if (field.length > 0 && field.length <= 30 && /^[A-Za-z]/.test(field) && !/[0-9]/.test(field)) {
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
function normalizeCellLines(inputLines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  // A "key" line is short, alpha words separated by single spaces, no colon/pipe.
  // Allows "Account Manager" but NOT "Customer    Customer Alpha" (multi-space).
  function isKey(s: string): boolean {
    return s.length > 0 && s.length < 30 &&
      /^[A-Za-z][A-Za-z]*(?: [A-Za-z]+)*$/.test(s) &&
      !s.includes(":") && !s.includes("|");
  }
  // A "value" line is non-empty and short (can be alpha, digits, mixed).
  function isValue(s: string): boolean {
    return s.length > 0 && s.length < 50 &&
      !s.includes(":") && !s.includes("|");
  }

  // Helper: try to extract a field/value from a single line
  function tryExtract(line: string): { field: string; value: string } | null {
    // Pipe-delimited
    if (line.includes("|")) {
      const parts = line.split("|").map(p => p.trim()).filter(p => p !== "");
      if (parts.length >= 2 && !parts[0].includes(":")) {
        return { field: parts[0], value: parts[1] };
      }
    }
    // Colon-separated
    const colonM = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*:\s*(.+)$/.exec(line);
    if (colonM) return { field: colonM[1].trim(), value: colonM[2].trim() };
    // Equals-separated
    const eqM = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*=\s*(.+)$/.exec(line);
    if (eqM) return { field: eqM[1].trim(), value: eqM[2].trim() };
    // Space-separated: "Field    Value" (2+ spaces)
    const spM = /^([A-Za-z][A-Za-z ]{0,30}?)\s{2,}(.+)$/.exec(line);
    if (spM) {
      const f = spM[1].trim();
      const v = spM[2].trim();
      if (f.length > 0 && f.length <= 30 && /^[A-Za-z]/.test(f) && !/[0-9]/.test(f)) {
        return { field: f, value: v };
      }
    }
    return null;
  }

  while (i < inputLines.length) {
    const trimmed = inputLines[i].trim();

    if (i + 1 < inputLines.length && isKey(trimmed)) {
      const nextTrimmed = inputLines[i + 1].trim();
      if (isKey(nextTrimmed)) {
        // Two consecutive alpha-only lines — possible table start.
        // SAFETY CHECK: Verify this looks like a real table.
        // We require the proposed header line to look like SHORT column
        // labels (each word ≤ 8 chars), while data rows can be longer.
        // This distinguishes real table headers like "Field | Value"
        // from data rows like "Customer Customer Alpha | Region South".
        const headerWords = trimmed.split(/\s+/);
        const nextWords = nextTrimmed.split(/\s+/);
        const isHeaderCandidate = headerWords.every(w => w.length <= 8) && nextWords.every(w => w.length <= 8);

        if (isHeaderCandidate) {
          let isTable = true;
          let rowIdx = i + 2;
          let rowCount = 0;
          while (rowIdx + 1 < inputLines.length) {
            const k = inputLines[rowIdx].trim();
            const v = inputLines[rowIdx + 1].trim();
            if (k === "" || v === "") { isTable = false; break; }
            if (!isKey(k) || !isValue(v)) { isTable = false; break; }
            rowCount++;
            rowIdx += 2;
          }

          if (rowCount >= 1 && isTable) {
            result.push(`${trimmed} | ${nextTrimmed}`);
            rowIdx = i + 2;
            while (rowIdx + 1 < inputLines.length) {
              const k = inputLines[rowIdx].trim();
              const v = inputLines[rowIdx + 1].trim();
              if (k === "" || v === "") break;
              if (k.length > 30 || !/^[A-Za-z][A-Za-z]*(?: [A-Za-z]+)*$/.test(k)) break;
              result.push(`${k} | ${v}`);
              rowIdx += 2;
            }
            i = rowIdx;
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
    return true;
  });
}

function textToCanonical(doc: ParsedDoc): ContentItem[] {
  const rawLines = doc.content?.type === "text" ? doc.content.lines : [];
  const lines = normalizeCellLines(filterArtifactLines(rawLines));
  const items: ContentItem[] = [];

  // First pass: detect pipe-delimited table blocks
  const pipeLineIndices = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().includes("|")) {
      const parts = lines[i].trim().split("|").map(p => p.trim()).filter(p => p !== "");
      // Only treat as pipe-delimited if first part has no colon.
      // A line like "Account: 1000 | Synthetic data" has pipes as visual
      // separators in a sentence, not as table column delimiters.
      if (parts.length >= 2 && !parts[0].includes(":")) {
        pipeLineIndices.add(i);
      }
    }
  }

  // Group consecutive pipe lines
  const pipeBlocks: Array<{ start: number; end: number; rows: string[][] }> = [];
  let currentBlock: { start: number; end: number; rows: string[][] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (pipeLineIndices.has(i)) {
      const cells = lines[i].trim().split("|").map(c => c.trim());
      if (!currentBlock) {
        currentBlock = { start: i, end: i, rows: [cells] };
      } else {
        currentBlock.end = i;
        currentBlock.rows.push(cells);
      }
    } else {
      if (currentBlock) { pipeBlocks.push(currentBlock); currentBlock = null; }
    }
  }
  if (currentBlock) pipeBlocks.push(currentBlock);

  const pipeTableLines = new Set<number>();
  for (const block of pipeBlocks) {
    for (let i = block.start; i <= block.end; i++) pipeTableLines.add(i);
  }

  // Process pipe table blocks
  for (const block of pipeBlocks) {
    const firstRow = block.rows[0];
    // Only treat as header if there are at least 2 rows
    // (header + at least one data row). A single-row table is data, not header.
    // Header rows have SHORT parts (e.g., "Field" and "Value").
    // Longer values like "Customer Alpha" mean this is a data row.
    const isHeader = block.rows.length >= 2 &&
      firstRow && firstRow.length === 2 &&
      firstRow.every(c => c.length <= 10 && /^[A-Za-z][A-Za-z ]*$/.test(c));
    const startRow = isHeader ? 1 : 0;

    // Header becomes a paragraph (not data)
    if (isHeader) {
      items.push({
        key: normalizeKey(firstRow.join(" ")),
        label: firstRow.join(" | "),
        value: firstRow.join(" | "),
        kind: "paragraph",
        sourceLocation: `Line ${block.start + 1}`,
      });
    }

    // Data rows become field_value items
    for (let r = startRow; r < block.rows.length; r++) {
      const row = block.rows[r];
      if (row.length >= 2) {
        const field = row[0].trim();
        const value = row[1].trim();
        if (field !== "" && value !== "") {
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

  // Process remaining lines (not in pipe tables)
  for (let i = 0; i < lines.length; i++) {
    if (pipeTableLines.has(i)) continue;
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
      const isFieldValuePairTable =
        headers.length >= 2 &&
        headers[0].toLowerCase() === "field" &&
        headers[1].toLowerCase() === "value";

      if (isFieldValuePairTable) {
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

    // Pipe-aware comparison: "Field | Value" === "Field Value"
    // Strip pipes and collapse whitespace for structural equivalence
    const stripPipes = (s: string) => s.replace(/[|]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (stripPipes(na) === stripPipes(nb)) return true;

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
      if (bNorm.includes(cNorm) || cNorm.includes(bNorm)) {
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
      if (bNorm.includes(cNorm) || cNorm.includes(bNorm)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(bIdx);
        break;
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
