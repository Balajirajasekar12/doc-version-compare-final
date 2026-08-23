import { describe, it, expect } from "vitest";
import { toCanonical, compareCanonical, resetDiffCounter } from "./canonical";
import { parseFileBytes } from "./parsers";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } from "docx";
import * as XLSX from "xlsx";

describe("DEBUG", () => {
  it("trace unicode DOCX vs XLSX", async () => {
    resetDiffCounter();
    const data = [
      ["Name", "José García"],
      ["City", "München"],
      ["Currency", "₹15,400.00"],
      ["Language", "東京"],
      ["Department", "R&D"],
    ];
    
    const docRows = data.map(row => new TableRow({
      children: row.map(cell => new TableCell({
        children: [new Paragraph({ children: [new TextRun(cell)] })],
        width: { size: 50, type: WidthType.PERCENTAGE },
      })),
    }));
    const doc = new Document({ sections: [{ children: [new Table({ rows: docRows })] }] });
    const buf = await Packer.toBuffer(doc);
    const abuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    
    const docxDoc = await parseFileBytes("unicode.docx", abuf);
    const docxCanon = toCanonical(docxDoc);
    console.log("DOCX items:", docxCanon.items.map(i => `[${i.kind}] key="${i.key}" val="${i.value}"`));
    
    const xlsxBuf = XLSX.write(
      (() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Field", "Value"], ...data]), "Sheet1"); return wb; })(),
      { type: "array", bookType: "xlsx" }
    );
    const xlsxAbuf = xlsxBuf instanceof ArrayBuffer ? xlsxBuf : xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength);
    const xlsxDoc = await parseFileBytes("unicode.xlsx", xlsxAbuf);
    const xlsxCanon = toCanonical(xlsxDoc);
    console.log("XLSX items:", xlsxCanon.items.map(i => `[${i.kind}] key="${i.key}" val="${i.value}"`));
    
    const result = compareCanonical(docxCanon, xlsxCanon, "intelligent");
    console.log("MATCHED:", result.matched.map(m => `${m.baseline.key}=${m.baseline.value} → ${m.comparing.value} [${m.identical ? "ID" : "DIFF"}]`));
    console.log("MISSING:", result.missingInComparing.map(i => `[${i.kind}] ${i.key}=${i.value}`));
    console.log("ADDED:", result.addedInComparing.map(i => `[${i.kind}] ${i.key}=${i.value}`));
    
    expect(true).toBe(true); // just print
  });
});
