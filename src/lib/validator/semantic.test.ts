/**
 * Regression tests for semantic content matcher.
 *
 * These tests verify that identical content in different structural
 * representations (PDF table vs RTF text) is correctly recognized as
 * matching, while genuine differences are still reported.
 */
import { describe, it, expect } from "vitest";
import {
  extractElements,
  matchElements,
  generateSemanticDiffs,
} from "./semantic";
import type { ComparisonMode, ParsedDoc } from "./types";
import type { ContentElement, MatchResult } from "./semantic";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDoc(
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
    versionTag: "",
    size: 0,
    content: { type: "text", lines },
  };
}

function makeKVElement(
  key: string,
  value: string,
  position = "Line 1",
): ContentElement {
  return {
    normalizedKey: key.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    label: key,
    value,
    positionHint: position,
    kind: "key_value",
  };
}

function makeProseElement(text: string, position = "Line 1"): ContentElement {
  return {
    normalizedKey: `text#0`,
    label: text,
    value: text,
    positionHint: position,
    kind: "prose",
  };
}

function countDifferences(result: MatchResult): number {
  return (
    result.missingInComparing.length +
    result.addedInComparing.length +
    result.matched.filter((m) => !m.identical).length
  );
}

// ── Test: Pipe-delimited content matches ─────────────────────────────────────

describe("Pipe-delimited content matching", () => {
  it("matches identical pipe-delimited lines", () => {
    const baseline = [
      makeKVElement("Account", "1000"),
      makeKVElement("Customer", "Customer Alpha"),
      makeKVElement("Region", "South"),
    ];
    const comparing = [
      makeKVElement("Account", "1000"),
      makeKVElement("Customer", "Customer Alpha"),
      makeKVElement("Region", "South"),
    ];
    const result = matchElements(baseline, comparing, "intelligent");
    expect(countDifferences(result)).toBe(0);
    expect(result.matched.length).toBe(3);
  });

  it("matches pipe-delimited header by content", () => {
    const baseline = [makeProseElement("Field | Value")];
    const comparing = [makeProseElement("Field | Value")];
    const result = matchElements(baseline, comparing, "intelligent");
    expect(countDifferences(result)).toBe(0);
    expect(result.matched.length).toBe(1);
  });
});

// ── Test: PDF table vs RTF text ──────────────────────────────────────────────

describe("PDF table vs RTF text", () => {
  it("PDF pipe table rows match RTF pipe-delimited rows", () => {
    const pdfElements = [
      makeProseElement("Field | Value"),
      makeKVElement("Account", "1000"),
      makeKVElement("Customer", "Customer Alpha"),
      makeKVElement("Region", "South"),
      makeKVElement("Account Manager", "Arun Kumar"),
      makeKVElement("Status", "Active"),
      makeKVElement("Customer Since", "2021-06-15"),
    ];

    const rtfElements = [
      makeProseElement("Field | Value"),
      makeKVElement("Account", "1000"),
      makeKVElement("Customer", "Customer Alpha"),
      makeKVElement("Region", "South"),
      makeKVElement("Account Manager", "Arun Kumar"),
      makeKVElement("Status", "Active"),
      makeKVElement("Customer Since", "2021-06-15"),
    ];

    const result = matchElements(pdfElements, rtfElements, "intelligent");
    expect(countDifferences(result)).toBe(0);
  });

  it("PDF prose matches RTF key-value pairs (enhanced extraction)", () => {
    const pdfElements = [
      makeProseElement("Account | 1000"),
      makeProseElement("Region | South"),
    ];
    const rtfElements = [
      makeKVElement("Account", "1000"),
      makeKVElement("Region", "South"),
    ];

    const result = matchElements(pdfElements, rtfElements, "intelligent");
    expect(countDifferences(result)).toBe(0);
  });

  it("genuine missing content is still detected", () => {
    const baseline = [
      makeKVElement("Account", "1000"),
      makeKVElement("Region", "South"),
      makeKVElement("Status", "Active"),
    ];
    const comparing = [
      makeKVElement("Account", "1000"),
      makeKVElement("Region", "South"),
    ];

    const result = matchElements(baseline, comparing, "intelligent");
    expect(result.missingInComparing.length).toBe(1);
    expect(result.missingInComparing[0].label).toBe("Status");
  });

  it("genuine value mismatch is still detected", () => {
    const baseline = [
      makeKVElement("Account", "1000"),
      makeKVElement("Region", "South"),
    ];
    const comparing = [
      makeKVElement("Account", "1000"),
      makeKVElement("Region", "North"),
    ];

    const result = matchElements(baseline, comparing, "intelligent");
    expect(result.matched.some((m) => !m.identical)).toBe(true);
    const mismatch = result.matched.find((m) => !m.identical);
    expect(mismatch?.baseline.value).toBe("South");
    expect(mismatch?.comparing.value).toBe("North");
  });
});

