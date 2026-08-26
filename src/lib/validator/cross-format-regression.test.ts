/**
 * Cross-Format Regression Tests
 *
 * Tests the canonical comparison engine across ALL supported format pairs.
 * Ensures equivalent business content compares equal regardless of format,
 * and genuine differences are still detected.
 *
 * Architecture principle: These tests verify the GENERIC comparison engine,
 * not format-specific or document-specific behavior.
 */
import { describe, it, expect } from "vitest";
import {
  toCanonical,
  compareCanonical,
  resetDiffCounter,
} from "./canonical";
import type { ContentItem } from "./canonical";
import type { ParsedDoc, DocKind } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTextDoc(ext: DocKind, lines: string[]): ParsedDoc {
  return {
    id: ext,
    path: `test.${ext}`,
    dir: "",
    fileName: `test.${ext}`,
    ext,
    stem: "test",
    versionTag: "",
    size: 0,
    content: { type: "text", lines },
  };
}

function makeSheetDoc(
  ext: DocKind,
  sheetName: string,
  rows: string[][],
): ParsedDoc {
  return {
    id: ext,
    path: `test.${ext}`,
    dir: "",
    fileName: `test.${ext}`,
    ext,
    stem: "test",
    versionTag: "",
    size: 0,
    content: {
      type: "sheet",
      sheets: [{ name: sheetName, rows }],
    },
  };
}

function countDiffs(r: {
  matched: unknown[];
  missingInComparing: unknown[];
  addedInComparing: unknown[];
}): number {
  const valueMismatches = r.matched.filter(
    (m: any) => !m.identical,
  ).length;
  return (
    valueMismatches + r.missingInComparing.length + r.addedInComparing.length
  );
}

function fieldValues(
  r: { items: ContentItem[] },
  kind?: string,
): ContentItem[] {
  return r.items.filter((i) => (kind ? i.kind === kind : true));
}

// ── Shared test data ────────────────────────────────────────────────────────

const FV_ROWS: Array<[string, string]> = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

const TABLE_ROWS = [
  ["Account", "Customer", "Region", "Status"],
  ["1000", "Customer Alpha", "South", "Active"],
  ["2000", "Customer Beta", "North", "Inactive"],
];

const MIXED_CONTENT = [
  "Invoice Report",
  "Generated on 2026-01-15",
  "",
  "Account | 1000",
  "Customer | Customer Alpha",
  "Region | South",
  "",
  "Status: Active",
  "Amount: $1,234.56",
];

// ═════════════════════════════════════════════════════════════════════════════
// IDENTICAL DOCUMENTS — zero differences across all format pairs
// ═════════════════════════════════════════════════════════════════════════════

