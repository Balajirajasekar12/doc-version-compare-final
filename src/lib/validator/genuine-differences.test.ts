/**
 * Genuine Differences Test Suite
 *
 * Verifies that real data changes (VALUE_MISMATCH, MISSING_CONTENT, ADDED_CONTENT)
 * are correctly detected across PDF/RTF/DOCX/XLSX format combinations.
 * Also verifies that identical content across formats produces ZERO false differences.
 */
import { describe, it, expect } from "vitest";
import {
  toCanonical,
  compareCanonical,
  generateCanonicalDiffs,
  resetDiffCounter,
  type ContentItem,
} from "./canonical";
import type { ComparisonMode, ParsedDoc } from "./types";

// ── Test Helpers ────────────────────────────────────────────────────────────

function makeTextDoc(
  ext: "pdf" | "rtf" | "docx",
  lines: string[],
  fileName = `test.${ext}`,
): ParsedDoc {
  return {
    id: `${fileName}::0`,
    path: fileName,
    dir: "",
    fileName,
    ext,
    stem: fileName.replace(/\.[^.]+$/, ""),
    versionTag: "baseline",
    size: 0,
    content: { type: "text", lines },
  };
}

function makeSheetDoc(
  ext: "xlsx",
  sheetName: string,
  rows: string[][],
  fileName = `test.${ext}`,
): ParsedDoc {
  return {
    id: `${fileName}::0`,
    path: fileName,
    dir: "",
    fileName,
    ext,
    stem: fileName.replace(/\.[^.]+$/, ""),
    versionTag: "baseline",
    size: 0,
    content: { type: "sheet", sheets: [{ name: sheetName, rows }] },
  };
}

// Standard report data used across all tests
const STANDARD_ROWS = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

const STANDARD_PIPE_LINES = STANDARD_ROWS.map(([k, v]) => `${k} | ${v}`);

// Simulate RTF alternating key/value output (Field on one line, Value on next)
const STANDARD_RTF_LINES = STANDARD_ROWS.flatMap(([k, v]) => [k, v]);

// Simulate PDF space-separated table output (Field  Value with 2+ spaces)
const STANDARD_PDF_LINES = STANDARD_ROWS.map(([k, v]) => `${k}    ${v}`);

// ── Part 1: Identical content across formats should produce ZERO differences ─

describe("Genuine Differences: Identical content across formats", () => {
  it("RTF pipe vs XLSX Field/Value → zero false differences", () => {
    const rtf = makeTextDoc("rtf", [
      "Customer Profile",
      ...STANDARD_PIPE_LINES,
      "Synthetic data - no real PHI.",
    ]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...STANDARD_ROWS,
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    const falseMismatch = result.matched.filter(m => !m.identical);

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
    expect(falseMismatch.length).toBe(0);
  });

  it("PDF space-separated vs DOCX pipe → zero false differences", () => {
    const pdf = makeTextDoc("pdf", [
      "Sales Summary",
      ...STANDARD_PDF_LINES,
    ]);
    const docx = makeTextDoc("docx", [
      "Customer Profile",
      ...STANDARD_PIPE_LINES,
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    const falseMismatch = result.matched.filter(m => !m.identical);

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
    expect(falseMismatch.length).toBe(0);
  });

  it("XLSX vs PDF → zero false differences", () => {
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...STANDARD_ROWS,
    ]);
    const pdf = makeTextDoc("pdf", [
      "Sales Summary",
      ...STANDARD_PDF_LINES,
    ]);

    const result = compareCanonical(
      toCanonical(xlsx),
      toCanonical(pdf),
      "intelligent",
    );

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    const falseMismatch = result.matched.filter(m => !m.identical);

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
    expect(falseMismatch.length).toBe(0);
  });

  it("RTF alternating lines vs PDF space-separated → zero false differences", () => {
    const rtf = makeTextDoc("rtf", STANDARD_RTF_LINES);
    const pdf = makeTextDoc("pdf", STANDARD_PDF_LINES);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(pdf),
      "intelligent",
    );

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    const falseMismatch = result.matched.filter(m => !m.identical);

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
    expect(falseMismatch.length).toBe(0);
  });

  it("DOCX pipe vs XLSX Field/Value → zero false differences", () => {
    const docx = makeTextDoc("docx", STANDARD_PIPE_LINES);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...STANDARD_ROWS,
    ]);

    const result = compareCanonical(
      toCanonical(docx),
      toCanonical(xlsx),
      "intelligent",
    );

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    const falseMismatch = result.matched.filter(m => !m.identical);

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
    expect(falseMismatch.length).toBe(0);
  });

  it("PDF pipe vs RTF pipe → zero false differences", () => {
    const pdf = makeTextDoc("pdf", STANDARD_PIPE_LINES);
    const rtf = makeTextDoc("rtf", STANDARD_PIPE_LINES);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(rtf),
      "intelligent",
    );

    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    const falseMismatch = result.matched.filter(m => !m.identical);

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
    expect(falseMismatch.length).toBe(0);
  });
});

