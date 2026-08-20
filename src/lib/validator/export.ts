import * as XLSX from "xlsx";
import type {
  ReportAccount,
  ReportIssue,
  ReportModel,
  ReportNode,
  ReportPackage,
} from "./report";

/**
 * Report exports. Both formats are generated and downloaded entirely in the
 * browser — the data never leaves the device, and downloads are user-initiated.
 *
 *  HTML — interactive audit report: summary cards, search / severity filters,
 *         expand/collapse, and an Account → Package → Report hierarchy with
 *         issue cards.
 *  XLSX — multi-sheet workbook (Executive Summary, Reported Issues,
 *         Validation Hierarchy, Version Details).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain",
): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke once the browser has had a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

// ── HTML report ────────────────────────────────────────────────────────────

function issueHtml(issue: ReportIssue): string {
  const sevClass = issue.severity.toLowerCase();
  const detailRows = issue.details
    .map(
      (d) =>
        `<div class="det-row"><span class="det-name">${escapeHtml(d.fileName)}</span><span class="det-val">${escapeHtml(d.text) || "—"}</span></div>`,
    )
    .join("");
  const search =
    `${issue.account} ${issue.packageName} ${issue.category} ${issue.reportName} ${issue.location} ${issue.differenceType} ${issue.description}`.toLowerCase();
  return `<div class="issue" data-severity="${issue.severity}" data-search="${escapeHtml(search)}">
  <div class="issue-head">
    <span class="badge ${sevClass}">${issue.severity}</span>
    <span class="itype">${escapeHtml(issue.differenceType)}</span>
    ${issue.status === "Ignored" ? `<span class="badge ignored">Ignored</span>` : ""}
  </div>
  <div class="issue-grid">
    <div><span class="lbl">Location</span><span class="val">${escapeHtml(issue.location)}</span></div>
    <div><span class="lbl">Baseline file</span><span class="val mono">${escapeHtml(issue.baselineFile)}</span></div>
    <div><span class="lbl">Baseline</span><span class="val mono">${escapeHtml(issue.baseline) || "—"}</span></div>
    <div><span class="lbl">Different</span><span class="val mono">${escapeHtml(issue.different) || "—"}</span></div>
    <div><span class="lbl">Status</span><span class="val">${issue.status}</span></div>
  </div>
  <p class="issue-desc">${escapeHtml(issue.description)}</p>
  <button class="view-details" type="button">View details</button>
  <div class="issue-details" style="display:none">${detailRows}</div>
</div>`;
}

function reportHtml(node: ReportNode): string {
  const body =
    node.issues.length === 0
      ? `<div class="ok">✓ No differences detected</div>`
      : `<div class="issues">${node.issues.map(issueHtml).join("\n")}</div>`;
  const search =
    `${node.reportName} ${node.versionsLabel} ${node.issues.map((i) => `${i.location} ${i.description}`).join(" ")}`.toLowerCase();
  return `<details class="report" open data-search="${escapeHtml(search)}">
  <summary><span class="t-label">📄 ${escapeHtml(node.reportName)}</span>${node.category ? `<span class="cat">${escapeHtml(node.category)}</span>` : ""}<span class="cnt">${node.issues.length} issue(s)</span></summary>
  <div class="versions">Versions: ${escapeHtml(node.versionsLabel)}</div>
  ${body}
</details>`;
}

function packageHtml(pkg: ReportPackage): string {
  const cats = pkg.categories
    .map((c) => `<span class="cat">${escapeHtml(c)}</span>`)
    .join("");
  return `<details class="package" open>
  <summary><span class="t-label">📦 ${escapeHtml(pkg.label)}</span>${cats}<span class="cnt">${pkg.issueCount} issue(s)</span></summary>
  ${pkg.reports.map(reportHtml).join("\n")}
</details>`;
}

function accountHtml(account: ReportAccount): string {
  return `<details class="account" open>
  <summary><span class="t-label">🏢 ${escapeHtml(account.account)}</span><span class="cnt">${account.issueCount} issue(s)</span></summary>
  ${account.packages.map(packageHtml).join("\n")}
</details>`;
}

export function buildHtmlReport(model: ReportModel): string {
  const statCards: Array<[string, number]> = [
    ["Accounts", model.accounts],
    ["Reports", model.reports],
    ["Files Compared", model.filesCompared],
    ["Reported Issues", model.reportedIssues],
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Document Version Validation Report</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
  .banner { background: #1e3a5f; color: #fff; padding: 28px 32px 24px; }
  .banner h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.2px; }
  .banner p { margin: 6px 0 0; font-size: 13px; color: #b7c9dd; }
  main { max-width: 1060px; margin: 0 auto; padding: 20px 20px 48px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
  .stat .label { color: #64748b; font-size: 12px; }
  .stat .value { font-size: 26px; font-weight: 700; color: #1e3a5f; margin-top: 2px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 12px; align-items: center; }
  .actions input, .actions select { height: 36px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 10px; font-size: 13px; background: #fff; }
  .actions input { flex: 1; min-width: 220px; }
  .btn { height: 36px; border: none; border-radius: 8px; padding: 0 14px; font-size: 13px; font-weight: 600; background: #1e3a5f; color: #fff; cursor: pointer; }
  .btn:hover { background: #274b78; }
  .tree { display: flex; flex-direction: column; gap: 6px; }
  details { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; }
  details > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 12px 14px; font-size: 14px; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸"; color: #94a3b8; transition: transform 0.15s; }
  details[open] > summary::before { content: "▾"; }
  details.account > summary { font-weight: 700; }
  details.package { margin: 6px 12px 6px 26px; }
  details.package > summary { font-weight: 600; }
  details.report { margin: 6px 12px 6px 26px; }
  details.report > summary { font-weight: 600; }
  .t-label { flex: 1; }
  .cnt { font-size: 12px; color: #64748b; font-weight: 500; white-space: nowrap; }
  .cat { font-size: 11px; color: #1e3a5f; background: #e8eef5; border: 1px solid #d3deea; border-radius: 999px; padding: 1px 9px; font-weight: 500; white-space: nowrap; }
  .versions { margin: 0 14px 10px 14px; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; font-size: 12px; color: #475569; }
  .issues { margin: 0 14px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
  .issue { border: 1px solid #fecaca; border-radius: 10px; background: #fef2f2; padding: 12px 14px; }
  .issue-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .badge { border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700; color: #fff; }
  .badge.high { background: #dc2626; }
  .badge.medium { background: #d97706; }
  .badge.low { background: #64748b; }
  .badge.ignored { background: #94a3b8; }
  .itype { font-weight: 700; font-size: 14px; color: #1e293b; }
  .issue-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .issue-grid > div { background: #fff; border: 1px solid #fde2e2; border-radius: 8px; padding: 8px 10px; }
  .lbl { display: block; font-size: 11px; color: #64748b; margin-bottom: 3px; }
  .val { font-size: 13px; font-weight: 600; color: #1e293b; }
  .val.mono { font-family: ui-monospace, "Cascadia Code", monospace; font-size: 12px; word-break: break-word; }
  .issue-desc { margin: 10px 0 0; font-size: 13px; color: #7f1d1d; }
  .view-details { margin-top: 10px; height: 32px; border: none; border-radius: 8px; padding: 0 12px; font-size: 12px; font-weight: 600; background: #1e3a5f; color: #fff; cursor: pointer; }
  .issue-details { margin-top: 10px; border-top: 1px dashed #fca5a5; padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .det-row { display: flex; gap: 10px; font-size: 12px; }
  .det-name { min-width: 120px; color: #64748b; }
  .det-val { font-family: ui-monospace, monospace; color: #1e293b; white-space: pre-wrap; word-break: break-word; }
  .ok { margin: 0 14px 14px 14px; border: 1px solid #bbf7d0; background: #f0fdf4; color: #15803d; border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 500; }
  .foot { margin-top: 28px; color: #94a3b8; font-size: 12px; text-align: center; }
</style>
</head>
<body>
  <header class="banner">
    <h1>Document Version Validation Report</h1>
    <p>${escapeHtml(model.validationStatus)} · generated ${escapeHtml(model.generatedAt)} · processed locally, nothing uploaded</p>
  </header>
  <main>
    <div class="stats">
      ${statCards
        .map(
          ([label, value]) =>
            `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`,
        )
        .join("")}
    </div>

    <div class="actions">
      <input id="q" type="search" placeholder="Search account, report, issue…" />
      <select id="sev">
        <option value="all">All severities</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <button class="btn" id="expandAll" type="button">Expand all</button>
      <button class="btn" id="collapseAll" type="button">Collapse all</button>
    </div>

    <div class="tree" id="tree">
      ${model.hierarchy.map(accountHtml).join("\n") || "<p>No reports found.</p>"}
    </div>

    <p class="foot">Generated by Document Version Validator. Report data exists only in this downloaded file.</p>
  </main>

<script>
(function () {
  var tree = document.getElementById("tree");
  function visibleCards(scope) {
    var cards = scope.querySelectorAll(".issue");
    var n = 0;
    for (var i = 0; i < cards.length; i++) if (cards[i].style.display !== "none") n++;
    return n;
  }
  function updateCounts() {
    var reports = tree.querySelectorAll("details.report");
    for (var i = 0; i < reports.length; i++) {
      var r = reports[i];
      var n = visibleCards(r);
      r.querySelector(".cnt").textContent = n + " issue(s)";
      var show = n > 0 || r.querySelectorAll(".ok").length > 0;
      r.style.display = show ? "" : "none";
    }
    ["account", "package"].forEach(function (cls) {
      var nodes = tree.querySelectorAll("details." + cls);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var n = visibleCards(node);
        node.querySelector(".cnt").textContent = n + " issue(s)";
        node.style.display = n > 0 ? "" : "none";
      }
    });
  }
  function applySeverity(cards) {
    var sev = document.getElementById("sev").value;
    for (var i = 0; i < cards.length; i++) {
      cards[i].style.display = (sev === "all" || cards[i].getAttribute("data-severity") === sev) ? "" : "none";
    }
  }
  document.getElementById("expandAll").addEventListener("click", function () {
    var ds = tree.querySelectorAll("details");
    for (var i = 0; i < ds.length; i++) ds[i].open = true;
  });
  document.getElementById("collapseAll").addEventListener("click", function () {
    var ds = tree.querySelectorAll("details");
    for (var i = 0; i < ds.length; i++) ds[i].open = false;
  });
  document.getElementById("sev").addEventListener("change", function () {
    applySeverity(tree.querySelectorAll(".issue"));
    updateCounts();
  });
  document.getElementById("q").addEventListener("input", function () {
    var q = this.value.trim().toLowerCase();
    var reports = tree.querySelectorAll("details.report");
    for (var i = 0; i < reports.length; i++) {
      var r = reports[i];
      var show = !q || (r.getAttribute("data-search") || "").indexOf(q) !== -1;
      if (!show) {
        var cards = r.querySelectorAll(".issue");
        for (var j = 0; j < cards.length; j++) {
          if ((cards[j].getAttribute("data-search") || "").indexOf(q) !== -1) { show = true; break; }
        }
      }
      r.style.display = show ? "" : "none";
      if (show) applySeverity(r.querySelectorAll(".issue"));
    }
    updateCounts();
  });
  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target.closest) return;
    var btn = target.closest(".view-details");
    if (!btn) return;
    var details = btn.closest(".issue").querySelector(".issue-details");
    details.style.display = details.style.display === "none" ? "block" : "none";
  });
  updateCounts();
})();
</script>
</body>
</html>`;
}

// ── XLSX report ────────────────────────────────────────────────────────────

const HEADER_STYLE = {
  fill: { patternType: "solid", fgColor: { rgb: "1E3A5F" } },
  font: { bold: true, color: { rgb: "FFFFFF" } },
};

function styleCell(ws: XLSX.WorkSheet, r: number, c: number, s: unknown): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  (ws[addr] as { s?: unknown }).s = s;
}

function styleRow(ws: XLSX.WorkSheet, r: number, s: unknown): void {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let c = range.s.c; c <= range.e.c; c++) {
    styleCell(ws, r, c, s);
  }
}

export function buildXlsxReport(model: ReportModel): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  // ── Executive Summary ────────────────────────────────────────────────────
  const exec: Array<Array<string | number>> = [
    ["DOCUMENT VERSION VALIDATION REPORT"],
    [],
    ["Metric", "Value"],
    ["Validation Status", model.validationStatus],
    ["Accounts Processed", model.accountNames.join(", ")],
    ["Packages Processed", model.packages],
    ["Categories Processed", model.categories],
    ["Reports Processed", model.reports],
    ["Versions per Report", model.versionsPerReport],
    ["Files Compared", model.filesCompared],
    ["Reported Issues", model.reportedIssues],
    ["Ignored Issues", model.ignoredIssues],
    ["Processing Errors", model.processingErrors],
  ];
  const wsExec = XLSX.utils.aoa_to_sheet(exec);
  wsExec["!cols"] = [{ wch: 26 }, { wch: 16 }];
  wsExec["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  styleCell(wsExec, 0, 0, {
    font: { bold: true, sz: 16, color: { rgb: "1E3A5F" } },
  });
  styleRow(wsExec, 2, HEADER_STYLE);
  XLSX.utils.book_append_sheet(workbook, wsExec, "Executive Summary");

  // ── Reported Issues ──────────────────────────────────────────────────────
  const issueHeader = [
    "Account",
    "Package",
    "Category",
    "Report Name",
    "Baseline File",
    "Baseline Format",
    "Comparing File",
    "Comparing Format",
    "Comparison Type",
    "Location",
    "Difference Type",
    "Baseline Content",
    "Comparing Content",
    "Detailed Description",
    "Severity",
    "Decision",
    "Status",
  ];
  const issueRows: Array<Array<string | number>> = [];
  for (const account of model.hierarchy) {
    for (const pkg of account.packages) {
      for (const report of pkg.reports) {
        for (const issue of report.issues) {
          issueRows.push([
            issue.account,
            issue.packageName,
            issue.category,
            issue.reportName,
            issue.baselineFile,
            issue.baselineFormat,
            issue.comparingFile,
            issue.comparingFormat,
            issue.comparisonType,
            issue.location,
            issue.differenceType,
            issue.baseline,
            issue.different,
            issue.description,
            issue.severity,
            "REPORT",
            issue.status,
          ]);
        }
      }
    }
  }
  const wsIssues = XLSX.utils.aoa_to_sheet([issueHeader, ...issueRows]);
  styleRow(wsIssues, 0, HEADER_STYLE);
  wsIssues["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 26 },
    { wch: 12 },
    { wch: 26 },
    { wch: 12 },
    { wch: 14 },
    { wch: 28 },
    { wch: 20 },
    { wch: 18 },
    { wch: 26 },
    { wch: 50 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  if (issueRows.length > 0) {
    wsIssues["!autofilter"] = { ref: `A1:Q${issueRows.length + 1}` };
  }
  wsIssues["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, wsIssues, "Reported Issues");

  // ── Validation Hierarchy ─────────────────────────────────────────────────
  const hierarchyHeader = [
    "Account",
    "Package",
    "Category",
    "Report Name",
    "Versions",
    "Result",
    "Issue Count",
  ];
  const hierarchyRows: Array<Array<string | number>> = [];
  for (const account of model.hierarchy) {
    for (const pkg of account.packages) {
      for (const report of pkg.reports) {
        hierarchyRows.push([
          account.account,
          pkg.packageName,
          report.category,
          report.reportName,
          report.versionsLabel,
          report.issues.length > 0 ? "Issues Found" : "No Differences",
          report.issues.length,
        ]);
      }
    }
  }
  const wsHierarchy = XLSX.utils.aoa_to_sheet([hierarchyHeader, ...hierarchyRows]);
  styleRow(wsHierarchy, 0, HEADER_STYLE);
  wsHierarchy["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
  ];
  if (hierarchyRows.length > 0) {
    wsHierarchy["!autofilter"] = { ref: `A1:G${hierarchyRows.length + 1}` };
  }
  wsHierarchy["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, wsHierarchy, "Validation Hierarchy");

  // ── Version Details ──────────────────────────────────────────────────────
  const versionHeader = [
    "Account",
    "Package",
    "Category",
    "Report Name",
    "Version",
    "File",
    "Format",
    "Role",
    "Comparison Result",
  ];
  const versionRows = model.versionRows.map((row) => [
    row.account,
    row.packageName,
    row.category,
    row.reportName,
    row.version,
    row.file,
    row.format,
    row.role,
    row.result,
  ]);
  const wsVersions = XLSX.utils.aoa_to_sheet([versionHeader, ...versionRows]);
  styleRow(wsVersions, 0, HEADER_STYLE);
  wsVersions["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 10 },
    { wch: 28 },
    { wch: 10 },
    { wch: 12 },
    { wch: 18 },
  ];
  if (versionRows.length > 0) {
    wsVersions["!autofilter"] = { ref: `A1:I${versionRows.length + 1}` };
  }
  wsVersions["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, wsVersions, "Version Details");

  return XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
  }) as ArrayBuffer;
}
