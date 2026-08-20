import { comparableDocs, naturalCompare } from "./grouping";
import type {
  ComparisonPair,
  DiffRecord,
  DiffType,
  DocGroup,
  ParsedDoc,
  RunStats,
} from "./types";

/**
 * Report model — a normalized, hierarchy-aware view of a validation run,
 * shared by the HTML and XLSX report builders.
 *
 * The hierarchy mirrors the reference report structure:
 *   Account (top-level folder) → Package → Category → Report → Issues
 * and issues carry an audit-style vocabulary (severity, difference type,
 * baseline, differing versions, description, status).
 */

export type ReportSeverity = "High" | "Medium" | "Low";

export interface ReportIssue {
  account: string;
  packageName: string;
  category: string;
  reportName: string;
  groupId: string;
  versionsLabel: string;
  location: string;
  differenceType: string;
  severity: ReportSeverity;
  /** File name of the reference version the issue is measured against. */
  baselineFile: string;
  /** Format of the baseline document. */
  baselineFormat: string;
  /** File name of the comparing document. */
  comparingFile: string;
  /** Format of the comparing document. */
  comparingFormat: string;
  /** The comparison chain label, e.g. "PDF → RTF". */
  comparisonType: string;
  baseline: string;
  different: string;
  /** Detailed, user-friendly description of the difference. */
  description: string;
  status: "Reported" | "Ignored";
  details: Array<{ fileName: string; text: string }>;
}

export interface ReportNode {
  reportName: string;
  /** Third path segment, e.g. "Non-Phi" ("" when absent). */
  category: string;
  versionsLabel: string;
  issues: ReportIssue[];
  /** Whether ALL comparisons matched (no differences). */
  allMatched: boolean;
}

export interface ReportPackage {
  /** Second path segment, e.g. "Package 1". */
  packageName: string;
  /** First category name seen in this package (for display). */
  category: string;
  /** Distinct category names inside this package. */
  categories: string[];
  label: string;
  reports: ReportNode[];
  issueCount: number;
}

export interface ReportAccount {
  account: string;
  packages: ReportPackage[];
  issueCount: number;
}

export interface VersionRow {
  account: string;
  packageName: string;
  category: string;
  reportName: string;
  version: string;
  file: string;
  format: string;
  role: string;
  result: string;
}

export interface ComparisonChainRow {
  account: string;
  packageName: string;
  category: string;
  reportName: string;
  baselineFormat: string;
  comparingFormat: string;
  chainLabel: string;
  result: string;
  differenceCount: number;
}

export interface ReportModel {
  generatedAt: string;
  validationStatus: string;
  accounts: number;
  /** Actual account folder names, e.g. ["1000", "1001", "1002", "1003"]. */
  accountNames: string[];
  packages: number;
  categories: number;
  reports: number;
  versionsPerReport: number;
  filesCompared: number;
  comparisons: number;
  reportedIssues: number;
  ignoredIssues: number;
  matches: number;
  processingErrors: number;
  hierarchy: ReportAccount[];
  versionRows: VersionRow[];
  comparisonChains: ComparisonChainRow[];
  errors: RunStats["errors"];
}

const TYPE_MAP: Record<string, { code: string; severity: ReportSeverity }> = {
  cell_changed: { code: "VALUE_MISMATCH", severity: "Medium" },
  text_changed: { code: "TEXT_MISMATCH", severity: "Medium" },
  header_changed: { code: "COLUMN_NAME_MISMATCH", severity: "Medium" },
  rows_added: { code: "ROW_COUNT_MISMATCH", severity: "High" },
  rows_removed: { code: "ROW_COUNT_MISMATCH", severity: "High" },
  cols_added: { code: "COLUMN_COUNT_MISMATCH", severity: "High" },
  cols_removed: { code: "COLUMN_COUNT_MISMATCH", severity: "High" },
  sheet_added: { code: "SHEET_MISMATCH", severity: "High" },
  sheet_removed: { code: "SHEET_MISMATCH", severity: "High" },
  sheet_renamed: { code: "SHEET_NAME_MISMATCH", severity: "Low" },
  missing_content: { code: "MISSING_CONTENT", severity: "High" },
  added_content: { code: "ADDED_CONTENT", severity: "Medium" },
  value_mismatch: { code: "VALUE_MISMATCH", severity: "Medium" },
  format_mismatch: { code: "FORMAT_MISMATCH", severity: "Low" },
  font_mismatch: { code: "FONT_MISMATCH", severity: "Low" },
  font_size_mismatch: { code: "FONT_SIZE_MISMATCH", severity: "Low" },
  image_added: { code: "IMAGE_ADDED", severity: "Medium" },
  image_removed: { code: "IMAGE_REMOVED", severity: "High" },
  image_count_mismatch: { code: "IMAGE_COUNT_MISMATCH", severity: "Medium" },
  number_format_mismatch: { code: "NUMBER_FORMAT_MISMATCH", severity: "Low" },
  date_format_mismatch: { code: "DATE_FORMAT_MISMATCH", severity: "Low" },
  currency_format_mismatch: { code: "CURRENCY_FORMAT_MISMATCH", severity: "Low" },
  exact_match: { code: "MATCH", severity: "Low" },
};

