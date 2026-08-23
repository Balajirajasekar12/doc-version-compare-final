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

/**
 * Canonicalize a value for cross-format equivalence checks. Position- and
 * layout-independent: two values that a human would read as "the same data"
 * produce the same canonical string, regardless of which format/line they came
 * from.
 *
 * - Collapses whitespace and lowercases (via normalizeText).
 * - For money/number-like strings, strips currency symbols, thousands
 *   separators and spaces, and drops insignificant trailing decimal zeros, so
 *   "$1,234.50" === "1234.5" and "333.00" === "333".
 * - Leading zeros on integers are PRESERVED (so IDs like "016543" stay distinct
 *   from "16543").
 */
export function canonicalValue(value: string): string {
  const base = normalizeText(value).toLowerCase();
  const stripped = base.replace(/[$,\s%]/g, "");
  if (/^[-+]?\d+(\.\d+)?$/.test(stripped)) {
    if (stripped.includes(".")) {
      return stripped.replace(/0+$/, "").replace(/\.$/, "");
    }
    return stripped;
  }
  return base;
}

// ── Canonical Content Extraction ────────────────────────────────────────────

/**
 * Extract field/value pairs from ANY text using generic patterns.
 * This is FORMAT-AGNOSTIC — it works on text from PDF, RTF, DOCX, etc.
 */
