/**
 * Comprehensive regression tests for the canonical document model
 * and format-agnostic comparison engine.
 *
 * Tests cover:
 * - Normalization layer
 * - Canonical conversion from text documents
 * - Canonical conversion from spreadsheet documents
 * - Cross-format comparison (PDF vs RTF, PDF vs DOCX, XLSX vs CSV, etc.)
 * - Field/value matching across different physical representations
 * - Genuine difference detection
 * - Duplicate deduplication
 * - Order independence
 */
import { describe, it, expect } from "vitest";
import {
  normalizeText,
  normalizeKey,
  toCanonical,
  compareCanonical,
  generateCanonicalDiffs,
  resetDiffCounter,
  type CanonicalMatchResult,
} from "./canonical";
import type { ComparisonMode, ParsedDoc } from "./types";

// ── Test Helpers ────────────────────────────────────────────────────────────

function makeDoc(
  ext: "pdf" | "rtf" | "docx" | "xlsx" | "csv",
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
    versionTag: "",
    size: 0,
    content: { type: "text", lines },
  };
}

function makeSheetDoc(
  ext: "xlsx" | "csv",
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
    versionTag: "",
    size: 0,
    content: { type: "sheet", sheets: [{ name: sheetName, rows }] },
  };
}

function countDifferences(result: CanonicalMatchResult): number {
  return (
    result.missingInComparing.length +
    result.addedInComparing.length +
    result.matched.filter(m => !m.identical).length
  );
}

// ── Normalization Layer ─────────────────────────────────────────────────────

describe("normalizeText", () => {
  it("trims whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("hello    world")).toBe("hello world");
  });

  it("normalizes CR/LF", () => {
    expect(normalizeText("hello\r\nworld")).toBe("hello\nworld");
    expect(normalizeText("hello\rworld")).toBe("hello\nworld");
  });

  it("strips zero-width characters", () => {
    expect(normalizeText("he\u200Bllo")).toBe("hello");
  });

  it("strips non-breaking spaces", () => {
    expect(normalizeText("hello\u00A0world")).toBe("hello world");
  });

  it("strips Unicode whitespace", () => {
    expect(normalizeText("hello\u2003world")).toBe("hello world");
  });

  it("preserves meaningful newlines", () => {
    expect(normalizeText("hello\n\n\n\nworld")).toBe("hello\n\nworld");
  });
});

describe("normalizeKey", () => {
  it("lowercases", () => {
    expect(normalizeKey("Region")).toBe("region");
  });

  it("strips punctuation", () => {
    expect(normalizeKey("Account #")).toBe("account");
  });

  it("collapses whitespace", () => {
    expect(normalizeKey("Account  Manager")).toBe("account manager");
  });

  it("handles complex keys", () => {
    expect(normalizeKey("Sales Amount (USD)")).toBe("sales amount usd");
  });
});

// ── Canonical Conversion ────────────────────────────────────────────────────