// ── Test: Whitespace and delimiter variations ────────────────────────────────

describe("Whitespace and delimiter normalization", () => {
  it("matches pipe vs colon separated content", () => {
    const baseline = [makeProseElement("Region | South")];
    const comparing = [makeProseElement("Region: South")];
    const result = matchElements(baseline, comparing, "intelligent");
    expect(countDifferences(result)).toBe(0);
  });

  it("matches multiple spaces vs single space", () => {
    const baseline = [makeProseElement("Region | South")];
    const comparing = [makeProseElement("Region   |   South")];
    const result = matchElements(baseline, comparing, "intelligent");
    expect(countDifferences(result)).toBe(0);
  });

  it("matches leading/trailing whitespace", () => {
    const baseline = [makeProseElement("Region | South")];
    const comparing = [makeProseElement("  Region | South  ")];
    const result = matchElements(baseline, comparing, "intelligent");
    expect(countDifferences(result)).toBe(0);
  });
});

// ── Test: Content at different line positions ────────────────────────────────

describe("Line position independence", () => {
  it("matches content at different positions", () => {
    const baseline = [
      makeKVElement("Account", "1000", "Line 1"),
      makeKVElement("Region", "South", "Line 2"),
      makeKVElement("Status", "Active", "Line 3"),
    ];
    const comparing = [
      makeKVElement("Status", "Active", "Line 10"),
      makeKVElement("Account", "1000", "Line 15"),
      makeKVElement("Region", "South", "Line 20"),
    ];

    const result = matchElements(baseline, comparing, "intelligent");
    expect(countDifferences(result)).toBe(0);
    expect(result.matched.length).toBe(3);
  });
});

// ── Test: Enhanced key-value extraction ──────────────────────────────────────

describe("Enhanced key-value extraction from prose", () => {
  it("extracts pipe-delimited pairs from prose", () => {
    const doc = makeDoc("pdf", [
      "Sales Summary",
      "Account: 1000 | Synthetic data",
      "Field | Value",
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
    ]);
    const elements = extractElements(doc);
    const kvElements = elements.filter((el) => el.kind === "key_value");
    expect(kvElements.length).toBeGreaterThanOrEqual(3);
    const account = kvElements.find((el) => el.label === "Account");
    expect(account).toBeDefined();
    expect(account?.value).toBe("1000");
  });

  it("extracts colon-separated pairs from prose", () => {
    const doc = makeDoc("pdf", [
      "Customer Profile",
      "Account: 1000",
      "Status: Active",
    ]);
    const elements = extractElements(doc);
    const kvElements = elements.filter((el) => el.kind === "key_value");
    expect(kvElements.length).toBeGreaterThanOrEqual(2);
    const account = kvElements.find((el) => el.label === "Account");
    expect(account?.value).toBe("1000");
  });
});

// ── Test: Full PDF vs RTF pipeline ──────────────────────────────────────────

describe("Full PDF vs RTF comparison pipeline", () => {
  it("identical table content produces zero differences", () => {
    const sharedLines = [
      "Field | Value",
      "Account | 1000",
      "Customer | Customer Alpha",
      "Region | South",
      "Account Manager | Arun Kumar",
      "Status | Active",
      "Customer Since | 2021-06-15",
    ];
    // Both documents have the same table data
    const pdfLines = ["Sales Summary", "Account: 1000", ...sharedLines];
    const rtfLines = ["Customer Profile", "Account: 1000", ...sharedLines];

    const pdfDoc = makeDoc("pdf", pdfLines);
    const rtfDoc = makeDoc("rtf", rtfLines);

    const pdfElements = extractElements(pdfDoc);
    const rtfElements = extractElements(rtfDoc);

    const result = matchElements(pdfElements, rtfElements, "intelligent");

    // All table rows should match — no MISSING_CONTENT for table fields
    const missingKV = result.missingInComparing.filter(
      (el) => el.kind === "key_value",
    );
    expect(missingKV.length).toBe(0);

    // All matched elements with same key should have identical values
    const mismatchedKV = result.matched.filter(
      (m) => m.baseline.kind === "key_value" && !m.identical,
    );
    expect(mismatchedKV.length).toBe(0);
  });

  it("detects genuine differences in mixed content", () => {
    const pdfLines = [
      "Field | Value",
      "Account | 1000",
      "Region | South",
      "Status | Active",
    ];
    const rtfLines = [
      "Field | Value",
      "Account | 1000",
      "Region | North",
    ];

    const pdfDoc = makeDoc("pdf", pdfLines);
    const rtfDoc = makeDoc("rtf", rtfLines);

    const pdfElements = extractElements(pdfDoc);
    const rtfElements = extractElements(rtfDoc);

    const result = matchElements(pdfElements, rtfElements, "intelligent");
    const hasDifference = countDifferences(result) > 0;
    expect(hasDifference).toBe(true);
  });
});
