import type { DocGroup, DocKind, ParsedDoc } from "./types";

/**
 * Automatic version discovery.
 *
 * File names are split into a base "stem" and a trailing version token, e.g.
 *   salesreport_2608041001.docx → stem "salesreport", version "2608041001"
 *   q1_report_final.docx        → stem "q1_report", version "final"
 *   invoice_v2.xlsx             → stem "invoice", version "v2"
 *
 * Files that share (directory, stem, format) are treated as versions of the
 * same report and grouped for comparison.
 */

const VERSION_WORDS = new Set([
  "final",
  "draft",
  "rev",
  "approved",
  "released",
  "original",
  "updated",
  "new",
  "old",
  "copy",
  "backup",
  "wip",
  "tmp",
  "temp",
  "clean",
]);

function isVersionToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (/^\d+$/.test(token) || /^\d{6,}$/.test(token)) return true;
  if (/^v?\d+(\.\d+)*$/i.test(token)) return true;
  if (/^rev\s?\d*$/i.test(token)) return true;
  return VERSION_WORDS.has(lower);
}

export function splitVersion(fileName: string): { stem: string; version: string } {
  const base = fileName.replace(/\.[^.]+$/, "");
  const tokens = base.split(/[-_\s.]+/).filter(Boolean);
  const versionParts: string[] = [];
  while (tokens.length > 0 && isVersionToken(tokens[tokens.length - 1])) {
    versionParts.unshift(tokens.pop() as string);
  }
  return {
    stem: tokens.join("_") || base,
    version: versionParts.join("_"),
  };
}

/** Natural sort: numeric chunks compare numerically ("v2" < "v10"). */
export function naturalCompare(a: string, b: string): number {
  const partsA = a.split(/(\d+)/);
  const partsB = b.split(/(\d+)/);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const pa = partsA[i];
    const pb = partsB[i];
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    if (pa === pb) continue;
    const na = /^\d+$/.test(pa);
    const nb = /^\d+$/.test(pb);
    if (na && nb) return parseInt(pa, 10) - parseInt(pb, 10);
    return pa < pb ? -1 : 1;
  }
  return 0;
}

/**
 * Resolve account / package / category from a directory relative to the
 * picked root, at a 1-based "account level".
 *
 * Example with accountLevel = 2:
 *   dir "Reports/1000/Non-Phi" → account "1000", package "Non-Phi", category ""
 *
 * The browser never exposes the name of the folder the user picked, so the
 * account is whatever folder sits at the chosen level. Level 1 is the
 * default; a uniform wrapper folder at level 1 is detected and skipped so
 * the account folders (1000, 2000, …) are found at level 2 instead.
 */
export function resolveHierarchy(
  dir: string,
  accountLevel: number,
): { account: string; packageName: string; category: string } {
  const segs = dir.split("/").filter(Boolean);
  const at = (i: number) => segs[i] ?? "";
  return {
    account: at(accountLevel - 1) || "(root)",
    packageName: at(accountLevel) || "(root)",
    category: at(accountLevel + 1) ?? "",
  };
}

/**
 * Pick the most likely account level for a set of documents.
 *
 * If the first level contains exactly one folder across all files, that
 * folder is almost certainly a wrapper around the accounts (e.g. the user
 * picked a parent that holds a single "Reports" folder). In that case the
 * accounts live one level deeper — unless the single folder itself looks
 * like an account (purely numeric, e.g. the user picked the parent of a
 * single account "1000"), in which case level 1 is kept.
 */
export function detectAccountLevel(docs: ParsedDoc[]): number {
  const distinct = (level: number): number =>
    new Set(
      docs
        .map((d) => d.dir.split("/").filter(Boolean)[level - 1])
        .filter((s): s is string => Boolean(s)),
    ).size;
  if (distinct(1) === 1 && distinct(2) >= 2) {
    const first = docs.find((d) => d.dir)?.dir.split("/")[0] ?? "";
    if (!/^\d+$/.test(first)) return 2;
  }
  return 1;
}

/** Group parsed documents into version sets. Docs with errors are kept but
 *  excluded from comparison.
 *
 *  Versions are identified by folder + base name ONLY — the format is not
 *  part of the key, so the four exports of one report
 *  (customer_report_1000.csv/.docx/.rtf/.xlsx) are compared against each
 *  other as versions, even though their file names match. */
export function groupDocs(docs: ParsedDoc[], accountLevel = 1): DocGroup[] {
  const buckets = new Map<string, ParsedDoc[]>();
  for (const doc of docs) {
    const key = `${doc.dir}||${doc.stem.toLowerCase()}`;
    const list = buckets.get(key);
    if (list) {
      list.push(doc);
    } else {
      buckets.set(key, [doc]);
    }
  }

  const groups: DocGroup[] = [];
  for (const [key, list] of buckets) {
    const [dir, stem] = key.split("||");
    list.sort((a, b) => {
      const byVersion = naturalCompare(a.versionTag, b.versionTag);
      if (byVersion !== 0) return byVersion;
      return a.fileName.localeCompare(b.fileName);
    });
    const formats = Array.from(new Set(list.map((d) => d.ext))).sort();
    groups.push({
      id: key,
      dir,
      ...resolveHierarchy(dir, accountLevel),
      stem,
      formats,
      docs: list,
    });
  }
  groups.sort((a, b) => a.dir.localeCompare(b.dir) || a.stem.localeCompare(b.stem));
  return groups;
}

/** Docs in a group that parsed successfully (these participate in diffs). */
export function comparableDocs(group: DocGroup): ParsedDoc[] {
  return group.docs.filter((d) => !d.error && d.content !== undefined);
}

/**
 * Default reference for a group, following the format chain:
 * PDF → DOCX → RTF among text versions, XLSX → XLS → CSV among spreadsheets.
 * Returns the index into `docs` (parsed, comparable documents).
 */
export function defaultRefIndex(docs: ParsedDoc[]): number {
  const priority: DocKind[] = ["pdf", "docx", "rtf", "xlsx", "xls", "csv"];
  for (const ext of priority) {
    const idx = docs.findIndex((d) => d.ext === ext);
    if (idx >= 0) return idx;
  }
  return 0;
}