// ── Part 2: Genuine VALUE_MISMATCH should be detected ──────────────────────

describe("Genuine Differences: VALUE_MISMATCH detection", () => {
  const alteredRows: [string, string][] = [
    ["Account", "1000"],
    ["Customer", "Customer Alpha"],
    ["Region", "North"],          // Changed from South
    ["Account Manager", "Arun Kumar"],
    ["Status", "Inactive"],       // Changed from Active
    ["Customer Since", "2021-06-15"],
  ];

  it("detects Region South → North across RTF vs XLSX", () => {
    const rtf = makeTextDoc("rtf", STANDARD_PIPE_LINES);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...alteredRows,
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    // Should find exactly 2 mismatches: Region and Status
    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(2);

    const regionMismatch = mismatches.find(m => m.baseline.key === "region");
    expect(regionMismatch).toBeDefined();
    expect(regionMismatch!.baseline.value).toBe("South");
    expect(regionMismatch!.comparing.value).toBe("North");

    const statusMismatch = mismatches.find(m => m.baseline.key === "status");
    expect(statusMismatch).toBeDefined();
    expect(statusMismatch!.baseline.value).toBe("Active");
    expect(statusMismatch!.comparing.value).toBe("Inactive");
  });

  it("detects Region South → North across PDF vs DOCX", () => {
    const pdf = makeTextDoc("pdf", STANDARD_PDF_LINES);
    const docx = makeTextDoc("docx", alteredRows.map(([k, v]) => `${k} | ${v}`));

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(2);

    const regionMismatch = mismatches.find(m => m.baseline.key === "region");
    expect(regionMismatch).toBeDefined();
    expect(regionMismatch!.baseline.value).toBe("South");
    expect(regionMismatch!.comparing.value).toBe("North");

    const statusMismatch = mismatches.find(m => m.baseline.key === "status");
    expect(statusMismatch).toBeDefined();
    expect(statusMismatch!.baseline.value).toBe("Active");
    expect(statusMismatch!.comparing.value).toBe("Inactive");
  });

  it("detects VALUE_MISMATCH across XLSX vs RTF", () => {
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...STANDARD_ROWS,
    ]);
    const rtf = makeTextDoc("rtf", alteredRows.map(([k, v]) => `${k} | ${v}`));

    const result = compareCanonical(
      toCanonical(xlsx),
      toCanonical(rtf),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(2);
  });

  it("detects single value change: Customer Since date changed", () => {
    const pdf = makeTextDoc("pdf", STANDARD_PIPE_LINES);
    const docx = makeTextDoc("docx", [
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
      "Account Manager | Arun Kumar",
      "Status | Active",
      "Customer Since | 2023-01-15",  // Changed from 2021-06-15
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.key).toBe("customer since");
    expect(mismatches[0].baseline.value).toBe("2021-06-15");
    expect(mismatches[0].comparing.value).toBe("2023-01-15");
  });

  it("detects numeric value change: Account changed from 1000 to 2000", () => {
    const rtf = makeTextDoc("rtf", STANDARD_PIPE_LINES);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Account", "2000"],  // Changed from 1000
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
      ["Account Manager", "Arun Kumar"],
      ["Status", "Active"],
      ["Customer Since", "2021-06-15"],
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.key).toBe("account");
    expect(mismatches[0].baseline.value).toBe("1000");
    expect(mismatches[0].comparing.value).toBe("2000");
  });
});

