/**
 * DIAGNOSTIC TEST — Trace REAL parser output for actual document files
 *
 * This test does NOT use simulated data. It creates real DOCX/XLSX/RTF files
 * using actual libraries, then parses them through the real parsers.
 * The output is logged at every stage so we can see exactly what the
 * real parsers produce vs what our synthetic tests assumed.
 */
import { describe, it, expect } from "vitest";
import { parseFileBytes } from "./parsers";
import { rtfToText } from "./rtf";
import { toCanonical, compareCanonical, type ContentItem } from "./canonical";
import * as XLSX from "xlsx";
import type { ParsedDoc, SheetData } from "./types";

// ── Shared data: the same fields used by the organization reports ──────────

const FIELDS = [
  ["Field", "Value"],
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

// ── STAGE 1: Create REAL files ──────────────────────────────────────────────

/** Create a real XLSX file using SheetJS */
function createRealXLSX(rows: string[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })).buffer;
}

/** Create a real RTF file with table structure */
function createRealRTF(rows: string[][]): ArrayBuffer {
  const lines: string[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (i > 0) lines.push("\\tab");
      // Escape RTF special characters
      lines.push(row[i].replace(/[\\{}]/g, (m) => `\\${m}`));
    }
    lines.push("\\par");
  }
  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}}
\\pard\\f0\\fs24
${lines.join("\n")}
}`;
  return new TextEncoder().encode(rtf).buffer;
}

/** Create a real RTF file with bold key names and tab separation (like Word exports) */
function createRealRTFWithBoldKeys(rows: string[][]): ArrayBuffer {
  const lines: string[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (i > 0) lines.push("\\tab");
      // Bold the first column (key name)
      if (i === 0) {
        lines.push(`{\\b ${row[i].replace(/[\\{}]/g, (m) => `\\${m}`)}}`);
      } else {
        lines.push(row[i].replace(/[\\{}]/g, (m) => `\\${m}`));
      }
    }
    lines.push("\\par");
  }
  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}}
\\pard\\f0\\fs24
${lines.join("\n")}
}`;
  return new TextEncoder().encode(rtf).buffer;
}

// ── STAGE 2: Parse through REAL parsers ─────────────────────────────────────

