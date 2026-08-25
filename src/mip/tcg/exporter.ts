// ============================================================
// Requirement → Test Case Generator — Export (XLSX + PDF)
// All export is client-side. No data leaves the browser.
// ============================================================

import type { GeneratedTestCase, TcgExportRow } from "./types";

// --- Export to CSV (fallback when XLSX not available) ---
export function exportToCsv(cases: GeneratedTestCase[]): void {
  const rows = cases
    .filter(tc => tc.status === "kept")
    .map(formatExportRow);

  const headers = ["Test Case ID", "Test Case Description", "Test Steps", "Precondition", "Query", "Expected Results", "Test Case Type", "Source / Traceability"];

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
      escapeCsv(row.sourceTraceability),
    ].join(","))
  ].join("\n");

  downloadFile(csvContent, "TestCases.csv", "text/csv");
}

// --- Export to XLSX (using docx + xlsx libs) ---
export async function exportToXlsx(cases: GeneratedTestCase[]): Promise<void> {
  const keptCases = cases.filter(tc => tc.status === "kept");
  const rows = keptCases.map(formatExportRow);

  try {
    // Dynamic import of xlsx
    const XLSX = await import("xlsx");

    const worksheetData = [
      ["Test Case ID", "Test Case Description", "Test Steps", "Precondition", "Query", "Expected Results", "Test Case Type", "Source / Traceability"],
      ...rows.map(row => [
        row.testCaseId,
        row.description,
        row.steps,
        row.precondition,
        row.query,
        row.expectedResults,
        row.testCaseType,
        row.sourceTraceability,
      ])
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    worksheet["!cols"] = [
      { wch: 12 }, // ID
      { wch: 50 }, // Description
      { wch: 60 }, // Steps
      { wch: 40 }, // Precondition
      { wch: 40 }, // Query
      { wch: 50 }, // Expected Results
      { wch: 20 }, // Type
      { wch: 30 }, // Source
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Test Cases");

    // Generate and download
    const xlsxBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([xlsxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, "TestCases.xlsx");
  } catch {
    // Fallback to CSV if xlsx not available
    exportToCsv(cases);
  }
}

// --- Export to PDF (using browser print) ---
export async function exportToPdf(cases: GeneratedTestCase[]): Promise<void> {
  const keptCases = cases.filter(tc => tc.status === "kept");
  const rows = keptCases.map(formatExportRow);

  try {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // Title
    doc.setFontSize(16);
    doc.text("Generated Test Cases", 14, 15);
    doc.setFontSize(10);
    doc.text(`Total: ${rows.length} test cases | Generated: ${new Date().toLocaleDateString()}`, 14, 22);

    // Table
    autoTable(doc, {
      startY: 28,
      head: [["ID", "Description", "Steps", "Precondition", "Query", "Expected Results", "Type", "Source"]],
      body: rows.map(row => [
        row.testCaseId,
        truncate(row.description, 60),
        truncate(row.steps, 80),
        truncate(row.precondition, 40),
        truncate(row.query, 40),
        truncate(row.expectedResults, 60),
        row.testCaseType,
        truncate(row.sourceTraceability, 40),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
    });

    doc.save("TestCases.pdf");
  } catch {
    // Fallback: use browser print
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
    sourceTraceability: tc.sources.map(s => `${s.documentName} → ${s.sectionRef}`).join("; "),
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

function exportViaHtmlPrint(rows: { testCaseId: string; description: string; steps: string; precondition: string; query: string; expectedResults: string; testCaseType: string; sourceTraceability: string }[]): void {
  const html = `
<!DOCTYPE html>
<html>
<head>
<title>Test Cases</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 20px; }
  h1 { font-size: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: bold; }
  td { font-size: 9px; }
  tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
<h1>Generated Test Cases</h1>
<p>Total: ${rows.length} test cases | Generated: ${new Date().toLocaleDateString()}</p>
<table>
<tr><th>ID</th><th>Description</th><th>Steps</th><th>Precondition</th><th>Query</th><th>Expected Results</th><th>Type</th><th>Source</th></tr>
${rows.map(r => `<tr>
  <td>${escapeHtml(r.testCaseId)}</td>
  <td>${escapeHtml(r.description)}</td>
  <td>${escapeHtml(r.steps)}</td>
  <td>${escapeHtml(r.precondition)}</td>
  <td>${escapeHtml(r.query)}</td>
  <td>${escapeHtml(r.expectedResults)}</td>
  <td>${escapeHtml(r.testCaseType)}</td>
  <td>${escapeHtml(r.sourceTraceability)}</td>
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
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