function extractFieldValuesFromText(text: string): Array<{ field: string; value: string }> {
  const pairs: Array<{ field: string; value: string }> = [];
  // Convert tabs to pipes for consistent handling
  const trimmed = text.trim().replace(/\t/g, " | ");

  // Helper: extract a single segment using colon/equals/space patterns
  function extractFromSegment(segment: string): { field: string; value: string } | null {
    const s = segment.trim();
    if (s === "") return null;

    // Colon-separated: "Field: Value" (field may start with digit for dates like 03/26)
    const colonMatch = /^([A-Za-z0-9][A-Za-z0-9 _/().\-&'*]+?)\s*:\s*(.+)$/.exec(s);
    if (colonMatch) {
      const val = colonMatch[2].trim();
      if (val.includes("|")) return null;
      return { field: colonMatch[1].trim(), value: val };
    }

    // Equals-separated: "Field = Value"
    const equalsMatch = /^([A-Za-z0-9][A-Za-z0-9 _/().\-&'*]+?)\s*=\s*(.+)$/.exec(s);
    if (equalsMatch) {
      return { field: equalsMatch[1].trim(), value: equalsMatch[2].trim() };
    }

    // Space-separated with 2+ spaces: "Field  Value"
    // Field can contain letters, digits, spaces, &, /, -, (, ) for business content
    // like "Paid Claims & Expenses", "Other Fees & Charges", "03/26 Total"
    const spaceGapMatch = /^([A-Za-z0-9][A-Za-z0-9 &,/\-().]{0,30}?)\s{2,}(.+)$/.exec(s);
    if (spaceGapMatch) {
      const field = spaceGapMatch[1].trim();
      const value = spaceGapMatch[2].trim();
      if (field.length > 0 && field.length <= 40 && /^[A-Za-z0-9]/.test(field) && !/^\d+$/.test(field)) {
        const isHeader = field.length <= 5 && value.length <= 5 &&
          /^[A-Za-z][A-Za-z ]*$/.test(field) && /^[A-Za-z][A-Za-z ]*$/.test(value);
        if (!isHeader) return { field, value };
      }
    }

    // Single-space separated: "Field Value" where value is numeric
    // Catches PDF table rows like "Account 1000" or "Customer Since 2021-06-15"
    // where the parser didn't insert pipes and the gap is only one space.
    const singleSpaceMatch = /^([A-Za-z0-9][A-Za-z0-9 &,/\-().]{0,30}?)\s(.+)$/.exec(s);
    if (singleSpaceMatch) {
      const field = singleSpaceMatch[1].trim();
      const value = singleSpaceMatch[2].trim();
      // Only match when the value is numeric, currency, or date-like
      // This prevents leaking parser artifacts like "onttbl 0 Arial;"
      if (field.length > 0 && field.length <= 40 && field.length >= 3 &&
        /^[A-Za-z0-9]/.test(field) && !/^\d+$/.test(field) &&
        /^[$0-9(-][0-9,.:\-/$]*$/.test(value)) {
        return { field, value };
      }
    }

    return null;
  }

  // Pattern 1: Pipe-delimited segments
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map(p => p.trim()).filter(p => p !== "");
    // When only 1 non-empty segment remains (trailing empty pipes from XLSX rows
    // like "Sort Description: Product/Sub Group-8 Digit |  |  |  |  |  |"),
    // strip the pipes and try single-segment extraction on the non-empty part.
    if (parts.length === 1 && trimmed.includes("|")) {
      const single = extractFromSegment(parts[0]);
      if (single) { pairs.push(single); return pairs; }
      // If extraction failed, fall through to single-segment extraction below
    }
    if (parts.length >= 2) {
      // Check if this is a header row (all alpha-only, short)
      const isHeader = parts.length === 2 &&
        parts.every(p => p.length <= 10 && /^[A-Za-z][A-Za-z ]*$/.test(p));
      if (!isHeader) {
        // If the first segment contains a colon, the pipes are likely
        // visual separators in a sentence (e.g., "Account: 1000 | Synthetic data | No real PHI"),
        // NOT table column delimiters. In this case, extract only the colon-separated
        // field_value from the first segment, not from all segments.
        if (parts[0].includes(":")) {
          // Try to extract a colon-separated field_value from the first segment.
          // Works for:
          //   "Sort Description: | Product/Sub Group-8 Digit" → field=Sort Description, value=Product/Sub Group-8 Digit
          //   "Sort Description: Product/Sub Group-8 Digit |  |  ..." → field=Sort Description, value=Product/Sub Group-8 Digit
          //   "Account: 1000 | Synthetic data" → field=Account, value=1000 (metadata)
          const firstSegExtracted = extractFromSegment(parts[0]);
          if (firstSegExtracted && firstSegExtracted.value.length > 0) {
            pairs.push(firstSegExtracted);
          } else {
            // Check if first segment ENDS with colon — it's a field label
            // but extractFromSegment couldn't parse it (e.g., empty value after colon).
            const firstSegTrimmed = parts[0].trim();
            if (firstSegTrimmed.endsWith(":") && firstSegTrimmed.length > 1) {
              const field = firstSegTrimmed.slice(0, -1).trim();
              // Find the next non-empty segment as value
              const nextNonEmpty = parts.slice(1).find(p => p.trim().length > 0);
              if (field.length > 0 && nextNonEmpty) {
                pairs.push({ field, value: nextNonEmpty.trim() });
              }
            } else {
              // Colon is in the middle but extractFromSegment failed —
              // likely metadata like "Account: 1000 | Synthetic data | No real PHI"
              // Return empty so caller treats as paragraph.
              return pairs;
            }
          }
        }
        // Split on pipes and extract field_value from each segment.
        for (const segment of parts) {
          const extracted = extractFromSegment(segment);
          if (extracted) {
            pairs.push(extracted);
          }
        }
        if (pairs.length > 0) return pairs;
        // Fallback: only use first two parts as field/value if the first part
        // looks like a field label (alpha-only, starts with letter, ≤30 chars)
        // and NOT like a pure number/ID.
        if (parts.length >= 2) {
          const candidateField = parts[0].trim();
          const candidateValue = parts[1].trim();
          const looksLikeLabel = /^[A-Za-z][A-Za-z ]{0,29}$/.test(candidateField) &&
            !/^\d+$/.test(candidateField) && candidateField.length >= 2;
          if (looksLikeLabel && candidateValue.length > 0) {
            pairs.push({ field: candidateField, value: candidateValue });
          }
        }
        return pairs;
      }
    }
  }

  // Pattern 2: Single segment extraction (no pipes)
  const single = extractFromSegment(trimmed);
  if (single) {
    pairs.push(single);
    return pairs;
  }

  return pairs;
}

/**
 * Detect alternating key-value lines from RTF \cell extraction.
 * Converts "Field\nValue\nAccount\n1001" → ["Field | Value", "Account | 1001"]
 */
function normalizeCellLines(inputLines: string[]): string[] {
  // PRE-PROCESS: Handle RTF tab-separated multi-column content.
  // RTF produces lines like:
  //   "Client Number\t\t\tClient Name\t\t\tInvoice Number" (all labels)
  //   "016543\t\t\tBorough of Ridgway\t260804584270" (all values)
  // These are TWO lines that together form paired field/value columns.
  // Strategy: detect when line N is all-labels and line N+1 is all-values
  // with matching column counts, then emit them as pipe-delimited pairs.
  // Allow common business characters in labels: & / - ( ) and digits (for dates like 03/26)
  // Must contain at least one alpha character (prevents pure digit strings like "1000" from being labels)
  const isLabelSeg = (s: string) =>
    /^[A-Za-z0-9][A-Za-z0-9 &/\-().]*$/.test(s) && /[A-Za-z]/.test(s) && s.length >= 2 && s.length <= 50;
  const hasNonLabel = (segs: string[]) => segs.some(s => !isLabelSeg(s));
  const tabProcessed: string[] = [];
  let skipNext = false;
  for (let li = 0; li < inputLines.length; li++) {
    if (skipNext) { skipNext = false; continue; }
    const trimmed = inputLines[li].trim();
    if (trimmed.includes("\t")) {
      const segs = trimmed.split("\t").map(s => s.trim()).filter(s => s !== "");
      if (segs.length >= 2) {
        const allLabels = segs.every(isLabelSeg);
        // Check if next line has same column count with tabs AND has non-labels (values).
        // Only pair multi-column lines (3+ labels) — 2-column lines like
        // "Status\tActive" are independent field/value pairs, not paired columns.
        if (allLabels && segs.length >= 2) {
          // Skip empty lines to find the next data row
          let nextIdx = li + 1;
          while (nextIdx < inputLines.length && inputLines[nextIdx].trim() === "") nextIdx++;
          if (nextIdx < inputLines.length) {
            const nextTrimmed = inputLines[nextIdx].trim();
            if (nextTrimmed.includes("\t")) {
              const nextSegs = nextTrimmed.split("\t").map(s => s.trim()).filter(s => s !== "");
              if (nextSegs.length === segs.length && hasNonLabel(nextSegs)) {
                // Found a header row followed by data row(s).
                const numCols = segs.length;
                const dataRows: string[][] = [nextSegs];
                let dataIdx = nextIdx + 1;
                while (dataIdx < inputLines.length) {
                  const dataTrimmed = inputLines[dataIdx].trim();
                  if (dataTrimmed === "") { dataIdx++; continue; }
                  if (!dataTrimmed.includes("\t")) break;
                  const dataSegs = dataTrimmed.split("\t").map(s => s.trim()).filter(s => s !== "");
                  if (dataSegs.length !== numCols) break;
                  dataRows.push(dataSegs);
                  dataIdx++;
                }
                // PAIR column-by-column for ALL header+data tab blocks.
                // This correctly handles:
                //   2-col: "Bill Account Number | Bill Account Name" + "0165431006 | Borough Of Ridgway"
                //   3+col: "Client Number | Client Name | Invoice Number" + "016543 | ... | 260804584270"
                for (const dataRow of dataRows) {
                  for (let col = 0; col < numCols; col++) {
                    const header = segs[col];
                    const value = dataRow[col];
                    if (header && value) {
                      tabProcessed.push(header + " | " + value);
                    }
                  }
                }
                // Skip all consumed lines
                li = dataIdx - 1; // -1 because for loop will increment
                continue;
              }
            }
          }
        }
      }
    }
    tabProcessed.push(inputLines[li]);
  }

  const result: string[] = [];
  let i = 0;

  // A "key" line is a short alpha phrase (label/field name), no colon/pipe.
  // Keys are SHORT labels like "Client Number", "Status", "Region".
  // Longer alpha phrases like "Borough Of Ridgway" (19 chars) are VALUES, not keys.
  // This distinction is critical for alternating KV detection.
  function isKey(s: string): boolean {
    return s.length > 0 && s.length <= 20 &&
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
    // Colon-separated (allow digit-starting fields like 03/26)
    const colonM = /^([A-Za-z0-9][A-Za-z0-9 _/().\-&'*]+?)\s*:\s*(.+)$/.exec(line);
    if (colonM) return { field: colonM[1].trim(), value: colonM[2].trim() };
    // Equals-separated
    const eqM = /^([A-Za-z0-9][A-Za-z0-9 _/().\-&'*]+?)\s*=\s*(.+)$/.exec(line);
    if (eqM) return { field: eqM[1].trim(), value: eqM[2].trim() };
    // Space-separated: "Field    Value" (2+ spaces)
    const spM = /^([A-Za-z0-9][A-Za-z0-9 &,/\-().]{0,30}?)\s{2,}(.+)$/.exec(line);
    if (spM) {
      const f = spM[1].trim();
      const v = spM[2].trim();
      if (f.length > 0 && f.length <= 40 && /^[A-Za-z0-9]/.test(f) && !/^\d+$/.test(f)) {
        return { field: f, value: v };
      }
    }
    return null;
  }

  while (i < tabProcessed.length) {
    const trimmed = tabProcessed[i].trim();

    if (i + 1 < tabProcessed.length && isKey(trimmed)) {
      const nextTrimmed = tabProcessed[i + 1].trim();

      // Pattern A: Alternating key-value (key on line N, value on line N+1).
      // This handles RTF/DOCX where fields appear as separate lines:
      //   "Invoice Number"
      //   "260804584270"
      //   "Bill Account Number"
      //   "0165431006"
      // We require at least 2 consecutive key-value pairs to avoid false matches.
      // We require !isKey(valueLine) to prevent pairing two key-like lines.
      // Values like "016543" or "Borough Of Ridgway" (>20 chars) fail isKey,
      // allowing the pairing. But short alpha like "Field" or "Value" pass isKey,
      // preventing false pairing with preceding key-like lines.
      // SAFETY: Skip if key words are a prefix/subset of value words.
      // This prevents false pairing of table headers like:
      //   "Total" + "Total Number of Installment"
      //   "Billed to Date" + "Total Installments Billed to Date"
      // These are column headers, not field/value pairs.
      const keyWords = trimmed.toLowerCase().split(/\s+/);
      const valWords = nextTrimmed.toLowerCase().split(/\s+/);
      const keyIsPrefixOfValue = keyWords.every(kw => valWords.includes(kw));

      if (!isKey(nextTrimmed) && isValue(nextTrimmed) && !keyIsPrefixOfValue) {
        // Peek ahead: need at least one more key-value pair after this
        const peekIdx = i + 2;
        if (peekIdx + 1 < tabProcessed.length) {
          const peekKey = tabProcessed[peekIdx].trim();
          const peekVal = tabProcessed[peekIdx + 1].trim();
          if (isKey(peekKey) && (peekVal.length > peekKey.length || !isKey(peekVal)) && isValue(peekVal)) {
            // Found at least 2 consecutive key-value pairs — collect them all
            const pairs: string[] = [`${trimmed} | ${nextTrimmed}`];
            let rowIdx = i + 2;
            while (rowIdx + 1 < tabProcessed.length) {
              const k = tabProcessed[rowIdx].trim();
              const v = tabProcessed[rowIdx + 1].trim();
              if (k === "" || v === "") break;
              if (!isKey(k) || !isValue(v)) break;
              pairs.push(`${k} | ${v}`);
              rowIdx += 2;
            }
            for (const pair of pairs) result.push(pair);
            i = rowIdx;
            continue;
          }
        }
      }

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
          while (rowIdx + 1 < tabProcessed.length) {
            const k = tabProcessed[rowIdx].trim();
            const v = tabProcessed[rowIdx + 1].trim();
            if (k === "" || v === "") { isTable = false; break; }
            if (!isKey(k) || !isValue(v)) { isTable = false; break; }
            rowCount++;
            rowIdx += 2;
          }

          if (rowCount >= 1 && isTable) {
            result.push(`${trimmed} | ${nextTrimmed}`);
            rowIdx = i + 2;
            while (rowIdx + 1 < tabProcessed.length) {
              const k = tabProcessed[rowIdx].trim();
              const v = tabProcessed[rowIdx + 1].trim();
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

    result.push(tabProcessed[i]);
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

/**
 * Split concatenated table cells from mammoth (DOCX parser).
 * Mammoth joins adjacent cells WITHOUT separators:
 *   "Invoice Number" + "260804584270" → "Invoice Number260804584270"
 *   "Bill Account Name" + "Borough Of Ridgway" → "Bill Account NameBorough Of Ridgway"
 *   "Unpaid Advance" + "Balance" → "Unpaid AdvanceBalance"
 *   "Total" + "Numberof" + "Installment" → "Total Numberof Installment"
 *
 * Detection: find boundaries where:
 *   1. A lowercase letter transitions to an uppercase letter (camelCase word boundary)
 *   2. A letter transitions to a digit (field-name → numeric-value boundary)
 * But NOT:
 *   - Already properly spaced text
 *   - Common abbreviations (e.g., "PPONumber" → should NOT become "PPO Number")
 *   - Single uppercase letters within a word
 */
function splitConcatenatedCells(line: string): string {
  // Already has proper separators (colon, pipe, 2+ spaces) — don't touch
  if (line.includes(":") || line.includes("|") || /\s{2,}/.test(line)) {
    return line;
  }

  let result = line;

  // 1. Split camelCase word boundaries: "MonthAugust" → "Month August"
  //    "AdvanceBalance" → "Advance Balance"
  //    "InstallmentDue" → "Current Installment Due"
  result = result.replace(/([a-z])([A-Z])/g, "$1 $2");

  // 2. Split "Numberof" → "Number of" (common mammoth concatenation)
  result = result.replace(/Numberof/g, "Number of");

  // 3. Split alpha→digit boundaries: "Invoice Number260804584270"
  //    → "Invoice Number 260804584270"
  result = result.replace(/([A-Za-z])([0-9])/g, "$1 $2");

  return result;
}

function textToCanonical(doc: ParsedDoc): ContentItem[] {
  const rawLines = doc.content?.type === "text" ? doc.content.lines : [];
  // Step 1: Split concatenated cells from mammoth
  const splitLines = rawLines.map(splitConcatenatedCells);
  const lines = normalizeCellLines(filterArtifactLines(splitLines));
  const items: ContentItem[] = [];

  // First pass: detect pipe-delimited table blocks
  const pipeLineIndices = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const lineTrimmed = lines[i].trim();
    if (lineTrimmed.includes("|")) {
      const parts = lineTrimmed.split("|").map(p => p.trim()).filter(p => p !== "");
      if (parts.length >= 2 && !parts[0].includes(":")) {
        pipeLineIndices.add(i);
      }
    } else if (lineTrimmed.includes("\t")) {
      // Lines with 3+ tabs are multi-column table rows from RTF.
      const tabParts = lineTrimmed.split("\t").map(p => p.trim()).filter(p => p !== "");
      if (tabParts.length >= 3) {
        pipeLineIndices.add(i);
      }
    }
  }

  // Group consecutive pipe lines, splitting when column counts change.
  // E.g., RTF produces:
  //   "Client Number | Client Name | Invoice Number" (3 cols)
  //   "016543 | Borough of Ridgway | 260804584270" (3 cols)
  //   "Bill Account Number | Bill Account Name" (2 cols)
  //   "0165431006 | Borough Of Ridgway" (2 cols)
  // These are TWO separate sub-tables, not one 4-row table.
  const pipeBlocks: Array<{ start: number; end: number; rows: string[][] }> = [];
  let currentBlock: { start: number; end: number; rows: string[][] } | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (pipeLineIndices.has(i)) {
      const lineTrimmed = lines[i].trim();
      const cells = lineTrimmed.includes("|")
        ? lineTrimmed.split("|").map(c => c.trim())
        : lineTrimmed.split("\t").map(c => c.trim()).filter(c => c !== "");
      if (!currentBlock) {
        currentBlock = { start: i, end: i, rows: [cells] };
      } else {
        // Split block if column count changes.
        // Even a change of 1 column means different sub-tables
        // (e.g., 3-col header+data followed by 2-col header+data).
        const prevRowCols = currentBlock.rows[currentBlock.rows.length - 1].length;
        const thisRowCols = cells.length;
        if (thisRowCols !== prevRowCols && currentBlock.rows.length >= 2) {
          pipeBlocks.push(currentBlock);
          currentBlock = { start: i, end: i, rows: [cells] };
        } else {
          currentBlock.end = i;
          currentBlock.rows.push(cells);
        }
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

    // Detect IRREGULAR pipe blocks: rows with wildly different column counts
    // (e.g., 6, 4, 2, 3). These are NOT real tables — they're field/value pairs
    // that happen to have pipes due to PDF positioning. Process each line individually.
    const colCounts = block.rows.map(r => r.length);
    const minCols = Math.min(...colCounts);
    const maxCols = Math.max(...colCounts);
    const isIrregular = maxCols - minCols > 2 || (maxCols > 2 && minCols < 2);

    if (isIrregular) {
      // Irregular block: these are field/value pairs mixed on the same line
      // due to PDF positioning. Extract adjacent pairs directly from pipe segments.
      for (let r = 0; r < block.rows.length; r++) {
        const cells = block.rows[r];
        if (cells.length === 1) {
          // Single cell — might be a paragraph
          const text = cells[0].trim();
          if (text !== '') {
            items.push({
              key: normalizeKey(text),
              label: text,
              value: text,
              kind: 'paragraph',
              sourceLocation: `Line ${block.start + 1 + r}`,
            });
          }
        } else if (cells.length === 2) {
          // Standard 2-column: col0=field, col1=value
          const field = cells[0].trim();
          const value = cells[1].trim();
          if (field !== '' && value !== '') {
            items.push({
              key: normalizeKey(field),
              label: field,
              value,
              kind: 'field_value',
              sourceLocation: `Line ${block.start + 1 + r}`,
            });
          }
        } else {
          // Multi-column row in an irregular block.
          // These rows mix field/value pairs with table data from PDF positioning.
          // Use extractFieldValuesFromText which handles colon, equals, and pipe patterns.
          // For remaining unmatched segments, treat as paragraph (table data).
          const lineText = cells.join(' | ');
          const fvPairs = extractFieldValuesFromText(lineText);
          
          if (fvPairs.length > 0) {
            for (const { field, value } of fvPairs) {
              items.push({
                key: normalizeKey(field),
                label: field,
                value,
                kind: 'field_value',
                sourceLocation: `Line ${block.start + 1 + r}`,
              });
            }
          } else {
            // No field/value extraction possible — treat as paragraph
            items.push({
              key: normalizeKey(lineText),
              label: lineText,
              value: lineText,
              kind: 'paragraph',
              sourceLocation: `Line ${block.start + 1 + r}`,
            });
          }
        }
      }
      continue; // Skip normal table processing for this block
    }

    // Only treat as header if there are at least 2 rows.
    // All cells must be alpha-only (no digits, no special chars).
    // 2-column headers: both parts ≤12 chars (e.g., "Field", "Value").
    // Multi-column headers (>2 cols): all parts ≤50 chars.
    // The alpha-only check is sufficient to distinguish headers from data.
    const isHeader = block.rows.length >= 2 && firstRow && firstRow.length >= 2 &&
      firstRow.every(c => /^[A-Za-z][A-Za-z ]*$/.test(c)) &&
      (firstRow.length === 2
        ? firstRow.every(c => c.length <= 12)
        : firstRow.every(c => c.length <= 50));
    const startRow = isHeader ? 1 : 0;
    const headers = isHeader ? firstRow.map(c => c.trim()) : [];

    // Header becomes a paragraph (structural metadata), UNLESS it's a standard
    // Field/Value table header. The XLSX parser consumes the header row
    // (isFieldValuePairTable) and doesn't emit it, so we shouldn't either.
    const isFieldValuePairHeader = firstRow.length === 2 &&
      firstRow[0].toLowerCase() === "field" && firstRow[1].toLowerCase() === "value";
    if (isHeader && !isFieldValuePairHeader) {
      items.push({
        key: normalizeKey(firstRow.join(" ")),
        label: firstRow.join(" | "),
        value: firstRow.join(" | "),
        kind: "paragraph",
        sourceLocation: `Line ${block.start + 1}`,
      });
    }

    // Data rows become field_value items
    // For multi-column tables, track seen keys across ALL rows for deduplication
    // (matching XLSX sheetToCanonical behavior).
    const multiColSeen = new Map<string, number>();
    for (let r = startRow; r < block.rows.length; r++) {
      const row = block.rows[r];
      if (row.length >= 2) {
        if (isFieldValuePairHeader) {
          // Field/Value table (header is ["Field", "Value"]):
          // col0 = field name, col1 = field value.
          const field = row[0].trim();
          const value = (row[1] ?? '').trim();
          if (field !== '' && value !== '') {
            items.push({
              key: normalizeKey(field),
              label: field,
              value,
              kind: 'field_value',
              sourceLocation: `Line ${block.start + 1 + r}`,
            });
          }
        } else if (isHeader && headers.length > 2) {
          // Multi-column table (>2 cols): use header names as keys.
          for (let c = 0; c < headers.length && c < row.length; c++) {
            const baseField = headers[c];
            const value = row[c]?.trim() ?? "";
            if (baseField !== "" && value !== "") {
              const n = multiColSeen.get(baseField) ?? 0;
              multiColSeen.set(baseField, n + 1);
              const field = n > 0 ? `${baseField} #${n}` : baseField;
              items.push({
                key: normalizeKey(field),
                label: field,
                value,
                kind: "field_value",
                sourceLocation: `Line ${block.start + 1 + r}`,
              });
            }
          }
        } else {
          // Non-header table: extract field/value pairs.
          // For multi-column rows (e.g., PDF puts "Client Number | 016543 | Client Name | Borough of Ridgway")
          // extract ALL pairs: even cols = keys, odd cols = values.
          // For 2-column rows: col 0 = field, col 1 = value.
          if (row.length <= 2) {
            const field = row[0].trim();
            const value = (row[1] ?? '').trim();
            if (field !== '' && value !== '') {
              items.push({
                key: normalizeKey(field),
                label: field,
                value,
                kind: 'field_value',
                sourceLocation: `Line ${block.start + 1 + r}`,
              });
            }
          } else {
            // Multi-column: extract adjacent pairs (col0=field, col1=value, col2=field, col3=value, ...)
            for (let c = 0; c + 1 < row.length; c += 2) {
              const field = row[c].trim();
              const value = row[c + 1].trim();
              if (field !== '' && value !== '') {
                items.push({
                  key: normalizeKey(field),
                  label: field,
                  value,
                  kind: 'field_value',
                  sourceLocation: `Line ${block.start + 1 + r}`,
                });
              }
            }
          }
        }
      }
    }
  }

  // Pre-process: join colon-terminated lines with their following line.
  // PDF parser splits "Sort Description: Product/Sub Group-8 Digit" into
  // two lines: "Sort Description:" and "Product/Sub Group-8 Digit" because
  // they're at different X positions. Join them back together.
  // Also build a set tracking which joinedLines indices came from pipe lines.
  const joinedLines: string[] = [];
  const joinedPipeLines = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || pipeTableLines.has(i)) {
      if (pipeTableLines.has(i)) joinedPipeLines.add(joinedLines.length);
      joinedLines.push(lines[i]);
      continue;
    }
    // If line ends with just a colon and next non-empty line exists,
    // join them with ": " to form a single field:value line.
    if (/^[A-Za-z][A-Za-z ]*:$/.test(trimmed)) {
      // Find next non-empty, non-pipe line
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === "" || pipeTableLines.has(j))) j++;
      if (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        // Only join if next line is NOT another colon-terminated line
        // and NOT a pipe line and NOT a table separator
        if (nextTrimmed !== "" && !/^[A-Za-z][A-Za-z ]*:$/i.test(nextTrimmed) &&
            !nextTrimmed.includes("|") && !/^[-+:]+$/.test(nextTrimmed)) {
          joinedLines.push(trimmed + " " + nextTrimmed);
          // Skip the joined line
          i = j;
          continue;
        }
      }
    }
    joinedLines.push(lines[i]);
  }

  // Process remaining lines (not in pipe tables)
  for (let i = 0; i < joinedLines.length; i++) {
    if (joinedPipeLines.has(i)) continue;
    const trimmed = joinedLines[i].trim();
    if (trimmed === "") continue;
    if (/^[|\-+:]+$/.test(trimmed)) continue; // table separator

    // Check for field/value in remaining text
    const fvPairs = extractFieldValuesFromText(trimmed);
    if (fvPairs.length > 0) {
      // Check if this line appears immediately before a pipe table block.
      // If so, it's likely report metadata (e.g., "Account: 1000") that
      // identifies the report, not actual data. Treat as paragraph.
      const nextNonEmpty = joinedLines.findIndex((l, j) => j > i && l.trim() !== "" && joinedPipeLines.has(j));
      const isBeforeTable = nextNonEmpty === i + 1 || (nextNonEmpty > i && nextNonEmpty - i <= 2);
      
      // Also check: if the value is a pure identifier/code AND the field
      // is a short single word, it's report metadata (not data).
      // IMPORTANT: do NOT classify descriptive fields like "Sort Description"
      // as metadata — those contain real data values.
      const isMetadata = fvPairs.length === 1 &&
        isBeforeTable &&
        fvPairs[0].field.length <= 15 &&
        !fvPairs[0].field.includes(" ") &&
        /^[A-Za-z][A-Za-z ]*$/.test(fvPairs[0].field) &&
        !fvPairs[0].value.includes("|") &&
        fvPairs[0].value.length < 20 &&
        (/^\d+$/.test(fvPairs[0].value) || /^[A-Za-z0-9._-]+$/.test(fvPairs[0].value));
      
      for (const { field, value } of fvPairs) {
        items.push({
          key: normalizeKey(field),
          label: field,
          value,
          kind: isMetadata ? "paragraph" : "field_value",
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
    // Skip metadata sheets (e.g., "Validation Notes") that don't contain report data.
    // These contain document metadata like "Property | Value" tables.
    if (sheet.name.toLowerCase().includes("validation") ||
        sheet.name.toLowerCase().includes("notes")) {
      continue;
    }

    const rows = sheet.rows;

    if (hasHeaderRow(rows)) {
      const headers = rows[0].map((h, c) => h.trim() || colLetters(c));

      // Detect Field/Value table pattern:
      // Header row is ["Field", "Value"] → use first column as field name,
      // second column as field value.
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
      // Non-header layout.
      // Check if this is a single-column sheet with alternating key-value pairs.
      const maxCols = Math.max(...rows.filter(r => r).map(r => r.length));
      const isSingleCol = maxCols <= 1;

      if (isSingleCol) {
        // Single-column: check for alternating key-value pattern
        const isKeyRow = (s: string): boolean =>
          s.length > 0 && s.length < 30 &&
          /^[A-Za-z][A-Za-z]*(?: [A-Za-z]+)*$/.test(s) &&
          !s.includes(":") && !s.includes("|");
        const isValRow = (s: string): boolean =>
          s.length > 0 && s.length < 50 &&
          !s.includes(":") && !s.includes("|");

        let r = 0;
        while (r < rows.length) {
          const row = rows[r];
          if (!row) { r++; continue; }
          const cell0 = (row[0] ?? "").trim();
          if (cell0 === "") { r++; continue; }

          // Check if this row is a key and next row is a value
          if (r + 1 < rows.length && isKeyRow(cell0)) {
            const nextRow = rows[r + 1];
            const nextCell0 = (nextRow?.[0] ?? "").trim();
            if (isValRow(nextCell0)) {
              items.push({
                key: normalizeKey(cell0),
                label: cell0,
                value: nextCell0,
                kind: "field_value",
                sourceLocation: `${sheet.name} · A${r + 1}`,
                sheet: sheet.name,
              });
              r += 2;
              continue;
            }
          }

          // Check for colon-separated
          const colonMatch = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*:\s*(.+)$/.exec(cell0);
          if (colonMatch) {
            items.push({
              key: normalizeKey(colonMatch[1].trim()),
              label: colonMatch[1].trim(),
              value: colonMatch[2].trim(),
              kind: "field_value",
              sourceLocation: `${sheet.name} · A${r + 1}`,
              sheet: sheet.name,
            });
            r++;
            continue;
          }

          items.push({
            key: `cell_${r}_0`,
            label: `A${r + 1}`,
            value: cell0,
            kind: "table_cell",
            sourceLocation: `${sheet.name} · A${r + 1}`,
            sheet: sheet.name,
          });
          r++;
        }
      } else {
        // Multi-column: use table_cell items
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

  // Post-process: fix reversed field_value pairs.
  // The PDF parser joins text items by stream order, not visual order.
  // This causes pairs like:
  //   key="product sub group 8 digit" value="Sort Description:"
  // when the correct representation is:
  //   key="sort description" value="Product/Sub Group-8 Digit"
  // Detection: value ends with ':' but label doesn't → swap them.
  for (const item of items) {
    if (item.kind === "field_value" && item.value.endsWith(":") && !item.label.endsWith(":")) {
      const oldLabel = item.label;
      const oldValue = item.value;
      item.label = oldValue.replace(/:\s*$/, "").trim();
      item.value = oldLabel;
      item.key = normalizeKey(item.label);
    }
  }

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
      // Don't match field_value vs field_value by value alone —
      // two different fields can have the same value (e.g.,
      // "Client Name" = Borough of Ridgway, "Bill Account Name" = Borough Of Ridgway).
      // Phase 1 already matched field_values by key. Phase 2 should only match
      // non-KV items (paragraphs, table_cells) or cross-kind matches.
      const bothKv = (bEl.kind === "field_value" || bEl.kind === "heading") &&
                     (cEl.kind === "field_value" || cEl.kind === "heading");
      if (bothKv) continue;
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
    // For pipe-containing paragraphs, try to match each pipe segment
    // against a field_value. E.g., "Account: 1000 | Synthetic data | No real PHI"
    // has segment "Account: 1000" which matches field_value key=account, value=1000.
    if (bEl.value.includes("|")) {
      const segments = bEl.value.split("|").map(s => s.trim()).filter(s => s.length > 0);
      const matchedSegments = new Set<number>();
      for (const seg of segments) {
        const segLower = seg.toLowerCase();
        for (const { el: cEl, idx: cIdx } of unmatchedKVComparing) {
          if (usedComp.has(cIdx) || matchedSegments.has(cIdx)) continue;
          const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
          // Exact value match
          if (segLower === cNorm) {
            matched.push({ baseline: bEl, comparing: cEl, identical: true });
            matchedSegments.add(cIdx);
            break;
          }
          // Segment contains field key and ends with value
          const keyInSeg = segLower.includes(cEl.key) || segLower.includes(normalizeKey(cEl.label));
          if (keyInSeg && cNorm.length > 0 && segLower.includes(cNorm)) {
            matched.push({ baseline: bEl, comparing: cEl, identical: true });
            matchedSegments.add(cIdx);
            break;
          }
        }
      }
      if (matchedSegments.size > 0) {
        // Mark paragraph as matched (structural content)
        unmatchedBaseline.delete(bIdx);
        for (const idx of matchedSegments) {
          unmatchedComparing.delete(idx);
          usedComp.add(idx);
        }
      }
      continue;
    }
    // Non-pipe paragraph matching
    for (const { el: cEl, idx: cIdx } of unmatchedKVComparing) {
      if (usedComp.has(cIdx)) continue;
      const bNorm = normalizeValue(bEl.value, mode).toLowerCase();
      const cNorm = normalizeValue(cEl.value, mode).toLowerCase();
      // Guard: paragraph must not be too long (concatenated rows are long).
      if (bNorm.length > 120) continue;
      // Prefer exact match
      if (bNorm === cNorm) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
      // Substring match: if field key appears in paragraph text
      // Handle colon-terminated labels: "sort description:" includes key "sort description"
      const keyInParagraph = bNorm.includes(cEl.key) || bNorm.includes(normalizeKey(cEl.label)) ||
        bNorm.replace(/:\s*$/, "").trim() === cEl.key ||
        bNorm.replace(/:\s*$/, "").trim() === normalizeKey(cEl.label);
      if (keyInParagraph && bNorm.length < 200) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }

  // Phase 3b: Match colon-terminated paragraphs against field_values
  // When PDF produces "Sort Description:" as a paragraph and DOCX/RTF produces
  // field_value key=sort description, value=Product/Sub Group-8 Digit.
  const unmatchedColonBaseline = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) =>
      (el.kind === "paragraph" || el.kind === "list_item") &&
      /[A-Za-z]:\s*$/.test(el.value.trim())
    );
  const unmatchedKVComparingPhase3b = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");

  for (const { el: bEl, idx: bIdx } of unmatchedColonBaseline) {
    const paraKey = normalizeKey(bEl.value.replace(/:\s*$/, "").trim());
    for (const { el: cEl, idx: cIdx } of unmatchedKVComparingPhase3b) {
      if (usedComp.has(cIdx)) continue;
      if (cEl.key === paraKey) {
        // The paragraph is just the field label with colon, the field_value has the value
        // Match them — the paragraph "Sort Description:" matches field_value "sort description"
        matched.push({ baseline: bEl, comparing: cEl, identical: false });
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
      if (cNorm.length > 120) continue;
      if (bNorm === cNorm) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(bIdx);
        break;
      }
      // Handle colon-terminated paragraph matching field key
      const cNormStripped = cNorm.replace(/:\s*$/, "").trim();
      const keyInParagraph = cNorm.includes(bEl.key) || cNorm.includes(normalizeKey(bEl.label)) ||
        cNormStripped === bEl.key || cNormStripped === normalizeKey(bEl.label);
      if (keyInParagraph && cNorm.length < 200) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(bIdx);
        break;
      }
    }
  }

  // Phase 5: Match pipe-containing paragraphs against field_values
  // When PDF produces "Account | 1000" as a paragraph but RTF produces it
  // as a field_value, they need to match across kinds.
  const unmatchedProseBaselinePhase5 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) =>
      (el.kind === "paragraph" || el.kind === "list_item") &&
      el.value.includes("|") &&
      !el.value.includes(":")
    );
  const unmatchedKVComparingPhase5 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");

  for (const { el: bEl, idx: bIdx } of unmatchedProseBaselinePhase5) {
    const parts = bEl.value.split("|").map(p => p.trim()).filter(p => p !== "");
    if (parts.length < 2) continue;
    const paraField = normalizeKey(parts[0]);
    const paraValue = parts[1];

    for (const { el: cEl, idx: cIdx } of unmatchedKVComparingPhase5) {
      if (usedComp.has(cIdx)) continue;
      if (cEl.key === paraField && valuesEqual(paraValue, cEl.value)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }

  // Phase 6: Reverse — field_value in baseline vs pipe-containing paragraph in comparing
  const unmatchedKVBaselinePhase6 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const unmatchedProseComparingPhase6 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) =>
      (el.kind === "paragraph" || el.kind === "list_item") &&
      el.value.includes("|") &&
      !el.value.includes(":")
    );

  for (const { el: bEl, idx: bIdx } of unmatchedKVBaselinePhase6) {
    for (const { el: cEl, idx: cIdx } of unmatchedProseComparingPhase6) {
      if (usedComp.has(cIdx)) continue;
      const parts = cEl.value.split("|").map(p => p.trim()).filter(p => p !== "");
      if (parts.length < 2) continue;
      const paraField = normalizeKey(parts[0]);
      const paraValue = parts[1];

      if (bEl.key === paraField && valuesEqual(bEl.value, paraValue)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }

  // Phase 7: Match structured paragraphs against field_values
  // When PDF produces "Account 1000" as a paragraph (no pipe/colon)
  // but RTF produces "Account | 1000" as a field_value, match them.
  // Strategy: for unmatched paragraphs, try to find a field_value in
  // the comparing document whose value appears as a suffix of the paragraph.
  const unmatchedProseBaselinePhase7 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) =>
      (el.kind === "paragraph" || el.kind === "list_item") &&
      !el.value.includes("|")
    );
  const unmatchedKVComparingPhase7 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");

  for (const { el: bEl, idx: bIdx } of unmatchedProseBaselinePhase7) {
    const paraNorm = normalizeValue(bEl.value, mode).toLowerCase();
    for (const { el: cEl, idx: cIdx } of unmatchedKVComparingPhase7) {
      if (usedComp.has(cIdx)) continue;
      const valNorm = normalizeValue(cEl.value, mode).toLowerCase();
      if (valNorm.length === 0) continue;
      // Match "Account 1000" paragraph against field_value key="account" value="1000"
      // Strategy: paragraph ends with the value AND contains the field name
      const keyInPara = paraNorm.includes(cEl.key) || paraNorm.includes(normalizeKey(cEl.label));
      if (keyInPara && paraNorm.endsWith(valNorm)) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
      // Also match if paragraph is just the value (e.g. "1000" == "1000")
      if (paraNorm === valNorm) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
      // Also match if paragraph is just the field KEY (e.g., standalone "Customer"
      // paragraph matches field_value key="customer" value="Customer Alpha")
      if (keyInPara && paraNorm === cEl.key) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }

  // Phase 8: Reverse — field_value in baseline vs structured paragraph in comparing
  const unmatchedKVBaselinePhase8 = Array.from(unmatchedBaseline)
    .map(i => ({ el: baseline.items[i], idx: i }))
    .filter(({ el }) => el.kind === "field_value" || el.kind === "heading");
  const unmatchedProseComparingPhase8 = Array.from(unmatchedComparing)
    .map(i => ({ el: comparing.items[i], idx: i }))
    .filter(({ el }) =>
      (el.kind === "paragraph" || el.kind === "list_item") &&
      !el.value.includes("|")
    );

  for (const { el: bEl, idx: bIdx } of unmatchedKVBaselinePhase8) {
    for (const { el: cEl, idx: cIdx } of unmatchedProseComparingPhase8) {
      if (usedComp.has(cIdx)) continue;
      const paraNorm = normalizeValue(cEl.value, mode).toLowerCase();
      const valNorm = normalizeValue(bEl.value, mode).toLowerCase();
      // Phase 8a: Match if paragraph ends with value AND contains the field key.
      // CRITICAL: Do NOT match by value alone — two different fields can share
      // the same value (e.g., Client Name = Borough Of Ridgway and
      // Bill Account Name = Borough Of Ridgway). Matching by value alone
      // hides genuine missing fields.
      const keyInPara = paraNorm.includes(bEl.key) || paraNorm.includes(normalizeKey(bEl.label));
      if (valNorm.length > 0 && paraNorm.endsWith(valNorm) && keyInPara) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
      // Phase 8b: Match if paragraph is just the field KEY
      if (keyInPara && paraNorm === bEl.key) {
        matched.push({ baseline: bEl, comparing: cEl, identical: true });
        unmatchedBaseline.delete(bIdx);
        unmatchedComparing.delete(cIdx);
        usedComp.add(cIdx);
        break;
      }
    }
  }


  // Collect remaining unmatched as missing/added.
  // Report ALL unmatched items (not just field_value/heading) so that genuine
  // content differences like "Created for cross-format comparison testing." are
  // not hidden. However, suppress paragraphs/list_items whose content is already
  // represented by a matched item — these are false duplicates from the same
  // data being expressed differently across formats.
  const allUnmatchedBaseline = Array.from(unmatchedBaseline).map(i => baseline.items[i]);
  const allUnmatchedComparing = Array.from(unmatchedComparing).map(i => comparing.items[i]);

  // POSITION/LAYOUT-INDEPENDENT REPORTING.
  //
  // The canonical model matches by key/value, NEVER by line number, so content
  // that merely moved (e.g. on line 1 in the PDF but line 2 in the DOCX) is not
  // a difference. Here we also make the *reporting* of unmatched field_value/
  // heading items value-aware.
  //
  // The same datum routinely appears under a different KEY across formats:
  // repeated subtotal rows keyed "group #1/#2/#3", fields re-keyed by a table
  // flattener, header/metadata rows, etc. If an unmatched field's VALUE is
  // still present somewhere in the other document, it is the same data laid out
  // differently — a layout artifact, not a data difference — so we suppress it.
  // Only values that are genuinely ABSENT from the other document are reported.
  //
  // We use a multiset (value -> count) so a value that appears N times must be
  // present N times to be fully suppressed; the (N+1)-th occurrence with no
  // counterpart is reported. Values consumed by genuine matches are removed
  // first, so a value used in a real match can't also mask a missing item.
  //
  // Non-field_value items (paragraphs, list_items, table_cells) remain
  // structural/formatting content and are never reported as data differences.

  function buildValueCounts(items: ContentItem[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const it of items) {
      const v = canonicalValue(it.value);
      if (v === "") continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return counts;
  }
  const comparingValueCounts = buildValueCounts(comparing.items);
  const baselineValueCounts = buildValueCounts(baseline.items);

  // Remove values already accounted for by genuine matches.
  for (const m of matched) {
    const bv = canonicalValue(m.baseline.value);
    const cv = canonicalValue(m.comparing.value);
    if ((baselineValueCounts.get(bv) ?? 0) > 0) baselineValueCounts.set(bv, baselineValueCounts.get(bv)! - 1);
    if ((comparingValueCounts.get(cv) ?? 0) > 0) comparingValueCounts.set(cv, comparingValueCounts.get(cv)! - 1);
  }

  // Consume one occurrence of a value from the other document's multiset.
  // Returns true when the value WAS present (so this unmatched item is a layout
  // artifact and should be suppressed), false when it is genuinely absent.
  function consume(counts: Map<string, number>, value: string): boolean {
    const v = canonicalValue(value);
    if (v === "") return false;
    const n = counts.get(v) ?? 0;
    if (n > 0) {
      counts.set(v, n - 1);
      return true;
    }
    return false;
  }

  const missingInComparing = allUnmatchedBaseline.filter(item => {
    if (item.kind !== "field_value" && item.kind !== "heading") return false;

    // SUPPRESS WATERMARK/HEADER FALSE FIELD_VALUES.
    // PDF parsers sometimes pair watermark text ("Proof", "Draft"), header text
    // ("August", "HIGHMARK"), or date fragments ("07 31 2026") with adjacent
    // content as field_value items. These create false differences.
    //
    // Rule 1: If key is a single short word (≤8 chars) AND another field_value
    // has the same value with a more specific key, suppress this one.
    // (e.g., "Proof" suppressed in favor of "Client Name" for same value)
    //
    // Rule 2: If key is a date fragment (digits/spaces only like "07 31 2026")
    // or a month name, suppress it — these are parser artifacts, not field labels.
    const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const keyParts = item.key.split(/\s+/);
    const isDateFragment = /^\d+(\s+\d+)+$/.test(item.key);
    const isMonthName = keyParts.length === 1 && MONTH_NAMES.includes(item.key.toLowerCase());
    if (isDateFragment || isMonthName) {
      return false; // suppress date fragments and month names
    }

    // Rule 3: Suppress short PDF internal identifiers.
    // PDF parsers sometimes extract internal object references like
    // "PG1" → "KEY_1" or "KEY_1" → "PG1" as field_value pairs.
    // These are parser artifacts, not business content.
    const isPdfInternal = (
      item.key.length <= 5 && /\d/.test(item.key) && /^[A-Za-z0-9_]+$/.test(item.key) &&
      item.value.length <= 10 && /^[A-Za-z0-9_]+$/.test(item.value)
    ) ||
      /^KEY[_\s]?\d+$/i.test(item.key) ||
      /^KEY[_\s]?\d+$/i.test(item.value) ||
      /^PG[_\s]?\d+$/i.test(item.key) ||
      /^PG[_\s]?\d+$/i.test(item.value) ||
      /^OBJ[_\s]?\d+/i.test(item.key) ||
      /^OBJ[_\s]?\d+/i.test(item.value);
    if (isPdfInternal) {
      return false; // suppress PDF internal artifacts
    }
    if (keyParts.length === 1 && item.key.length <= 8 && item.value.length > 5) {
      const itemValNorm = normalizeText(item.value).toLowerCase();
      const hasMoreSpecificKey = allUnmatchedBaseline.some(other =>
        other !== item &&
        other.kind === "field_value" &&
        normalizeText(other.value).toLowerCase() === itemValNorm &&
        (other.key.length > item.key.length || other.key.split(/\s+/).length > 1)
      );
      if (hasMoreSpecificKey) return false; // suppress this false positive
    }

    // Report only if the value is genuinely absent from the comparing document.
    return !consume(comparingValueCounts, item.value);
  });
  const addedInComparing = allUnmatchedComparing.filter(item => {
    if (item.kind !== "field_value" && item.kind !== "heading") return false;

    // Apply same suppression rules as missingInComparing
    const MONTH_NAMES2 = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const keyParts2 = item.key.split(/\s+/);
    const isDateFragment2 = /^\d+(\s+\d+)+$/.test(item.key);
    const isMonthName2 = keyParts2.length === 1 && MONTH_NAMES2.includes(item.key.toLowerCase());
    if (isDateFragment2 || isMonthName2) return false;

    const isPdfInternal2 = (
      item.key.length <= 5 && /\d/.test(item.key) && /^[A-Za-z0-9_]+$/.test(item.key) &&
      item.value.length <= 10 && /^[A-Za-z0-9_]+$/.test(item.value)
    ) ||
      /^KEY[_\s]?\d+$/i.test(item.key) ||
      /^KEY[_\s]?\d+$/i.test(item.value) ||
      /^PG[_\s]?\d+$/i.test(item.key) ||
      /^PG[_\s]?\d+$/i.test(item.value) ||
      /^OBJ[_\s]?\d+/i.test(item.key) ||
      /^OBJ[_\s]?\d+/i.test(item.value);
    if (isPdfInternal2) return false;

    return !consume(baselineValueCounts, item.value);
  });

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