// ── Part 3: Genuine MISSING_CONTENT detection ──────────────────────────────

describe("Genuine Differences: MISSING_CONTENT detection", () => {
  it("detects missing field across RTF vs XLSX", () => {
    const rtf = makeTextDoc("rtf", STANDARD_PIPE_LINES);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
      ["Account Manager", "Arun Kumar"],
      // Status is missing
      ["Customer Since", "2021-06-15"],
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const missing = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missing.length).toBe(1);
    expect(missing[0].key).toBe("status");
  });

  it("detects missing field across PDF vs DOCX", () => {
    const pdf = makeTextDoc("pdf", STANDARD_PDF_LINES);
    const docx = makeTextDoc("docx", [
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
      // Account Manager is missing
      "Status | Active",
      "Customer Since | 2021-06-15",
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );

    const missing = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missing.length).toBe(1);
    expect(missing[0].key).toBe("account manager");
  });

  it("detects multiple missing fields", () => {
    const pdf = makeTextDoc("pdf", STANDARD_PDF_LINES);
    const rtf = makeTextDoc("rtf", [
      "Account | 1000",
      "Region | South",
      // Customer, Account Manager, Status, Customer Since all missing
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(rtf),
      "intelligent",
    );

    const missing = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missing.length).toBe(4);
    const missingKeys = missing.map(m => m.key).sort();
    expect(missingKeys).toEqual([
      "account manager",
      "customer",
      "customer since",
      "status",
    ]);
  });
});

// ── Part 4: Genuine ADDED_CONTENT detection ────────────────────────────────

