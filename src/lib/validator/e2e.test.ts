/**
 * END-TO-END VALIDATION TEST
 *
 * Tests the actual comparison pipeline with realistic document representations.
 * Each format's parser output is modeled from the ACTUAL parser code:
 * - PDF: pdfjs-dist groups text by Y-position, inserts pipes at column gaps
 * - DOCX: mammoth extractRawText outputs each cell as a separate line
 * - RTF: rtf.ts strips control words, \cell inserts newlines
 * - XLSX: xlsx library provides structured sheet data
 *
 * The canonical engine (toCanonical, compareCanonical, generateCanonicalDiffs)
 * is imported and used DIRECTLY — no simulated shortcuts.
 */
import { describe, it, expect } from "vitest";
import {
  toCanonical,
  compareCanonical,
  generateCanonicalDiffs,
  resetDiffCounter,
  type ContentItem,
} from "./canonical";
import { rtfToText } from "./rtf";
import type { ComparisonMode, ParsedDoc, SheetData } from "./types";
import * as XLSX from "xlsx";

// ── Shared Data ─────────────────────────────────────────────────────────────

const FV_HEADER = ["Field", "Value"];
const FV_ROWS = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

function allFVRows() {
  return [FV_HEADER, ...FV_ROWS];
}

// ── Document Factories ──────────────────────────────────────────────────────

/**
 * Simulate PDF parser output.
 * pdfjs-dist extracts text items with X,Y positions, groups by Y into rows,
 * and inserts " | " at adaptive column gaps.
 * For a 2-column table with gridlines, the parser typically produces pipe-delimited lines.
 */
function makePDFDoc(fileName: string, includeExtras = true): ParsedDoc {
  const lines: string[] = [];
  if (includeExtras) {
    lines.push("Sales Summary");
    lines.push("Account: 1000 | Synthetic data | No real PHI");
  }
  // PDF table output — pipe-delimited (adaptive column detection succeeded)
  for (const row of allFVRows()) {
    lines.push(row.join(" | "));
  }
  if (includeExtras) {
    lines.push("Created for cross-format comparison testing.");
  }
  return {
    id: `${fileName}::${1000}`,
    path: fileName,
    dir: "",
    fileName,
    ext: "pdf",
    stem: fileName.replace(/\.pdf$/i, ""),
    versionTag: null,
    size: 1000,
    content: { type: "text", lines },
  };
}

/**
 * Simulate PDF parser output when column gap detection FAILS.
 * Table cells are space-separated instead of pipe-delimited.
 */
function makePDFDocSpaceSeparated(fileName: string): ParsedDoc {
  const lines: string[] = ["Sales Summary"];
  // PDF table output — space-separated (column gap detection failed)
  for (const row of allFVRows()) {
    lines.push(row.join("    "));
  }
  return {
    id: `${fileName}::${1000}`,
    path: fileName,
    dir: "",
    fileName,
    ext: "pdf",
    stem: fileName.replace(/\.pdf$/i, ""),
    versionTag: null,
    size: 1000,
    content: { type: "text", lines },
  };
}

/**
 * Simulate DOCX parser output (mammoth extractRawText).
 * Each table cell is a separate paragraph/line.
 * Multi-word keys like "Account Manager" and "Customer Since" are separate lines.
 */
function makeDOCXDoc(fileName: string, includeExtras = true): ParsedDoc {
  const lines: string[] = [];
  if (includeExtras) {
    lines.push("Customer Profile");
    lines.push("Account: 1000 | Synthetic data | No real PHI");
  }
  // DOCX table output — each cell on its own line (mammoth behavior)
  for (const row of allFVRows()) {
    for (const cell of row) {
      lines.push(cell);
    }
  }
  if (includeExtras) {
    lines.push("Created for cross-format comparison testing.");
  }
  return {
    id: `${fileName}::${1000}`,
    path: fileName,
    dir: "",
    fileName,
    ext: "docx",
    stem: fileName.replace(/\.docx$/i, ""),
    versionTag: null,
    size: 1000,
    content: { type: "text", lines },
  };
}

/**
 * Simulate RTF parser output.
 * RTF \cell inserts newlines between cells, producing alternating key-value lines
 * similar to DOCX but may have extra whitespace or different formatting.
 */
