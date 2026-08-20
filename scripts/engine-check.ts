/**
 * Temporary engine verification — exercises grouping, text diffing, sheet
 * diffing, and fingerprint matching outside the browser. Run with:
 *   bun run scripts/engine-check.ts
 */
import { splitVersion, groupDocs } from "../src/lib/validator/grouping";
import { compareTextVersions } from "../src/lib/validator/diff";
import { compareSheetVersions } from "../src/lib/validator/sheets";
import { compareFieldVersions } from "../src/lib/validator/fields";
import { buildReportModel } from "../src/lib/validator/report";
import { buildHtmlReport, buildXlsxReport } from "../src/lib/validator/export";
import * as XLSX from "xlsx";
import { rtfToText } from "../src/lib/validator/rtf";
import {
  buildIgnoreMatcher,
  computeFingerprint,
  fingerprintOf,
} from "../src/lib/validator/ignore";
import type { ParsedDoc } from "../src/lib/validator/types";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function doc(
  path: string,
  stem: string,
  version: string,
  ext: ParsedDoc["ext"],
  content: ParsedDoc["content"],
): ParsedDoc {
  return {
    id: path,
    path,
    dir: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
    fileName: path.split("/").pop() as string,
    ext,
    stem,
    versionTag: version,
    size: 1,
    content,
  };
}

// ── 1. Version splitting ──────────────────────────────────────────────
check("split salesreport_2608041001", splitVersion("salesreport_2608041001.docx").stem === "salesreport");
check("version tag 2608041001", splitVersion("salesreport_2608041001.docx").version === "2608041001");
check("split q1_report_final", splitVersion("q1_report_final.docx").stem === "q1_report");
check("version tag final", splitVersion("q1_report_final.docx").version === "final");
check("split invoice_v2", splitVersion("invoice_v2.xlsx").version === "v2");
check("no token stays whole", splitVersion("customer_report.docx").stem === "customer_report");

// ── 2. Grouping ───────────────────────────────────────────────────────
const textA1 = doc("Package 1/Non-Phi/salesreport_2608041001.docx", "salesreport", "2608041001", "docx", { type: "text", lines: ["a", "b"] });
const textA2 = doc("Package 1/Non-Phi/salesreport_2608041002.docx", "salesreport", "2608041002", "docx", { type: "text", lines: ["a", "b"] });
const textA3 = doc("Package 1/Non-Phi/salesreport_2608041003.docx", "salesreport", "2608041003", "docx", { type: "text", lines: ["a", "b"] });
const csv1 = doc("Package 1/Non-Phi/salesreport_2608041001.csv", "salesreport", "2608041001", "csv", { type: "sheet", sheets: [{ name: "S", rows: [["a"]] }] });
const other = doc("Package 1/Non-Phi/customer_report_2608041001.docx", "customer_report", "2608041001", "docx", { type: "text", lines: ["x"] });

const groups = groupDocs([textA1, textA2, textA3, csv1, other]);
const salesGroup = groups.find((g) => g.stem === "salesreport");
check("same-stem group has 4 versions (3 docx + csv)", salesGroup?.docs.length === 4, String(salesGroup?.docs.length));
check("formats collected", salesGroup?.formats.join(",") === "csv,docx");
check("customer group exists", groups.some((g) => g.stem === "customer_report"));
check("account = top-level folder", salesGroup?.account === "Package 1");