describe("Genuine Differences: ADDED_CONTENT detection", () => {
  it("detects added field across RTF vs XLSX", () => {
    const rtf = makeTextDoc("rtf", [
      "Account | 1000",
      "Region | South",
    ]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],  // Added
      ["Region", "South"],
      ["Account Manager", "Arun Kumar"],  // Added
      ["Status", "Active"],  // Added
      ["Customer Since", "2021-06-15"],  // Added
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const added = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(added.length).toBe(4);
    const addedKeys = added.map(a => a.key).sort();
    expect(addedKeys).toEqual([
      "account manager",
      "customer",
      "customer since",
      "status",
    ]);
  });

  it("detects added field across PDF vs RTF", () => {
    const pdf = makeTextDoc("pdf", [
      "Account | 1000",
      "Region | South",
    ]);
    const rtf = makeTextDoc("rtf", [
      "Account | 1000",
      "Region | South",
      "Status | Active",
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(rtf),
      "intelligent",
    );

    const added = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(added.length).toBe(1);
    expect(added[0].key).toBe("status");
  });
});

// ── Part 5: generateCanonicalDiffs produces correct DiffRecord types ────────

describe("Genuine Differences: DiffRecord generation", () => {
  it("produces value_mismatch DiffRecord for changed value", () => {
    resetDiffCounter();
    const baseline = makeTextDoc("pdf", ["Region | South"]);
    const comparing = makeTextDoc("rtf", ["Region | North"]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "g1",
      "Test Group",
      "1000",
      baseline,
      comparing,
      result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
    );

    expect(diffs.length).toBe(1);
    expect(diffs[0].differenceType).toBe("value_mismatch");
    expect(diffs[0].referenceText).toBe("South");
    expect(diffs[0].versions[0].text).toBe("North");
  });

  it("produces missing_content DiffRecord for removed field", () => {
    resetDiffCounter();
    const baseline = makeTextDoc("pdf", [
      "Account | 1000",
      "Status | Active",
    ]);
    const comparing = makeTextDoc("rtf", [
      "Account | 1000",
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "g1",
      "Test Group",
      "1000",
      baseline,
      comparing,
      result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
    );

    expect(diffs.length).toBe(1);
    expect(diffs[0].differenceType).toBe("missing_content");
    expect(diffs[0].referenceText).toBe("Active");
    expect(diffs[0].locationLabel).toBe("Status");
  });

  it("produces added_content DiffRecord for added field", () => {
    resetDiffCounter();
    const baseline = makeTextDoc("pdf", [
      "Account | 1000",
    ]);
    const comparing = makeTextDoc("rtf", [
      "Account | 1000",
      "Status | Active",
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "g1",
      "Test Group",
      "1000",
      baseline,
      comparing,
      result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
    );

    expect(diffs.length).toBe(1);
    expect(diffs[0].differenceType).toBe("added_content");
    expect(diffs[0].versions[0].text).toBe("Active");
    expect(diffs[0].locationLabel).toBe("Status");
  });

  it("produces zero DiffRecords for identical content", () => {
    resetDiffCounter();
    const baseline = makeTextDoc("pdf", STANDARD_PIPE_LINES);
    const comparing = makeTextDoc("xlsx", STANDARD_PIPE_LINES);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "g1",
      "Test Group",
      "1000",
      baseline,
      comparing,
      result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
    );

    expect(diffs.length).toBe(0);
  });

  it("detects all 3 difference types in one comparison", () => {
    resetDiffCounter();
    const baseline = makeTextDoc("pdf", [
      "Account | 1000",
      "Customer | Customer Alpha",  // Will be missing in comparing
      "Region | South",              // Will be mismatched
      "Status | Active",
    ]);
    const comparing = makeTextDoc("rtf", [
      "Account | 1000",
      "Region | North",              // Changed from South
      "Status | Active",
      "Account Manager | Arun Kumar", // Added
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "g1",
      "Test Group",
      "1000",
      baseline,
      comparing,
      result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
    );

    // Should have: 1 mismatch (Region), 1 missing (Customer), 1 added (Account Manager)
    const mismatches = diffs.filter(d => d.differenceType === "value_mismatch");
    const missing = diffs.filter(d => d.differenceType === "missing_content");
    const added = diffs.filter(d => d.differenceType === "added_content");

    expect(mismatches.length).toBe(1);
    expect(mismatches[0].referenceText).toBe("South");
    expect(mismatches[0].versions[0].text).toBe("North");

    expect(missing.length).toBe(1);
    expect(missing[0].referenceText).toBe("Customer Alpha");

    expect(added.length).toBe(1);
    expect(added[0].versions[0].text).toBe("Arun Kumar");
  });
});

// ── Part 6: Multi-word keys and special values ─────────────────────────────

describe("Genuine Differences: Multi-word keys and special values", () => {
  it("detects change in multi-word key: Account Manager", () => {
    const xlsx1 = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Account Manager", "Arun Kumar"],
    ]);
    const xlsx2 = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Account Manager", "Priya Sharma"],  // Changed
    ]);

    const result = compareCanonical(
      toCanonical(xlsx1),
      toCanonical(xlsx2),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.value).toBe("Arun Kumar");
    expect(mismatches[0].comparing.value).toBe("Priya Sharma");
  });

  it("preserves date values in mismatch comparison", () => {
    const rtf = makeTextDoc("rtf", ["Customer Since | 2021-06-15"]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Customer Since", "2022-12-31"],
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.value).toBe("2021-06-15");
    expect(mismatches[0].comparing.value).toBe("2022-12-31");
  });

  it("preserves currency values in comparison", () => {
    const rtf = makeTextDoc("rtf", ["Amount | ₹15,400.00"]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Amount", "₹18,200.00"],
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.value).toBe("₹15,400.00");
    expect(mismatches[0].comparing.value).toBe("₹18,200.00");
  });

  it("preserves Unicode values in comparison", () => {
    const rtf = makeTextDoc("rtf", ["Location | München"]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Location", "東京"],
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.value).toBe("München");
    expect(mismatches[0].comparing.value).toBe("東京");
  });

  it("preserves hyphenated values in comparison", () => {
    const rtf = makeTextDoc("rtf", ["Product Code | ABC-123"]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Product Code", "XYZ-789"],
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.value).toBe("ABC-123");
    expect(mismatches[0].comparing.value).toBe("XYZ-789");
  });
});