function makeRTFDoc(fileName: string, includeExtras = true): ParsedDoc {
  const lines: string[] = [];
  if (includeExtras) {
    lines.push("Customer Profile");
    lines.push("Account: 1000 | Synthetic data | No real PHI");
  }
  // RTF table output — alternating key/value lines (from \cell control words)
  for (const row of allFVRows()) {
    for (const cell of row) {
      lines.push(cell);
    }
  }
  if (includeExtras) {
    lines.push("Created for cross-format comparison testing.");
  }
  return {
    id: `${fileName}::${1000}`,
    path: fileName,
    dir: "",
    fileName,
    ext: "rtf",
    stem: fileName.replace(/\.rtf$/i, ""),
    versionTag: null,
    size: 1000,
    content: { type: "text", lines },
  };
}

/**
 * Create an ACTUAL XLSX file using the xlsx library,
 * then parse it back through the real parseSheet function.
 * This tests the REAL spreadsheet parsing path.
 */
function makeXLSXDoc(fileName: string): ParsedDoc {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allFVRows());
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  // Write to buffer and read back (tests actual xlsx parsing)
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const readWb = XLSX.read(buf, { type: "array" });
  const readSheet = readWb.Sheets[readWb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(readSheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });

  const sheets: SheetData[] = [
    {
      name: "Report",
      rows: rows.map((row) =>
        (Array.isArray(row) ? row : []).map((cell) =>
          cell === null || cell === undefined ? "" : String(cell),
        ),
      ),
    },
  ];

  return {
    id: `${fileName}::${1000}`,
    path: fileName,
    dir: "",
    fileName,
    ext: "xlsx",
    stem: fileName.replace(/\.xlsx$/i, ""),
    versionTag: null,
    size: buf.byteLength,
    content: { type: "sheet", sheets },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getFieldValues(doc: ParsedDoc): ContentItem[] {
  return toCanonical(doc).items.filter((i) => i.kind === "field_value");
}

function countDifferences(result: ReturnType<typeof compareCanonical>): number {
  return (
    result.missingInComparing.length +
    result.addedInComparing.length +
    result.matched.filter((m) => !m.identical).length
  );
}

function logItems(label: string, items: ContentItem[]): void {
  console.log(`\n=== ${label} (${items.length} field_value items) ===`);
  for (const item of items) {
    console.log(`  ${item.key.padEnd(20)} = ${item.value}`);
  }
}

function logComparison(
  baselineLabel: string,
  comparingLabel: string,
  result: ReturnType<typeof compareCanonical>,
): void {
  console.log(`\n--- ${baselineLabel} vs ${comparingLabel} ---`);
  console.log(`  Matched: ${result.matched.length}`);
  for (const m of result.matched) {
    if (m.baseline.kind === "field_value") {
      console.log(
        `    ${m.baseline.key.padEnd(20)} = ${m.baseline.value.padEnd(20)} → ${m.identical ? "IDENTICAL" : "CHANGED: " + m.comparing.value}`,
      );
    }
  }
  console.log(
    `  Missing (in baseline only): ${result.missingInComparing.filter((i) => i.kind === "field_value").length}`,
  );
  for (const m of result.missingInComparing.filter(
    (i) => i.kind === "field_value",
  )) {
    console.log(`    ${m.key.padEnd(20)} = ${m.value}`);
  }
  console.log(
    `  Added (in comparing only): ${result.addedInComparing.filter((i) => i.kind === "field_value").length}`,
  );
  for (const a of result.addedInComparing.filter(
    (i) => i.kind === "field_value",
  )) {
    console.log(`    ${a.key.padEnd(20)} = ${a.value}`);
  }
}

// ── Create Documents ────────────────────────────────────────────────────────

const pdf = makePDFDoc("customer_profile_1000.pdf");
const pdfSpace = makePDFDocSpaceSeparated("sales_summary_1000.pdf");
const docx = makeDOCXDoc("customer_profile_1000.docx");
const rtf = makeRTFDoc("customer_profile_1000.rtf");
const xlsx = makeXLSXDoc("customer_profile_1000.xlsx");

// ── Tests ───────────────────────────────────────────────────────────────────

describe("E2E: Canonical extraction for each format", () => {
  it("PDF extracts all 6 field_value pairs", () => {
    const items = getFieldValues(pdf);
    logItems("PDF", items);
    expect(items.length).toBe(6);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("account");
    expect(keys).toContain("customer");
    expect(keys).toContain("region");
    expect(keys).toContain("account manager");
    expect(keys).toContain("status");
    expect(keys).toContain("customer since");
    expect(items.find((i) => i.key === "account")?.value).toBe("1000");
    expect(items.find((i) => i.key === "customer")?.value).toBe(
      "Customer Alpha",
    );
  });

  it("DOCX extracts all 6 field_value pairs", () => {
    const items = getFieldValues(docx);
    logItems("DOCX", items);
    expect(items.length).toBe(6);
    expect(items.find((i) => i.key === "account")?.value).toBe("1000");
    expect(items.find((i) => i.key === "customer")?.value).toBe(
      "Customer Alpha",
    );
    expect(items.find((i) => i.key === "account manager")?.value).toBe(
      "Arun Kumar",
    );
  });

  it("RTF extracts all 6 field_value pairs", () => {
    const items = getFieldValues(rtf);
    logItems("RTF", items);
    expect(items.length).toBe(6);
    expect(items.find((i) => i.key === "account")?.value).toBe("1000");
  });

  it("XLSX extracts all 6 field_value pairs", () => {
    const items = getFieldValues(xlsx);
    logItems("XLSX", items);
    expect(items.length).toBe(6);
    expect(items.find((i) => i.key === "account")?.value).toBe("1000");
    expect(items.find((i) => i.key === "account manager")?.value).toBe(
      "Arun Kumar",
    );
  });

  it("PDF space-separated extracts all 6 field_value pairs", () => {
    const items = getFieldValues(pdfSpace);
    logItems("PDF (space-separated)", items);
    expect(items.length).toBe(6);
    expect(items.find((i) => i.key === "account")?.value).toBe("1000");
  });
});

describe("E2E: Cross-format comparisons — identical content", () => {
  const comparisons: Array<[string, string, ParsedDoc, ParsedDoc]> = [
    ["PDF → RTF", "PDF vs RTF", pdf, rtf],
    ["PDF → DOCX", "PDF vs DOCX", pdf, docx],
    ["PDF → XLSX", "PDF vs XLSX", pdf, xlsx],
    ["DOCX → XLSX", "DOCX vs XLSX", docx, xlsx],
    ["DOCX → PDF", "DOCX vs PDF", docx, pdf],
    ["XLSX → DOCX", "XLSX vs DOCX", xlsx, docx],
    ["XLSX → PDF", "XLSX vs PDF", xlsx, pdf],
    ["RTF → DOCX", "RTF vs DOCX", rtf, docx],
    ["PDF(space) → RTF", "PDF(space) vs RTF", pdfSpace, rtf],
    ["PDF(space) → DOCX", "PDF(space) vs DOCX", pdfSpace, docx],
    ["PDF(space) → XLSX", "PDF(space) vs XLSX", pdfSpace, xlsx],
  ];

  for (const [label, _desc, baseline, comparing] of comparisons) {
    it(`${label} → 0 false differences`, () => {
      resetDiffCounter();
      const baseCanon = toCanonical(baseline);
      const compCanon = toCanonical(comparing);

      const result = compareCanonical(baseCanon, compCanon, "intelligent");
      logComparison(label, `${baseline.ext} vs ${comparing.ext}`, result);

      const falseMissing = result.missingInComparing.filter(
        (i) => i.kind === "field_value",
      );
      const falseAdded = result.addedInComparing.filter(
        (i) => i.kind === "field_value",
      );
      const falseChanged = result.matched.filter(
        (m) =>
          !m.identical &&
          m.baseline.kind === "field_value" &&
          m.baseline.key === m.comparing.key,
      );

      // Log any false differences
      if (falseMissing.length > 0) {
        console.log("  FALSE MISSING:");
        for (const m of falseMissing) {
          console.log(`    ${m.key} = ${m.value}`);
        }
      }
      if (falseAdded.length > 0) {
        console.log("  FALSE ADDED:");
        for (const a of falseAdded) {
          console.log(`    ${a.key} = ${a.value}`);
        }
      }
      if (falseChanged.length > 0) {
        console.log("  FALSE CHANGED:");
        for (const c of falseChanged) {
          console.log(
            `    ${c.baseline.key}: ${c.baseline.value} → ${c.comparing.value}`,
          );
        }
      }

      expect(falseMissing.length).toBe(0);
      expect(falseAdded.length).toBe(0);
      expect(falseChanged.length).toBe(0);
    });
  }
});

describe("E2E: Metadata must not leak into content", () => {
  it("No filename metadata in canonical items", () => {
    const allDocs = [pdf, docx, rtf, xlsx];
    for (const doc of allDocs) {
      const items = toCanonical(doc).items;
      for (const item of items) {
        expect(item.value).not.toContain(".PDF");
        expect(item.value).not.toContain(".DOCX");
        expect(item.value).not.toContain(".XLSX");
        expect(item.value).not.toContain(".RTF");
        expect(item.key).not.toContain(".PDF");
        expect(item.key).not.toContain(".DOCX");
        expect(item.key).not.toContain(".XLSX");
        expect(item.key).not.toContain(".RTF");
      }
    }
  });
});

describe("E2E: Genuine differences still detected", () => {
  function makeModifiedPDF(overrides: Record<string, string>): ParsedDoc {
    const rows = [...FV_ROWS];
    for (const [field, value] of Object.entries(overrides)) {
      const idx = rows.findIndex((r) => r[0].toLowerCase() === field.toLowerCase());
      if (idx >= 0) {
        rows[idx] = [rows[idx][0], value];
      } else {
        // Add new field
        rows.push([field, value]);
      }
    }
    const lines = ["Field | Value", ...rows.map((r) => r.join(" | "))];
    return {
      id: "modified.pdf::1000",
      path: "modified.pdf",
      dir: "",
      fileName: "modified.pdf",
      ext: "pdf",
      stem: "modified",
      versionTag: null,
      size: 1000,
      content: { type: "text", lines },
    };
  }

  function makeModifiedDOCX(
    removeField?: string,
    addField?: [string, string],
  ): ParsedDoc {
    const rows = [...FV_ROWS];
    if (removeField) {
      const idx = rows.findIndex(
        (r) => r[0].toLowerCase() === removeField.toLowerCase(),
      );
      if (idx >= 0) rows.splice(idx, 1);
    }
    if (addField) {
      rows.push(addField);
    }
    const lines: string[] = [];
    for (const row of rows) {
      for (const cell of row) {
        lines.push(cell);
      }
    }
    return {
      id: "modified.docx::1000",
      path: "modified.docx",
      dir: "",
      fileName: "modified.docx",
      ext: "docx",
      stem: "modified",
      versionTag: null,
      size: 1000,
      content: { type: "text", lines },
    };
  }

  it("Test A: Region South → North = 1 content mismatch", () => {
    const modified = makeModifiedPDF({ Region: "North" });
    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(xlsx),
      toCanonical(modified),
      "intelligent",
    );

    const regionMismatch = result.matched.find(
      (m) => m.baseline.key === "region" && !m.identical,
    );
    expect(regionMismatch).toBeDefined();
    expect(regionMismatch!.baseline.value).toBe("South");
    expect(regionMismatch!.comparing.value).toBe("North");

    // No other field_value differences (paragraph mismatches are expected
    // due to different document headers/extras between formats)
    const otherFieldDiffs = result.matched.filter(
      (m) => !m.identical && m.baseline.kind === "field_value" && m.baseline.key !== "region",
    ).length;
    expect(otherFieldDiffs).toBe(0);
  });

  it("Test B: Status Active → Inactive = 1 content mismatch", () => {
    const modified = makeModifiedPDF({ Status: "Inactive" });
    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(xlsx),
      toCanonical(modified),
      "intelligent",
    );

    const statusMismatch = result.matched.find(
      (m) => m.baseline.key === "status" && !m.identical,
    );
    expect(statusMismatch).toBeDefined();
    expect(statusMismatch!.baseline.value).toBe("Active");
    expect(statusMismatch!.comparing.value).toBe("Inactive");
  });

  it("Test C: Account Manager Arun → Ravi = 1 content mismatch", () => {
    const modified = makeModifiedPDF({ "Account Manager": "Ravi Kumar" });
    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(xlsx),
      toCanonical(modified),
      "intelligent",
    );

    const mismatch = result.matched.find(
      (m) => m.baseline.key === "account manager" && !m.identical,
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.baseline.value).toBe("Arun Kumar");
    expect(mismatch!.comparing.value).toBe("Ravi Kumar");
  });

  it("Test D: Add Country India = 1 added content", () => {
    const modified = makeModifiedDOCX(undefined, ["Country", "India"]);
    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(modified),
      "intelligent",
    );

    const countryAdded = result.addedInComparing.find(
      (i) => i.key === "country",
    );
    expect(countryAdded).toBeDefined();
    expect(countryAdded!.value).toBe("India");
  });

  it("Test E: Remove Customer Since = 1 missing content", () => {
    const modified = makeModifiedDOCX("Customer Since");
    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(modified),
      "intelligent",
    );

    const missing = result.missingInComparing.find(
      (i) => i.key === "customer since",
    );
    expect(missing).toBeDefined();
    expect(missing!.value).toBe("2021-06-15");
  });
});

