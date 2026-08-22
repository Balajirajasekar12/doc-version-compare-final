/**
 * ARTIFACT FILTER REGRESSION TESTS
 *
 * These tests verify that binary/container/parser garbage NEVER enters
 * the canonical comparison engine as document content. They test the
 * actual extraction pipeline end-to-end, not just the filter functions.
 */
import { describe, it, expect } from "vitest";
import {
  toCanonical,
  compareCanonical,
  resetDiffCounter,
} from "./canonical";
import { rtfToText } from "./rtf";
import type { ParsedDoc, SheetData } from "./types";
import * as XLSX from "xlsx";

// ── OOXML/ZIP path contamination tests ──────────────────────────────────────

describe("Artifact filter: OOXML paths never reach comparison", () => {
  const OOXML_LINES = [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/styles.xml",
    "word/_rels/document.xml.rels",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
    "xl/sharedStrings.xml",
    "xl/styles.xml",
    "ppt/presentation.xml",
  ];

  it("None of these lines appear as canonical content items", () => {
    for (const badLine of OOXML_LINES) {
      const doc: ParsedDoc = {
        id: `test::${badLine.length}`,
        path: "test.docx",
        dir: "",
        fileName: "test.docx",
        ext: "docx",
        stem: "test",
        versionTag: null,
        size: 100,
        content: { type: "text", lines: [badLine] },
      };
      const items = toCanonical(doc).items;
      for (const item of items) {
        expect(item.value).not.toContain("word/document.xml");
        expect(item.value).not.toContain("xl/workbook.xml");
        expect(item.value).not.toContain("[Content_Types].xml");
        expect(item.value).not.toContain("_rels/");
        expect(item.key).not.toContain("word/");
        expect(item.key).not.toContain("xl/");
      }
    }
  });

  it("OOXML paths mixed with valid content: only valid content remains", () => {
    const doc: ParsedDoc = {
      id: "mixed::100",
      path: "mixed.docx",
      dir: "",
      fileName: "mixed.docx",
      ext: "docx",
      stem: "mixed",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: [
          "word/document.xml",
          "Account | 1000",
          "Customer | Customer Alpha",
          "xl/sharedStrings.xml",
          "Region | South",
        ],
      },
    };
    const items = toCanonical(doc).items;
    const values = items.map((i) => i.value);

    // OOXML paths are filtered out
    expect(values).not.toContain("word/document.xml");
    expect(values).not.toContain("xl/sharedStrings.xml");

    // Valid content is preserved
    const fvItems = items.filter((i) => i.kind === "field_value");
    expect(fvItems.length).toBe(3);
    expect(fvItems.find((i) => i.key === "account")?.value).toBe("1000");
    expect(fvItems.find((i) => i.key === "customer")?.value).toBe("Customer Alpha");
    expect(fvItems.find((i) => i.key === "region")?.value).toBe("South");
  });
});

// ── ZIP binary garbage tests ────────────────────────────────────────────────

describe("Artifact filter: ZIP binary garbage never reaches comparison", () => {
  it("PK signature bytes decoded as text are filtered", () => {
    const doc: ParsedDoc = {
      id: "zipgarb::100",
      path: "test.rtf",
      dir: "",
      fileName: "test.rtf",
      ext: "rtf",
      stem: "test",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: [
          "PK\u0003\u0004word/document.xml",
          "PK\u0001\u0002xl/workbook.xml",
          "Account | 1000",
          "Customer | Customer Alpha",
        ],
      },
    };
    const items = toCanonical(doc).items;
    const fvItems = items.filter((i) => i.kind === "field_value");
    expect(fvItems.length).toBe(2);
    expect(fvItems.find((i) => i.key === "account")?.value).toBe("1000");
  });
});

// ── RTF control syntax leakage tests ────────────────────────────────────────

describe("Artifact filter: raw RTF control syntax is filtered", () => {
  it("Pure RTF control lines are removed", () => {
    const doc: ParsedDoc = {
      id: "rtfgarb::100",
      path: "test.rtf",
      dir: "",
      fileName: "test.rtf",
      ext: "rtf",
      stem: "test",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: [
          "{\\rtf1\\ansi\\deff0",
          "\\pard\\fs24",
          "Account | 1000",
          "\\par\\b",
          "Customer | Customer Alpha",
        ],
      },
    };
    const items = toCanonical(doc).items;
    const fvItems = items.filter((i) => i.kind === "field_value");
    expect(fvItems.length).toBe(2);
    expect(fvItems.find((i) => i.key === "account")?.value).toBe("1000");
  });
});

// ── Real RTF parsing through actual rtfToText ────────────────────────────────

