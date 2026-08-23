/**
 * TRACE DIVERGENCE — Find the EXACT first stage where equivalent data
 * becomes different canonical representations across formats.
 *
 * This test creates REAL binary files and traces through the ACTUAL
 * production functions at every stage.
 */
import { describe, it, expect } from "vitest";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from "docx";
import mammothModule from "mammoth/mammoth.browser";
import { toCanonical, compareCanonical, type ContentItem } from "./canonical";
import { parseFileBytes } from "./parsers";
import * as XLSX from "xlsx";
import type { ParsedDoc, SheetData } from "./types";

const FIELDS: [string, string][] = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

function logStage(stage: string, label: string, data: unknown): void {
  console.log(`  [${stage}] ${label}:`);
  if (typeof data === "string") console.log(`    ${data}`);
  else if (Array.isArray(data)) {
    for (const item of data.slice(0, 30)) console.log(`    ${typeof item === "string" ? `"${item}"` : JSON.stringify(item)}`);
    if (data.length > 30) console.log(`    ... (${data.length} total)`);
  } else console.log(`    ${JSON.stringify(data)}`);
}

// ── Create REAL DOCX ────────────────────────────────────────────────────────

async function createRealDOCX(rows: [string, string][], title?: string): Promise<ArrayBuffer> {
  const children: (Paragraph | Table)[] = [];
  if (title) {
    children.push(new Paragraph({ children: [new TextRun({ text: title, bold: true })] }));
  }
  const tableRows = rows.map(([field, value]) =>
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: field, bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value })] })] }),
      ],
    }),
  );
  children.push(new Table({ rows: tableRows }));
  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// ── Create REAL XLSX ────────────────────────────────────────────────────────

function createRealXLSX(rows: string[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })).buffer;
}

// ── TESTS ───────────────────────────────────────────────────────────────────