// ── 3. Text diff ──────────────────────────────────────────────────────
const refText = doc("r.docx", "r", "1", "docx", {
  type: "text",
  lines: ["Line one", "Total: $1,240,000", "Line three", "Line four"],
});
const v2Text = doc("v2.docx", "r", "2", "docx", {
  type: "text",
  lines: ["Line one", "Total: $1,280,000", "Line three", "Line four"],
});
const v3Text = doc("v3.docx", "r", "3", "docx", {
  type: "text",
  lines: ["Line one", "Total: $1,280,000", "Line three", "Line four changed"],
});
const textDiffs = compareTextVersions(
  { id: "g1", account: "Package 1", stem: "r" },
  refText,
  [v2Text, v3Text],
);
// Per-line records: line 2 and line 4, each a clean single-line difference.
check("text diff is per-line (2 records)", textDiffs.length === 2, `got ${textDiffs.length}`);
const span1 = textDiffs.find((d) => d.locationSignature === "L2");
check("text record: clean line label", span1?.locationLabel === "Line 2", String(span1?.locationLabel));
check("span1 ref value is just the line", span1?.referenceText === "Total: $1,240,000");
check("span1 v2 changed", span1?.versions.find((v) => v.versionTag === "2")?.kind === "changed");
check("span1 v2 has word segments", (span1?.versions.find((v) => v.versionTag === "2")?.segments?.length ?? 0) > 0);
check("span1 v3 also changed", span1?.versions.find((v) => v.versionTag === "3")?.kind === "changed");
const span2 = textDiffs.find((d) => d.locationSignature === "L4");
check("span2 v2 unchanged", span2?.versions.find((v) => v.versionTag === "2")?.kind === "unchanged");
check("span2 v3 changed", span2?.versions.find((v) => v.versionTag === "3")?.kind === "changed");

// insertion-only
const insRef = doc("ir.docx", "ir", "1", "docx", { type: "text", lines: ["a"] });
const insV2 = doc("iv2.docx", "ir", "2", "docx", { type: "text", lines: ["a", "brand new line"] });
const insDiffs = compareTextVersions({ id: "g2", account: "A", stem: "ir" }, insRef, [insV2]);
check("insertion detected", insDiffs.length === 1 && insDiffs[0].versions[0].kind === "added");

// ── 4. Sheet diff ─────────────────────────────────────────────────────
const refSheet = doc("s.xlsx", "s", "1", "xlsx", {
  type: "sheet",
  sheets: [{ name: "Summary", rows: [["Header", "Value"], ["Net revenue", "1240000"], ["Costs", "50000"]] }],
});
const vSheet = doc("s2.xlsx", "s", "2", "xlsx", {
  type: "sheet",
  sheets: [{ name: "Summary", rows: [["Header", "Value"], ["Net revenue", "1280000"], ["Costs", "50000"], ["Extra", "1"]] }],
});
const sheetDiffs = compareSheetVersions({ id: "g3", account: "A", stem: "s" }, refSheet, [vSheet]);
check("cell change found", sheetDiffs.some((d) => d.differenceType === "cell_changed" && d.address === "B2" && d.referenceText === "1240000"));
check("rows added found", sheetDiffs.some((d) => d.differenceType === "rows_added"));
check("no false cell diffs on unchanged cell", !sheetDiffs.some((d) => d.address === "B3"));

// sheet removed (version has no sheets at all)
const noSheet = doc("s3.xlsx", "s", "3", "xlsx", { type: "sheet", sheets: [] });
const sheetDiffs2 = compareSheetVersions({ id: "g4", account: "A", stem: "s" }, refSheet, [noSheet]);
check("sheet removed detected", sheetDiffs2.some((d) => d.differenceType === "sheet_removed"));