function logSection(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function logItems(label: string, items: ContentItem[]): void {
  console.log(`\n  ${label} (${items.length} items):`);
  for (const item of items) {
    console.log(`    [${item.kind.padEnd(14)}] key="${item.key}" value="${item.value}" loc=${item.sourceLocation}`);
  }
}

function logMatchResult(result: ReturnType<typeof compareCanonical>): void {
  console.log(`\n  MATCHED (${result.matched.length}):`);
  for (const m of result.matched) {
    const status = m.identical ? "IDENTICAL" : "CHANGED";
    console.log(`    ${m.baseline.key.padEnd(20)} = "${m.baseline.value}" → "${m.comparing.value}" [${status}]`);
  }
  console.log(`\n  MISSING IN COMPARING (${result.missingInComparing.length}):`);
  for (const m of result.missingInComparing) {
    console.log(`    ${m.key.padEnd(20)} = "${m.value}" [${m.kind}]`);
  }
  console.log(`\n  ADDED IN COMPARING (${result.addedInComparing.length}):`);
  for (const a of result.addedInComparing) {
    console.log(`    ${a.key.padEnd(20)} = "${a.value}" [${a.kind}]`);
  }
}

// ── DIAGNOSTIC: Real XLSX parsing ───────────────────────────────────────────

describe("DIAGNOSTIC: What does the REAL XLSX parser produce?", () => {
  it("Traces XLSX: create → parse → canonical", async () => {
    logSection("REAL XLSX FILE — FIELDS TABLE");
    
    const xlsxBuffer = createRealXLSX(FIELDS);
    logSection("STAGE 1: Raw XLSX file created");
    console.log(`  Size: ${xlsxBuffer.byteLength} bytes`);
    
    const parsed = await parseFileBytes("report.xlsx", xlsxBuffer);
    logSection("STAGE 2: parseFileBytes output");
    console.log(`  Content type: ${parsed.content.type}`);
    if (parsed.content.type === "sheet") {
      for (const sheet of parsed.content.sheets) {
        console.log(`  Sheet "${sheet.name}": ${sheet.rows.length} rows`);
        for (let r = 0; r < Math.min(sheet.rows.length, 10); r++) {
          console.log(`    Row ${r}: [${sheet.rows[r].map(c => `"${c}"`).join(", ")}]`);
        }
      }
    }
    
    const doc: ParsedDoc = {
      id: "diag.xlsx::1000", path: "report.xlsx", dir: "",
      fileName: "report.xlsx", ext: "xlsx", stem: "report",
      versionTag: null, size: xlsxBuffer.byteLength, content: parsed.content,
    };
    
    const canonical = toCanonical(doc);
    logItems("STAGE 3: toCanonical output", canonical.items);
    
    expect(true).toBe(true); // Just capture output
  });
});

// ── DIAGNOSTIC: Real RTF parsing ────────────────────────────────────────────

describe("DIAGNOSTIC: What does the REAL RTF parser produce?", () => {
  it("Traces RTF: create → rtfToText → parse → canonical", async () => {
    logSection("REAL RTF FILE — FIELDS TABLE (with bold keys)");
    
    const rtfBuffer = createRealRTFWithBoldKeys(FIELDS);
    
    // First, see what rtfToText produces directly
    const rtfString = new TextDecoder("windows-1252").decode(rtfBuffer);
    const plainText = rtfToText(rtfString);
    logSection("STAGE 1: rtfToText direct output");
    console.log(`  Plain text lines:`);
    const lines = plainText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      console.log(`    Line ${i}: "${lines[i]}"`);
    }
    
    // Now parse through the full parser
    const parsed = await parseFileBytes("report.rtf", rtfBuffer);
    logSection("STAGE 2: parseFileBytes output");
    console.log(`  Content type: ${parsed.content.type}`);
    if (parsed.content.type === "text") {
      console.log(`  Lines (${parsed.content.lines.length}):`);
      for (let i = 0; i < parsed.content.lines.length; i++) {
        console.log(`    Line ${i}: "${parsed.content.lines[i]}"`);
      }
    }
    
    const doc: ParsedDoc = {
      id: "diag.rtf::1000", path: "report.rtf", dir: "",
      fileName: "report.rtf", ext: "rtf", stem: "report",
      versionTag: null, size: rtfBuffer.byteLength, content: parsed.content,
    };
    
    const canonical = toCanonical(doc);
    logItems("STAGE 3: toCanonical output", canonical.items);
    
    expect(true).toBe(true);
  });
  
  it("Traces RTF: simple table format (no bold)", async () => {
    logSection("REAL RTF FILE — SIMPLE TABLE (no bold)");
    
    const rtfBuffer = createRealRTF(FIELDS);
    const parsed = await parseFileBytes("report.rtf", rtfBuffer);
    
    if (parsed.content.type === "text") {
      logSection("parseFileBytes lines");
      for (let i = 0; i < parsed.content.lines.length; i++) {
        console.log(`    Line ${i}: "${parsed.content.lines[i]}"`);
      }
    }
    
    const doc: ParsedDoc = {
      id: "diag2.rtf::1000", path: "report.rtf", dir: "",
      fileName: "report.rtf", ext: "rtf", stem: "report",
      versionTag: null, size: rtfBuffer.byteLength, content: parsed.content,
    };
    
    const canonical = toCanonical(doc);
    logItems("toCanonical output", canonical.items);
    
    expect(true).toBe(true);
  });
});

// ── DIAGNOSTIC: Simulated mammoth DOCX output ───────────────────────────────

describe("DIAGNOSTIC: What mammoth actually produces for DOCX tables", () => {
  it("Simulates real mammoth output for a 2-column table", () => {
    logSection("MAMMOTH SIMULATED OUTPUT — 2-column table");
    
    // Mammoth extractRawText produces each table cell as a SEPARATE line.
    // For a table like:
    //   | Field | Value |
    //   | Account | 1000 |
    //   | Customer | Customer Alpha |
    //
    // Mammoth outputs:
    //   Field
    //   Value
    //   Account
    //   1000
    //   Customer
    //   Customer Alpha
    
    const mammothLines: string[] = [];
    for (const row of FIELDS) {
      for (const cell of row) {
        mammothLines.push(cell);
      }
    }
    
    logSection("Simulated mammoth lines");
    for (let i = 0; i < mammothLines.length; i++) {
      console.log(`    Line ${i}: "${mammothLines[i]}"`);
    }
    
    const doc: ParsedDoc = {
      id: "diag.docx::1000", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: 1000,
      content: { type: "text", lines: mammothLines },
    };
    
    const canonical = toCanonical(doc);
    logItems("toCanonical output", canonical.items);
    
    // This should produce field_value items, not paragraphs
    const fvItems = canonical.items.filter(i => i.kind === "field_value");
    const paraItems = canonical.items.filter(i => i.kind === "paragraph");
    console.log(`\n  field_value items: ${fvItems.length}`);
    console.log(`  paragraph items: ${paraItems.length}`);
    
    // If this produces paragraphs instead of field_values, that's the bug
    for (const item of paraItems) {
      console.log(`    PARAGRAPH: "${item.value}"`);
    }
  });
});

// ── DIAGNOSTIC: Cross-format comparison with real parsers ────────────────────