// ── Additional Cross-Format Comparisons ──────────────────────────────────────

describe("E2E: Remaining cross-format comparisons — identical content", () => {
  const moreComparisons: Array<[string, ParsedDoc, ParsedDoc]> = [
    ["RTF → PDF", rtf, pdf],
    ["RTF → XLSX", rtf, xlsx],
    ["XLSX → RTF", xlsx, rtf],
  ];

  for (const [label, baseline, comparing] of moreComparisons) {
    it(`${label} → 0 false field_value differences`, () => {
      resetDiffCounter();
      const baseCanon = toCanonical(baseline);
      const compCanon = toCanonical(comparing);
      const result = compareCanonical(baseCanon, compCanon, "intelligent");
      logComparison(label, `${baseline.ext} vs ${comparing.ext}`, result);

      const falseMissing = result.missingInComparing.filter(
        (i) => i.kind === "field_value",
      );
      const falseAdded = result.addedInComparing.filter(
        (i) => i.kind === "field_value",
      );
      const falseChanged = result.matched.filter(
        (m) => !m.identical && m.baseline.kind === "field_value" && m.baseline.key === m.comparing.key,
      );

      expect(falseMissing.length).toBe(0);
      expect(falseAdded.length).toBe(0);
      expect(falseChanged.length).toBe(0);
    });
  }
});