// ── 4b. User scenario: same report exported to 4 formats, same base name ──
const csvDoc = doc("Non-Phi/customer_report_1000.csv", "customer_report", "1000", "csv", {
  type: "sheet",
  sheets: [{ name: "Sheet1", rows: [
    ["Account", "Customer", "Region", "Sales Amount", "Orders", "Manager", "Status", "Report Date"],
    ["1000", "Customer Alpha", "South", "1240000", "42", "Arun Kumar", "Active", "2026-08-01"],
  ] }],
});
const xlsxDoc = doc("Non-Phi/customer_report_1000.xlsx", "customer_report", "1000", "xlsx", {
  type: "sheet",
  sheets: [{ name: "Summary", rows: [
    ["Account", "Customer", "Region", "Sales Amount", "Orders", "Manager", "Status", "Report Date"],
    ["1000", "Customer Alpha", "South", "1280000", "42", "Arun Kumar", "Active", "2026-08-01"],
  ] }],
});
const docxDoc = doc("Non-Phi/customer_report_1000.docx", "customer_report", "1000", "docx", {
  type: "text",
  lines: ["Customer Report", "Account: 1000", "Customer: Customer Alpha", "Region: South", "Sales Amount: 1240000", "Orders: 42", "Manager: Arun Kumar", "Status: Active", "Report Date: 2026-08-01"],
});
const rtfDoc = doc("Non-Phi/customer_report_1000.rtf", "customer_report", "1000", "rtf", {
  type: "text",
  lines: ["Customer Report", "Account: 1000", "Customer: Customer Alpha", "Region: South", "Sales Amount: 1240000", "Orders: 42", "Manager: Arun Kumar", "Status: Active", "Report Date: 2026-08-01"],
});
const userGroups = groupDocs([csvDoc, xlsxDoc, docxDoc, rtfDoc]);
const userGroup = userGroups[0];
check("4 same-name files → one group of 4", userGroups.length === 1 && userGroup.docs.length === 4, JSON.stringify(userGroups.map((g) => g.docs.length)));
check("group formats", userGroup.formats.join(",") === "csv,docx,rtf,xlsx");
// All-sheet comparison: positional matching aligns CSV "Sheet1" with XLSX "Summary".
const xSheetDiffs = compareSheetVersions({ id: "g5", account: "Package 1", stem: "customer_report" }, csvDoc, [xlsxDoc]);
check("cross-format sheets matched positionally (no added/removed)", !xSheetDiffs.some((d) => d.differenceType === "sheet_added" || d.differenceType === "sheet_removed"));
check("cross-format cell change found at D2", xSheetDiffs.some((d) => d.differenceType === "cell_changed" && d.address === "D2" && d.referenceText === "1240000"));
// Mixed-format comparison: the user's exact case — one group, compared via
// the field engine, with only the value change surfaced and no sheet noise.
const mixedDiffs = compareFieldVersions(
  { id: userGroup.id, account: userGroup.account, stem: userGroup.stem },
  csvDoc,
  [xlsxDoc, docxDoc, rtfDoc],
);
check(
  "mixed group: exactly one difference, the value change",
  mixedDiffs.length === 1 && mixedDiffs[0].differenceType === "cell_changed",
  JSON.stringify(mixedDiffs.map((d) => `${d.differenceType}:${d.locationLabel}`)),
);
check(
  "mixed group: no sheet add/remove noise for text versions",
  !mixedDiffs.some((d) => d.differenceType === "sheet_added" || d.differenceType === "sheet_removed"),
);
check(
  "mixed group: clean field location + value",
  mixedDiffs[0].locationLabel === "Sheet1 → Sales Amount" && mixedDiffs[0].referenceText === "1240000" && mixedDiffs[0].versions.some((v) => v.text === "1280000"),
  JSON.stringify(mixedDiffs[0] && { loc: mixedDiffs[0].locationLabel, ref: mixedDiffs[0].referenceText }),
);