describe("TRACE: Find first divergence between real DOCX and XLSX", () => {
  it("DOCX (with title) → XLSX: trace every stage", async () => {
    const allRows: [string, string][] = [["Field", "Value"], ...FIELDS];
    const docxBuffer = await createRealDOCX(allRows, "Customer Profile");
    const xlsxBuffer = createRealXLSX([["Field", "Value"], ...FIELDS]);

    // Parse DOCX through real parser
    const docxParsed = await parseFileBytes("report.docx", docxBuffer);
    logStage("DOCX-PARSE", "Lines", docxParsed.content.type === "text" ? docxParsed.content.lines : "sheet");

    // Parse XLSX through real parser
    const xlsxParsed = await parseFileBytes("report.xlsx", xlsxBuffer);
    if (xlsxParsed.content.type === "sheet") {
      logStage("XLSX-PARSE", "Rows", xlsxParsed.content.sheets[0]?.rows);
    }

    // Build ParsedDocs
    const docxDoc: ParsedDoc = {
      id: "docx::1000", path: "report.docx", dir: "", fileName: "report.docx",
      ext: "docx", stem: "report", versionTag: null, size: docxBuffer.byteLength, content: docxParsed.content,
    };
    const xlsxDoc: ParsedDoc = {
      id: "xlsx::1000", path: "report.xlsx", dir: "", fileName: "report.xlsx",
      ext: "xlsx", stem: "report", versionTag: null, size: xlsxBuffer.byteLength, content: xlsxParsed.content,
    };

    // Canonical conversion
    const docxCanon = toCanonical(docxDoc);
    const xlsxCanon = toCanonical(xlsxDoc);

    logStage("DOCX-CANON", "Items", docxCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));
    logStage("XLSX-CANON", "Items", xlsxCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));

    // Compare
    const result = compareCanonical(docxCanon, xlsxCanon, "intelligent");

    console.log(`\n  MATCHED (${result.matched.length}):`);
    for (const m of result.matched) {
      console.log(`    ${m.baseline.key.padEnd(25)}: "${m.baseline.value}" → "${m.comparing.value}" [${m.identical ? "IDENTICAL" : "CHANGED"}]`);
    }
    console.log(`  MISSING (${result.missingInComparing.length}):`);
    for (const m of result.missingInComparing) console.log(`    ${m.key.padEnd(25)}: "${m.value}" [${m.kind}]`);
    console.log(`  ADDED (${result.addedInComparing.length}):`);
    for (const a of result.addedInComparing) console.log(`    ${a.key.padEnd(25)}: "${a.value}" [${a.kind}]`);

    // Assertions
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });

  it("DOCX (no title) → XLSX: trace every stage", async () => {
    const allRows: [string, string][] = [["Field", "Value"], ...FIELDS];
    const docxBuffer = await createRealDOCX(allRows);
    const xlsxBuffer = await createRealXLSX([["Field", "Value"], ...FIELDS]);

    const docxParsed = await parseFileBytes("report.docx", docxBuffer);
    const xlsxParsed = await parseFileBytes("report.xlsx", xlsxBuffer);
    logStage("DOCX-PARSE", "Lines", docxParsed.content.type === "text" ? docxParsed.content.lines : "sheet");

    const docxDoc: ParsedDoc = {
      id: "docx::1000", path: "report.docx", dir: "", fileName: "report.docx",
      ext: "docx", stem: "report", versionTag: null, size: docxBuffer.byteLength, content: docxParsed.content,
    };
    const xlsxDoc: ParsedDoc = {
      id: "xlsx::1000", path: "report.xlsx", dir: "", fileName: "report.xlsx",
      ext: "xlsx", stem: "report", versionTag: null, size: xlsxBuffer.byteLength, content: xlsxParsed.content,
    };

    const docxCanon = toCanonical(docxDoc);
    const xlsxCanon = toCanonical(xlsxDoc);

    logStage("DOCX-CANON", "Items", docxCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));
    logStage("XLSX-CANON", "Items", xlsxCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));

    const result = compareCanonical(docxCanon, xlsxCanon, "intelligent");

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });

  it("Simulated PDF (space-separated) → DOCX: trace the divergence", async () => {
    const pdfLines = [
      "Field    Value",
      ...FIELDS.map(([k, v]) => `${k}    ${v}`),
      "Created for testing.",
    ];
    logStage("PDF-RAW", "Lines", pdfLines);

    const pdfDoc: ParsedDoc = {
      id: "sim.pdf::1000", path: "report.pdf", dir: "",
      fileName: "report.pdf", ext: "pdf", stem: "report",
      versionTag: null, size: 1000,
      content: { type: "text", lines: pdfLines },
    };
    const pdfCanon = toCanonical(pdfDoc);
    logStage("PDF-CANON", "Items", pdfCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));

    const allRows: [string, string][] = [["Field", "Value"], ...FIELDS];
    const docxBuffer = await createRealDOCX(allRows, "Customer Profile");
    const docxParsed = await parseFileBytes("report.docx", docxBuffer);
    const docxDoc: ParsedDoc = {
      id: "docx::1000", path: "report.docx", dir: "", fileName: "report.docx",
      ext: "docx", stem: "report", versionTag: null, size: docxBuffer.byteLength, content: docxParsed.content,
    };
    const docxCanon = toCanonical(docxDoc);
    logStage("DOCX-CANON", "Items", docxCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));

    const result = compareCanonical(pdfCanon, docxCanon, "intelligent");

    console.log(`\n  MATCHED: ${result.matched.length}, MISSING: ${result.missingInComparing.length}, ADDED: ${result.addedInComparing.length}`);
    for (const m of result.matched.filter(m => !m.identical)) console.log(`    CHANGED: "${m.baseline.value}" → "${m.comparing.value}"`);
    for (const m of result.missingInComparing) console.log(`    MISSING: "${m.value}" [${m.kind}]`);
    for (const a of result.addedInComparing) console.log(`    ADDED: "${a.value}" [${a.kind}]`);

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });
});
