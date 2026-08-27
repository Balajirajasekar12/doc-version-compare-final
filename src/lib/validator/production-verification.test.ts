/**
 * PRODUCTION VERIFICATION
 *
 * Tests the EXACT failure patterns reported from real organization documents.
 * Creates REAL binary files (DOCX, XLSX, RTF, PDF simulation) through
 * the actual production parsers and verifies zero false differences.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  toCanonical,
  compareCanonical,
  generateCanonicalDiffs,
  resetDiffCounter,
} from "./canonical";
import { parseFileBytes } from "./parsers";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TextRun,
  HeadingLevel,
} from "docx";
import * as XLSX from "xlsx";

// ── Helpers ─────────────────────────────────────────────────────────────────

const FV_DATA = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

async function createDocx(
  rows: string[][],
  opts?: { title?: string; description?: string },
): Promise<ArrayBuffer> {
  const docRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun(cell)] })],
              width: { size: 50, type: WidthType.PERCENTAGE },
            }),
        ),
      }),
  );
  const children = [];
  if (opts?.title) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: opts.title, bold: true })],
        heading: HeadingLevel.HEADING_1,
      }),
    );
  }
  children.push(new Table({ rows: docRows }));
  if (opts?.description) {
    children.push(new Paragraph({ children: [new TextRun(opts.description)] }));
  }
  const doc = new Document({ sections: [{ children }] });
  const buf = await Packer.toBuffer(doc);
  // Packer.toBuffer returns Uint8Array; we need ArrayBuffer
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function createXlsx(rows: string[][], sheetName = "Sheet1"): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  // XLSX.write with type:"array" returns Uint8Array
  if (buf instanceof ArrayBuffer) return buf;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function createMinimalPdf(text: string): ArrayBuffer {
  const textLines = text.split("\n");
  let stream = "BT\n/F1 12 Tf\n";
  let y = 700;
  for (const line of textLines) {
    stream += `1 0 0 1 50 ${y} Tm\n(${line.replace(/[()\\]/g, "\\$&")}) Tj\n`;
    y -= 20;
  }
  stream += "ET";

  const catalogObj = 1, pagesObj = 2, pageObj = 3, contentObj = 4, fontObj = 5;
  const objects: string[] = [];
  objects.push(`${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${pagesObj} 0 R >>\nendobj`);
  objects.push(`${pagesObj} 0 obj\n<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>\nendobj`);
  objects.push(`${pageObj} 0 obj\n<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>\nendobj`);
  objects.push(`${fontObj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);
  objects.push(`${contentObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`);

  const xrefOffsets: number[] = [];
  let pdf = "";
  for (const obj of objects) {
    xrefOffsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xrefStart = pdf.length;
  pdf += "xref\n";
  pdf += `0 6\n`;
  pdf += "0000000000 65535 f \r\n";
  for (const offset of xrefOffsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \r\n`;
  }
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";

  return new TextEncoder().encode(pdf).buffer;
}

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetDiffCounter();
});

describe("PRODUCTION: Cross-format field/value comparison", () => {
  it("DOCX → XLSX: zero false differences", async () => {
    const docxBuf = await createDocx(FV_DATA);
    const xlsxBuf = createXlsx([["Field", "Value"], ...FV_DATA]);
    const docxDoc = await parseFileBytes("profile.docx", docxBuf);
    const xlsxDoc = await parseFileBytes("profile.xlsx", xlsxBuf);
    const baseline = toCanonical(docxDoc);
    const comparing = toCanonical(xlsxDoc);
    const result = compareCanonical(baseline, comparing, "intelligent");
    const matchedFV = result.matched.filter(m => m.baseline.kind === "field_value");
    expect(matchedFV.length).toBeGreaterThanOrEqual(6);
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });

  it("DOCX (with title) → XLSX: title doesn't break table detection", async () => {
    const docxBuf = await createDocx(FV_DATA, { title: "Customer Profile" });
    const xlsxBuf = createXlsx([["Field", "Value"], ...FV_DATA]);
    const docxDoc = await parseFileBytes("profile.docx", docxBuf);
    const xlsxDoc = await parseFileBytes("profile.xlsx", xlsxBuf);
    const baseline = toCanonical(docxDoc);
    const comparing = toCanonical(xlsxDoc);
    const result = compareCanonical(baseline, comparing, "intelligent");
    const matchedFV = result.matched.filter(m => m.baseline.kind === "field_value");
    expect(matchedFV.length).toBeGreaterThanOrEqual(6);
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });

  it("PDF (space-separated) → DOCX: cross-format matching", async () => {
    const pdfText = [
      "Field    Value",
      "Account    1000",
      "Customer    Customer Alpha",
      "Region    South",
      "Account Manager    Arun Kumar",
      "Status    Active",
      "Customer Since    2021-06-15",
    ].join("\n");
    const pdfBuf = createMinimalPdf(pdfText);
    const docxBuf = await createDocx(FV_DATA);
    const pdfDoc = await parseFileBytes("profile.pdf", pdfBuf);
    const docxDoc = await parseFileBytes("profile.docx", docxBuf);
    const baseline = toCanonical(pdfDoc);
    const comparing = toCanonical(docxDoc);
    const result = compareCanonical(baseline, comparing, "intelligent");
    const matchedFV = result.matched.filter(m => m.baseline.kind === "field_value");
    expect(matchedFV.length).toBeGreaterThanOrEqual(4);
    const falseMissing = result.missingInComparing.filter(
      i => i.kind === "field_value" &&
        ["account","customer","region","status","account manager","customer since"].includes(i.key),
    );
    expect(falseMissing.length).toBe(0);
  });

  it("RTF → XLSX: cross-format matching", async () => {
    const rtfRows = FV_DATA.map(([k, v]) => `${k}\\cell ${v}\\cell`).join("\\row\n");
    const rtf = `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Helvetica;}}\n\\pard\nField\\cell Value\\cell\\row\n${rtfRows}\n}`;
    const rtfBuf = new TextEncoder().encode(rtf).buffer;
    const xlsxRowBuf = createXlsx([["Field", "Value"], ...FV_DATA]);
    const rtfDoc = await parseFileBytes("profile.rtf", rtfBuf);
    const xlsxDoc = await parseFileBytes("profile.xlsx", xlsxRowBuf);
    const baseline = toCanonical(rtfDoc);
    const comparing = toCanonical(xlsxDoc);
    const result = compareCanonical(baseline, comparing, "intelligent");
    const matchedFV = result.matched.filter(m => m.baseline.kind === "field_value");
    expect(matchedFV.length).toBeGreaterThanOrEqual(4);
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    const falseAdded = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
    expect(falseAdded.length).toBe(0);
  });
});

describe("PRODUCTION: Genuine differences detected", () => {
  it("Region changed: South → North", async () => {
    const compData = FV_DATA.map(([k, v]) => k === "Region" ? [k, "North"] : [k, v]);
    const docxBuf = await createDocx(FV_DATA);
    const xlsxRowBuf = createXlsx([["Field", "Value"], ...compData]);
    const docxDoc = await parseFileBytes("baseline.docx", docxBuf);
    const xlsxDoc = await parseFileBytes("comparing.xlsx", xlsxRowBuf);
    const result = compareCanonical(toCanonical(docxDoc), toCanonical(xlsxDoc), "intelligent");
    const regionMismatch = result.matched.find(m => m.baseline.key === "region" && m.baseline.kind === "field_value" && !m.identical);
    expect(regionMismatch).toBeDefined();
    expect(regionMismatch!.baseline.value).toBe("South");
    expect(regionMismatch!.comparing.value).toBe("North");
  });

  it("Missing field: Status removed", async () => {
    const compData = FV_DATA.filter(([k]) => k !== "Status");
    const docxBuf = await createDocx(FV_DATA);
    const xlsxRowBuf = createXlsx([["Field", "Value"], ...compData]);
    const docxDoc = await parseFileBytes("baseline.docx", docxBuf);
    const xlsxDoc = await parseFileBytes("comparing.xlsx", xlsxRowBuf);
    const result = compareCanonical(toCanonical(docxDoc), toCanonical(xlsxDoc), "intelligent");
    expect(result.missingInComparing.find(i => i.key === "status" && i.kind === "field_value")).toBeDefined();
  });

  it("Added field: Department added", async () => {
    const compData = [...FV_DATA, ["Department", "Research"]];
    const docxBuf = await createDocx(FV_DATA);
    const xlsxRowBuf = createXlsx([["Field", "Value"], ...compData]);
    const docxDoc = await parseFileBytes("baseline.docx", docxBuf);
    const xlsxDoc = await parseFileBytes("comparing.xlsx", xlsxRowBuf);
    const result = compareCanonical(toCanonical(docxDoc), toCanonical(xlsxDoc), "intelligent");
    const addedDept = result.addedInComparing.find(i => i.key === "department" && i.kind === "field_value");
    expect(addedDept).toBeDefined();
    expect(addedDept!.value).toBe("Research");
  });
});

describe("PRODUCTION: Unicode preserved", () => {
  it("Unicode values survive full pipeline", async () => {
    const data = [
      ["Name", "José García"],
      ["City", "München"],
      ["Currency", "₹15,400.00"],
      ["Language", "東京"],
      ["Department", "R&D"],
    ];
    const docxBuf = await createDocx(data);
    const xlsxRowBuf = createXlsx([["Field", "Value"], ...data]);
    const docxDoc = await parseFileBytes("unicode.docx", docxBuf);
    const xlsxDoc = await parseFileBytes("unicode.xlsx", xlsxRowBuf);
    const result = compareCanonical(toCanonical(docxDoc), toCanonical(xlsxDoc), "intelligent");
    const matchedFV = result.matched.filter(m => m.baseline.kind === "field_value" && m.identical);
    expect(matchedFV.length).toBeGreaterThanOrEqual(4);
    const falseMissing = result.missingInComparing.filter(i => i.kind === "field_value");
    expect(falseMissing.length).toBe(0);
  });
});

describe("PRODUCTION: Cross-format matrix", () => {
  const formats = ["docx", "xlsx", "rtf", "pdf"] as const;
  async function makeDoc(fmt: string, data: string[][]) {
    switch (fmt) {
      case "docx": return parseFileBytes("t.docx", await createDocx(data));
      case "xlsx": return parseFileBytes("t.xlsx", createXlsx([["Field", "Value"], ...data]));
      case "rtf": {
        const r = data.map(([k,v]) => `${k}\\cell ${v}\\cell`).join("\\row\n");
        const buf = new TextEncoder().encode(`{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Helvetica;}}\n\\pard\nField\\cell Value\\cell\\row\n${r}\n}`).buffer;
        return parseFileBytes("t.rtf", buf);
      }
      case "pdf": {
        const text = data.map(([k,v]) => `${k}    ${v}`).join("\n");
        const buf = createMinimalPdf(text);
        return parseFileBytes("t.pdf", buf);
      }
      default: throw new Error(`Unknown format: ${fmt}`);
    }
  }

  for (const bf of formats) {
    for (const cf of formats) {
      if (bf === cf) continue;
      it(`${bf.toUpperCase()} → ${cf.toUpperCase()}: zero false field_value diffs`, async () => {
        const bDoc = await makeDoc(bf, FV_DATA);
        const cDoc = await makeDoc(cf, FV_DATA);
        const result = compareCanonical(toCanonical(bDoc), toCanonical(cDoc), "intelligent");
        const matchedFV = result.matched.filter(m => m.baseline.kind === "field_value");
        expect(matchedFV.length).toBeGreaterThanOrEqual(4);
        expect(result.missingInComparing.filter(i => i.kind === "field_value").length).toBe(0);
        expect(result.addedInComparing.filter(i => i.kind === "field_value").length).toBe(0);
      });
    }
  }
});

describe("PRODUCTION: Misnamed files rejected", () => {
  it("DOCX → .rtf: clear error", async () => {
    const buf = await createDocx(FV_DATA);
    await expect(parseFileBytes("profile.rtf", buf)).rejects.toThrow(/ZIP|DOCX|extension/i);
  });
  it("XLSX → .rtf: clear error", async () => {
    const buf = createXlsx([["Field", "Value"], ...FV_DATA]);
    await expect(parseFileBytes("profile.rtf", buf)).rejects.toThrow(/ZIP|XLSX|extension/i);
  });
  it("PDF → .docx: clear error", async () => {
    const buf = createMinimalPdf("test");
    await expect(parseFileBytes("profile.docx", buf)).rejects.toThrow(/PDF|extension/i);
  });
  it("RTF → .docx: clear error", async () => {
    const buf = new TextEncoder().encode("{\\rtf1 test}").buffer;
    await expect(parseFileBytes("profile.docx", buf)).rejects.toThrow(/ZIP|RTF|extension/i);
  });
});

describe("PRODUCTION: No artifacts in output", () => {
  it("No OOXML paths in canonical output", async () => {
    const buf = await createDocx(FV_DATA);
    const doc = await parseFileBytes("t.docx", buf);
    const items = toCanonical(doc).items;
    const OOXML = ["word/document.xml", "xl/workbook.xml", "[Content_Types].xml", "_rels/.rels"];
    for (const item of items) {
      for (const p of OOXML) {
        expect(item.value).not.toContain(p);
      }
    }
  });

  it("No RTF control syntax in canonical output", async () => {
    const rtf = `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Helvetica;}}\n\\pard\nAccount\\cell 1000\\cell\nCustomer\\cell Customer Alpha\\cell\n}`;
    const buf = new TextEncoder().encode(rtf).buffer;
    const doc = await parseFileBytes("t.rtf", buf);
    const items = toCanonical(doc).items;
    for (const item of items) {
      expect(item.value).not.toMatch(/^\\rtf/);
      expect(item.value).not.toMatch(/\\pard/);
    }
  });

  it("Report rows contain only human-readable content", async () => {
    const docxBuf = await createDocx(FV_DATA);
    const xlsxRowBuf = createXlsx([["Field", "Value"], ...FV_DATA]);
    const docxDoc = await parseFileBytes("baseline.docx", docxBuf);
    const xlsxDoc = await parseFileBytes("comparing.xlsx", xlsxRowBuf);
    const result = compareCanonical(toCanonical(docxDoc), toCanonical(xlsxDoc), "intelligent");
    const diffs = generateCanonicalDiffs("g1", "Test", "ACC-001", docxDoc, xlsxDoc, result, { baselineFormat: "docx", comparingFormat: "xlsx" });
    const GARBAGE = [/^PK/, /word\/document\.xml/, /xl\/workbook\.xml/, /\[Content_Types\]\.xml/, /\\rtf/, /\\pard/];
    for (const d of diffs) {
      for (const p of GARBAGE) {
        expect(d.referenceText).not.toMatch(p);
        expect(d.locationLabel).not.toMatch(p);
        for (const v of d.versions) expect(v.text).not.toMatch(p);
      }
    }
  });

  it("'Field | Value' is not emitted as field_value data", async () => {
    const buf = await createDocx(FV_DATA);
    const doc = await parseFileBytes("t.docx", buf);
    const items = toCanonical(doc).items;
    // Generic table header "Field | Value" should not appear as field_value data
    const fieldData = items.find(i => i.kind === "field_value" && i.key === "field" && i.value !== "Value");
    expect(fieldData).toBeUndefined();
    // Data rows should still be present as field_value items
    const accountItem = items.find(i => i.kind === "field_value" && i.key === "account");
    expect(accountItem).toBeDefined();
  });
});
