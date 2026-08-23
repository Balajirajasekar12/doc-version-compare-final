/**
 * DIAGNOSTIC: Real DOCX file through mammoth extraction
 *
 * Creates a REAL .docx file using the `docx` library,
 * then parses it through mammoth to see EXACTLY what text is extracted.
 * This is the actual production path.
 */
import { describe, it, expect } from "vitest";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType } from "docx";
import mammothModule from "mammoth/mammoth.browser";
import { toCanonical, compareCanonical, type ContentItem } from "./canonical";
import { parseFileBytes } from "./parsers";
import * as XLSX from "xlsx";
import type { ParsedDoc, SheetData } from "./types";

// ── Shared data ─────────────────────────────────────────────────────────────

const FIELDS: [string, string][] = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

function logSection(title: string): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(70)}`);
}

function logItems(label: string, items: ContentItem[]): void {
  console.log(`\n  ${label} (${items.length} items):`);
  for (const item of items) {
    console.log(`    [${item.kind.padEnd(14)}] key="${item.key}" value="${item.value}"`);
  }
}

// ── Create REAL DOCX files ──────────────────────────────────────────────────

async function createRealDOCX(rows: [string, string][]): Promise<ArrayBuffer> {
  const headerRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "Field", bold: true })] })],
        width: { size: 3000, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true })] })],
        width: { size: 5000, type: WidthType.DXA },
      }),
    ],
    tableHeader: true,
  });

  const dataRows = rows.map(([field, value]) =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: field, bold: true })] })],
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: value })] })],
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [{
      children: [
        new Table({
          rows: [headerRow, ...dataRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

// ── Extract raw text from DOCX using mammoth ────────────────────────────────

async function extractDOCXRawText(arrayBuffer: ArrayBuffer): Promise<string[]> {
  // @ts-ignore — mammoth.browser UMD bundle
  const mammoth = mammothModule as any;
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text: string = result.value;
  return text.split("\n").filter((l: string) => l.trim() !== "");
}

// ── TESTS ───────────────────────────────────────────────────────────────────

describe("DIAGNOSTIC: Real DOCX → mammoth extraction", () => {
  it("Creates real DOCX and extracts text through mammoth", async () => {
    logSection("CREATING REAL DOCX FILE");
    const arrayBuffer = await createRealDOCX(FIELDS);
    
    logSection("STAGE 1: Raw DOCX file");
    console.log(`  Size: ${arrayBuffer.byteLength} bytes`);
    
    // Verify it's a real ZIP
    const bytes = new Uint8Array(arrayBuffer);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    console.log(`  Starts with PK signature: YES`);
    
    logSection("STAGE 2: mammoth.extractRawText output");
    const rawLines = await extractDOCXRawText(arrayBuffer);
    console.log(`  Lines (${rawLines.length}):`);
    for (let i = 0; i < rawLines.length; i++) {
      console.log(`    Line ${i}: "${rawLines[i]}"`);
    }
    
    logSection("STAGE 3: parseFileBytes output");
    const parsed = await parseFileBytes("report.docx", arrayBuffer);
    console.log(`  Content type: ${parsed.content.type}`);
    if (parsed.content.type === "text") {
      console.log(`  Lines (${parsed.content.lines.length}):`);
      for (let i = 0; i < parsed.content.lines.length; i++) {
        console.log(`    Line ${i}: "${parsed.content.lines[i]}"`);
      }
    }
    
    const doc: ParsedDoc = {
      id: "diag.docx::1000", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: arrayBuffer.byteLength, content: parsed.content,
    };
    
    logSection("STAGE 4: toCanonical output");
    const canonical = toCanonical(doc);
    logItems("Canonical items", canonical.items);
    
    // Check for field_value items
    const fvItems = canonical.items.filter(i => i.kind === "field_value");
    console.log(`\n  field_value count: ${fvItems.length}`);
    for (const item of fvItems) {
      console.log(`    ${item.key} = ${item.value}`);
    }
    
    expect(true).toBe(true);
  });

  it("Real DOCX vs Real XLSX — cross-format comparison trace", async () => {
    logSection("CROSS-FORMAT: Real DOCX vs Real XLSX");
    
    // Create real DOCX
    const docxBuffer = await createRealDOCX(FIELDS);
    const docxParsed = await parseFileBytes("report.docx", docxBuffer);
    const docxDoc: ParsedDoc = {
      id: "diag.docx::1000", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: docxBuffer.byteLength, content: docxParsed.content,
    };
    
    // Create real XLSX
    const xlsxBuffer = new Uint8Array(XLSX.write(
      (() => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([["Field", "Value"], ...FIELDS]);
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        return wb;
      })(),
      { type: "array", bookType: "xlsx" },
    )).buffer;
    const xlsxParsed = await parseFileBytes("report.xlsx", xlsxBuffer);
    const xlsxDoc: ParsedDoc = {
      id: "diag.xlsx::1000", path: "report.xlsx", dir: "",
      fileName: "report.xlsx", ext: "xlsx", stem: "report",
      versionTag: null, size: xlsxBuffer.byteLength, content: xlsxParsed.content,
    };
    
    logSection("DOCX parser lines");
    if (docxParsed.content.type === "text") {
      for (let i = 0; i < docxParsed.content.lines.length; i++) {
        console.log(`    Line ${i}: "${docxParsed.content.lines[i]}"`);
      }
    }
    
    logSection("XLSX parser sheets");
    if (xlsxParsed.content.type === "sheet") {
      for (const sheet of xlsxParsed.content.sheets) {
        console.log(`  Sheet "${sheet.name}":`);
        for (let r = 0; r < sheet.rows.length; r++) {
          console.log(`    Row ${r}: [${sheet.rows[r].map(c => `"${c}"`).join(", ")}]`);
        }
      }
    }
    
    const docxCanon = toCanonical(docxDoc);
    const xlsxCanon = toCanonical(xlsxDoc);
    
    logItems("DOCX canonical items", docxCanon.items);
    logItems("XLSX canonical items", xlsxCanon.items);
    
    const result = compareCanonical(docxCanon, xlsxCanon, "intelligent");
    
    console.log(`\n  MATCHED (${result.matched.length}):`);
    for (const m of result.matched) {
      console.log(`    ${m.baseline.key.padEnd(20)}: "${m.baseline.value}" → "${m.comparing.value}" [${m.identical ? "IDENTICAL" : "CHANGED"}]`);
    }
    console.log(`\n  MISSING (${result.missingInComparing.length}):`);
    for (const m of result.missingInComparing) {
      console.log(`    ${m.key.padEnd(20)}: "${m.value}" [${m.kind}]`);
    }
    console.log(`\n  ADDED (${result.addedInComparing.length}):`);
    for (const a of result.addedInComparing) {
      console.log(`    ${a.key.padEnd(20)}: "${a.value}" [${a.kind}]`);
    }
    
    expect(true).toBe(true);
  });
});
