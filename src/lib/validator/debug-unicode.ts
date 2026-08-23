import { toCanonical } from "./canonical";
import { parseFileBytes } from "./parsers";
import type { ParsedDoc } from "./types";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } from "docx";
import * as XLSX from "xlsx";

const data = [
  ["Name", "José García"],
  ["City", "München"],
  ["Currency", "₹15,400.00"],
  ["Language", "東京"],
  ["Department", "R&D"],
];

async function main() {
  const docRows = data.map(row => new TableRow({
    children: row.map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun(cell)] })],
      width: { size: 50, type: WidthType.PERCENTAGE },
    })),
  }));

  const doc = new Document({ sections: [{ children: [new Table({ rows: docRows })] }] });
  const buf = await Packer.toBuffer(doc);
  const abuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

  const docxDocRaw = await parseFileBytes("unicode.docx", abuf);
  const docxDoc = docxDocRaw as ParsedDoc;
  if (docxDoc.content.type === "text") {
    console.log("DOCX lines:", JSON.stringify(docxDoc.content.lines));
  }
  const docxCanon = toCanonical(docxDoc);
  console.log("DOCX canonical:", docxCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));

  const xlsxRows = [["Field", "Value"], ...data];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(xlsxRows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const xlsxBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const xlsxAbuf = xlsxBuf instanceof ArrayBuffer ? xlsxBuf : xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength) as ArrayBuffer;
  const xlsxDocRaw = await parseFileBytes("unicode.xlsx", xlsxAbuf);
  const xlsxDoc = xlsxDocRaw as ParsedDoc;
  const xlsxCanon = toCanonical(xlsxDoc);
  console.log("XLSX canonical:", xlsxCanon.items.map(i => `[${i.kind}] key="${i.key}" value="${i.value}"`));
}

main().catch(e => { console.error(e); process.exit(1); });