/** "sales_report" / "customerReport" → "Sales Report". */
export function humanize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();
}

function oneLine(value: string, max = 120): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function extUpper(fileName: string): string {
  const m = /\\.([^.]+)$/.exec(fileName);
  return (m ? m[1] : fileName).toUpperCase();
}

/** "DOCX · XLSX · RTF · CSV" — formats in version order, deduplicated. */
export function versionsLabelOf(group: DocGroup): string {
  const seen: string[] = [];
  for (const doc of comparableDocs(group)) {
    const up = doc.ext.toUpperCase();
    if (!seen.includes(up)) seen.push(up);
  }
  return seen.join(" · ");
}

/** For cell diffs: "Summary → Sales Amount" */
function cellLocation(
  diff: DiffRecord,
  group: DocGroup | undefined,
  refIndexByGroup: Record<string, number>,
): string {
  if (diff.differenceType !== "cell_changed" || !diff.sheet || !diff.address) {
    return diff.locationLabel;
  }
  const m = /^([A-Z]+)(\d+)$/.exec(diff.address);
  if (!m || !group) return diff.locationLabel;
  const rowIndex = parseInt(m[2], 10) - 1;
  const colIndex = m[1]
    .split("")
    .reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  const comparable = comparableDocs(group);
  const refIndex = Math.min(
    refIndexByGroup[group.id] ?? 0,
    comparable.length - 1,
  );
  const reference = comparable[refIndex];
  const sheet = (reference.content?.type === "sheet"
    ? reference.content.sheets.find((s) => s.name === diff.sheet)
    : undefined);
  const headerRow = sheet?.rows[0];
  const header = headerRow?.[colIndex]?.trim();
  if (header) return `${diff.sheet} → ${header}`;
  const row = sheet?.rows[rowIndex];
  const label = row?.find((c) => c.trim() !== "")?.trim();
  return label ? `${diff.sheet} → ${label}` : `${diff.sheet} → ${diff.address}`;
}

/**
 * Generate a detailed, non-vague description for a diff record.
 * Enhanced to provide user-friendly explanations.
 */
function describe(diff: DiffRecord, who: string, location: string): string {
  // Use the detailed description from the diff record if available
  if (diff.detailedDescription) return diff.detailedDescription;

  // Fallback for legacy diff records
  const field = location.includes("→")
    ? location.split("→")[1].trim().toLowerCase()
    : "";
  const baseline = diff.baselineFormat?.toUpperCase() ?? "BASELINE";
  const comparing = diff.comparingFormat?.toUpperCase() ?? "COMPARING";

  switch (diff.differenceType) {
    case "cell_changed":
      return field
        ? `The baseline ${baseline} contains the field "${field}" with value "${oneLine(diff.referenceText, 80)}". The comparing ${comparing} has a different value. This is a value mismatch.`
        : `The baseline ${baseline} and comparing ${comparing} contain different values at this location. This is a value mismatch.`;
    case "header_changed": {
      const name = location.match(/Column "([^"]+)"/)?.[1] ?? "";
      return name
        ? `The column "${name}" is named differently in ${comparing} compared to ${baseline}.`
        : `${comparing} uses a different column name than ${baseline} here.`;
    }
    case "sheet_renamed": {
      const name = diff.sheet ?? location.match(/Sheet "([^"]+)"/)?.[1] ?? "";
      return name
        ? `The sheet "${name}" is named differently in ${comparing}.`
        : `${comparing} names a sheet differently.`;
    }
    case "text_changed": {
      const snippet = oneLine(diff.referenceText, 80);
      return snippet
        ? `The baseline ${baseline} contains the text "${snippet}" at ${location}. The comparing ${comparing} has different text at this position.`
        : `${comparing} text differs from ${baseline} at ${location}.`;
    }
    case "rows_added":
      return `${comparing} contains additional rows compared to ${baseline}.`;
    case "rows_removed":
      return `${comparing} is missing rows compared to ${baseline}.`;
    case "cols_added":
      return `${comparing} contains additional columns compared to ${baseline}.`;
    case "cols_removed":
      return `${comparing} is missing columns compared to ${baseline}.`;
    case "sheet_added":
    case "sheet_removed": {
      const name = diff.locationLabel.match(/"([^"]+)"/)?.[1] ?? diff.sheet ?? "?";
      return diff.differenceType === "sheet_added"
        ? `${comparing} includes an additional sheet "${name}".`
        : `${comparing} is missing sheet "${name}".`;
    }
    default:
      return `${comparing} differs from ${baseline} at ${location}.`;
  }
}