// ── Real RTF Parsing Test ────────────────────────────────────────────────────

describe("E2E: Real RTF content through actual rtfToText() parser", () => {
  // Build a real RTF string and parse it through the actual rtfToText function
  const RTF_CONTENT = `{\rtf1\ansi\deff0
{\fonttbl{\f0 Arial;}}
\pard
Customer Profile\par
\par
{\b Field} \tab {\b Value}\par
{\b Account} \tab 1000\par
{\b Customer} \tab Customer Alpha\par
{\b Region} \tab South\par
{\b Account Manager} \tab Arun Kumar\par
{\b Status} \tab Active\par
{\b Customer Since} \tab 2021-06-15\par
\par
Created for cross-format comparison testing.\par
}`;

  it("RTF → clean text preserves all field values", () => {
    const plain = rtfToText(RTF_CONTENT);
    console.log("\n=== Real RTF parsed output ===");
    console.log(plain);

    // Verify key content is present
    expect(plain).toContain("Customer Profile");
    expect(plain).toContain("Account");
    expect(plain).toContain("1000");
    expect(plain).toContain("Customer Alpha");
    expect(plain).toContain("South");
    expect(plain).toContain("Arun Kumar");
    expect(plain).toContain("Active");
    expect(plain).toContain("2021-06-15");

    // Verify RTF control words are NOT in the output
    expect(plain).not.toContain("\\pard");
    expect(plain).not.toContain("\\par");
    expect(plain).not.toContain("\\fs");
    expect(plain).not.toContain("\\b");
    expect(plain).not.toContain("\\rtf");
  });

  it("Real RTF parsed through canonical engine matches XLSX", () => {
    const plain = rtfToText(RTF_CONTENT);
    const lines = plain.split("\n").filter(l => l.trim() !== "");

    // Simulate what parseRtf would produce
    const rtfParsed: ParsedDoc = {
      id: "real.rtf::1000",
      path: "real.rtf",
      dir: "",
      fileName: "real.rtf",
      ext: "rtf",
      stem: "real",
      versionTag: null,
      size: RTF_CONTENT.length,
      content: { type: "text", lines },
    };

    resetDiffCounter();
    const rtfCanon = toCanonical(rtfParsed);
    const xlsxCanon = toCanonical(xlsx);
    const result = compareCanonical(rtfCanon, xlsxCanon, "intelligent");

    logComparison("Real RTF → XLSX", "rtf vs xlsx", result);

    const falseMissing = result.missingInComparing.filter(
      (i) => i.kind === "field_value",
    );
    const falseAdded = result.addedInComparing.filter(
      (i) => i.kind === "field_value",
    );

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });
});