describe("Identical content across formats — zero differences", () => {
  const formats: Array<{
    name: string;
    make: (lines: string[]) => ParsedDoc;
  }> = [
    {
      name: "PDF",
      make: (l) => makeTextDoc("pdf", l),
    },
    {
      name: "DOCX",
      make: (l) => makeTextDoc("docx", l),
    },
    {
      name: "RTF",
      make: (l) => makeTextDoc("rtf", l),
    },
  ];

  for (const fmtA of formats) {
    for (const fmtB of formats) {
      if (fmtA.name === fmtB.name) continue;
      it(`${fmtA.name} ↔ ${fmtB.name}: pipe-delimited field/value`, () => {
        const lines = FV_ROWS.map(([k, v]) => `${k} | ${v}`);
        resetDiffCounter();
        const r = compareCanonical(
          toCanonical(fmtA.make(lines)),
          toCanonical(fmtB.make(lines)),
          "intelligent",
        );
        expect(countDiffs(r)).toBe(0);
      });
    }
  }

  it("PDF ↔ DOCX: colon-separated field/value", () => {
    const lines = FV_ROWS.map(([k, v]) => `${k}: ${v}`);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(makeTextDoc("pdf", lines)),
      toCanonical(makeTextDoc("docx", lines)),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(0);
  });

  it("RTF ↔ DOCX: alternating key/value lines", () => {
    const rtfLines = FV_ROWS.flatMap(([k, v]) => [k, v]);
    const docxLines = FV_ROWS.flatMap(([k, v]) => [k, v]);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(makeTextDoc("rtf", rtfLines)),
      toCanonical(makeTextDoc("docx", docxLines)),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CROSS-FORMAT REPRESENTATION EQUIVALENCE
// ═════════════════════════════════════════════════════════════════════════════

describe("Cross-format representation equivalence", () => {
  it("PDF pipe ↔ RTF tab-delimited ↔ DOCX individual lines", () => {
    const pdf = makeTextDoc(
      "pdf",
      FV_ROWS.map(([k, v]) => `${k} | ${v}`),
    );
    const rtf = makeTextDoc(
      "rtf",
      FV_ROWS.map(([k, v]) => `${k}\t${v}`),
    );
    const docx = makeTextDoc(
      "docx",
      FV_ROWS.flatMap(([k, v]) => [k, v]),
    );

    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(pdf), toCanonical(rtf), "intelligent"))).toBe(0);
    expect(countDiffs(compareCanonical(toCanonical(pdf), toCanonical(docx), "intelligent"))).toBe(0);
    expect(countDiffs(compareCanonical(toCanonical(rtf), toCanonical(docx), "intelligent"))).toBe(0);
  });

  it("PDF space-separated ↔ RTF tab-delimited", () => {
    const pdf = makeTextDoc(
      "pdf",
      FV_ROWS.map(([k, v]) => `${k}    ${v}`),
    );
    const rtf = makeTextDoc(
      "rtf",
      FV_ROWS.map(([k, v]) => `${k}\t${v}`),
    );
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(pdf), toCanonical(rtf), "intelligent"))).toBe(0);
  });

  it("XLSX spreadsheet ↔ CSV-like text", () => {
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Account", "Customer", "Region"],
      ["1000", "Customer Alpha", "South"],
    ]);
    const csv = makeSheetDoc("csv", "Report", [
      ["Account", "Customer", "Region"],
      ["1000", "Customer Alpha", "South"],
    ]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(xlsx), toCanonical(csv), "intelligent"))).toBe(0);
  });

  it("RTF tab-delimited field/value ↔ XLSX with matching field/value structure", () => {
    const rtf = makeTextDoc("rtf", [
      "Account: 1000",
      "Customer: Customer Alpha",
      "Region: South",
    ]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
    ]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(rtf), toCanonical(xlsx), "intelligent"))).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GENUINE DIFFERENCES — must be detected
// ═════════════════════════════════════════════════════════════════════════════