describe("toCanonical - text documents", () => {
  it("converts pipe-delimited data to field_value items", () => {
    const doc = makeDoc("rtf", [
      "Field | Value",
      "Account | 1000",
      "Region | South",
    ]);
    const canonical = toCanonical(doc);
    const fv = canonical.items.filter(i => i.kind === "field_value");
    expect(fv.length).toBe(2);
    expect(fv[0].key).toBe("account");
    expect(fv[0].value).toBe("1000");
    expect(fv[1].key).toBe("region");
    expect(fv[1].value).toBe("South");
  });

  it("converts colon-separated data to field_value items", () => {
    const doc = makeDoc("pdf", [
      "Account: 1000",
      "Region: South",
    ]);
    const canonical = toCanonical(doc);
    const fv = canonical.items.filter(i => i.kind === "field_value");
    expect(fv.length).toBe(2);
    expect(fv[0].key).toBe("account");
    expect(fv[0].value).toBe("1000");
  });

  it("preserves headings", () => {
    const doc = makeDoc("docx", [
      "# Sales Summary",
      "Some content",
    ]);
    const canonical = toCanonical(doc);
    const headings = canonical.items.filter(i => i.kind === "heading");
    expect(headings.length).toBe(1);
    expect(headings[0].value).toBe("Sales Summary");
  });

  it("preserves paragraphs", () => {
    const doc = makeDoc("rtf", [
      "This is a paragraph.",
      "Another paragraph.",
    ]);
    const canonical = toCanonical(doc);
    const paragraphs = canonical.items.filter(i => i.kind === "paragraph");
    expect(paragraphs.length).toBe(2);
  });

  it("skips header rows in multi-row pipe tables", () => {
    const doc = makeDoc("pdf", [
      "Field | Value",
      "Account | 1000",
    ]);
    const canonical = toCanonical(doc);
    const fv = canonical.items.filter(i => i.kind === "field_value");
    // Header "Field | Value" is NOT a field_value, only data rows are
    expect(fv.length).toBe(1);
    expect(fv[0].key).toBe("account");
    expect(fv[0].value).toBe("1000");
  });

  it("does NOT skip single-row pipe table as header", () => {
    const doc = makeDoc("pdf", ["Region | South"]);
    const canonical = toCanonical(doc);
    const fv = canonical.items.filter(i => i.kind === "field_value");
    expect(fv.length).toBe(1);
    expect(fv[0].key).toBe("region");
    expect(fv[0].value).toBe("South");
  });

  it("deduplicates identical content", () => {
    const doc = makeDoc("pdf", [
      "Account | 1000",
      "Account | 1000",
    ]);
    const canonical = toCanonical(doc);
    const fv = canonical.items.filter(i => i.kind === "field_value");
    expect(fv.length).toBe(1);
  });
});

describe("toCanonical - spreadsheet documents", () => {
  it("converts header+data rows to field_value items", () => {
    const doc = makeSheetDoc("xlsx", "Sheet1", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Region", "South"],
    ]);
    const canonical = toCanonical(doc);
    const fv = canonical.items.filter(i => i.kind === "field_value");
    expect(fv.length).toBe(2);
    expect(fv[0].key).toBe("account");
    expect(fv[0].value).toBe("1000");
    expect(fv[1].key).toBe("region");
    expect(fv[1].value).toBe("South");
  });

  it("handles numeric headers", () => {
    const doc = makeSheetDoc("xlsx", "Sheet1", [
      ["1", "2"],
      ["Account", "1000"],
    ]);
    const canonical = toCanonical(doc);
    // Numeric headers → no header row → all cells become table_cell
    const cells = canonical.items.filter(i => i.kind === "table_cell");
    expect(cells.length).toBe(4); // 2 rows × 2 columns
  });
});

// ── Cross-Format Comparison ─────────────────────────────────────────────────