// ── 4b2. Field-aware mixed-format comparison ───────────────────────────
const fCsv = doc("Non-Phi/sales_report_1000.csv", "sales_report", "1000", "csv", {
  type: "sheet",
  sheets: [{ name: "Summary", rows: [
    ["Account", "Customer", "Region", "Sales Amount", "Orders", "Manager", "Status", "Report Date"],
    ["1000", "Customer Alpha", "South", "125000", "42", "Arun Kumar", "Active", "2026-08-01"],
  ] }],
});
const fXlsx = doc("Non-Phi/sales_report_1000.xlsx", "sales_report", "1000", "xlsx", {
  type: "sheet",
  sheets: [
    { name: "Summary", rows: [
      ["Account", "Customer", "Region", "Sales Amount", "Orders", "Manager", "Status", "Report Date"],
      ["1000", "Customer Alpha", "South", "127500", "42", "Arun Kumar", "Active", "2026-08-01"],
    ] },
    { name: "Details", rows: [["Metric", "Value"], ["Report", "Customer Report"]] },
  ],
});
const fDocx = doc("Non-Phi/sales_report_1000.docx", "sales_report", "1000", "docx", {
  type: "text",
  lines: [
    "Customer Report",
    "Account: 1000",
    "Customer: Customer Alpha",
    "Region: South",
    "Sales Amount: 125000",
    "Orders: 42",
    "Manager: Arun Kumar",
    "Status: Active",
    "Report Date: 2026-08-01",
  ],
});
const fRtf = doc("Non-Phi/sales_report_1000.rtf", "sales_report", "1000", "rtf", {
  type: "text",
  lines: [
    "Customer Report",
    "Account: 1000",
    "Customer: Customer Alpha",
    "Region: South",
    "Sales Amount: 125000",
    "Orders: 42",
    "Manager: Arun Kumar",
    "Status: Active",
    "Report Date: 2026-08-01",
  ],
});
const fGroup = groupDocs([fCsv, fDocx, fRtf, fXlsx])[0];
const fieldDiffs = compareFieldVersions(
  { id: fGroup.id, account: fGroup.account, stem: fGroup.stem },
  fCsv,
  [fDocx, fRtf, fXlsx],
);
check(
  "field engine: value change + genuinely extra sheet (no whole-doc dumps)",
  fieldDiffs.length === 2 && fieldDiffs.some((d) => d.differenceType === "cell_changed") && fieldDiffs.some((d) => d.differenceType === "sheet_added"),
  JSON.stringify(fieldDiffs.map((d) => `${d.differenceType}:${d.locationLabel}`)),
);
check(
  "field engine: no sheet noise for text versions",
  !fieldDiffs.some((d) => d.differenceType === "sheet_removed" || (d.differenceType === "sheet_added" && d.locationLabel === "Sheet “Summary” added")),
);
const fVal = fieldDiffs.find((d) => d.locationLabel === "Summary → Sales Amount");
check("field diff: clean baseline", fVal?.referenceText === "125000" && (fVal?.referenceText ?? "").length < 30);
check("field diff: only XLSX affected", fVal?.versions.filter((v) => v.kind === "changed").length === 1 && fVal?.versions.find((v) => v.kind === "changed")?.text === "127500");
check("field diff: docx + rtf unchanged", fVal?.versions.filter((v) => v.kind === "unchanged").length === 2);
const fSheet = fieldDiffs.find((d) => d.differenceType === "sheet_added");
check("field engine: extra sheet flagged", fSheet?.locationLabel === "Sheet “Details” added");

// Text mismatch: only the differing line is reported.
const fRtfAlt: ParsedDoc = {
  ...fRtf,
  content: {
    type: "text",
    lines: fRtf.content?.type === "text"
      ? fRtf.content.lines.map((l) => (l.startsWith("Manager:") ? "Manager: Ramesh Kumar" : l))
      : [],
  },
};
const fTextDiffs = compareFieldVersions({ id: "field-g2", account: "A", stem: "r" }, fDocx, [fRtfAlt]);
check(
  "field engine: text mismatch shows only the differing field",
  fTextDiffs.length === 1 && fTextDiffs[0]?.locationLabel === "Manager" && fTextDiffs[0]?.referenceText === "Arun Kumar" && fTextDiffs[0]?.versions[0]?.text === "Ramesh Kumar",
  JSON.stringify(fTextDiffs.map((d) => ({ loc: d.locationLabel, ref: d.referenceText, v: d.versions.map((x) => x.text) }))),
);

