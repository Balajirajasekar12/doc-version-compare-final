// ============================================================
// Requirement → Test Case Generator — Exporter (v3)
// XLSX, PDF, CSV with completeness status + new columns
// ============================================================

import type { GeneratedTestCase, TcgExportRow } from "./types";

function toExportRows(testCases: GeneratedTestCase[]): TcgExportRow[] {
  return testCases
    .filter(tc => tc.status !== "ignored")
    .map(tc => ({
      testCaseId: tc.caseNumber,
      description: tc.description,
      steps: tc.steps,
      precondition: tc.precondition,
      query: tc.query,
      expectedResults: tc.expectedResults,
      testCaseType: tc.types.join(", "),
      priority: tc.priority,
      businessFlow: tc.businessFlow,
      requirementTraceability: tc.requirementIds.join(", "),
      sourceTraceability: tc.sources.map(s => `${s.documentName} → ${s.sectionRef}`).join("; "),
      riskRationale: tc.riskRationale,
      status: tc.completeness,
      incompleteReasons: tc.incompleteReasons.join("; "),
    }));
}

// ============================================================
// XLSX Export (using xlsx library)
// ============================================================

export async function exportToXlsx(testCases: GeneratedTestCase[]): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = toExportRows(testCases);

  const wsData = [
    [
      "Test Case ID", "Description", "Test Steps", "Precondition",
      "Query", "Expected Results", "Test Case Type", "Priority",
      "Business Flow", "Requirement Traceability", "Source Traceability",
      "Risk Rationale", "Status", "Incomplete Reasons",
    ],
    ...rows.map(r => [
      r.testCaseId, r.description, r.steps, r.precondition,
      r.query, r.expectedResults, r.testCaseType, r.priority,
      r.businessFlow, r.requirementTraceability, r.sourceTraceability,
      r.riskRationale, r.status, r.incompleteReasons,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = [
    { wch: 12 }, { wch: 60 }, { wch: 80 }, { wch: 40 },
    { wch: 50 }, { wch: 50 }, { wch: 15 }, { wch: 10 },
    { wch: 25 }, { wch: 30 }, { wch: 40 },
    { wch: 40 }, { wch: 12 }, { wch: 50 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
  XLSX.writeFile(wb, "TestCases.xlsx");
}

// ============================================================
// PDF Export (using jsPDF)
// ============================================================

export async function exportToPdf(testCases: GeneratedTestCase[]): Promise<void> {
  const { jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Title
  doc.setFontSize(16);
  doc.text("Test Case Report", 14, 20);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
  doc.text(`Total Test Cases: ${testCases.filter(tc => tc.status !== "ignored").length}`, 14, 34);

  const rows = toExportRows(testCases);

  // Table
  (doc as any).autoTable({
    startY: 40,
    head: [["ID", "Description", "Steps", "Precondition", "Query", "Expected Results", "Type", "Priority", "Flow", "Status"]],
    body: rows.map(r => [
      r.testCaseId,
      r.description.slice(0, 80),
      r.steps.slice(0, 120),
      r.precondition.slice(0, 60),
      r.query.slice(0, 60),
      r.expectedResults.slice(0, 80),
      r.testCaseType,
      r.priority,
      r.businessFlow,
      r.status,
    ]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 50 },
      2: { cellWidth: 60 },
      7: { cellWidth: 15 },
      9: { cellWidth: 18 },
    },
  });

  doc.save("TestCases.pdf");
}

// ============================================================
// CSV Export (browser download)
// ============================================================

export function exportToCsv(testCases: GeneratedTestCase[]): void {
  const rows = toExportRows(testCases);

  const headers = [
    "Test Case ID", "Description", "Test Steps", "Precondition",
    "Query", "Expected Results", "Test Case Type", "Priority",
    "Business Flow", "Requirement Traceability", "Source Traceability",
    "Risk Rationale", "Status", "Incomplete Reasons",
  ];

  const csvRows = [
    headers.join(","),
    ...rows.map(r =>
      [
        r.testCaseId,
        `"${r.description.replace(/"/g, '""')}"`,
        `"${r.steps.replace(/"/g, '""')}"`,
        `"${r.precondition.replace(/"/g, '""')}"`,
        `"${r.query.replace(/"/g, '""')}"`,
        `"${r.expectedResults.replace(/"/g, '""')}"`,
        r.testCaseType,
        r.priority,
        `"${r.businessFlow}"`,
        `"${r.requirementTraceability}"`,
        `"${r.sourceTraceability}"`,
        `"${r.riskRationale}"`,
        r.status,
        `"${r.incompleteReasons.replace(/"/g, '""')}"`,
      ].join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "TestCases.csv";
  a.click();
  URL.revokeObjectURL(url);
}