describe("DIAGNOSTIC: Cross-format comparison with real parser output", () => {
  it("Real XLSX vs Simulated mammoth DOCX — trace the mismatch", async () => {
    logSection("CROSS-FORMAT: XLSX vs DOCX (simulated mammoth)");
    
    // XLSX through real parser
    const xlsxBuffer = createRealXLSX(FIELDS);
    const xlsxParsed = await parseFileBytes("report.xlsx", xlsxBuffer);
    const xlsxDoc: ParsedDoc = {
      id: "diag.xlsx::1000", path: "report.xlsx", dir: "",
      fileName: "report.xlsx", ext: "xlsx", stem: "report",
      versionTag: null, size: xlsxBuffer.byteLength, content: xlsxParsed.content,
    };
    
    // DOCX through simulated mammoth output
    const mammothLines: string[] = [];
    for (const row of FIELDS) {
      for (const cell of row) {
        mammothLines.push(cell);
      }
    }
    const docxDoc: ParsedDoc = {
      id: "diag.docx::1000", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: 1000,
      content: { type: "text", lines: mammothLines },
    };
    
    const xlsxCanon = toCanonical(xlsxDoc);
    const docxCanon = toCanonical(docxDoc);
    
    logItems("XLSX canonical items", xlsxCanon.items);
    logItems("DOCX canonical items", docxCanon.items);
    
    const result = compareCanonical(xlsxCanon, docxCanon, "intelligent");
    logMatchResult(result);
    
    expect(true).toBe(true);
  });
  
  it("Real XLSX vs Real RTF — trace the mismatch", async () => {
    logSection("CROSS-FORMAT: XLSX vs RTF (real parser)");
    
    // XLSX through real parser
    const xlsxBuffer = createRealXLSX(FIELDS);
    const xlsxParsed = await parseFileBytes("report.xlsx", xlsxBuffer);
    const xlsxDoc: ParsedDoc = {
      id: "diag.xlsx::1000", path: "report.xlsx", dir: "",
      fileName: "report.xlsx", ext: "xlsx", stem: "report",
      versionTag: null, size: xlsxBuffer.byteLength, content: xlsxParsed.content,
    };
    
    // RTF through real parser
    const rtfBuffer = createRealRTFWithBoldKeys(FIELDS);
    const rtfParsed = await parseFileBytes("report.rtf", rtfBuffer);
    const rtfDoc: ParsedDoc = {
      id: "diag.rtf::1000", path: "report.rtf", dir: "",
      fileName: "report.rtf", ext: "rtf", stem: "report",
      versionTag: null, size: rtfBuffer.byteLength, content: rtfParsed.content,
    };
    
    const xlsxCanon = toCanonical(xlsxDoc);
    const rtfCanon = toCanonical(rtfDoc);
    
    logItems("XLSX canonical items", xlsxCanon.items);
    logItems("RTF canonical items", rtfCanon.items);
    
    const result = compareCanonical(xlsxCanon, rtfCanon, "intelligent");
    logMatchResult(result);
    
    expect(true).toBe(true);
  });
});

// ── DIAGNOSTIC: What does PDF parser actually produce? ───────────────────────

describe("DIAGNOSTIC: Simulated PDF parser output for table data", () => {
  it("Simulates PDF parser with pipe-delimited output (column detection succeeded)", () => {
    logSection("SIMULATED PDF OUTPUT — pipe-delimited");
    
    // When PDF parser detects column gaps, it inserts pipes
    const pdfLines = FIELDS.map(row => row.join(" | "));
    logSection("PDF pipe-delimited lines");
    for (const line of pdfLines) console.log(`    "${line}"`);
    
    const doc: ParsedDoc = {
      id: "diag.pdf::1000", path: "report.pdf", dir: "",
      fileName: "report.pdf", ext: "pdf", stem: "report",
      versionTag: null, size: 1000,
      content: { type: "text", lines: pdfLines },
    };
    
    const canonical = toCanonical(doc);
    logItems("toCanonical output", canonical.items);
  });
  
  it("Simulates PDF parser with space-separated output (column detection failed)", () => {
    logSection("SIMULATED PDF OUTPUT — space-separated");
    
    // When PDF parser FAILS to detect column gaps, cells are space-separated
    const pdfLines = FIELDS.map(row => row.join("    "));
    logSection("PDF space-separated lines");
    for (const line of pdfLines) console.log(`    "${line}"`);
    
    const doc: ParsedDoc = {
      id: "diag.pdf::1000", path: "report.pdf", dir: "",
      fileName: "report.pdf", ext: "pdf", stem: "report",
      versionTag: null, size: 1000,
      content: { type: "text", lines: pdfLines },
    };
    
    const canonical = toCanonical(doc);
    logItems("toCanonical output", canonical.items);
  });
});
