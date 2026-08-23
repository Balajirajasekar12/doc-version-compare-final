import { describe, it } from "vitest";
import { extractDocxText } from "./mammoth";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } from "docx";

describe("DEBUG2", () => {
  it("mammoth unicode extraction", async () => {
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
    const text = await extractDocxText(abuf);
    console.log("RAW TEXT:", JSON.stringify(text));
    const lines = text.split("\n");
    console.log("LINES:", lines.map((l, i) => `[${i}] "${l}"`));
  });
});