const fGroups = groupDocs([fCsv, fDocx, fRtf, fXlsx]);
const fModel = buildReportModel(
  fGroups,
  fieldDiffs,
  { files: 4, parsed: 4, failed: 0, groups: 1, comparableGroups: 1, differences: fieldDiffs.length, ignored: 0, types: {} },
  {},
  () => false,
);
const fIssue = fModel.hierarchy[0]?.packages[0]?.reports[0]?.issues.find((i) => i.differenceType === "VALUE_MISMATCH");
check("report: field location", fIssue?.location === "Summary → Sales Amount", String(fIssue?.location));
check("report: baseline + different version", fIssue?.baseline === "125000" && fIssue?.different === "XLSX = 127500");
check("report: human description", fIssue?.description === "XLSX sales amount differs from the other versions.", String(fIssue?.description));
check(
  "report: extra sheet description names the sheet",
  fModel.hierarchy[0]?.packages[0]?.reports[0]?.issues.find((i) => i.differenceType === "SHEET_MISMATCH")?.description === "XLSX includes an additional sheet “Details”.",
  String(fModel.hierarchy[0]?.packages[0]?.reports[0]?.issues.find((i) => i.differenceType === "SHEET_MISMATCH")?.description),
);

// ── 4c. Report model + HTML/XLSX builders ─────────────────────────────
const reportDiffs = compareSheetVersions(
  { id: userGroups[0].id, account: userGroups[0].account, stem: userGroups[0].stem },
  csvDoc,
  [xlsxDoc],
);
const model = buildReportModel(
  userGroups,
  reportDiffs,
  {
    files: 4,
    parsed: 4,
    failed: 0,
    groups: 1,
    comparableGroups: 1,
    differences: reportDiffs.length,
    ignored: 0,
    types: {},
  },
  {},
  () => false,
);
check("model: 1 account, 1 report", model.accounts === 1 && model.reports === 1 && model.hierarchy[0]?.packages[0]?.reports[0]?.reportName === "Customer Report");
check("model: files compared + versions per report", model.filesCompared === 4 && model.versionsPerReport === 4);
const modelIssue = model.hierarchy[0]?.packages[0]?.reports[0]?.issues[0];
check("model issue: VALUE_MISMATCH", modelIssue?.differenceType === "VALUE_MISMATCH");
check("model issue: location uses column header", modelIssue?.location === "Sheet1 → Sales Amount", String(modelIssue?.location));
check("model issue: baseline + different", modelIssue?.baseline === "1240000" && modelIssue?.different === "XLSX = 1280000");
check("model issue: severity + status", modelIssue?.severity === "Medium" && modelIssue?.status === "Reported");
check("model: version rows", model.versionRows.length === 4 && model.versionRows[0]?.version === "V1" && model.versionRows[0]?.role === "Baseline" && model.versionRows[0]?.result === "Different", JSON.stringify(model.versionRows));

const htmlReport = buildHtmlReport(model);
check("html report: title + banner", htmlReport.includes("Document Version Validation Report") && htmlReport.includes("DOCUMENT VERSION VALIDATION REPORT") === false);
check("html report: issue card", htmlReport.includes("VALUE_MISMATCH") && htmlReport.includes("Sheet1 → Sales Amount") && htmlReport.includes("View details"));

const xlsxBuffer = buildXlsxReport(model);
const magic = String.fromCharCode(...new Uint8Array(xlsxBuffer.slice(0, 2)));
check("xlsx report: valid zip container", magic === "PK", magic);
const wb2 = XLSX.read(xlsxBuffer, { type: "array" });
check(
  "xlsx report: four sheets in order",
  wb2.SheetNames.join(",") ===
    "Executive Summary,Reported Issues,Validation Hierarchy,Version Details",
  wb2.SheetNames.join(","),
);
const issueSheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb2.Sheets["Reported Issues"], { defval: "" });
check(
  "xlsx issues sheet: VALUE_MISMATCH row",
  issueSheetRows[0]?.["Difference Type"] === "VALUE_MISMATCH" &&
    issueSheetRows[0]?.["Baseline"] === "1240000" &&
    issueSheetRows[0]?.["Severity"] === "Medium" &&
    issueSheetRows[0]?.["Status"] === "Reported",
  JSON.stringify(issueSheetRows[0]),
);

