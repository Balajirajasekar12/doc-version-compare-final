/**
 * Comparison Chain Engine
 *
 * Determines which format pairs to compare for a report group based on the
 * user-selected baseline and the format priority rules.
 *
 * Priority rules (CASE 1 - PDF exists):
 *   PDF → RTF
 *   PDF → DOCX
 *   DOCX → XLSX
 *   XLSX → CSV
 *
 * CASE 2 - No PDF, DOCX exists:
 *   DOCX → RTF
 *   DOCX → XLSX
 *   XLSX → CSV
 *
 * CASE 3 - Only some formats exist:
 *   Compare only the applicable formats that are actually available.
 *
 * Never manufacture a missing version.
 */

import type { ComparisonChain, ComparisonPair, DocKind, DocGroup } from "./types";

/** Ordered priority chain: which format should be baseline for which. */
const FORMAT_PRIORITY: DocKind[] = ["pdf", "docx", "rtf", "xlsx", "xls", "csv"];

/** Maps baseline format to the chain of comparisons to run from it. */
const CHAIN_TEMPLATES: Record<string, ComparisonPair[]> = {
  pdf: [
    { baselineFormat: "pdf", comparingFormat: "rtf" },
    { baselineFormat: "pdf", comparingFormat: "docx" },
    { baselineFormat: "docx", comparingFormat: "xlsx" },
    { baselineFormat: "xlsx", comparingFormat: "csv" },
  ],
  docx: [
    { baselineFormat: "docx", comparingFormat: "rtf" },
    { baselineFormat: "docx", comparingFormat: "xlsx" },
    { baselineFormat: "xlsx", comparingFormat: "csv" },
  ],
  rtf: [
    { baselineFormat: "rtf", comparingFormat: "xlsx" },
    { baselineFormat: "xlsx", comparingFormat: "csv" },
  ],
  xlsx: [
    { baselineFormat: "xlsx", comparingFormat: "csv" },
  ],
  xls: [
    { baselineFormat: "xls", comparingFormat: "csv" },
  ],
  csv: [],
};

/**
 * Normalize a DocKind alias for chain lookup.
 * "xls" is treated as "xlsx" for chain purposes.
 */
function normalizeForChain(kind: DocKind): DocKind {
  return kind === "xls" ? "xlsx" : kind;
}

/**
 * Get the available formats in a group, deduplicated and normalized.
 */
function getAvailableFormats(group: DocGroup): Set<DocKind> {
  const formats = new Set<DocKind>();
  for (const doc of group.docs) {
    if (!doc.error && doc.content) {
      formats.add(normalizeForChain(doc.ext));
    }
  }
  return formats;
}

/**
 * Determine the default baseline format for a group based on format priority.
 */
export function getDefaultBaseline(group: DocGroup): DocKind {
  const available = getAvailableFormats(group);
  for (const kind of FORMAT_PRIORITY) {
    if (available.has(kind)) return kind;
  }
  // Fallback to the first available format
  return group.formats[0] ?? "pdf";
}

/**
 * Generate a comparison chain for a report group given a baseline format.
 *
 * The chain follows the hierarchical structure:
 * - If baseline is PDF: PDF→RTF, PDF→DOCX, then DOCX→XLSX, XLSX→CSV
 * - If baseline is DOCX: DOCX→RTF, DOCX→XLSX, XLSX→CSV
 * - etc.
 *
 * Only pairs where BOTH formats exist in the group are included.
 */
export function buildComparisonChain(
  group: DocGroup,
  baselineFormat: DocKind,
): ComparisonChain {
  const available = getAvailableFormats(group);
  const normalized = normalizeForChain(baselineFormat);

  // Get the template chain for this baseline format
  const template = CHAIN_TEMPLATES[normalized] ?? [];

  // Filter to only pairs where both formats are available
  const pairs: ComparisonPair[] = [];
  for (const pair of template) {
    const baseNorm = normalizeForChain(pair.baselineFormat);
    const compNorm = normalizeForChain(pair.comparingFormat);
    if (available.has(baseNorm) && available.has(compNorm)) {
      pairs.push(pair);
    }
  }

  return {
    baselineFormat: normalized,
    pairs,
  };
}

/**
 * Get all distinct comparison pairs across multiple groups, for summary display.
 */
export function summarizeChains(groups: DocGroup[]): ComparisonPair[] {
  const seen = new Set<string>();
  const result: ComparisonPair[] = [];
  for (const group of groups) {
    const baseline = getDefaultBaseline(group);
    const chain = buildComparisonChain(group, baseline);
    for (const pair of chain.pairs) {
      const key = `${pair.baselineFormat}→${pair.comparingFormat}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(pair);
      }
    }
  }
  return result;
}

/**
 * Find the document in a group that matches a given format.
 * Prefers docs without errors and with parsed content.
 */
export function findDocForFormat(
  group: DocGroup,
  format: DocKind,
): import("./types").ParsedDoc | undefined {
  // First try exact format match
  const exact = group.docs.find(
    (d) => normalizeForChain(d.ext) === normalizeForChain(format) && !d.error && d.content,
  );
  if (exact) return exact;

  // For xlsx, also accept xls
  if (format === "xlsx") {
    const xls = group.docs.find(
      (d) => d.ext === "xls" && !d.error && d.content,
    );
    if (xls) return xls;
  }

  return undefined;
}
