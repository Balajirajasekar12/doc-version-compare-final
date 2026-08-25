// ============================================================
// Requirement → Test Case Generator — Export (XLSX + PDF + CSV)
// All export is client-side. No data leaves the browser.
// ============================================================

import type { GeneratedTestCase, TcgExportRow } from "./types";

// --- Export to CSV ---
export function exportToCsv(cases: GeneratedTestCase[]): void {
  const rows = cases
    .filter(tc => tc.status === "kept")
    .map(formatExportRow);

  const headers = [
    "Test Case ID", "Test Case Description", "Test Steps", "Precondition",
    "Query", "Expected Results", "Test Case Type", "Priority",
    "Business Flow", "Requirement Traceability", "Source / Traceability", "Risk Rationale",
  ];

  const csvContent = [
    headers.join(","),
    ...rows.map(row => [
      escapeCsv(row.testCaseId),
      escapeCsv(row.description),
      escapeCsv(row.steps),
      escapeCsv(row.precondition),
      escapeCsv(row.query),
      escapeCsv(row.expectedResults),
      escapeCsv(row.testCaseType),
      escapeCsv(row.priority),
      escapeCsv(row.businessFlow),
      escapeCsv(row.requirementTraceability),
      escapeCsv(row.sourceTraceability),
      escapeCsv(row.riskRationale),
    ].join(","))
  ].join("\n");

  downloadFile(csvContent, "TestCases.csv", "text/csv");
}

// --- Export to XLSX ---
export async function exportToXlsx(cases: GeneratedTestCase[]): Promise<void> {
  const keptCases = cases.filter(tc => tc.status === "kept");
  const rows = keptCases.map(formatExportRow);

  try {
    const XLSX = await import("xlsx");

    const worksheetData = [
      ["Test Case ID", "Test Case Description", "Test Steps", "Precondition", "Query",
       "Expected Results", "Test Case Type", "Priority", "Business Flow",
       "Requirement Traceability", "Source / Traceability", "Risk Rationale"],
      ...rows.map(row => [
        row.testCaseId, row.description, row.steps, row.precondition,
        row.query, row.expectedResults, row.testCaseType, row.priority,
        row.businessFlow, row.requirementTraceability, row.sourceTraceability,
        row.riskRationale,
      ])
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet["!cols"] = [
      { wch: 12 }, { wch: 55 }, { wch: 70 }, { wch: 45 }, { wch: 45 },
      { wch: 55 }, { wch: 14 }, { wch: 8 }, { wch: 25 },
      { wch: 30 }, { wch: 35 }, { wch: 45 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Test Cases");
    const xlsxBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([xlsxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, "TestCases.xlsx");
  } catch {
    exportToCsv(cases);
  }
}

// --- Export to PDF ---
export async function exportToPdf(cases: GeneratedTestCase[]): Promise<void> {
  const keptCases = cases.filter(tc => tc.status === "kept");
  const rows = keptCases.map(formatExportRow);

  try {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(16);
    doc.text("Generated Test Cases", 14, 15);
    doc.setFontSize(10);
    doc.text(`Total: ${rows.length} test cases | Generated: ${new Date().toLocaleDateString()}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [["ID", "Description", "Steps", "Precondition", "Query", "Expected", "Type", "Priority", "Flow", "Source"]],
      body: rows.map(row => [
        row.testCaseId,
        truncate(row.description, 50),
        truncate(row.steps, 70),
        truncate(row.precondition, 35),
        truncate(row.query, 35),
        truncate(row.expectedResults, 50),
        row.testCaseType,
        row.priority,
        truncate(row.businessFlow, 25),
        truncate(row.sourceTraceability, 35),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
    });

    doc.save("TestCases.pdf");
  } catch {
    exportViaHtmlPrint(rows);
  }
}

// ============================================================
// Helpers
// ============================================================

function formatExportRow(tc: GeneratedTestCase): TcgExportRow {
  const effective = tc.status === "edited" && tc.editedFields ? { ...tc, ...tc.editedFields } : tc;

  return {
    testCaseId: tc.caseNumber,
    description: effective.description,
    steps: effective.steps,
    precondition: effective.precondition,
    query: effective.query,
    expectedResults: effective.expectedResults,
    testCaseType: effective.types.join(", "),
    priority: effective.priority,
    businessFlow: effective.businessFlow,
    requirementTraceability: tc.requirementIds.join(", "),
    sourceTraceability: tc.sources.map(s => `${s.documentName} → ${s.sectionRef}`).join("; "),
    riskRationale: tc.riskRationale,
  };
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportViaHtmlPrint(rows: TcgExportRow[]): void {
  const html = `
<!DOCTYPE html>
<html>
<head>
<title>Test Cases</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 15px; }
  h1 { font-size: 14px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: bold; font-size: 8px; }
  td { font-size: 8px; }
  tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
<h1>Generated Test Cases</h1>
<p>Total: ${rows.length} test cases | Generated: ${new Date().toLocaleDateString()}</p>
<table>
<tr><th>ID</th><th>Description</th><th>Steps</th><th>Precondition</th><th>Query</th><th>Expected</th><th>Type</th><th>Priority</th><th>Flow</th><th>Source</th><th>Risk</th></tr>
${rows.map(r => `<tr>
  <td>${escapeHtml(r.testCaseId)}</td>
  <td>${escapeHtml(r.description)}</td>
  <td>${escapeHtml(r.steps)}</td>
  <td>${escapeHtml(r.precondition)}</td>
  <td>${escapeHtml(r.query)}</td>
  <td>${escapeHtml(r.expectedResults)}</td>
  <td>${escapeHtml(r.testCaseType)}</td>
  <td>${escapeHtml(r.priority)}</td>
  <td>${escapeHtml(r.businessFlow)}</td>
  <td>${escapeHtml(r.sourceTraceability)}</td>
  <td>${escapeHtml(r.riskRationale)}</td>
</tr>`).join("\n")}
</table>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
