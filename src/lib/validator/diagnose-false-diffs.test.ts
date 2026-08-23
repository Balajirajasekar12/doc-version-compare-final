/**
 * DIAGNOSTIC: Test the EXACT false difference patterns from production
 *
 * The user reports these false differences:
 *
 * PDF → DOCX:
 *   MISSING: "Account 1000", "Customer Since 2021-06-15"
 *   ADDED: "Field", "Account", "1000", "Customer", "Region", ...
 *
 * DOCX → XLSX:
 *   MISSING: "Field", "Value", "Customer", "Region", ...
 *   ADDED: "Property #1", "Property #2", "Property #3", "Value #3"
 *
 * This test recreates these exact patterns and traces where they originate.
 */
import { describe, it, expect } from "vitest";
import {
  toCanonical,
  compareCanonical,
  generateCanonicalDiffs,
  resetDiffCounter,
  type ContentItem,
} from "./canonical";
import type { ParsedDoc, SheetData } from "./types";

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

// ── Pattern 1: PDF parser output where column detection creates pipes ────────

describe("PATTERN 1: PDF → DOCX false differences", () => {
  it("Simulates PDF pipe-delimited output vs DOCX alternating cells", () => {
    logSection("PDF (pipe-delimited) vs DOCX (alternating cells)");
    
    // The REAL PDF parser (pdfjs-dist) groups text by Y-position and
    // inserts " | " at adaptive column gaps. For a simple 2-column table
    // with sufficient spacing, it produces pipe-delimited lines.
    // BUT: if the table has 4+ columns, or the spacing is tight,
    // the PDF may produce different output.
    
    // SCENARIO A: PDF produces pipe-delimited (column detection succeeded)
    const pdfPipeDoc: ParsedDoc = {
      id: "pdf::100", path: "report.pdf", dir: "",
      fileName: "report.pdf", ext: "pdf", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "text",
        lines: [
          "Field | Value",
          "Account | 1000",
          "Customer | Customer Alpha",
          "Region | South",
          "Account Manager | Arun Kumar",
          "Status | Active",
          "Customer Since | 2021-06-15",
        ],
      },
    };
    
    // DOCX: mammoth extractRawText produces each cell as a separate line
    const docxDoc: ParsedDoc = {
      id: "docx::100", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "text",
        lines: [
          "Field", "Value",
          "Account", "1000",
          "Customer", "Customer Alpha",
          "Region", "South",
          "Account Manager", "Arun Kumar",
          "Status", "Active",
          "Customer Since", "2021-06-15",
        ],
      },
    };
    
    const pdfCanon = toCanonical(pdfPipeDoc);
    const docxCanon = toCanonical(docxDoc);
    
    logItems("PDF canonical", pdfCanon.items);
    logItems("DOCX canonical", docxCanon.items);
    
    resetDiffCounter();
    const result = compareCanonical(pdfCanon, docxCanon, "intelligent");
    
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
    
    // All 6 field_values should match
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });
  
  it("SCENARIO B: PDF produces space-separated output (column detection failed)", () => {
    logSection("PDF (space-separated) vs DOCX (alternating cells)");
    
    // When PDF column gap detection FAILS, cells are space-separated
    // This is a REALISTIC scenario for tightly-spaced tables
    const pdfSpaceDoc: ParsedDoc = {
      id: "pdf::100", path: "report.pdf", dir: "",
      fileName: "report.pdf", ext: "pdf", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "text",
        lines: [
          "Field    Value",
          "Account    1000",
          "Customer    Customer Alpha",
          "Region    South",
          "Account Manager    Arun Kumar",
          "Status    Active",
          "Customer Since    2021-06-15",
        ],
      },
    };
    
    const docxDoc: ParsedDoc = {
      id: "docx::100", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "text",
        lines: [
          "Field", "Value",
          "Account", "1000",
          "Customer", "Customer Alpha",
          "Region", "South",
          "Account Manager", "Arun Kumar",
          "Status", "Active",
          "Customer Since", "2021-06-15",
        ],
      },
    };
    
    const pdfCanon = toCanonical(pdfSpaceDoc);
    const docxCanon = toCanonical(docxDoc);
    
    logItems("PDF canonical", pdfCanon.items);
    logItems("DOCX canonical", docxCanon.items);
    
    resetDiffCounter();
    const result = compareCanonical(pdfCanon, docxCanon, "intelligent");
    
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
    
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });
});

// ── Pattern 2: DOCX → XLSX "Property #N" problem ────────────────────────────

