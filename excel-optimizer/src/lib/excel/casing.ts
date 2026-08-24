/**
 * Heading text normalization.
 *
 * The optimizer never touches data cells, but the product's heading pass
 * (titles, subtitles, section labels and table header rows) may normalize
 * casing so all sheets read consistently: "PROJECT 11 TESTING SUMMARY",
 * "test automation execution dashboard 5" and "testAutomationDashboard" all
 * become "Project 11 Testing Summary" / "Test Automation Execution Dashboard 5".
 *
 * Rules (deterministic, so the validator can recognize these as intentional):
 *  - Title-case every word: first letter upper, rest lower.
 *  - Camel-case words are split first ("testAutomation" → "Test Automation").
 *  - Hyphenated compounds are cased per segment ("end-to-end" → "End-to-End").
 *  - Known acronyms (ID, URL, API, …) stay uppercase ("Test Case ID").
 *  - Small words (of, the, and, …) stay lowercase except as the first word.
 *  - Words without letters (numbers, punctuation) are left untouched.
 *  - Original whitespace runs and punctuation are preserved exactly.
 */
const SMALL_WORDS = new Set([
  "a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to",
  "from", "by", "of", "in", "with", "via", "vs", "per",
]);

const ACRONYMS = new Set([
  "ID", "URL", "API", "SQL", "HTML", "CSS", "CSV", "PDF", "AI", "UI", "QA",
  "HTTP", "HTTPS", "TCP", "IP", "OS", "PC", "SKU", "FAQ", "ROI", "KPI", "SSN",
  "EIN", "ISO", "XML", "JSON", "PNG", "JPEG", "GIF", "SQL", "DB", "CRM", "ERP",
  // HIGHMARK / enterprise abbreviations
  "SFB", "PHI", "HIPAA", "EBS", "HBS", "ASO", "HDHP", "PPO", "EOB",
  "ADF", "BAU", "SLA", "KPI", "RPT", "ADM", "DEV", "TST", "PRD",
]);

/** True when `text` differs from its normalized form. */
export function needsTitleCase(text: string): boolean {
  return toTitleCase(text) !== text;
}

// ============================================================
// Typo / spelling corrections for common enterprise document errors.
// Applied only to heading cells (row kinds: title, heading, subtitle).
// Does NOT touch data cells.
// ============================================================

const TYPO_CORRECTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  // =====================================================================
  // Phase 1: Multi-word patterns (greedy — match longest first)
  // =====================================================================
  // HIGHMARK: full phrase corrections
  { pattern: /\bClaim\s+S\s+B\s+Ased\s+Adminive\b/gi, replacement: "Claims Based Administrative" },
  { pattern: /\bClaims?\s+S\s+B\s+Ased\s+Adminive\b/gi, replacement: "Claims Based Administrative" },
  { pattern: /\bClaims?\s+S\s+B\s+Ased\b/gi, replacement: "Claims Based" },

  // =====================================================================
  // Phase 2: Single-word garbled patterns (applied before camelCase splitting)
  // These catch OCR/transcription errors where a single word is garbled.
  // The key insight: correctTypos runs BEFORE toTitleCase, so garbled
  // single words like "claimS" or "bAsed" must be fixed first.
  // =====================================================================
  // "claimS" → "Claims" (OCR garbled trailing S)
  { pattern: /\bclaimS\b/g, replacement: "Claims" },
  // "bAsed" → "Based" (OCR garbled capital A)
  { pattern: /\bbAsed\b/g, replacement: "Based" },
  // "SbAsed" → "SbBased" (unlikely but safe)
  { pattern: /\bSbAsed\b/g, replacement: "SbBased" },
  // "Ased" → "Based" when it's a standalone garbled word
  { pattern: /\bAsed\b/g, replacement: "Based" },
  // "claimS bAsed" as a two-word pattern
  { pattern: /\bclaimS\s+bAsed\b/g, replacement: "Claims Based" },
  // "Claims bAsed" (partial garble)
  { pattern: /\bClaims?\s+bAsed\b/gi, replacement: "Claims Based" },
  // "claimS Based" or "Claims Based"
  { pattern: /\bclaimS\s+Based\b/g, replacement: "Claims Based" },
  // Generic "Adminive" (OCR garbled)
  { pattern: /\bAdminive\b/gi, replacement: "Administrative" },
  // "Adiminstrative", "Adminstrative" etc.
  { pattern: /\bAdmin(?:i?n?istrat(?:iv)?e?)\b/gi, replacement: "Administrative" },

  // =====================================================================
  // Phase 3: "Bill Package" corrections
  // =====================================================================
  // "B lllpackage" → "Bill Package" (space + extra Ls)
  { pattern: /\bB\s+ll+package\b/gi, replacement: "Bill Package" },
  // "lllpackage" → "Bill Package" (missing B, extra Ls)
  { pattern: /\bll+package\b/gi, replacement: "Bill Package" },
  // "billpackage" → "Bill Package" (no space)
  { pattern: /\bbill\s*package\b/gi, replacement: "Bill Package" },
];

/**
 * Applies deterministic typo corrections to heading text.
 * Returns the corrected text, or the original if no corrections matched.
 */
export function correctTypos(text: string): string {
  let result = text;
  for (const { pattern, replacement } of TYPO_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function toTitleCase(text: string): string {
  // Split on whitespace runs, preserving the original separators exactly.
  const parts = text.split(/(\s+)/);
  let firstWord = true;
  let out = "";
  for (const part of parts) {
    if (!/\S/.test(part)) {
      out += part; // whitespace separator — untouched
      continue;
    }
    const cased = titleCaseWord(part, firstWord);
    out += cased;
    if (/\w/.test(part)) firstWord = false;
  }
  return out;
}

function titleCaseWord(word: string, isFirstWord: boolean): string {
  // Hyphenated / underscore compounds: case each segment, keep the separator.
  if (word.includes("-") || word.includes("_")) {
    const sep = word.includes("-") ? "-" : "_";
    return word
      .split(sep)
      .map((seg, i) => titleCaseWord(seg, isFirstWord && i === 0))
      .join(sep);
  }
  // Camel-case boundaries: "testAutomation" → "test Automation" (joined with
  // a space — camelCase words become separate title-cased words).
  const spaced = word
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Letter→digit boundaries: "Dashboard5" → "Dashboard 5" — unless the
    // letter run is an all-caps acronym-style token ("FY24" stays put).
    .replace(/([a-zA-Z]{2,})(\d+)(?![A-Za-z])/g, (m, letters: string, digits: string) =>
      /^[A-Z]+$/.test(letters) ? m : `${letters} ${digits}`,
    );
  let first = true;
  return spaced
    .split(" ")
    .map((w) => {
      const out = titleCaseSingle(w, isFirstWord && first);
      if (/\w/.test(w)) first = false;
      return out;
    })
    .join(" ");
}

function titleCaseSingle(w: string, isFirstWord: boolean): string {
  if (!/[a-zA-Z]/.test(w)) return w; // numbers / punctuation only
  // Mixed alphanumeric all-caps tokens (FY2024, Q2FY25, 2FA, Q1) stay as-is.
  if (/\d/.test(w) && /[A-Z]/.test(w) && !/[a-z]/.test(w)) return w;
  const lower = w.toLowerCase();
  const upper = w.toUpperCase();
  if (!isFirstWord && SMALL_WORDS.has(lower)) return lower;
  if (ACRONYMS.has(upper)) return upper;
  return w[0].toUpperCase() + lower.slice(1);
}