describe("Genuine differences detected across formats", () => {
  it("PDF ↔ DOCX: field value change", () => {
    const pdf = makeTextDoc("pdf", [
      "Account: 1000",
      "Region: South",
      "Status: Active",
    ]);
    const docx = makeTextDoc("docx", [
      "Account: 1000",
      "Region: South",
      "Status: Inactive",
    ]);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(1);
    const mismatch = r.matched.find((m) => !m.identical);
    expect(mismatch).toBeDefined();
    expect(mismatch!.baseline.value).toBe("Active");
    expect(mismatch!.comparing.value).toBe("Inactive");
  });

  it("PDF ↔ DOCX: missing field", () => {
    const pdf = makeTextDoc("pdf", [
      "Account: 1000",
      "Region: South",
      "Status: Active",
    ]);
    const docx = makeTextDoc("docx", [
      "Account: 1000",
      "Region: South",
    ]);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(1);
    expect(r.missingInComparing.length).toBe(1);
    expect(r.missingInComparing[0].label).toBe("Status");
  });

  it("PDF ↔ DOCX: added field", () => {
    const pdf = makeTextDoc("pdf", [
      "Account: 1000",
      "Region: South",
    ]);
    const docx = makeTextDoc("docx", [
      "Account: 1000",
      "Region: South",
      "Status: Active",
    ]);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(1);
    expect(r.addedInComparing.length).toBe(1);
    expect(r.addedInComparing[0].label).toBe("Status");
  });

  it("RTF colon-separated ↔ XLSX field/value: value change detected", () => {
    const rtf = makeTextDoc("rtf", [
      "Account: 1000",
      "Customer: Customer Alpha",
      "Region: South",
    ]);
    const xlsx = makeSheetDoc("xlsx", "Report", [
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "East"],
    ]);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(rtf),
      toCanonical(xlsx),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(1);
    const mismatch = r.matched.find((m) => !m.identical);
    expect(mismatch).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WHITESPACE AND FORMATTING NORMALIZATION
// ═════════════════════════════════════════════════════════════════════════════

describe("Whitespace and formatting normalization", () => {
  it("multiple spaces collapsed", () => {
    const a = makeTextDoc("pdf", ["Account:   1000"]);
    const b = makeTextDoc("docx", ["Account: 1000"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("leading/trailing whitespace ignored", () => {
    const a = makeTextDoc("pdf", ["  Account: 1000  "]);
    const b = makeTextDoc("docx", ["Account: 1000"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("tab vs space normalization", () => {
    const a = makeTextDoc("pdf", ["Account: 1000"]);
    const b = makeTextDoc("docx", ["Account:\t1000"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NUMERIC VALUES AND FORMATTING
// ═════════════════════════════════════════════════════════════════════════════

describe("Numeric values preserved correctly", () => {
  it("currency values match", () => {
    const a = makeTextDoc("pdf", ["Amount: $1,234.56"]);
    const b = makeTextDoc("docx", ["Amount: $1,234.56"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("leading zeros preserved", () => {
    const a = makeTextDoc("pdf", ["Account: 001234"]);
    const b = makeTextDoc("docx", ["Account: 001234"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("dates match across formats", () => {
    const a = makeTextDoc("pdf", ["Date: 2026-01-15"]);
    const b = makeTextDoc("docx", ["Date: 2026-01-15"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("parenthetical negatives match", () => {
    const a = makeTextDoc("pdf", ["Amount: ($333.33)"]);
    const b = makeTextDoc("docx", ["Amount: ($333.33)"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PARAGRAPH-LEVEL MATCHING
// ═════════════════════════════════════════════════════════════════════════════

describe("Paragraph-level matching across formats", () => {
  it("same paragraph text matches", () => {
    const a = makeTextDoc("pdf", [
      "This is a report header",
      "Generated on 2026-01-15",
    ]);
    const b = makeTextDoc("docx", [
      "This is a report header",
      "Generated on 2026-01-15",
    ]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("paragraph with one word changed is detected", () => {
    const a = makeTextDoc("pdf", ["Report for January 2026"]);
    const b = makeTextDoc("docx", ["Report for February 2026"]);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(a),
      toCanonical(b),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(1);
  });

  it("paragraph order doesn't affect matching", () => {
    const a = makeTextDoc("pdf", ["First paragraph", "Second paragraph"]);
    const b = makeTextDoc("docx", ["Second paragraph", "First paragraph"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MIXED CONTENT
// ═════════════════════════════════════════════════════════════════════════════

describe("Mixed content (paragraphs + field/value pairs)", () => {
  it("PDF pipe tables ↔ DOCX separate lines", () => {
    const pdf = makeTextDoc("pdf", MIXED_CONTENT);
    const docx = makeTextDoc("docx", [
      "Invoice Report",
      "Generated on 2026-01-15",
      "",
      "Account",
      "1000",
      "Customer",
      "Customer Alpha",
      "Region",
      "South",
      "",
      "Status: Active",
      "Amount: $1,234.56",
    ]);
    resetDiffCounter();
    const r = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );
    expect(countDiffs(r)).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HIGHMARK REGRESSION — generic test, not document-specific
// ═════════════════════════════════════════════════════════════════════════════

describe("Highmark-style invoice comparison (generic regression)", () => {
  it("PDF pipe-delimited invoice ↔ DOCX separate-line invoice: only genuine missing fields reported", () => {
    // Simulates a typical insurance invoice layout where:
    // - PDF uses pipe-delimited table rows (visual layout extraction)
    // - DOCX uses separate paragraphs (text extraction)
    // - The only genuine difference is 2 missing fields in DOCX
    const pdfLines = [
      "HIGHMARK",
      "An Independent Licensee of the Blue Cross and Blue Shield Association",
      "PAGE: 1 of 1 | Paid Claims Month",
      "August 2026",
      "(Prepared 08/04/2026)",
      "Claims Paid Thru",
      "07/31/2026 | (Bill Cycle 5 of 5)",
      "Product/Sub Group-8 Digit | Sort Description:",
      "Group | Total",
      "Total Number",
      "of Installment | Billed to Date",
      "Total Installments",
      "Billed to Date",
      "Unpaid Advance",
      "Balance",
      "Current Installment",
      "Due",
      "HDHP PPO",
      "105745-44",
      "3 0 | 105745 Total | ($333.33) | $0.00 | ($333.33) | ($111.11)",
      "HDHP PPO Total | ($333.33) | $0.00 | ($333.33) | ($111.11)",
      "Advance Deposit Total | ($111.11)",
      "*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.",
      "ADVANCE DEPOSIT",
      "Client Number",
      "016543",
      "Client Name",
      "Borough Of Ridgway",
      "Invoice Number",
      "260804584270",
      "Bill Account Number",
      "0165431006",
      "Bill Account Name",
      "Borough Of Ridgway",
    ];

    const docxLines = [
      "HIGHMARK",
      "An Independent Licensee of the Blue Cross and Blue Shield Association",
      "PAGE: 1 of 1",
      "Paid Claims Month",
      "August 2026",
      "(Prepared 08/04/2026)",
      "Claims Paid Thru",
      "07/31/2026 (Bill Cycle 5 of 5)",
      "ADVANCE DEPOSIT",
      "Invoice Number",
      "260804584270",
      "Bill Account Number",
      "0165431006",
      "Bill Account Name",
      "Borough Of Ridgway",
      "Sort Description: Product/Sub Group-8 Digit",
      "Group",
      "Total",
      "Total Number",
      "of Installment",
      "Billed to Date",
      "Total Installments",
      "Billed to Date",
      "Unpaid Advance",
      "Balance",
      "Current Installment",
      "Due",
      "HDHP PPO",
      "105745-44",
      "105745 Total",
      "($333.33)",
      "3",
      "$0.00",
      "0",
      "($333.33)",
      "($111.11)",
      "HDHP PPO Total",
      "($333.33)",
      "$0.00",
      "($333.33)",
      "($111.11)",
      "Advance Deposit Total",
      "($111.11)",
      "*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.",
    ];

    const pdf = makeTextDoc("pdf", pdfLines);
    const docx = makeTextDoc("docx", docxLines);

    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(pdf),
      toCanonical(docx),
      "intelligent",
    );

    // Count value mismatches
    const valueMismatches = result.matched.filter((m) => !m.identical).length;

    // The two genuine missing fields (Client Number and Client Name)
    const missingValues = result.missingInComparing.map(
      (i) => i.label.toLowerCase(),
    );

    // Zero value mismatches — all shared content matches
    expect(valueMismatches).toBe(0);

    // Client Number and Client Name are genuinely missing from DOCX
    expect(result.missingInComparing.length).toBeGreaterThanOrEqual(2);
    expect(
      missingValues.some((l) => l.includes("client number")),
    ).toBe(true);
    expect(
      missingValues.some((l) => l.includes("client name")),
    ).toBe(true);

    // No false positives — total differences should be exactly 2
    // (the genuine missing fields)
    expect(countDiffs(result)).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("empty documents — zero differences", () => {
    const a = makeTextDoc("pdf", []);
    const b = makeTextDoc("docx", []);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("single identical line", () => {
    const a = makeTextDoc("pdf", ["Hello World"]);
    const b = makeTextDoc("docx", ["Hello World"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });

  it("blank lines ignored", () => {
    const a = makeTextDoc("pdf", ["", "Account: 1000", "", ""]);
    const b = makeTextDoc("docx", ["Account: 1000"]);
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(a), toCanonical(b), "intelligent"))).toBe(0);
  });
});