describe("PATTERN 2: DOCX → XLSX false 'Property #N' differences", () => {
  it("Investigates what produces 'Property #N' items in XLSX", () => {
    logSection("XLSX with generic column names (no 'Field/Value' header)");
    
    // The "Property #1", "Property #2" pattern suggests the XLSX has
    // column names like "Property #1", "Property #2" instead of "Field", "Value".
    // This is the deduplication numbering in canonical.ts.
    
    // If the XLSX has column names like: Property #1, Property #2, Property #3
    // with values in the rows, the canonical engine produces:
    //   field_value(key="property #1", value="Report")
    //   field_value(key="property #2", value="Purpose")
    //   field_value(key="property #3", value="Data")
    //   field_value(key="value #3", value="Synthetic / No real PHI")
    
    const xlsxDoc: ParsedDoc = {
      id: "xlsx::100", path: "report.xlsx", dir: "",
      fileName: "report.xlsx", ext: "xlsx", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "sheet",
        sheets: [{
          name: "Report",
          rows: [
            ["Property #1", "Property #2", "Property #3", "Value #3"],
            ["Report", "Purpose", "Data", "Synthetic / No real PHI"],
          ],
        }],
      },
    };
    
    // The DOCX has the same data but in a 2-column key-value format
    const docxDoc: ParsedDoc = {
      id: "docx::100", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "text",
        lines: [
          "Field", "Value",
          "Account", "1000",
          "Customer", "Customer Alpha",
          "Region", "South",
          "Account Manager", "Arun Kumar",
          "Status", "Active",
          "Customer Since", "2021-06-15",
        ],
      },
    };
    
    const xlsxCanon = toCanonical(xlsxDoc);
    const docxCanon = toCanonical(docxDoc);
    
    logItems("XLSX canonical", xlsxCanon.items);
    logItems("DOCX canonical", docxCanon.items);
    
    resetDiffCounter();
    const result = compareCanonical(docxCanon, xlsxCanon, "intelligent");
    
    console.log(`\n  MISSING (${result.missingInComparing.length}):`);
    for (const m of result.missingInComparing) {
      console.log(`    ${m.key.padEnd(20)}: "${m.value}" [${m.kind}]`);
    }
    console.log(`\n  ADDED (${result.addedInComparing.length}):`);
    for (const a of result.addedInComparing) {
      console.log(`    ${a.key.padEnd(20)}: "${a.value}" [${a.kind}]`);
    }
    
    // The XLSX items should NOT be "Property #N" — they should match
    // the actual column names from the XLSX header row.
    // This test just captures the output; the real fix is understanding
    // why the XLSX has these generic column names.
    
    expect(true).toBe(true);
  });
});

// ── Pattern 3: What the REAL organization DOCX output looks like ─────────────

describe("PATTERN 3: Real DOCX content variations", () => {
  it("DOCX with mixed pipe-delimited AND alternating cells", () => {
    // Some DOCX files have SOME content as pipe-delimited (from text paragraphs)
    // and SOME as alternating cells (from tables). This is realistic.
    logSection("DOCX mixed format: pipes + alternating cells");
    
    const docxDoc: ParsedDoc = {
      id: "docx::100", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "text",
        lines: [
          // Title paragraph
          "Customer Profile",
          // Some pipe-delimited content (from a text paragraph)
          "Account: 1000 | Synthetic data | No real PHI",
          // Table cells (alternating from mammoth)
          "Field", "Value",
          "Account", "1000",
          "Customer", "Customer Alpha",
          "Region", "South",
          "Account Manager", "Arun Kumar",
          "Status", "Active",
          "Customer Since", "2021-06-15",
          // Footer paragraph
          "Created for cross-format comparison testing.",
        ],
      },
    };
    
    const docxCanon = toCanonical(docxDoc);
    logItems("DOCX canonical", docxCanon.items);
    
    const fvItems = docxCanon.items.filter(i => i.kind === "field_value");
    console.log(`\n  field_value items: ${fvItems.length}`);
    for (const item of fvItems) {
      console.log(`    ${item.key} = ${item.value}`);
    }
    
    expect(true).toBe(true);
  });
  
  it("DOCX with longer field names and values", () => {
    logSection("DOCX with long field names (30+ chars)");
    
    // Some organizations have very long field names
    const longDocxDoc: ParsedDoc = {
      id: "docx::100", path: "report.docx", dir: "",
      fileName: "report.docx", ext: "docx", stem: "report",
      versionTag: null, size: 1000,
      content: {
        type: "text",
        lines: [
          "Field", "Value",
          "Account Number", "1000",
          "Customer Full Name", "Customer Alpha",
          "Geographic Region", "South",
          "Assigned Account Manager", "Arun Kumar",
          "Current Status", "Active",
          "Customer Since Date", "2021-06-15",
          "Total Sales Amount", "15,400.00",
          "Number of Orders", "16",
          "Report Generation Date", "2026-08-04",
        ],
      },
    };
    
    const docxCanon = toCanonical(longDocxDoc);
    logItems("DOCX canonical", docxCanon.items);
    
    const fvItems = docxCanon.items.filter(i => i.kind === "field_value");
    console.log(`\n  field_value items: ${fvItems.length}`);
    expect(fvItems.length).toBe(9);
  });
});
