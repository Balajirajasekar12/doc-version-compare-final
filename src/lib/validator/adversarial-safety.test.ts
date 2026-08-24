/**
 * ADVERSARIAL SAFETY TESTS — CORRECTED
 *
 * These tests prove that Phase 7 token aggregation in compareCanonical
 * CANNOT hide genuine content differences.
 *
 * KEY DISTINCTION:
 * - "Changed" = matched with different values
 * - "Missing" = in baseline but not comparing
 * - "Added" = in comparing but not baseline
 * - A real difference is ANY of the above being nonzero.
 *
 * Phase 7 safety means: if the CONTENT differs, Phase 7 must NOT
 * produce a match that marks them as identical.
 */
import { describe, it, expect } from "vitest";
import {
  toCanonical,
  compareCanonical,
  resetDiffCounter,
} from "./canonical";
import type { ParsedDoc } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTextDoc(lines: string[], ext: "pdf" | "rtf" | "docx" = "pdf"): ParsedDoc {
  return {
    id: `${ext}-test`, path: `test.${ext}`, dir: "", fileName: `test.${ext}`,
    ext, stem: "test", versionTag: "", size: 0,
    content: { type: "text", lines },
  };
}

function makeFieldDoc(pairs: Array<[string, string]>): ParsedDoc {
  return makeTextDoc(pairs.map(([k, v]) => `${k}: ${v}`), "pdf");
}

function countDiffs(result: ReturnType<typeof compareCanonical>) {
  return result.missingInComparing.length +
    result.addedInComparing.length +
    result.matched.filter((m) => !m.identical).length;
}