// ── Part 7: RTF alternating lines vs XLSX (the exact production scenario) ──

describe("Genuine Differences: RTF alternating lines vs XLSX Field/Value table", () => {
  it("RTF alternating lines produce same field_values as XLSX table", () => {
    // RTF parser produces: "Account\n1000\nCustomer\nCustomer Alpha\n..."
    const rtf = makeTextDoc("rtf", STANDARD_RTF_LINES);
    // XLSX produces: [["Field", "Value"], ["Account", "1000"], ...]
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...STANDARD_ROWS,
    ]);

    const rtfItems = toCanonical(rtf);
    const xlsxItems = toCanonical(xlsx);

    // RTF alternating lines: all 6 key-value pairs are now detected by
    // normalizeCellLines (including Account/1000). XLSX also produces 6 field_values.
    const rtfFV = rtfItems.items.filter(i => i.kind === "field_value");
    const xlsxFV = xlsxItems.items.filter(i => i.kind === "field_value");

    expect(rtfFV.length).toBe(6);
    expect(xlsxFV.length).toBe(6);

    // Compare
    const result = compareCanonical(rtfItems, xlsxItems, "intelligent");
    const falseDiffs = result.missingInComparing.length +
      result.addedInComparing.length +
      result.matched.filter(m => !m.identical).length;

    expect(falseDiffs).toBe(0);
  });

  it("RTF vs XLSX detects Region change in alternating-lines format", () => {
    const rtf = makeTextDoc("rtf", STANDARD_RTF_LINES);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...STANDARD_ROWS.map(([k, v]) =>
        k === "Region" ? ["Region", "North"] : [k, v] as [string, string]
      ),
    ]);

    const result = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.key).toBe("region");
    expect(mismatches[0].baseline.value).toBe("South");
    expect(mismatches[0].comparing.value).toBe("North");
  });
});

// ── Part 8: PDF table with header row detection ─────────────────────────────