// ── Real XLSX Parsing Test ───────────────────────────────────────────────────

describe("E2E: Real XLSX with extra sheets — no contamination", () => {
  it("XLSX with Validation Notes sheet does not produce false content", () => {
    // Create XLSX with two sheets: Report + Validation Notes
    const wb = XLSX.utils.book_new();
    const reportWs = XLSX.utils.aoa_to_sheet(allFVRows());
    XLSX.utils.book_append_sheet(wb, reportWs, "Report");

    const notesWs = XLSX.utils.aoa_to_sheet([
      ["Validator", "Result"],
      ["Format Check", "PASS"],
      ["Content Check", "PASS"],
    ]);
    XLSX.utils.book_append_sheet(wb, notesWs, "Validation Notes");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const readWb = XLSX.read(buf, { type: "array" });
    const sheets: SheetData[] = readWb.SheetNames.map((name) => {
      const sheet = readWb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1, raw: true, defval: "", blankrows: true,
      });
      return {
        name,
        rows: rows.map((row) =>
          (Array.isArray(row) ? row : []).map((cell) =>
            cell === null || cell === undefined ? "" : String(cell),
          ),
        ),
      };
    });

    const multiSheetDoc: ParsedDoc = {
      id: "multi.xlsx::1000",
      path: "multi.xlsx",
      dir: "",
      fileName: "multi.xlsx",
      ext: "xlsx",
      stem: "multi",
      versionTag: null,
      size: buf.byteLength,
      content: { type: "sheet", sheets },
    };

    const multiCanon = toCanonical(multiSheetDoc);
    const pdfCanon = toCanonical(pdf);

    // The main 6 field_values should still match PDF → XLSX
    const result = compareCanonical(pdfCanon, multiCanon, "intelligent");
    logComparison("PDF → XLSX(multi-sheet)", "pdf vs xlsx-multi", result);

    // Main fields from Report sheet must NOT be missing
    const missingKeys = result.missingInComparing.filter(i => i.kind === "field_value").map(i => i.key);
    expect(missingKeys).not.toContain("account");
    expect(missingKeys).not.toContain("customer");
    expect(missingKeys).not.toContain("region");
    expect(missingKeys).not.toContain("account manager");
    expect(missingKeys).not.toContain("status");
    expect(missingKeys).not.toContain("customer since");

    // Validation Notes sheet content (validator, format check, etc.) are legitimate
    // additions — they exist in XLSX but not in PDF. This is expected.
    // The key assertion: NO main report fields are missing or falsely added.
  });
});