export function buildReportModel(
  groups: DocGroup[],
  diffs: DiffRecord[],
  stats: RunStats,
  refIndexByGroup: Record<string, number>,
  isIgnored: (diff: DiffRecord) => boolean,
): ReportModel {
  const issuesByGroup = new Map<string, ReportIssue[]>();
  const pushIssue = (groupId: string, issue: ReportIssue) => {
    const list = issuesByGroup.get(groupId);
    if (list) list.push(issue);
    else issuesByGroup.set(groupId, [issue]);
  };

  for (const diff of diffs) {
    const group = groups.find((g) => g.id === diff.groupId);
    const account = group?.account ?? "(root)";
    const packageName = group?.packageName ?? "(root)";
    const category = group?.category ?? "";
    const tm =
      TYPE_MAP[diff.differenceType] ?? {
        code: diff.differenceType.toUpperCase(),
        severity: "Medium" as ReportSeverity,
      };
    const changed = diff.versions.filter((v) => v.kind !== "unchanged");
    const who = Array.from(new Set(changed.map((v) => extUpper(v.fileName)))).join(
      " and ",
    );
    const location = diff.locationLabel;
    const baseline = oneLine(diff.referenceText);
    const baselineFile = diff.referenceFile || "Baseline";
    const comparingFile = diff.comparingFile || changed[0]?.fileName || "";
    const comparisonType = `${(diff.baselineFormat ?? "").toUpperCase()} → ${(diff.comparingFormat ?? "").toUpperCase()}`;
    const different = changed
      .map((v) => `${extUpper(v.fileName)} = ${oneLine(v.text, 160)}`)
      .join(", ");

    pushIssue(diff.groupId, {
      account,
      packageName,
      category,
      reportName: humanize(group?.stem ?? diff.groupLabel),
      groupId: diff.groupId,
      versionsLabel: group ? versionsLabelOf(group) : "",
      location,
      differenceType: tm.code,
      severity: tm.severity,
      baselineFile,
      baselineFormat: (diff.baselineFormat ?? "").toUpperCase(),
      comparingFile,
      comparingFormat: (diff.comparingFormat ?? "").toUpperCase(),
      comparisonType,
      baseline,
      different,
      description: describe(diff, who || "A version", location),
      status: isIgnored(diff) ? "Ignored" : "Reported",
      details: [
        { fileName: baselineFile, text: baseline },
        ...changed.map((v) => ({ fileName: v.fileName, text: oneLine(v.text) })),
      ],
    });
  }

  // ── Hierarchy: account → package(·category) → report ────────────────────
  const accounts = new Map<string, Map<string, ReportPackage>>();

  for (const group of groups) {
    const accountName = group.account;
    const packageName = group.packageName;
    const category = group.category;
    const label = category ? `${packageName} · ${category}` : packageName;
    const issues = issuesByGroup.get(group.id) ?? [];
    const node: ReportNode = {
      reportName: humanize(group.stem),
      category,
      versionsLabel: versionsLabelOf(group),
      issues,
      allMatched: issues.filter((i) => i.status === "Reported").length === 0,
    };

    let packages = accounts.get(accountName);
    if (!packages) {
      packages = new Map();
      accounts.set(accountName, packages);
    }
    const pkgLabel = packageName || "(root)";
    let pkg = packages.get(pkgLabel);
    if (!pkg) {
      pkg = {
        packageName,
        category,
        categories: [],
        label: pkgLabel,
        reports: [],
        issueCount: 0,
      };
      packages.set(pkgLabel, pkg);
    }
    if (category && !pkg.categories.includes(category)) {
      pkg.categories.push(category);
    }
    pkg.reports.push(node);
  }

  const hierarchy: ReportAccount[] = [];
  for (const [accountName, packages] of accounts) {
    const pkgList: ReportPackage[] = [];
    for (const [label, pkg] of packages) {
      pkg.categories.sort((a, b) => naturalCompare(a, b));
      pkg.reports.sort((a, b) => naturalCompare(a.reportName, b.reportName));
      pkg.issueCount = pkg.reports.reduce(
        (sum, r) => sum + r.issues.length,
        0,
      );
      pkgList.push(pkg);
    }
    pkgList.sort((a, b) => naturalCompare(a.label, b.label));
    hierarchy.push({
      account: accountName,
      packages: pkgList,
      issueCount: pkgList.reduce((sum, p) => sum + p.issueCount, 0),
    });
  }
  hierarchy.sort((a, b) => naturalCompare(a.account, b.account));

  // ── Version detail rows ─────────────────────────────────────────────────
  const versionRows: VersionRow[] = [];
  for (const group of groups) {
    const comparable = comparableDocs(group);
    if (comparable.length === 0) continue;
    const refIndex = Math.min(
      refIndexByGroup[group.id] ?? 0,
      comparable.length - 1,
    );
    const hasIssues = (issuesByGroup.get(group.id)?.length ?? 0) > 0;
    comparable.forEach((doc: ParsedDoc, i: number) => {
      versionRows.push({
        account: group.account,
        packageName: group.packageName,
        category: group.category,
        reportName: humanize(group.stem),
        version: `V${i + 1}`,
        file: doc.fileName,
        format: doc.ext.toUpperCase(),
        role: i === refIndex ? "Baseline" : "Compared",
        result: hasIssues ? "Different" : "Matches",
      });
    });
  }

  // ── Comparison chain rows ───────────────────────────────────────────────
  const comparisonChains: ComparisonChainRow[] = [];
  const chainPairsByGroup = new Map<string, Map<string, number>>();
  for (const diff of diffs) {
    const key = `${diff.groupId}|${diff.baselineFormat}→${diff.comparingFormat}`;
    const map = chainPairsByGroup.get(diff.groupId) ?? new Map();
    map.set(key, (map.get(key) ?? 0) + 1);
    chainPairsByGroup.set(diff.groupId, map);
  }
  for (const group of groups) {
    const chainMap = chainPairsByGroup.get(group.id);
    if (!chainMap) continue;
    const account = group.account;
    const packageName = group.packageName;
    const category = group.category;
    const reportName = humanize(group.stem);
    for (const [key, count] of chainMap) {
      const [, pairStr] = key.split("|");
      const [baseFmt, compFmt] = pairStr.split("→");
      comparisonChains.push({
        account,
        packageName,
        category,
        reportName,
        baselineFormat: baseFmt,
        comparingFormat: compFmt,
        chainLabel: `${baseFmt} → ${compFmt}`,
        result: count > 0 ? "Differences Found" : "Match",
        differenceCount: count,
      });
    }
  }

  // ── Counts ──────────────────────────────────────────────────────────────
  const packageCount = hierarchy.reduce(
    (sum, a) => sum + a.packages.length,
    0,
  );
  const categorySet = new Set<string>();
  for (const account of hierarchy) {
    for (const pkg of account.packages) {
      for (const c of pkg.categories) categorySet.add(c);
    }
  }
  const comparableLengths = groups
    .map((g) => comparableDocs(g).length)
    .filter((n) => n > 0);
  const lengthFreq = new Map<number, number>();
  for (const n of comparableLengths) {
    lengthFreq.set(n, (lengthFreq.get(n) ?? 0) + 1);
  }
  let versionsPerReport = 1;
  let best = 0;
  for (const [n, freq] of lengthFreq) {
    if (freq > best) {
      best = freq;
      versionsPerReport = n;
    }
  }

  const allIssues = Array.from(issuesByGroup.values()).flat();
  const ignoredIssues = allIssues.filter((i) => i.status === "Ignored").length;

  return {
    generatedAt: new Date().toLocaleString(),
    validationStatus:
      stats.failed > 0 ? "Completed with errors" : "Completed",
    accounts: hierarchy.length,
    accountNames: hierarchy.map((a) => a.account),
    packages: packageCount,
    categories: categorySet.size,
    reports: groups.length,
    versionsPerReport,
    filesCompared: comparableLengths.reduce((sum, n) => sum + n, 0),
    comparisons: stats.comparisons,
    reportedIssues: allIssues.length - ignoredIssues,
    ignoredIssues,
    matches: stats.matches,
    processingErrors: stats.failed,
    hierarchy,
    versionRows,
    comparisonChains,
    errors: stats.errors,
  };
}
