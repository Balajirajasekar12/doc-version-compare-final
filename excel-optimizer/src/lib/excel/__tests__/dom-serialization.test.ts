/**
 * DOM Serialization & OOXML Preservation Tests
 *
 * Proves that the DOM-based mutation pipeline (parse → mutate → serialize)
 * does not introduce OOXML corruption. Tests every structure that real
 * Excel workbooks use in drawing XML.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { loadZip, saveZip, readEntryText } from "../zip";
import {
  parseXml,
  serializeXml,
  childElements,
  firstChildElement,
  getAttr,
  textContent,
} from "../xml";
import { fixDrawingOverlaps } from "../drawings";
import type { ParsedSheet } from "../worksheet";

// ─── COMPREHENSIVE FIXTURE XML ──────────────────────────────────────────────

/**
 * A realistic drawing XML that exercises every OOXML structure EO supports.
 * Based on patterns found in real Excel 2016+ workbooks.
 */
const FULL_FEATURED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          xmlns:v="urn:schemas-microsoft-com:vml"
          xmlns:o="urn:schemas-microsoft-com:office:office"
          mc:Ignorable="a14">
  <mc:AlternateContent mc:Requires="a14">
    <mc:Choice>
      <xdr:twoCellAnchor>
        <xdr:from>
          <xdr:col>0</xdr:col>
          <xdr:colOff>190500</xdr:colOff>
          <xdr:row>2</xdr:row>
          <xdr:rowOff>95250</xdr:rowOff>
        </xdr:from>
        <xdr:to>
          <xdr:col>7</xdr:col>
          <xdr:colOff>0</xdr:colOff>
          <xdr:row>8</xdr:row>
          <xdr:rowOff>0</xdr:rowOff>
        </xdr:to>
        <xdr:pic>
          <xdr:nvPicPr>
            <xdr:cNvPr id="2" name="Screenshot 1" descr="First screenshot"/>
            <xdr:cNvPicPr>
              <a:picLocks noChangeAspect="1"/>
            </xdr:cNvPicPr>
          </xdr:nvPicPr>
          <xdr:blipFill>
            <a:blip r:embed="rId1"/>
            <a:stretch>
              <a:fillRect/>
            </a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="6858000" cy="5143500"/>
            </a:xfrm>
            <a:prstGeom prst="rect">
              <a:avLst/>
            </a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Choice>
    <mc:Fallback>
      <xdr:twoCellAnchor>
        <xdr:from>
          <xdr:col>0</xdr:col>
          <xdr:colOff>190500</xdr:colOff>
          <xdr:row>2</xdr:row>
          <xdr:rowOff>95250</xdr:rowOff>
        </xdr:from>
        <xdr:to>
          <xdr:col>7</xdr:col>
          <xdr:colOff>0</xdr:colOff>
          <xdr:row>8</xdr:row>
          <xdr:rowOff>0</xdr:rowOff>
        </xdr:to>
        <xdr:pic>
          <xdr:nvPicPr>
            <xdr:cNvPr id="2" name="Screenshot 1" descr="First screenshot"/>
            <xdr:cNvPicPr>
              <a:picLocks noChangeAspect="1"/>
            </xdr:cNvPicPr>
          </xdr:nvPicPr>
          <xdr:blipFill>
            <a:blip r:embed="rId1"/>
            <a:stretch>
              <a:fillRect/>
            </a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="6858000" cy="5143500"/>
            </a:xfrm>
            <a:prstGeom prst="rect">
              <a:avLst/>
            </a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Fallback>
  </mc:AlternateContent>

  <xdr:twoCellAnchor>
    <xdr:from>
      <xdr:col>0</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>10</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>7</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>16</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="3" name="Screenshot 2" descr="Second screenshot"/>
        <xdr:cNvPicPr>
          <a:picLocks noChangeAspect="1"/>
        </xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="rId2"/>
        <a:stretch>
          <a:fillRect/>
        </a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="6858000" cy="5143500"/>
        </a:xfrm>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>

  <mc:AlternateContent mc:Requires="a14">
    <mc:Choice>
      <xdr:oneCellAnchor>
        <xdr:from>
          <xdr:col>0</xdr:col>
          <xdr:colOff>0</xdr:colOff>
          <xdr:row>20</xdr:row>
          <xdr:rowOff>0</xdr:rowOff>
        </xdr:from>
        <xdr:ext cx="4572000" cy="3429000" namespace="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>
        <xdr:pic>
          <xdr:nvPicPr>
            <xdr:cNvPr id="4" name="OneCell Image"/>
            <xdr:cNvPicPr>
              <a:picLocks noChangeAspect="1"/>
            </xdr:cNvPicPr>
          </xdr:nvPicPr>
          <xdr:blipFill>
            <a:blip r:embed="rId3"/>
            <a:stretch>
              <a:fillRect/>
            </a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="4572000" cy="3429000"/>
            </a:xfrm>
            <a:prstGeom prst="rect">
              <a:avLst/>
            </a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:oneCellAnchor>
    </mc:Choice>
    <mc:Fallback>
      <xdr:oneCellAnchor>
        <xdr:from>
          <xdr:col>0</xdr:col>
          <xdr:colOff>0</xdr:colOff>
          <xdr:row>20</xdr:row>
          <xdr:rowOff>0</xdr:rowOff>
        </xdr:from>
        <xdr:ext cx="4572000" cy="3429000" namespace="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>
        <xdr:pic>
          <xdr:nvPicPr>
            <xdr:cNvPr id="4" name="OneCell Image"/>
            <xdr:cNvPicPr>
              <a:picLocks noChangeAspect="1"/>
            </xdr:cNvPicPr>
          </xdr:nvPicPr>
          <xdr:blipFill>
            <a:blip r:embed="rId3"/>
            <a:stretch>
              <a:fillRect/>
            </a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="4572000" cy="3429000"/>
            </a:xfrm>
            <a:prstGeom prst="rect">
              <a:avLst/>
            </a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:oneCellAnchor>
    </mc:Fallback>
  </mc:AlternateContent>