describe("Cross-format comparison", () => {
  const sharedData = [
    "Field | Value",
    "Account | 1000",
    "Customer | Customer Alpha",
    "Region | South",
    "Account Manager | Arun Kumar",
    "Status | Active",
    "Customer Since | 2021-06-15",
  ];

  it("PDF pipe table matches RTF pipe-delimited", () => {
    const pdf = makeDoc("pdf", sharedData);
    const rtf = makeDoc("rtf", sharedData);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(rtf),
      "intelligent",
    );
    // All field_value items should match
    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missingFV.length).toBe(0);
    const addedFV = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(addedFV.length).toBe(0);
    const mismatchedFV = result.matched.filter(m => !m.identical && m.baseline.kind === "field_value");
    expect(mismatchedFV.length).toBe(0);
  });

  it("PDF pipe table matches RTF colon-separated", () => {
    const pdf = makeDoc("pdf", sharedData);
    const rtf = makeDoc("rtf", [
      "Account: 1000",
      "Customer: Customer Alpha",
      "Region: South",
      "Account Manager: Arun Kumar",
      "Status: Active",
      "Customer Since: 2021-06-15",
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(rtf),
      "intelligent",
    );
    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missingFV.length).toBe(0);
  });

  it("PDF matches XLSX (header+data rows)", () => {
    const pdf = makeDoc("pdf", sharedData);
    const xlsx = makeSheetDoc("xlsx", "Sheet1", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
      ["Account Manager", "Arun Kumar"],
      ["Status", "Active"],
      ["Customer Since", "2021-06-15"],
    ]);

    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(xlsx),
      "intelligent",
    );
    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missingFV.length).toBe(0);
  });

  it("DOCX matches CSV (header+data rows)", () => {
    const docx = makeDoc("docx", sharedData);
    const csv = makeSheetDoc("csv", "Sheet1", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
      ["Account Manager", "Arun Kumar"],
      ["Status", "Active"],
      ["Customer Since", "2021-06-15"],
    ]);

    const result = compareCanonical(
      toCanonical(docx),
      toCanonical(csv),
      "intelligent",
    );
    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missingFV.length).toBe(0);
  });

  it("XLSX matches RTF pipe-delimited", () => {
    const xlsx = makeSheetDoc("xlsx", "Sheet1", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Region", "South"],
    ]);
    const rtf = makeDoc("rtf", ["Account | 1000", "Region | South"]);

    const result = compareCanonical(
      toCanonical(xlsx),
      toCanonical(rtf),
      "intelligent",
    );
    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(missingFV.length).toBe(0);
  });
});

// ── Genuine Difference Detection ────────────────────────────────────────────