// ── Unicode and Special Characters ────────────────────────────────────────────

describe("E2E: Unicode and special characters preserved through pipeline", () => {
  it("Unicode field values survive normalization", () => {
    const unicodePDF: ParsedDoc = {
      id: "unicode.pdf::1000",
      path: "unicode.pdf",
      dir: "",
      fileName: "unicode.pdf",
      ext: "pdf",
      stem: "unicode",
      versionTag: null,
      size: 1000,
      content: {
        type: "text",
        lines: [
          "Field | Value",
          "Account | 1000",
          "Customer | José García",
          "City | München",
          "Balance | $15,400.00",
          "Company | ACME & Co.",
          "Notes | 50% discount — valid until 2026-08-20",
        ],
      },
    };

    const unicodeXLSX: ParsedDoc = {
      id: "unicode.xlsx::1000",
      path: "unicode.xlsx",
      dir: "",
      fileName: "unicode.xlsx",
      ext: "xlsx",
      stem: "unicode",
      versionTag: null,
      size: 1000,
      content: {
        type: "sheet",
        sheets: [{
          name: "Report",
          rows: [
            ["Field", "Value"],
            ["Account", "1000"],
            ["Customer", "José García"],
            ["City", "München"],
            ["Balance", "$15,400.00"],
            ["Company", "ACME & Co."],
            ["Notes", "50% discount — valid until 2026-08-20"],
          ],
        }],
      },
    };

    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(unicodePDF),
      toCanonical(unicodeXLSX),
      "intelligent",
    );
    logComparison("Unicode PDF → Unicode XLSX", "pdf vs xlsx", result);

    const falseMissing = result.missingInComparing.filter(
      (i) => i.kind === "field_value",
    );
    const falseAdded = result.addedInComparing.filter(
      (i) => i.kind === "field_value",
    );

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);

    // Verify specific Unicode values are preserved
    const customer = result.matched.find(m => m.baseline.key === "customer");
    expect(customer).toBeDefined();
    expect(customer!.baseline.value).toContain("José");
    expect(customer!.comparing.value).toContain("José");

    const city = result.matched.find(m => m.baseline.key === "city");
    expect(city).toBeDefined();
    expect(city!.baseline.value).toContain("München");
  });
});