// ── 5. RTF ────────────────────────────────────────────────────────────
const rtf = String.raw`{\rtf1\ansi\ansicpg1252{\fonttbl{\f0\fnil\fcharset0 Arial;}}\f0\fs20 Hello \b world\b0\par Total: \$1,240,000{\*\fldinst{HYPERLINK}}{}\par}`;
const rtfOut = rtfToText(rtf);
check("rtf extracts text", rtfOut.includes("Hello world"), JSON.stringify(rtfOut));
check("rtf decodes dollars", rtfOut.includes("$1,240,000"));
check("rtf skips font table", !rtfOut.toLowerCase().includes("fonttbl"));

// ── 6. Fingerprints & ignore matching ─────────────────────────────────
const sampleDiff = {
  id: "d1",
  groupId: "g1",
  groupLabel: "salesreport.docx",
  account: "Package 1",
  docType: "docx" as const,
  differenceType: "text_changed" as const,
  comparisonMode: "reference" as const,
  locationSignature: "L2",
  locationLabel: "Line 2",
  referenceText: "Total: $1,240,000",
  versions: [],
};
const parts = await computeFingerprint(sampleDiff);
const fp = fingerprintOf(parts);
check("account hash is 64 hex chars", /^[0-9a-f]{64}$/.test(parts.accountHash));
check("fingerprint includes all hashes", fp.includes(parts.accountHash) && fp.includes(parts.reportHash) && fp.includes(parts.locationHash));
check("fingerprint is stable", fp === fingerprintOf(await computeFingerprint(sampleDiff)));

const sessionOnly = new Set<string>();
const matcherEmpty = buildIgnoreMatcher([], sessionOnly);
check("no rules → no match", matcherEmpty.match(parts) === null);

// location rule
const locationRule = {
  _id: "r1",
  scope: "location" as const,
  fingerprint: fp,
  accountHash: parts.accountHash,
  reportHash: parts.reportHash,
  locationHash: parts.locationHash,
  docType: "docx",
  differenceType: "text_changed",
  comparisonMode: "reference",
  createdAt: 0,
};
const matcherLocation = buildIgnoreMatcher([locationRule], new Set());
check("location rule matches", matcherLocation.match(parts)?.scope === "location");

// report rule suppresses a different location in the same report
const reportRule = {
  _id: "r2",
  scope: "report" as const,
  fingerprint: "x",
  accountHash: parts.accountHash,
  reportHash: parts.reportHash,
  locationHash: undefined,
  docType: "docx",
  differenceType: "text_changed",
  comparisonMode: "reference",
  createdAt: 0,
};
const matcherReport = buildIgnoreMatcher([reportRule], new Set());
const otherLoc = { ...sampleDiff, locationSignature: "L99", id: "d2" };
const otherParts = await computeFingerprint(otherLoc);
check("report rule matches another location", matcherReport.match(otherParts)?.scope === "report");

// global rule
const globalRule = {
  _id: "r3",
  scope: "global" as const,
  fingerprint: "y",
  accountHash: undefined,
  reportHash: undefined,
  locationHash: undefined,
  docType: "docx",
  differenceType: "text_changed",
  comparisonMode: "reference",
  createdAt: 0,
};
const matcherGlobal = buildIgnoreMatcher([globalRule], new Set());
check("global rule matches", matcherGlobal.match(otherParts)?.scope === "global");

// session occurrence beats persisted
const sessionMatcher = buildIgnoreMatcher([locationRule], new Set([fp]));
check("session occurrence matches first", sessionMatcher.match(parts)?.scope === "occurrence");

// account hash differs between accounts
const otherAccount = await computeFingerprint({ ...sampleDiff, account: "Package 2" });
check("account hash varies", otherAccount.accountHash !== parts.accountHash);

console.log(failures === 0 ? "\nAll checks passed ✅" : `\n${failures} check(s) failed ❌`);
process.exit(failures === 0 ? 0 : 1);