function hasValue(result: ReturnType<typeof compareCanonical>, needle: string): boolean {
  const all = [
    ...result.matched.filter(m => !m.identical).map(m => `${m.baseline.value} ${m.comparing.value}`),
    ...result.missingInComparing.map(m => m.value),
    ...result.addedInComparing.map(m => m.value),
  ].join(" ");
  return all.includes(needle);
}

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY A — VALUE CHANGES MUST BE DETECTED
// (Not hidden as identical matches)
// ═════════════════════════════════════════════════════════════════════════════
describe("SAFETY: Value changes must be detected", () => {
  it("A1: Name Rajasekar → Kumar (field_value)", () => {
    const base = makeFieldDoc([["Customer Name", "Balaji Rajasekar"]]);
    const comp = makeFieldDoc([["Customer Name", "Balaji Kumar"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    expect(hasValue(r, "Rajasekar")).toBe(true);
    expect(hasValue(r, "Kumar")).toBe(true);
  });

  it("A2: Name Rajasekar → Kumar (paragraphs)", () => {
    const base = makeTextDoc(["Customer Name Balaji Rajasekar"]);
    const comp = makeTextDoc(["Customer Name Balaji Kumar"]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    expect(hasValue(r, "Rajasekar")).toBe(true);
    expect(hasValue(r, "Kumar")).toBe(true);
  });

  it("B1: Invoice 1250 → 1350 (field_value)", () => {
    const base = makeFieldDoc([["Invoice Amount", "1250.00"]]);
    const comp = makeFieldDoc([["Invoice Amount", "1350.00"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    expect(hasValue(r, "1250")).toBe(true);
    expect(hasValue(r, "1350")).toBe(true);
  });

  it("B2: Invoice 1250 → 1350 (paragraphs)", () => {
    const base = makeTextDoc(["Invoice Amount 1250.00"]);
    const comp = makeTextDoc(["Invoice Amount 1350.00"]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    expect(hasValue(r, "1250")).toBe(true);
    expect(hasValue(r, "1350")).toBe(true);
  });

  it("C1: Date 07/31 → 08/01 (field_value)", () => {
    const base = makeFieldDoc([["Claims Paid Thru", "07/31/2026"]]);
    const comp = makeFieldDoc([["Claims Paid Thru", "08/01/2026"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    expect(hasValue(r, "07/31/2026")).toBe(true);
    expect(hasValue(r, "08/01/2026")).toBe(true);
  });

  it("C2: Date 07/31 → 08/01 (paragraphs)", () => {
    const base = makeTextDoc(["Claims Paid Thru 07/31/2026"]);
    const comp = makeTextDoc(["Claims Paid Thru 08/01/2026"]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
  });

  it("D1: Client number 12345678 → 12345679", () => {
    const base = makeFieldDoc([["Client Number", "12345678"]]);
    const comp = makeFieldDoc([["Client Number", "12345679"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    expect(hasValue(r, "12345678")).toBe(true);
    expect(hasValue(r, "12345679")).toBe(true);
  });

  it("I1: Member count 100 → 101", () => {
    const base = makeFieldDoc([["Member Count", "100"]]);
    const comp = makeFieldDoc([["Member Count", "101"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    expect(hasValue(r, "100")).toBe(true);
    expect(hasValue(r, "101")).toBe(true);
  });

  it("I2: Member count 100 → 101 (paragraphs)", () => {
    const base = makeTextDoc(["Member Count 100"]);
    const comp = makeTextDoc(["Member Count 101"]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
  });

  it("M1: Single-char difference ABC-1234 → ABC-1235", () => {
    const base = makeFieldDoc([["Claim ID", "ABC-1234"]]);
    const comp = makeFieldDoc([["Claim ID", "ABC-1235"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
  });

  it("M2: ($333.33) → $333.33 sign change", () => {
    const base = makeFieldDoc([["Balance", "($333.33)"]]);
    const comp = makeFieldDoc([["Balance", "$333.33"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
  });

  it("M3: Revenue Report → Expense Report (different paragraphs)", () => {
    const base = makeTextDoc(["Revenue Report Q1 2026"]);
    const comp = makeTextDoc(["Expense Report Q1 2026"]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
  });

  it("M4: Active → Inactive through fragmentation", () => {
    const base = makeTextDoc(["Account Status Active"]);
    const comp = makeFieldDoc([["Account Status", "Inactive"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBeGreaterThanOrEqual(1);
    expect(hasValue(r, "Active") || hasValue(r, "Inactive")).toBe(true);
  });

  it("B3: Table value B 200 → 250", () => {
    const base = makeFieldDoc([
      ["Product A", "100"], ["Product B", "200"], ["Product C", "300"],
    ]);
    const comp = makeFieldDoc([
      ["Product A", "100"], ["Product B", "250"], ["Product C", "300"],
    ]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(1);
    const bVal = r.matched.find(m => !m.identical);
    expect(bVal).toBeDefined();
    expect(bVal!.baseline.value).toBe("200");
    expect(bVal!.comparing.value).toBe("250");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY B — MISSING/ADDED CONTENT MUST BE DETECTED
// ═════════════════════════════════════════════════════════════════════════════
describe("SAFETY: Missing/added content must be detected", () => {
  it("E1: Customer Number removed", () => {
    const base = makeFieldDoc([["Customer Name", "Balaji"], ["Customer Number", "12345"]]);
    const comp = makeFieldDoc([["Customer Name", "Balaji"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(r.missingInComparing.some(m => m.key === "customer number")).toBe(true);
  });

  it("E2: Status removed — not hidden by token overlap", () => {
    const base = makeFieldDoc([["Account", "1000"], ["Status", "Active"]]);
    const comp = makeFieldDoc([["Account", "1000"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(r.missingInComparing.some(m => m.key === "status")).toBe(true);
  });

  it("F1: Customer Number added", () => {
    const base = makeFieldDoc([["Customer Name", "Balaji"]]);
    const comp = makeFieldDoc([["Customer Name", "Balaji"], ["Customer Number", "12345"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(r.addedInComparing.some(a => a.key === "customer number")).toBe(true);
  });

  it("J1: Product B row removed", () => {
    const base = makeFieldDoc([
      ["Product A", "100"], ["Product B", "200"], ["Product C", "300"],
    ]);
    const comp = makeFieldDoc([
      ["Product A", "100"], ["Product C", "300"],
    ]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(r.missingInComparing.some(m => m.key === "product b")).toBe(true);
  });

  it("L3: Extra 'Department Research' in comparing is ADDED", () => {
    const base = makeTextDoc(["Account 1000 Customer Alpha Region South"]);
    const comp = makeFieldDoc([
      ["Account", "1000"], ["Customer", "Alpha"],
      ["Region", "South"], ["Department", "Research"],
    ]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(r.addedInComparing.some(a => a.key === "department")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY C — FRAGMENTATION WITHOUT VALUE CHANGE MUST MATCH
// ═════════════════════════════════════════════════════════════════════════════
describe("SAFETY: Fragmentation matches (same content, different layout)", () => {
  it("G1: Merged paragraph ↔ field_value (same content)", () => {
    const base = makeTextDoc(["Claims Paid Thru 07/31/2026 (Bill Cycle 5 of 5)"]);
    const comp = makeFieldDoc([["Claims Paid Thru", "07/31/2026 (Bill Cycle 5 of 5)"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(0);
  });

  it("G2: Merged paragraph ↔ split paragraphs (same content)", () => {
    const base = makeTextDoc(["Claims Paid Thru 07/31/2026 (Bill Cycle 5 of 5)"]);
    const comp = makeTextDoc(["Claims Paid Thru", "07/31/2026 (Bill Cycle 5 of 5)"]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(0);
  });

  it("G3: Multiple fields fragmented differently match", () => {
    const base = makeTextDoc([
      "Paid Claims Month August 2026",
      "Claims Paid Thru 07/31/2026 (Bill Cycle 5 of 5)",
    ]);
    const comp = makeFieldDoc([
      ["Paid Claims Month", "August 2026"],
      ["Claims Paid Thru", "07/31/2026 (Bill Cycle 5 of 5)"],
    ]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBe(0);
  });

  it("H1: Date change through fragmentation IS detected (not hidden)", () => {
    const base = makeTextDoc(["Claims Paid Thru 07/31/2026 (Bill Cycle 5 of 5)"]);
    const comp = makeFieldDoc([["Claims Paid Thru", "08/01/2026 (Bill Cycle 5 of 5)"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    // The date tokens differ → must produce at least 1 difference
    expect(countDiffs(r)).toBeGreaterThanOrEqual(1);
    // The actual date values must appear in the differences
    expect(hasValue(r, "07/31/2026") || hasValue(r, "08/01/2026")).toBe(true);
  });

  it("H2: Value 1250 → 1350 through fragmentation IS detected", () => {
    const base = makeTextDoc(["Invoice Amount 1250.00"]);
    const comp = makeFieldDoc([["Invoice Amount", "1350.00"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBeGreaterThanOrEqual(1);
    expect(hasValue(r, "1250") || hasValue(r, "1350")).toBe(true);
  });

  it("H3: Currency ($333.33) → ($444.44) through fragmentation IS detected", () => {
    const base = makeTextDoc(["Advance Deposit Total ($333.33)"]);
    const comp = makeFieldDoc([["Advance Deposit Total", "($444.44)"]]);
    resetDiffCounter();
    const r = compareCanonical(toCanonical(base), toCanonical(comp), "intelligent");
    expect(countDiffs(r)).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY D — CROSS-FORMAT REPRESENTATION EQUIVALENCE
// ═════════════════════════════════════════════════════════════════════════════
describe("SAFETY: Cross-format representation equivalence", () => {
  const FV_ROWS: Array<[string, string]> = [
    ["Account", "1000"],
    ["Customer", "Customer Alpha"],
    ["Region", "South"],
    ["Account Manager", "Arun Kumar"],
    ["Status", "Active"],
    ["Customer Since", "2021-06-15"],
  ];

  it("N1: PDF pipe ↔ RTF alternating key/value", () => {
    const pdf = makeTextDoc(FV_ROWS.map(([k, v]) => `${k} | ${v}`), "pdf");
    const rtf = makeTextDoc(FV_ROWS.flatMap(([k, v]) => [k, v]), "rtf");
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(pdf), toCanonical(rtf), "intelligent"))).toBe(0);
  });

  it("N2: PDF space-separated ↔ DOCX individual lines", () => {
    const pdf = makeTextDoc(FV_ROWS.map(([k, v]) => `${k}    ${v}`), "pdf");
    const docx = makeTextDoc(FV_ROWS.flatMap(([k, v]) => [k, v]), "docx");
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(pdf), toCanonical(docx), "intelligent"))).toBe(0);
  });

  it("N4: RTF tab-delimited ↔ DOCX individual lines", () => {
    const rtf = makeTextDoc(["Field\tValue", ...FV_ROWS.map(([k, v]) => `${k}\t${v}`)], "rtf");
    const docx = makeTextDoc(FV_ROWS.flatMap(([k, v]) => [k, v]), "docx");
    resetDiffCounter();
    expect(countDiffs(compareCanonical(toCanonical(rtf), toCanonical(docx), "intelligent"))).toBe(0);
  });
});