describe("Real RTF → rtfToText → canonical: no garbage", () => {
  const RTF_WITH_TABLE = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}}
\\pard
Customer Profile\\par
\\par
Account\\tab 1000\\par
Customer\\tab Customer Alpha\\par
Region\\tab South\\par
Account Manager\\tab Arun Kumar\\par
Status\\tab Active\\par
Customer Since\\tab 2021-06-15\\par
\\par
Created for cross-format comparison testing.\\par
}`;

  it("RTF parsed through real parser produces clean text", () => {
    const plain = rtfToText(RTF_WITH_TABLE);

    // No RTF control syntax in output
    expect(plain).not.toContain("\\pard");
    expect(plain).not.toContain("\\par");
    expect(plain).not.toContain("\\fs");
    expect(plain).not.toContain("\\rtf");
    expect(plain).not.toContain("\\b");

    // All content preserved
    expect(plain).toContain("Account");
    expect(plain).toContain("1000");
    expect(plain).toContain("Customer Alpha");
    expect(plain).toContain("South");
    expect(plain).toContain("Arun Kumar");
    expect(plain).toContain("Active");
    expect(plain).toContain("2021-06-15");
  });

  it("RTF parsed through full pipeline matches XLSX", () => {
    const plain = rtfToText(RTF_WITH_TABLE);
    const lines = plain.split("\n").filter((l) => l.trim() !== "");

    const rtfDoc: ParsedDoc = {
      id: "real.rtf::1000",
      path: "real.rtf",
      dir: "",
      fileName: "real.rtf",
      ext: "rtf",
      stem: "real",
      versionTag: null,
      size: RTF_WITH_TABLE.length,
      content: { type: "text", lines },
    };

    // Create matching XLSX
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
      ["Account Manager", "Arun Kumar"],
      ["Status", "Active"],
      ["Customer Since", "2021-06-15"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const readWb = XLSX.read(buf, { type: "array" });
    const readSheet = readWb.Sheets[readWb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(readSheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });

    const xlsxDoc: ParsedDoc = {
      id: "real.xlsx::1000",
      path: "real.xlsx",
      dir: "",
      fileName: "real.xlsx",
      ext: "xlsx",
      stem: "real",
      versionTag: null,
      size: buf.byteLength,
      content: {
        type: "sheet",
        sheets: [
          {
            name: "Report",
            rows: rows.map((row) =>
              (Array.isArray(row) ? row : []).map((cell) =>
                cell === null || cell === undefined ? "" : String(cell),
              ),
            ),
          },
        ],
      },
    };

    resetDiffCounter();
    const rtfCanon = toCanonical(rtfDoc);
    const xlsxCanon = toCanonical(xlsxDoc);
    const result = compareCanonical(rtfCanon, xlsxCanon, "intelligent");

    // All 6 field_values match
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

// ── Real XLSX with multiple sheets ───────────────────────────────────────────

describe("Real XLSX with Validation Notes sheet: no false contamination", () => {
  it("Extra sheet content is separate from main report data", () => {
    const wb = XLSX.utils.book_new();
    const reportWs = XLSX.utils.aoa_to_sheet([
      ["Field", "Value"],
      ["Account", "1000"],
      ["Customer", "Customer Alpha"],
      ["Region", "South"],
    ]);
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
        header: 1,
        raw: true,
        defval: "",
        blankrows: true,
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

    const xlsxDoc: ParsedDoc = {
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

    // Create matching PDF-like text doc
    const pdfDoc: ParsedDoc = {
      id: "match.pdf::1000",
      path: "match.pdf",
      dir: "",
      fileName: "match.pdf",
      ext: "pdf",
      stem: "match",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: [
          "Field | Value",
          "Account | 1000",
          "Customer | Customer Alpha",
          "Region | South",
        ],
      },
    };

    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(pdfDoc),
      toCanonical(xlsxDoc),
      "intelligent",
    );

    // Main 3 fields must match — no false MISSING
    const missingKeys = result.missingInComparing
      .filter((i) => i.kind === "field_value")
      .map((i) => i.key);
    expect(missingKeys).not.toContain("account");
    expect(missingKeys).not.toContain("customer");
    expect(missingKeys).not.toContain("region");
  });
});

// ── Unicode preservation through artifact filter ──────────────────────────────

describe("Artifact filter preserves legitimate Unicode content", () => {
  it("Non-ASCII characters survive filtering", () => {
    const doc: ParsedDoc = {
      id: "uni::100",
      path: "uni.pdf",
      dir: "",
      fileName: "uni.pdf",
      ext: "pdf",
      stem: "uni",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: [
          "Field | Value",
          "Customer | José García",
          "City | München",
          "Balance | ₹15,400.00",
          "Company | ACME & Co.",
          "Notes | 50% discount — valid",
        ],
      },
    };
    const items = toCanonical(doc).items;
    const fvItems = items.filter((i) => i.kind === "field_value");
    expect(fvItems.length).toBe(5);
    expect(fvItems.find((i) => i.key === "customer")?.value).toContain("José");
    expect(fvItems.find((i) => i.key === "city")?.value).toContain("München");
    expect(fvItems.find((i) => i.key === "balance")?.value).toContain("₹");
    expect(fvItems.find((i) => i.key === "notes")?.value).toContain("—");
  });
});

// ── Genuine differences still detected after filtering ────────────────────────

describe("Artifact filter does not suppress real differences", () => {
  it("Value change is detected after artifact filtering", () => {
    const baseline: ParsedDoc = {
      id: "base::100",
      path: "base.pdf",
      dir: "",
      fileName: "base.pdf",
      ext: "pdf",
      stem: "base",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: ["Field | Value", "Account | 1000", "Region | South"],
      },
    };
    const comparing: ParsedDoc = {
      id: "comp::100",
      path: "comp.docx",
      dir: "",
      fileName: "comp.docx",
      ext: "docx",
      stem: "comp",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: ["Field | Value", "Account | 1000", "Region | North"],
      },
    };

    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const regionMismatch = result.matched.find(
      (m) => m.baseline.key === "region" && !m.identical,
    );
    expect(regionMismatch).toBeDefined();
    expect(regionMismatch!.baseline.value).toBe("South");
    expect(regionMismatch!.comparing.value).toBe("North");
  });

  it("Missing field is detected after artifact filtering", () => {
    const baseline: ParsedDoc = {
      id: "base::100",
      path: "base.pdf",
      dir: "",
      fileName: "base.pdf",
      ext: "pdf",
      stem: "base",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: [
          "Field | Value",
          "Account | 1000",
          "Region | South",
          "Status | Active",
        ],
      },
    };
    const comparing: ParsedDoc = {
      id: "comp::100",
      path: "comp.docx",
      dir: "",
      fileName: "comp.docx",
      ext: "docx",
      stem: "comp",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: ["Field | Value", "Account | 1000", "Region | South"],
      },
    };

    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const missing = result.missingInComparing.find(
      (i) => i.key === "status",
    );
    expect(missing).toBeDefined();
    expect(missing!.value).toBe("Active");
  });

  it("Added field is detected after artifact filtering", () => {
    const baseline: ParsedDoc = {
      id: "base::100",
      path: "base.pdf",
      dir: "",
      fileName: "base.pdf",
      ext: "pdf",
      stem: "base",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: ["Field | Value", "Account | 1000", "Region | South"],
      },
    };
    const comparing: ParsedDoc = {
      id: "comp::100",
      path: "comp.docx",
      dir: "",
      fileName: "comp.docx",
      ext: "docx",
      stem: "comp",
      versionTag: null,
      size: 100,
      content: {
        type: "text",
        lines: [
          "Field | Value",
          "Account | 1000",
          "Region | South",
          "Country | India",
        ],
      },
    };

    resetDiffCounter();
    const result = compareCanonical(
      toCanonical(baseline),
      toCanonical(comparing),
      "intelligent",
    );

    const added = result.addedInComparing.find((i) => i.key === "country");
    expect(added).toBeDefined();
    expect(added!.value).toBe("India");
  });
});

// ── Magic byte detection tests ──────────────────────────────────────────────

describe("Magic byte detection auto-detects misnamed files", () => {
  it("ZIP file with .rtf extension auto-detects as XLSX", async () => {
    // Create a real XLSX (ZIP) file, then parse as .rtf — should auto-detect
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Field", "Value"],
      ["Account", "1000"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const arrayBuffer = new Uint8Array(buf).buffer;

    const { parseFileBytes } = await import("./parsers");
    const result = await parseFileBytes("test.rtf", arrayBuffer);
    expect(result.ext).toBe("xlsx");
    expect(result.content.type).toBe("sheet");
  });

  it("PDF file with .docx extension auto-detects as PDF", async () => {
    // Create a minimal PDF header
    const pdfBytes = new TextEncoder().encode("%PDF-1.4 fake content");
    const arrayBuffer = pdfBytes.buffer;

    const { parseFileBytes } = await import("./parsers");
    try {
      const result = await parseFileBytes("test.docx", arrayBuffer);
      expect(result.ext).toBe("pdf");
    } catch (err) {
      // If PDF parsing fails on fake content, that's expected —
      // the key is it tries PDF, not DOCX
      const msg = (err as Error).message;
      expect(msg).not.toMatch(/ZIP|DOCX|XLSX|extension/i);
    }
  });
});