describe("Genuine Differences: PDF table with header detection", () => {
  it("PDF pipe table header 'Field | Value' is not flagged as difference", () => {
    const pdf = makeTextDoc("pdf", [
      "Field | Value",
      ...STANDARD_PIPE_LINES,
    ]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ...STANDARD_ROWS,
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(xlsx),
      "intelligent",
    );

    // Field/Value header should not create any field_value differences
    const falseFieldDiffs = [
      ...result.missingInComparing.filter(i => i.kind === "field_value"),
      ...result.addedInComparing.filter(i => i.kind === "field_value"),
      ...result.matched.filter(m => !m.identical && m.baseline.kind === "field_value"),
    ];

    expect(falseFieldDiffs.length).toBe(0);
  });

  it("PDF 5-column table with data change is detected", () => {
    const pdf = makeTextDoc("pdf", [
      "Transaction ID | Product | Quantity | Amount | Status",
      "TX10001 | Laptop | 2 | 3,600.00 | Completed",
      "TX10002 | Mouse | 10 | 500.00 | Pending",
    ]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Transaction ID", "Product", "Quantity", "Amount", "Status"],
      ["TX10001", "Laptop", "2", "3,600.00", "Completed"],
      ["TX10002", "Mouse", "10", "500.00", "Cancelled"],  // Changed from Pending
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(xlsx),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBeGreaterThanOrEqual(1);

    // PDF 5-column table: 2nd row's status gets key="status 1" (deduplicated)
    const statusMismatch = mismatches.find(m =>
      m.baseline.key.startsWith("status") && m.baseline.value === "Pending"
    );
    expect(statusMismatch).toBeDefined();
    expect(statusMismatch!.comparing.value).toBe("Cancelled");
  });
});

// ── Part 9: Full standard report across all 12 format combinations ─────────

describe("Genuine Differences: All 12 cross-format combinations", () => {
  function makePDFDoc(lines: string[]) { return makeTextDoc("pdf", lines); }
  function makeRTFDoc(lines: string[]) { return makeTextDoc("rtf", lines); }
  function makeDOCXDoc(lines: string[]) { return makeTextDoc("docx", lines); }
  function makeXLSXDoc(rows: string[][]) { return makeSheetDoc("xlsx", "Report", [["Field", "Value"], ...rows]); }

  const combos: Array<{
    name: string;
    baseline: () => ParsedDoc;
    comparing: () => ParsedDoc;
  }> = [
    { name: "PDF→RTF", baseline: () => makePDFDoc(STANDARD_PIPE_LINES), comparing: () => makeRTFDoc(STANDARD_PIPE_LINES) },
    { name: "PDF→DOCX", baseline: () => makePDFDoc(STANDARD_PIPE_LINES), comparing: () => makeDOCXDoc(STANDARD_PIPE_LINES) },
    { name: "PDF→XLSX", baseline: () => makePDFDoc(STANDARD_PIPE_LINES), comparing: () => makeXLSXDoc(STANDARD_ROWS) },
    { name: "RTF→PDF", baseline: () => makeRTFDoc(STANDARD_PIPE_LINES), comparing: () => makePDFDoc(STANDARD_PIPE_LINES) },
    { name: "RTF→DOCX", baseline: () => makeRTFDoc(STANDARD_PIPE_LINES), comparing: () => makeDOCXDoc(STANDARD_PIPE_LINES) },
    { name: "RTF→XLSX", baseline: () => makeRTFDoc(STANDARD_PIPE_LINES), comparing: () => makeXLSXDoc(STANDARD_ROWS) },
    { name: "DOCX→PDF", baseline: () => makeDOCXDoc(STANDARD_PIPE_LINES), comparing: () => makePDFDoc(STANDARD_PIPE_LINES) },
    { name: "DOCX→RTF", baseline: () => makeDOCXDoc(STANDARD_PIPE_LINES), comparing: () => makeRTFDoc(STANDARD_PIPE_LINES) },
    { name: "DOCX→XLSX", baseline: () => makeDOCXDoc(STANDARD_PIPE_LINES), comparing: () => makeXLSXDoc(STANDARD_ROWS) },
    { name: "XLSX→PDF", baseline: () => makeXLSXDoc(STANDARD_ROWS), comparing: () => makePDFDoc(STANDARD_PIPE_LINES) },
    { name: "XLSX→RTF", baseline: () => makeXLSXDoc(STANDARD_ROWS), comparing: () => makeRTFDoc(STANDARD_PIPE_LINES) },
    { name: "XLSX→DOCX", baseline: () => makeXLSXDoc(STANDARD_ROWS), comparing: () => makeDOCXDoc(STANDARD_PIPE_LINES) },
  ];

  for (const { name, baseline, comparing } of combos) {
    it(`${name}: identical content → zero differences`, () => {
      const result = compareCanonical(
        toCanonical(baseline()),
        toCanonical(comparing()),
        "intelligent",
      );
      const totalDiffs =
        result.missingInComparing.length +
        result.addedInComparing.length +
        result.matched.filter(m => !m.identical).length;
      expect(totalDiffs).toBe(0);
    });
  }

  // Test one combo with a real change
  it("XLSX→RTF: Region South→North detected as VALUE_MISMATCH", () => {
    const xlsx = makeXLSXDoc([
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "North"],  // Changed
      ["Account Manager", "Arun Kumar"],
      ["Status", "Active"],
      ["Customer Since", "2021-06-15"],
    ]);
    const rtf = makeRTFDoc(STANDARD_PIPE_LINES);

    const result = compareCanonical(
      toCanonical(xlsx),
      toCanonical(rtf),
      "intelligent",
    );

    const mismatches = result.matched.filter(m => !m.identical);
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].baseline.key).toBe("region");
    expect(mismatches[0].baseline.value).toBe("North");
    expect(mismatches[0].comparing.value).toBe("South");
  });
});
