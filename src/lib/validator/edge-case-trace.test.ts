/**
 * EDGE CASE TRACE — tests scenarios that could cause false differences.
 *
 * Verifies the canonical engine handles various parser outputs correctly.
 * Tests both "happy path" (real parser output) and edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  toCanonical,
  compareCanonical,
  resetDiffCounter,
  type ContentItem,
} from "./canonical";

const HEADER = ["Field", "Value"];
const ROWS = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

function makeDoc(
  ext: string,
  lines: string[],
  fileName = "test.pdf",
) {
  return {
    id: `${fileName}::x`,
    path: fileName,
    dir: "",
    fileName,
    ext,
    stem: "test",
    versionTag: "",
    size: 0,
    content: { type: "text" as const, lines },
  };
}

function logItems(label: string, items: ContentItem[]) {
  console.log(`\n  ${label}:`);
  items.forEach((item, i) => {
    console.log(`    [${i}] ${item.kind}: key="${item.key}" value="${item.value}"`);
  });
}

function getSharedFV(result: ReturnType<typeof compareCanonical>) {
  const sharedKeys = ["account", "customer", "region", "account manager", "status", "customer since"];
  return {
    missing: result.missingInComparing.filter(
      (i) => i.kind === "field_value" && sharedKeys.includes(i.key)
    ),
    added: result.addedInComparing.filter(
      (i) => i.kind === "field_value" && sharedKeys.includes(i.key)
    ),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 1: PDF with 4-space gap (column detection succeeded)
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 1: PDF space-gap (4 spaces) vs DOCX alternating", () => {
  it("should match — 4+ space gap detected by Pattern 4", () => {
    const pdfLines = ROWS.map((r) => `${r[0]}    ${r[1]}`);
    const docxLines = ["Field", "Value", ...ROWS.flat()];

    const pdfCanon = toCanonical(makeDoc("pdf", pdfLines));
    const docxCanon = toCanonical(makeDoc("docx", docxLines));

    logItems("PDF", pdfCanon.items);
    logItems("DOCX", docxCanon.items);

    resetDiffCounter();
    const result = compareCanonical(pdfCanon, docxCanon, "intelligent");
    const { missing, added } = getSharedFV(result);
    expect(missing.length).toBe(0);
    expect(added.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 2: PDF with pipe-delimited output (real pdfjs output)
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 2: PDF pipe-delimited vs DOCX alternating", () => {
  it("should match — both produce equivalent field_values", () => {
    const pdfLines = [
      ...ROWS.map((r) => r.join(" | ")),
    ];
    const docxLines = ["Field", "Value", ...ROWS.flat()];

    const pdfCanon = toCanonical(makeDoc("pdf", pdfLines));
    const docxCanon = toCanonical(makeDoc("docx", docxLines));

    logItems("PDF", pdfCanon.items);
    logItems("DOCX", docxCanon.items);

    resetDiffCounter();
    const result = compareCanonical(pdfCanon, docxCanon, "intelligent");
    const { missing, added } = getSharedFV(result);
    expect(missing.length).toBe(0);
    expect(added.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 3: DOCX alternating lines with non-paired first lines
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 3: Mixed content — some paired, some not", () => {
  it("should match field_values that ARE paired", () => {
    // DOCX where first2 lines aren't part of a table
    const docxLines = [
      "Customer Profile",
      "Created for testing.",
      // Table below
      "Field", "Value",
      ...ROWS.flat(),
    ];
    const pdfLines = [
      ...ROWS.map((r) => r.join(" | ")),
    ];

    const docxCanon = toCanonical(makeDoc("docx", docxLines));
    const pdfCanon = toCanonical(makeDoc("pdf", pdfLines));

    resetDiffCounter();
    const result = compareCanonical(pdfCanon, docxCanon, "intelligent");
    const { missing, added } = getSharedFV(result);
    expect(missing.length).toBe(0);
    expect(added.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 4: isHeader should NOT skip data rows
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 4: isHeader should not misclassify data rows", () => {
  it("'Customer | Customer Alpha' should be field_value, not skipped", () => {
    const lines = [
      "Customer | Customer Alpha",
      "Region | South",
      "Status | Active",
    ];
    const canon = toCanonical(makeDoc("pdf", lines));
    const fv = canon.items.filter((i) => i.kind === "field_value");
    expect(fv.length).toBe(3);
    expect(fv.find((i) => i.key === "customer")?.value).toBe("Customer Alpha");
  });

  it("'Customer Since | 2021-06-15' should be field_value", () => {
    const lines = [
      "Customer Since | 2021-06-15",
      "Account Manager | Arun Kumar",
    ];
    const canon = toCanonical(makeDoc("pdf", lines));
    const fv = canon.items.filter((i) => i.kind === "field_value");
    expect(fv.length).toBe(2);
    expect(fv.find((i) => i.key === "customer since")?.value).toBe("2021-06-15");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 5: extractFieldValuesFromText patterns
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 5: Multiple extraction patterns produce same key", () => {
  it("Colon format matches pipe format", () => {
    const colon = toCanonical(makeDoc("pdf", ["Account: 1000", "Customer: Customer Alpha"]));
    const pipe = toCanonical(makeDoc("pdf", ["Account | 1000", "Customer | Customer Alpha"]));

    resetDiffCounter();
    const result = compareCanonical(colon, pipe, "intelligent");
    expect(result.matched.length).toBeGreaterThanOrEqual(2);
    expect(result.missingInComparing.length).toBe(0);
    expect(result.addedInComparing.length).toBe(0);
  });

  it("Space-gap format matches pipe format", () => {
    const space = toCanonical(makeDoc("pdf", ["Account    1000", "Customer    Customer Alpha"]));
    const pipe = toCanonical(makeDoc("pdf", ["Account | 1000", "Customer | Customer Alpha"]));

    resetDiffCounter();
    const result = compareCanonical(space, pipe, "intelligent");
    expect(result.matched.length).toBeGreaterThanOrEqual(2);
    expect(result.missingInComparing.length).toBe(0);
    expect(result.addedInComparing.length).toBe(0);
  });

  it("Header 'Field | Value' should not create false field_value", () => {
    const lines = ["Field | Value", "Account | 1000", "Customer | Customer Alpha"];
    const canon = toCanonical(makeDoc("pdf", lines));

    // "Field | Value" should be a paragraph (header), not a field_value
    const fvField = canon.items.find((i) => i.key === "field");
    if (fvField) {
      expect(fvField.kind).not.toBe("field_value");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 6: Single-row pipe blocks
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 6: Single-row pipe blocks", () => {
  it("Single-row block 'Account | 1000' should be field_value", () => {
    const canon = toCanonical(makeDoc("pdf", ["Account | 1000"]));
    const fv = canon.items.find((i) => i.kind === "field_value");
    expect(fv).toBeDefined();
    expect(fv?.key).toBe("account");
    expect(fv?.value).toBe("1000");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 7: Full RTF table with alternating lines
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 7: Full RTF-style alternating lines (table context)", () => {
  it("All 6 fields paired correctly when full table context exists", () => {
    const lines = [
      "Customer Profile",
      "Field", "Value",
      "Account", "1000",
      "Customer", "Customer Alpha",
      "Region", "South",
      "Account Manager", "Arun Kumar",
      "Status", "Active",
      "Customer Since", "2021-06-15",
      "Created for cross-format comparison testing.",
    ];
    const canon = toCanonical(makeDoc("rtf", lines));

    logItems("RTF FULL TABLE", canon.items);

    const fv = canon.items.filter((i) => i.kind === "field_value");
    expect(fv.length).toBe(6);
    expect(fv.find((i) => i.key === "account")?.value).toBe("1000");
    expect(fv.find((i) => i.key === "customer")?.value).toBe("Customer Alpha");
    expect(fv.find((i) => i.key === "region")?.value).toBe("South");
    expect(fv.find((i) => i.key === "account manager")?.value).toBe("Arun Kumar");
    expect(fv.find((i) => i.key === "status")?.value).toBe("Active");
    expect(fv.find((i) => i.key === "customer since")?.value).toBe("2021-06-15");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE 8: Full cross-format comparison (all 4 formats)
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge Case 8: All 12 cross-format combos with full table context", () => {
  it("PDF → DOCX → RTF → XLSX all produce equivalent field_values", async () => {
    // PDF: pipe-delimited (real pdfjs output)
    const pdfCanon = toCanonical(makeDoc("pdf", ROWS.map((r) => r.join(" | "))));

    // DOCX: alternating lines (mammoth output) with table header
    const docxCanon = toCanonical(makeDoc("docx", ["Field", "Value", ...ROWS.flat()]));

    // RTF: alternating lines (rtfToText output) with table header
    const rtfCanon = toCanonical(makeDoc("rtf", [
      "Customer Profile",
      "Field", "Value",
      ...ROWS.flat(),
      "Created for testing.",
    ]));

    // XLSX: via real xlsx library
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([HEADER, ...ROWS]);
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const readWb = XLSX.read(buf, { type: "array" });
    const sheets = readWb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<unknown[]>(readWb.Sheets[name], {
        header: 1, raw: true, defval: "", blankrows: true,
      }).map((row) =>
        (Array.isArray(row) ? row : []).map((cell) =>
          cell === null || cell === undefined ? "" : String(cell)
        )
      ),
    }));
    const xlsxDoc = {
      id: "report.xlsx::x", path: "report.xlsx", dir: "", fileName: "report.xlsx",
      ext: "xlsx" as const, stem: "report", versionTag: "", size: 0,
      content: { type: "sheet" as const, sheets },
    };
    const xlsxCanon = toCanonical(xlsxDoc);

    const canons = [
      { name: "PDF", canon: pdfCanon },
      { name: "DOCX", canon: docxCanon },
      { name: "RTF", canon: rtfCanon },
      { name: "XLSX", canon: xlsxCanon },
    ];

    const pairs: Array<[string, string]> = [
      ["PDF", "DOCX"], ["PDF", "RTF"], ["PDF", "XLSX"],
      ["DOCX", "RTF"], ["DOCX", "XLSX"], ["RTF", "XLSX"],
      ["RTF", "PDF"], ["XLSX", "PDF"], ["XLSX", "DOCX"],
      ["XLSX", "RTF"], ["DOCX", "PDF"], ["RTF", "DOCX"],
    ];

    console.log("\n=== ALL 12 CROSS-FORMAT COMPARISONS ===");
    for (const [a, b] of pairs) {
      const canA = canons.find((c) => c.name === a)!;
      const canB = canons.find((c) => c.name === b)!;
      resetDiffCounter();
      const result = compareCanonical(canA.canon, canB.canon, "intelligent");
      const { missing, added } = getSharedFV(result);
      const ok = missing.length === 0 && added.length === 0;
      console.log(`  ${a} → ${b}: ${ok ? "✅" : "⚠️"} (matched: ${result.matched.length})`);
      if (!ok) {
        missing.forEach((m) => console.log(`    FALSE MISSING: ${m.key}="${m.value}"`));
        added.forEach((m) => console.log(`    FALSE ADDED: ${m.key}="${m.value}"`));
      }
      expect(ok).toBe(true);
    }
  });
});