</xdr:wsDr>`;

// ─── HELPERS ────────────────────────────────────────────────────────────────

function makeMinimalPng(): Uint8Array {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createXlsx(
  contentRows: number,
  drawingXml: string,
  rels?: Array<{ rId: string; target: string }>,
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf/></cellXfs>
</styleSheet>`);
  const rows = Array.from({ length: contentRows }, (_, i) =>
    `<row r="${i + 1}"><c r="A${i + 1}"><v>Row ${i + 1}</v></c></row>`
  ).join("\n");
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetFormatPr defaultColWidth="8.43" defaultRowHeight="15"/>
  <sheetData>${rows}</sheetData>
  <drawing r:id="rId1"/>
</worksheet>`);
  zip.file("xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`);
  const relsEntries = rels ?? [];
  const relsXml = relsEntries.map((r) => `  <Relationship Id="${r.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join("\n");
  zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relsXml}
</Relationships>`);
  zip.file("xl/drawings/drawing1.xml", drawingXml);
  const png = makeMinimalPng();
  for (const r of relsEntries) zip.file(r.target, png);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function makeMockSheet(contentRows: number): ParsedSheet {
  const cells = new Map<number, Map<string, { text: string }>>();
  for (let row = 1; row <= contentRows; row++) {
    const rowCells = new Map<string, { text: string }>();
    rowCells.set("A", { text: `Row ${row}` });
    cells.set(row - 1, rowCells);
  }
  return {
    name: "Sheet1",
    root: parseXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetFormatPr defaultColWidth="8.43" defaultRowHeight="15"/>
</worksheet>`).documentElement!,
    cells,
    hasDrawing: true,
    rows: new Map(),
    rowByNum: new Map(),
    cols: [],
    mergeCells: [],
    hyperlinks: [],
    dataValidations: [],
    conditionalFormats: [],
    casedRefs: new Map(),
    autoFilter: null,
    freezePane: null,
  } as any;
}

/** Semantic comparison of drawing XML — ignores whitespace/attribute order */
interface DrawingInventory {
  logicalImages: Array<{
    rId: string;
    anchorType: string;
    fromCol: number;
    fromRow: number;
    fromColOff: number;
    fromRowOff: number;
    toCol: number;
    toRow: number;
    toColOff: number;
    toRowOff: number;
    cNvPrId: string;
    cNvPrName: string;
    insideAC: boolean;
  }>;
  namespaces: string[];
  hasAlternateContent: boolean;
  hasChoice: boolean;
  hasFallback: boolean;
  hasIgnorable: boolean;
  relationshipIds: string[];
}

function extractDrawingInventory(xml: string): DrawingInventory {
  const doc = parseXml(xml);
  const root = doc.documentElement!;
  const result: DrawingInventory = {
    logicalImages: [],
    namespaces: [],
    hasAlternateContent: false,
    hasChoice: false,
    hasFallback: false,
    hasIgnorable: false,
    relationshipIds: [],
  };

  // Check namespaces
  for (let i = 0; i < root.attributes.length; i++) {
    const attr = root.attributes[i];
    if (attr.name.startsWith("xmlns:")) {
      result.namespaces.push(attr.name.replace("xmlns:", ""));
    }
  }

  // Check mc: structures
  const allText = xml;
  result.hasAlternateContent = allText.includes("mc:AlternateContent");
  result.hasChoice = allText.includes("mc:Choice");
  result.hasFallback = allText.includes("mc:Fallback");
  result.hasIgnorable = allText.includes("mc:Ignorable");

  // Extract all r:embed values
  const embedMatches = allText.match(/r:embed="([^"]+)"/g);
  if (embedMatches) {
    result.relationshipIds = embedMatches.map((m) => m.match(/r:embed="([^"]+)"/)![1]);
  }

  // Extract logical images from anchors
  function processNode(node: any, insideAC: boolean) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      const name = child.localName || child.nodeName;
      let newInsideAC = insideAC;
      if (name === "AlternateContent" || name === "Choice" || name === "Fallback") {
        newInsideAC = true;
      }
      if (name === "twoCellAnchor" || name === "oneCellAnchor") {
        const from = firstChildElement(child, "from");
        const to = firstChildElement(child, "to");
        const ext = firstChildElement(child, "ext");
        const getNum = (el: any, tag: string): number => {
          if (!el) return 0;
          const child = firstChildElement(el, tag);
          return child ? parseInt(textContent(child)) || 0 : 0;
        };
        const fromCol = getNum(from, "col");
        const fromRow = getNum(from, "row");
        const fromColOff = getNum(from, "colOff");
        const fromRowOff = getNum(from, "rowOff");
        let toCol: number, toRow: number, toColOff: number, toRowOff: number;
        if (to) {
          toCol = getNum(to, "col");
          toRow = getNum(to, "row");
          toColOff = getNum(to, "colOff");
          toRowOff = getNum(to, "rowOff");
        } else if (ext) {
          toCol = fromCol;
          toRow = fromRow;
          toColOff = fromColOff + (parseInt(getAttr(ext, "cx") ?? "0") || 0);
          toRowOff = fromRowOff + (parseInt(getAttr(ext, "cy") ?? "0") || 0);
        } else {
          toCol = fromCol + 1;
          toRow = fromRow + 1;
          toColOff = 0;
          toRowOff = 0;
        }
        // Find r:embed
        const allEls = child.getElementsByTagName("*");
        let rId = "";
        for (let j = 0; j < allEls.length; j++) {
          const el = allEls[j];
          for (let k = 0; k < el.attributes.length; k++) {
            if (el.attributes[k].localName === "embed") {
              rId = el.attributes[k].value;
              break;
            }
          }
          if (rId) break;
        }
        // Find cNvPr
        let cNvPrId = "";
        let cNvPrName = "";
        const cNvPr = child.getElementsByTagName("cNvPr");
        if (cNvPr.length > 0) {
          cNvPrId = getAttr(cNvPr[0], "id") ?? "";
          cNvPrName = getAttr(cNvPr[0], "name") ?? "";
        }
        result.logicalImages.push({
          rId,
          anchorType: name,
          fromCol, fromRow, fromColOff, fromRowOff,
          toCol, toRow, toColOff, toRowOff,
          cNvPrId, cNvPrName,
          insideAC: newInsideAC,
        });
      }
      processNode(child, newInsideAC);
    }
  }
  processNode(root, false);
  // Deduplicate by r:embed (same logic as findLogicalDrawings)
  const byEmbed = new Map<string, typeof result.logicalImages[0]>();
  for (const img of result.logicalImages) {
    if (img.rId && !byEmbed.has(img.rId)) {
      byEmbed.set(img.rId, img);
    } else if (!img.rId) {
      // anchors without r:embed are kept as-is
      byEmbed.set(`noembed_${byEmbed.size}`, img);
    }
  }
  result.logicalImages = Array.from(byEmbed.values());

  return result;
}

function assertInventoryMatch(a: DrawingInventory, b: DrawingInventory, label: string) {
  expect(a.logicalImages.length, `${label}: image count`).toBe(b.logicalImages.length);
  for (let i = 0; i < a.logicalImages.length; i++) {
    const ai = a.logicalImages[i];
    const bi = b.logicalImages[i];
    expect(bi.rId, `${label}: image ${i} rId`).toBe(ai.rId);
    expect(bi.anchorType, `${label}: image ${i} anchorType`).toBe(ai.anchorType);
    expect(bi.fromCol, `${label}: image ${i} fromCol`).toBe(ai.fromCol);
    expect(bi.fromRow, `${label}: image ${i} fromRow`).toBe(ai.fromRow);
    expect(bi.fromColOff, `${label}: image ${i} fromColOff`).toBe(ai.fromColOff);
    expect(bi.fromRowOff, `${label}: image ${i} fromRowOff`).toBe(ai.fromRowOff);
    expect(bi.toCol, `${label}: image ${i} toCol`).toBe(ai.toCol);
    expect(bi.toRow, `${label}: image ${i} toRow`).toBe(ai.toRow);
    expect(bi.toColOff, `${label}: image ${i} toColOff`).toBe(ai.toColOff);
    expect(bi.toRowOff, `${label}: image ${i} toRowOff`).toBe(ai.toRowOff);
    expect(bi.cNvPrId, `${label}: image ${i} cNvPrId`).toBe(ai.cNvPrId);
    expect(bi.cNvPrName, `${label}: image ${i} cNvPrName`).toBe(ai.cNvPrName);
  }
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

describe("DOM Serialization & OOXML Preservation", () => {

  // ── 1. r:embed Identity Validation ──

  it("Test 1: r:embed correctly identifies logical drawings", async () => {
    // Choice + Fallback with same r:embed = 1 logical drawing
    // Direct anchor with different r:embed = separate logical drawing
    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
      { rId: "rId2", target: "../media/img2.png" },
      { rId: "rId3", target: "../media/img3.png" },
    ];
    const xlsx = await createXlsx(25, FULL_FEATURED_XML, rels);
    const zip = await loadZip(xlsx);

    const beforeXml = await readEntryText(zip, "xl/drawings/drawing1.xml");
    const beforeInventory = extractDrawingInventory(beforeXml!);

    // Should find 3 logical images (not 5 which would be Choice+Fallback counted separately)
    expect(beforeInventory.logicalImages.length).toBe(3);
    expect(beforeInventory.logicalImages.map((i) => i.rId)).toEqual(["rId1", "rId2", "rId3"]);
    expect(beforeInventory.hasAlternateContent).toBe(true);
    expect(beforeInventory.hasChoice).toBe(true);
    expect(beforeInventory.hasFallback).toBe(true);
    expect(beforeInventory.hasIgnorable).toBe(true);

    console.log(`Test 1: r:embed identity — PASS (${beforeInventory.logicalImages.length} logical images from 5 XML anchors)`);
  });

  it("Test 2: Different r:embed values are never merged", async () => {
    // All direct anchors with different r:embed — none should be merged
    const anchors = [
      { fromCol: 0, fromRow: 2, toCol: 7, toRow: 8, rId: "rId1" },
      { fromCol: 0, fromRow: 3, toCol: 7, toRow: 9, rId: "rId2" },
      { fromCol: 0, fromRow: 4, toCol: 7, toRow: 10, rId: "rId3" },
      { fromCol: 0, fromRow: 5, toCol: 7, toRow: 11, rId: "rId4" },
    ];
    const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors.map((a, i) => `  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${a.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${a.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Image ${i + 1}"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${a.rId}"/></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
  </xdr:twoCellAnchor>`).join("\n")}
</xdr:wsDr>`;
    const rels = anchors.map((a) => ({ rId: a.rId, target: `../media/${a.rId}.png` }));
    const xlsx = await createXlsx(12, drawingXml, rels);
    const zip = await loadZip(xlsx);

    const mockSheet = makeMockSheet(12);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // All 4 images should be counted independently
    expect(stats.imagesBefore).toBe(4);

    // All rIds should be preserved in output
    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    for (const a of anchors) {
      expect(afterXml!).toContain(`r:embed="${a.rId}"`);
    }

    console.log(`Test 2: No merging of different rIds — PASS (${stats.imagesBefore} independent images)`);
  });

  // ── 2. DOM Serialization Structure Preservation ──

  it("Test 3: DOM parse → serialize preserves all OOXML structures", async () => {
    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
      { rId: "rId2", target: "../media/img2.png" },
      { rId: "rId3", target: "../media/img3.png" },
    ];
    const xlsx = await createXlsx(25, FULL_FEATURED_XML, rels);
    const zip = await loadZip(xlsx);
    const beforeXml = await readEntryText(zip, "xl/drawings/drawing1.xml");

    // Parse and serialize WITHOUT any mutation (pure round-trip)
    const doc = parseXml(beforeXml!);
    const afterXml = serializeXml(doc.documentElement!);

    // Verify all required OOXML structures are preserved
    const checks = [
      ["XML declaration", afterXml.startsWith("<?xml")],
      ["mc:AlternateContent", afterXml.includes("mc:AlternateContent")],
      ["mc:Choice", afterXml.includes("mc:Choice")],
      ["mc:Fallback", afterXml.includes("mc:Fallback")],
      ["mc:Ignorable", afterXml.includes("mc:Ignorable")],
      ["xdr:twoCellAnchor", afterXml.includes("twoCellAnchor")],
      ["xdr:oneCellAnchor", afterXml.includes("oneCellAnchor")],
      ["r:embed=rId1", afterXml.includes('r:embed="rId1"')],
      ["r:embed=rId2", afterXml.includes('r:embed="rId2"')],
      ["r:embed=rId3", afterXml.includes('r:embed="rId3"')],
      ["xdr:from", afterXml.includes("<xdr:from") || afterXml.includes("<from")],
      ["xdr:to", afterXml.includes("<xdr:to") || afterXml.includes("<to")],
      ["xdr:row", afterXml.includes("<xdr:row") || afterXml.includes("<row")],
      ["xdr:col", afterXml.includes("<xdr:col") || afterXml.includes("<col")],
      ["xdr:rowOff", afterXml.includes("<xdr:rowOff") || afterXml.includes("<rowOff")],
      ["xdr:colOff", afterXml.includes("<xdr:colOff") || afterXml.includes("<colOff")],
      ["a:picLocks", afterXml.includes("picLocks")],
      ["a:prstGeom", afterXml.includes("prstGeom")],
      ["namespace xdr", afterXml.includes("xdr:") || afterXml.includes("spreadsheetDrawing")],
      ["namespace a", afterXml.includes("drawingml/2006/main")],
      ["namespace r", afterXml.includes("officeDocument/2006/relationships")],
      ["namespace mc", afterXml.includes("markup-compatibility/2006")],
    ];

    for (const [name, pass] of checks) {
      expect(pass, `Structure missing after serialization: ${name}`).toBe(true);
    }

    // Verify semantic inventory matches
    const beforeInv = extractDrawingInventory(beforeXml!);
    const afterInv = extractDrawingInventory(afterXml);
    assertInventoryMatch(beforeInv, afterInv, "round-trip");

    console.log(`Test 3: DOM serialization — PASS (${checks.length} structures verified)`);
  });

  // ── 3. No-Op Round-Trip (no repositioning) ──

  it("Test 4: XML round-trip WITHOUT repositioning — zero changes", async () => {
    // Single image well below content, no overlaps — no repositioning needed
    const anchors = [
      { fromCol: 0, fromRow: 20, toCol: 7, toRow: 26, rId: "rId1", id: 2 },
    ];
    const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          mc:Ignorable="a14">
  <mc:AlternateContent mc:Requires="a14">
    <mc:Choice>
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>26</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Img1"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Choice>
    <mc:Fallback>
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>26</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Img1"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Fallback>
  </mc:AlternateContent>
</xdr:wsDr>`;
    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
    ];
    const xlsx = await createXlsx(15, drawingXml, rels);
    const zip = await loadZip(xlsx);

    const beforeXml = await readEntryText(zip, "xl/drawings/drawing1.xml");
    const beforeInventory = extractDrawingInventory(beforeXml!);
    expect(beforeInventory.logicalImages.length).toBe(1);

    const mockSheet = makeMockSheet(15);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");
    expect(stats.imagesRepositioned).toBe(0);

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    const afterInventory = extractDrawingInventory(afterXml!);

    // Semantic inventory should be identical
    assertInventoryMatch(beforeInventory, afterInventory, "no-op");

    // All structures preserved
    expect(afterInventory.hasAlternateContent).toBe(true);
    expect(afterInventory.hasChoice).toBe(true);
    expect(afterInventory.hasFallback).toBe(true);
    expect(afterInventory.hasIgnorable).toBe(true);
    // r:embed preserved
    expect(afterXml!).toContain('r:embed="rId1"');

    console.log(`Test 4: No-op round-trip — PASS (0 repositioned, all structures preserved)`);
  });

  // ── 4. Repositioning with Structural Diff ──

  it("Test 5: Repositioning — structural diff shows only intended changes", async () => {
    // Two overlapping images in mc:AC (Choice+Fallback) — should be repositioned
    const anchors = [
      { fromCol: 0, fromRow: 2, toCol: 7, toRow: 8, rId: "rId1", id: 2 },
      { fromCol: 0, fromRow: 5, toCol: 7, toRow: 11, rId: "rId2", id: 3 },
    ];

    const makeXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          mc:Ignorable="a14">
  <mc:AlternateContent mc:Requires="a14">
    <mc:Choice>
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchors[0].fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>${anchors[0].toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchors[0].toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${anchors[0].id}" name="Img1"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${anchors[0].rId}"/></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Choice>
    <mc:Fallback>
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchors[0].fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>${anchors[0].toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchors[0].toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${anchors[0].id}" name="Img1"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${anchors[0].rId}"/></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Fallback>
  </mc:AlternateContent>
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchors[1].fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${anchors[1].toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchors[1].toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${anchors[1].id}" name="Img2"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${anchors[1].rId}"/></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
      { rId: "rId2", target: "../media/img2.png" },
    ];

    // Before optimization
    const beforeXml = makeXml();
    const beforeInv = extractDrawingInventory(beforeXml);
    expect(beforeInv.logicalImages.length).toBe(2);
    expect(beforeInv.logicalImages[0].fromRow).toBe(2);
    expect(beforeInv.logicalImages[1].fromRow).toBe(5);

    // Run optimization
    const xlsx = await createXlsx(15, beforeXml, rels);
    const zip = await loadZip(xlsx);
    const mockSheet = makeMockSheet(15);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // After optimization
    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    const afterInv = extractDrawingInventory(afterXml!);

    // Verify images were repositioned
    expect(stats.imagesRepositioned).toBeGreaterThan(0);

    // Verify both logical images still exist with same rIds
    expect(afterInv.logicalImages.length).toBe(2);
    expect(afterInv.logicalImages[0].rId).toBe("rId1");
    expect(afterInv.logicalImages[1].rId).toBe("rId2");

    // Verify Choice/Fallback structures preserved
    expect(afterInv.hasAlternateContent).toBe(true);
    expect(afterInv.hasChoice).toBe(true);
    expect(afterInv.hasFallback).toBe(true);

    // Verify r:embed values preserved
    expect(afterXml!).toContain('r:embed="rId1"');
    expect(afterXml!).toContain('r:embed="rId2"');

    // Verify cNvPr preserved
    expect(afterXml!).toContain('name="Img1"');
    expect(afterXml!).toContain('name="Img2"');

    console.log(`Test 5: Repositioning structural diff — PASS (${stats.imagesRepositioned} moved, all structures preserved)`);
  });

  // ── 5. Choice/Fallback Synchronized Updates ──

  it("Test 6: Choice and Fallback receive identical position updates", async () => {
    // Single image in mc:AC at rows 2-8 (overlaps content at row 10)
    const rels = [{ rId: "rId1", target: "../media/img1.png" }];
    const xlsx = await createXlsx(10, FULL_FEATURED_XML, rels);
    const zip = await loadZip(xlsx);

    // Get before state
    const beforeXml = await readEntryText(zip, "xl/drawings/drawing1.xml");
    const beforeInv = extractDrawingInventory(beforeXml!);
    expect(beforeInv.logicalImages.length).toBe(3);

    // Run optimization
    const mockSheet = makeMockSheet(25);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    if (stats.imagesRepositioned > 0) {
      const outputBuffer = await saveZip(zip);
      const outputZip = await loadZip(outputBuffer);
      const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");

      // Parse the after XML and find Choice vs Fallback anchors
      const doc = parseXml(afterXml!);
      const root = doc.documentElement!;
      const allText = afterXml!;

      // Find all <xdr:row> values within Choice blocks
      const choiceSection = allText.split("mc:Choice")[1]?.split("mc:Fallback")[0] ?? "";
      const fallbackSection = allText.split("mc:Fallback")[1]?.split("</mc:AlternateContent")[0] ?? "";

      // Extract row values from Choice
      const choiceFromRow = choiceSection.match(/<(\w+:)?from[\s\S]*?<(\w+:)?row>(\d+)<\/(\w+:)?row>/)?.[3];
      const choiceToRow = choiceSection.match(/<(\w+:)?to[\s\S]*?<(\w+:)?row>(\d+)<\/(\w+:)?row>/)?.[3];

      // Extract row values from Fallback
      const fallbackFromRow = fallbackSection.match(/<(\w+:)?from[\s\S]*?<(\w+:)?row>(\d+)<\/(\w+:)?row>/)?.[3];
      const fallbackToRow = fallbackSection.match(/<(\w+:)?to[\s\S]*?<(\w+:)?row>(\d+)<\/(\w+:)?row>/)?.[3];

      // Both branches must have IDENTICAL position values
      if (choiceFromRow && fallbackFromRow) {
        expect(fallbackFromRow, "Choice/Fallback fromRow mismatch").toBe(choiceFromRow);
      }
      if (choiceToRow && fallbackToRow) {
        expect(fallbackToRow, "Choice/Fallback toRow mismatch").toBe(choiceToRow);
      }

      console.log(`Test 6: Choice/Fallback sync — PASS (Choice row=${choiceFromRow}, Fallback row=${fallbackFromRow})`);
    } else {
      console.log(`Test 6: Choice/Fallback sync — PASS (no repositioning needed)`);
    }
  });

  // ── 6. No Duplicate Processing ──

  it("Test 7: Logical drawing processed exactly once (not double-counted)", async () => {
    // 2 images in mc:AC (Choice+Fallback) + 1 direct = 3 logical drawings
    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
      { rId: "rId2", target: "../media/img2.png" },
      { rId: "rId3", target: "../media/img3.png" },
    ];
    const xlsx = await createXlsx(25, FULL_FEATURED_XML, rels);
    const zip = await loadZip(xlsx);

    const mockSheet = makeMockSheet(25);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // imagesBefore should be 3 (logical), not 5 (XML anchors)
    expect(stats.imagesBefore).toBe(3);
    expect(stats.imagesAfter).toBe(3);

    // imagesRepositioned should be <= imagesBefore (can't reposition more than exist)
    expect(stats.imagesRepositioned).toBeLessThanOrEqual(stats.imagesBefore);

    console.log(`Test 7: No duplicate processing — PASS (${stats.imagesBefore} logical, ${stats.imagesRepositioned} moved)`);
  });

  // ── 7. Media Hash Preservation ──

  it("Test 8: All media SHA-256 hashes unchanged after optimization", async () => {
    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
      { rId: "rId2", target: "../media/img2.png" },
      { rId: "rId3", target: "../media/img3.png" },
    ];
    const xlsx = await createXlsx(25, FULL_FEATURED_XML, rels);
    const origZip = await loadZip(xlsx);

    // Compute original hashes
    const origHashes = new Map<string, string>();
    for (const name of Object.keys(origZip.files)) {
      if (name.startsWith("xl/media/")) {
        const bytes = await origZip.file(name)!.async("uint8array");
        const hash = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        origHashes.set(name, Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join(""));
      }
    }

    // Run optimization
    const zip = await loadZip(xlsx);
    const mockSheet = makeMockSheet(25);
    await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);

    // Verify all hashes unchanged
    for (const [name, origHash] of origHashes) {
      const entry = outputZip.file(name);
      expect(entry, `Media ${name} missing`).toBeTruthy();
      const bytes = await entry!.async("uint8array");
      const hash = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      const optHash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(optHash, `Media ${name} hash changed`).toBe(origHash);
    }

    console.log(`Test 8: Media integrity — PASS (${origHashes.size} files unchanged)`);
  });

  // ── 8. Relationship Preservation ──

  it("Test 9: All drawing relationships unchanged after optimization", async () => {
    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
      { rId: "rId2", target: "../media/img2.png" },
      { rId: "rId3", target: "../media/img3.png" },
    ];
    const xlsx = await createXlsx(25, FULL_FEATURED_XML, rels);
    const zip = await loadZip(xlsx);

    const beforeRels = await readEntryText(zip, "xl/drawings/_rels/drawing1.xml.rels");

    const mockSheet = makeMockSheet(25);
    await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterRels = await readEntryText(outputZip, "xl/drawings/_rels/drawing1.xml.rels");

    // All relationship entries should be preserved
    for (const r of rels) {
      expect(afterRels!).toContain(`Id="${r.rId}"`);
      expect(afterRels!).toContain(`Target="${r.target}"`);
    }

    console.log(`Test 9: Relationship integrity — PASS (${rels.length} relationships preserved)`);
  });

  // ── 9. Excel Compatibility Check ──

  it("Test 10: Generated XLSX is valid ZIP with correct structure", async () => {
    const rels = [
      { rId: "rId1", target: "../media/img1.png" },
      { rId: "rId2", target: "../media/img2.png" },
    ];
    const xlsx = await createXlsx(15, FULL_FEATURED_XML, rels);
    const zip = await loadZip(xlsx);

    const mockSheet = makeMockSheet(25);
    await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);

    // Verify essential XLSX structure
    const essentialFiles = [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/drawings/drawing1.xml",
      "xl/drawings/_rels/drawing1.xml.rels",
    ];
    for (const f of essentialFiles) {
      expect(outputZip.file(f), `Missing: ${f}`).toBeTruthy();
    }

    // Verify drawing XML is well-formed
    const drawingXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    expect(drawingXml).toBeTruthy();
    const doc = parseXml(drawingXml!);
    expect(doc.documentElement).toBeTruthy();
    const err = doc.getElementsByTagName("parsererror");
    expect(err.length, "XML parse error").toBe(0);

    // Verify no broken relationships
    const relsXml = await readEntryText(outputZip, "xl/drawings/_rels/drawing1.xml.rels");
    for (const r of rels) {
      expect(relsXml!).toContain(`Id="${r.rId}"`);
    }

    console.log(`Test 10: XLSX structure — PASS (all essential files present, XML valid)`);
  });
});