describe("Genuine differences", () => {
  it("detects MISSING_CONTENT when field is absent", () => {
    const baseline = makeDoc("pdf", [
      "Account | 1000",
      "Region | South",
      "Status | Active",
    ]);
    const comparing = makeDoc("rtf", [
      "Account | 1000",
      "Region | South",
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    expect(result.missingInComparing.length).toBe(1);
    expect(result.missingInComparing[0].key).toBe("status");
  });

  it("detects ADDED_CONTENT when extra field exists", () => {
    const baseline = makeDoc("pdf", [
      "Account | 1000",
    ]);
    const comparing = makeDoc("rtf", [
      "Account | 1000",
      "Region | South",
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    expect(result.addedInComparing.length).toBe(1);
    expect(result.addedInComparing[0].key).toBe("region");
  });

  it("detects VALUE_MISMATCH when values differ", () => {
    const baseline = makeDoc("pdf", [
      "Region | South",
    ]);
    const comparing = makeDoc("rtf", [
      "Region | North",
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].identical).toBe(false);
    expect(result.matched[0].baseline.value).toBe("South");
    expect(result.matched[0].comparing.value).toBe("North");
  });

  it("does NOT report false MISSING_CONTENT for identical content", () => {
    const baseline = makeDoc("pdf", [
      "Account | 1000",
      "Region | South",
      "Status | Active",
    ]);
    const comparing = makeDoc("rtf", [
      "Account | 1000",
      "Region | South",
      "Status | Active",
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.addedInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.matched.filter(m => !m.identical && m.baseline.kind === "field_value").length).toBe(0);
  });
});

// ── Order Independence ──────────────────────────────────────────────────────

describe("Order independence", () => {
  it("matches content regardless of order", () => {
    const baseline = makeDoc("pdf", [
      "Account | 1000",
      "Region | South",
      "Status | Active",
    ]);
    const comparing = makeDoc("rtf", [
      "Status | Active",
      "Account | 1000",
      "Region | South",
    ]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.addedInComparing.filter(i => i.kind === "field_value").length).toBe(0);
  });
});

// ── Whitespace and Delimiter Variations ─────────────────────────────────────

describe("Whitespace and delimiter normalization", () => {
  it("matches pipe vs colon separated", () => {
    const baseline = makeDoc("pdf", ["Region | South"]);
    const comparing = makeDoc("rtf", ["Region: South"]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.addedInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    const mismatched = result.matched.filter(m => !m.identical && m.baseline.kind === "field_value");
    expect(mismatched.length).toBe(0);
  });

  it("matches extra whitespace", () => {
    const baseline = makeDoc("pdf", ["Region | South"]);
    const comparing = makeDoc("rtf", ["Region   |   South"]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    const mismatched = result.matched.filter(m => !m.identical && m.baseline.kind === "field_value");
    expect(mismatched.length).toBe(0);
  });

  it("matches leading/trailing whitespace", () => {
    const baseline = makeDoc("pdf", ["Region | South"]);
    const comparing = makeDoc("rtf", ["  Region | South  "]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );
    const mismatched = result.matched.filter(m => !m.identical && m.baseline.kind === "field_value");
    expect(mismatched.length).toBe(0);
  });
});

// ── Full Pipeline: generateCanonicalDiffs ───────────────────────────────────

describe("generateCanonicalDiffs", () => {
  it("generates correct diff records for missing content", () => {
    resetDiffCounter();
    const baseline = makeDoc("pdf", ["Account | 1000", "Region | South"]);
    const comparing = makeDoc("rtf", ["Account | 1000"]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "group-1", "test", "1000",
      baseline, comparing, result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
      "intelligent",
    );

    expect(diffs.length).toBe(1);
    expect(diffs[0].differenceType).toBe("missing_content");
    expect(diffs[0].referenceText).toBe("South");
    expect(diffs[0].detailedDescription).toContain("MISSING_CONTENT");
    expect(diffs[0].baselineFormat).toBe("pdf");
    expect(diffs[0].comparingFormat).toBe("rtf");
  });

  it("generates correct diff records for value mismatch", () => {
    resetDiffCounter();
    const baseline = makeDoc("pdf", ["Region | South"]);
    const comparing = makeDoc("rtf", ["Region | North"]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "group-1", "test", "1000",
      baseline, comparing, result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
      "intelligent",
    );

    expect(diffs.length).toBe(1);
    expect(diffs[0].differenceType).toBe("value_mismatch");
    expect(diffs[0].referenceText).toBe("South");
    expect(diffs[0].versions[0].text).toBe("North");
  });

  it("generates no diffs for identical content", () => {
    resetDiffCounter();
    const baseline = makeDoc("pdf", ["Account | 1000", "Region | South"]);
    const comparing = makeDoc("rtf", ["Account | 1000", "Region | South"]);

    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const diffs = generateCanonicalDiffs(
      "group-1", "test", "1000",
      baseline, comparing, result,
      { baselineFormat: "pdf", comparingFormat: "rtf" },
      "intelligent",
    );

    expect(diffs.length).toBe(0);
  });
});

// ── Sample Customer Profile Data (acceptance criteria) ──────────────────────

describe("Sample Customer Profile acceptance criteria", () => {
  const profileLines = [
    "Field | Value",
    "Account | 1000",
    "Customer | Customer Alpha",
    "Region | South",
    "Account Manager | Arun Kumar",
    "Status | Active",
    "Customer Since | 2021-06-15",
  ];

  const profileColon = [
    "Account: 1000",
    "Customer: Customer Alpha",
    "Region: South",
    "Account Manager: Arun Kumar",
    "Status: Active",
    "Customer Since: 2021-06-15",
  ];

  it("PDF pipe table vs RTF pipe-delimited → all field_values match", () => {
    const pdf = makeDoc("pdf", profileLines);
    const rtf = makeDoc("rtf", profileLines);

    const result = compareCanonical(toCanonical(pdf), toCanonical(rtf), "intelligent");
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.addedInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.matched.filter(m => !m.identical && m.baseline.kind === "field_value").length).toBe(0);
  });

  it("PDF pipe table vs RTF colon-separated → all field_values match", () => {
    const pdf = makeDoc("pdf", profileLines);
    const rtf = makeDoc("rtf", profileColon);

    const result = compareCanonical(toCanonical(pdf), toCanonical(rtf), "intelligent");
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
  });

  it("PDF pipe table vs XLSX header+data → all field_values match", () => {
    const pdf = makeDoc("pdf", profileLines);
    const xlsx = makeSheetDoc("xlsx", "Sheet1", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
      ["Account Manager", "Arun Kumar"],
      ["Status", "Active"],
      ["Customer Since", "2021-06-15"],
    ]);

    const result = compareCanonical(toCanonical(pdf), toCanonical(xlsx), "intelligent");
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
  });

  it("XLSX vs CSV → all match", () => {
    const xlsx = makeSheetDoc("xlsx", "Sheet1", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Region", "South"],
    ]);
    const csv = makeSheetDoc("csv", "Sheet1", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Region", "South"],
    ]);

    const result = compareCanonical(toCanonical(xlsx), toCanonical(csv), "intelligent");
    expect(countDifferences(result)).toBe(0);
  });

  it("PDF space-separated table vs RTF pipe-delimited → all field_values match", () => {
    // Both documents have IDENTICAL semantic content, just different physical representations.
    const pdfLines = [
      "Field    Value",
      "Account    1000",
      "Customer    Customer Alpha",
      "Region    South",
      "Status    Active",
    ];
    const rtfLines = [
      "Field | Value",
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
      "Status | Active",
    ];

    const pdf = makeDoc("pdf", pdfLines);
    const rtf = makeDoc("rtf", rtfLines);

    const result = compareCanonical(toCanonical(pdf), toCanonical(rtf), "intelligent");

    // No field_value items should be missing or added
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.addedInComparing.filter(i => i.kind === "field_value").length).toBe(0);

    // All shared fields should match identically
    const sharedFields = ["account", "customer", "region", "status"];
    for (const key of sharedFields) {
      const matchedKV = result.matched.filter(m => m.baseline.key === key && m.baseline.kind === "field_value");
      expect(matchedKV.length).toBeGreaterThanOrEqual(1);
      if (matchedKV.length > 0) {
        expect(matchedKV[0].identical).toBe(true);
      }
    }
  });

  it("DOCX alternating cells (mammoth) vs PDF pipe table → all match", () => {
    // Mammoth outputs each DOCX table cell as a separate line
    const docxLines = [
      "Field",
      "Value",
      "Account",
      "1000",
      "Customer",
      "Customer Alpha",
      "Region",
      "South",
      "Status",
      "Active",
    ];
    const pdfLines = [
      "Field | Value",
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
      "Status | Active",
    ];

    const docx = makeDoc("docx", docxLines);
    const pdf = makeDoc("pdf", pdfLines);

    const result = compareCanonical(toCanonical(docx), toCanonical(pdf), "intelligent");
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });

  it("DOCX with multi-word keys (Account Manager, Customer Since) → all match", () => {
    // This is the EXACT scenario from the user's DOCX file
    const docxLines = [
      "Field",
      "Value",
      "Account",
      "1000",
      "Customer",
      "Customer Alpha",
      "Region",
      "South",
      "Account Manager",
      "Arun Kumar",
      "Status",
      "Active",
      "Customer Since",
      "2021-06-15",
    ];
    const pdfLines = [
      "Field | Value",
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
      "Account Manager | Arun Kumar",
      "Status | Active",
      "Customer Since | 2021-06-15",
    ];

    const docx = makeDoc("docx", docxLines);
    const pdf = makeDoc("pdf", pdfLines);

    const docxItems = toCanonical(docx);
    const pdfItems = toCanonical(pdf);

    console.log("DOCX items:", docxItems.items.map(i => `${i.kind}: ${i.key}=${i.value}`));
    console.log("PDF items:", pdfItems.items.map(i => `${i.kind}: ${i.key}=${i.value}`));

    const result = compareCanonical(docxItems, pdfItems, "intelligent");
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);

    // All shared fields should match
    for (const key of ["account", "customer", "region", "account manager", "status", "customer since"]) {
      const matched = result.matched.filter(m => m.baseline.key === key && m.baseline.kind === "field_value");
      expect(matched.length).toBe(1);
      expect(matched[0].identical).toBe(true);
    }
  });

  it("PDF space-separated table vs DOCX multi-word keys → all match", () => {
    // PDF parser concatenates cells: "Account    1000"
    // DOCX parser outputs alternating: "Account\n1000"
    const pdfLines = [
      "Sales Summary",
      "Field    Value",
      "Account    1000",
      "Customer    Customer Alpha",
      "Region    South",
      "Account Manager    Arun Kumar",
      "Status    Active",
      "Customer Since    2021-06-15",
    ];
    const docxLines = [
      "Customer Profile",
      "Field",
      "Value",
      "Account",
      "1000",
      "Customer",
      "Customer Alpha",
      "Region",
      "South",
      "Account Manager",
      "Arun Kumar",
      "Status",
      "Active",
      "Customer Since",
      "2021-06-15",
    ];

    const pdf = makeDoc("pdf", pdfLines);
    const docx = makeDoc("docx", docxLines);

    const pdfItems = toCanonical(pdf);
    const docxItems = toCanonical(docx);

    console.log("PDF items:", pdfItems.items.map(i => `${i.kind}: ${i.key}=${i.value}`));
    console.log("DOCX items:", docxItems.items.map(i => `${i.kind}: ${i.key}=${i.value}`));

    const result = compareCanonical(pdfItems, docxItems, "intelligent");
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");

    console.log("Missing:", falseMissing.map(i => `${i.key}=${i.value}`));
    console.log("Added:", falseAdded.map(i => `${i.key}=${i.value}`));

    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });

  it("'Customer | Customer Alpha' is NOT treated as header (critical regression)", () => {
    // BUG FIX: The isHeader check was too broad — any line with all-alpha parts
    // was treated as a header, even "Customer | Customer Alpha" which is a
    // data row. Now only very short parts (<=10 chars each) are treated as header.
    const pdfLines = [
      "Field | Value",
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
    ];
    const rtfLines = [
      "Field | Value",
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
    ];

    const pdf = makeDoc("pdf", pdfLines);
    const rtf = makeDoc("rtf", rtfLines);

    const pdfItems = toCanonical(pdf);
    const rtfItems = toCanonical(rtf);

    // Both should extract "Customer" as field_value, NOT as paragraph
    const pdfCustomer = pdfItems.items.filter(i => i.key === "customer" && i.kind === "field_value");
    const rtfCustomer = rtfItems.items.filter(i => i.key === "customer" && i.kind === "field_value");
    expect(pdfCustomer.length).toBe(1);
    expect(rtfCustomer.length).toBe(1);
    expect(pdfCustomer[0].value).toBe("Customer Alpha");
    expect(rtfCustomer[0].value).toBe("Customer Alpha");

    // Zero differences
    const result = compareCanonical(pdfItems, rtfItems, "intelligent");
    expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
    expect(result.addedInComparing.filter(i => i.kind === "field_value").length).toBe(0);
  });

  it("PDF space-separated table vs RTF pipe → zero false MISSING_CONTENT", () => {
    const pdf = makeDoc("pdf", [
      "Field    Value",
      "Account    1000",
      "Region    South",
      "Status    Active",
    ]);
    const rtf = makeDoc("rtf", [
      "Field | Value",
      "Account | 1000",
      "Region | South",
      "Status | Active",
    ]);

    const result = compareCanonical(toCanonical(pdf), toCanonical(rtf), "intelligent");
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
  });
});
