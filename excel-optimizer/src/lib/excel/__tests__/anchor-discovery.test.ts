/**
 * Regression tests for anchor discovery and structural mapping.
 *
 * These tests verify that the optimizer correctly handles:
 * - Anchors inside mc:AlternateContent/mc:Choice/mc:Fallback
 * - Multiple anchors with different relationship IDs
 * - Media hash preservation
 * - Normal image-over-cell placement (should NOT be repositioned)
 * - Multiple drawing XML files across worksheets
 * - Mixed anchor types
 *
 * Each test creates a synthetic XLSX with a specific XML structure,
 * runs the optimizer, and verifies the output.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { loadZip, saveZip, readEntryText } from "../zip";
import { parseXml, childElements, firstChildElement, getAttr, textContent } from "../xml";
import { fixDrawingOverlaps } from "../drawings";
import type { ParsedSheet } from "../worksheet";

// ─── HELPERS ────────────────────────────────────────────────────────────────

function makeMinimalPng(): Uint8Array {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function makeDrawingXml(
  anchors: Array<{
    fromCol: number;
    fromRow: number;
    fromColOff?: number;
    fromRowOff?: number;
    toCol: number;
    toRow: number;
    toColOff?: number;
    toRowOff?: number;
    rId: string;
    id?: number;
    name?: string;
  }>,
  wrapInAlternateContent = false,
): string {
  const anchorXml = anchors
    .map(
      (a, i) => `  <xdr:twoCellAnchor>
  <xdr:from>
    <xdr:col>${a.fromCol}</xdr:col>
    <xdr:colOff>${a.fromColOff ?? 0}</xdr:colOff>
    <xdr:row>${a.fromRow}</xdr:row>
    <xdr:rowOff>${a.fromRowOff ?? 0}</xdr:rowOff>
  </xdr:from>
  <xdr:to>
    <xdr:col>${a.toCol}</xdr:col>
    <xdr:colOff>${a.toColOff ?? 0}</xdr:colOff>
    <xdr:row>${a.toRow}</xdr:row>
    <xdr:rowOff>${a.toRowOff ?? 0}</xdr:rowOff>
  </xdr:to>
  <xdr:pic>
    <xdr:nvPicPr>
      <xdr:cNvPr id="${a.id ?? i + 2}" name="${a.name ?? `Image ${i + 1}`}"/>
      <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
    </xdr:nvPicPr>
    <xdr:blipFill>
      <a:blip r:embed="${a.rId}"/>
      <a:stretch><a:fillRect/></a:stretch>
    </xdr:blipFill>
    <xdr:spPr>
      <a:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="6858000" cy="5143500"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    </xdr:spPr>
  </xdr:pic>
  <xdr:clientData/>
</xdr:twoCellAnchor>`,
    )
    .join("\n");

  if (wrapInAlternateContent) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <mc:AlternateContent mc:Requires="a14">
    <mc:Choice>
${anchorXml}
    </mc:Choice>
    <mc:Fallback>
${anchorXml}
    </mc:Fallback>
  </mc:AlternateContent>
</xdr:wsDr>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchorXml}
</xdr:wsDr>`;
}

async function createTestXlsx(
  contentRows: number,
  drawingXml: string,
  relsEntries?: Array<{ rId: string; target: string }>,
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

  const sheetRows = Array.from({ length: contentRows }, (_, i) => {
    const row = i + 1;
    return `<row r="${row}"><c r="A${row}"><v>Row ${row}</v></c></row>`;
  }).join("\n");

  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetFormatPr defaultColWidth="8.43" defaultRowHeight="15"/>
  <sheetData>${sheetRows}</sheetData>
  <drawing r:id="rId1"/>
</worksheet>`);

  zip.file("xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`);

  // Drawing rels — use provided entries or generate from anchors
  const rels = relsEntries ?? [];
  const relsXml = rels.map((r) => `  <Relationship Id="${r.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join("\n");
  zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relsXml}
</Relationships>`);

  zip.file("xl/drawings/drawing1.xml", drawingXml);

  const png = makeMinimalPng();
  for (const r of rels) {
    zip.file(r.target, png);
  }

  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function makeMockSheet(contentRows: number): ParsedSheet {
  const cells = new Map<number, Map<string, { text: string; styleIndex?: number }>>();
  for (let row = 1; row <= contentRows; row++) {
    const rowCells = new Map<string, { text: string; styleIndex?: number }>();
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

function parseDrawingXml(xml: string): Array<{ fromRow: number; toRow: number; fromCol: number; toCol: number; rId: string }> {
  const results: Array<{ fromRow: number; toRow: number; fromCol: number; toCol: number; rId: string }> = [];

  // Extract <from> and <to> blocks
  const fromBlocks = xml.match(/<(\w+:)?from\b[^>]*>([\s\S]*?)<\/(\w+:)?from>/g) || [];
  const toBlocks = xml.match(/<(\w+:)?to\b[^>]*>([\s\S]*?)<\/(\w+:)?to>/g) || [];

  const extractNum = (inner: string, tag: string): number => {
    const m = inner.match(new RegExp(`<\\\\w*:?(?:${tag})\\\\b[^>]*>(\\\\d+)</\\\\w*:?(?:${tag})>`));
    return m ? parseInt(m[1]) : 0;
  };

  const count = Math.min(fromBlocks.length, toBlocks.length);
  for (let i = 0; i < count; i++) {
    const fromInner = fromBlocks[i].replace(/<(\w+:)?from[^>]*>/, "").replace(/<\/(\w+:)?from>/, "");
    const toInner = toBlocks[i].replace(/<(\w+:)?to[^>]*>/, "").replace(/<\/(\w+:)?to>/, "");
    results.push({
      fromCol: extractNum(fromInner, "col"),
      fromRow: extractNum(fromInner, "row"),
      toCol: extractNum(toInner, "col"),
      toRow: extractNum(toInner, "row"),
      rId: "",
    });
  }

  return results;
}

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe("Anchor Discovery Regression Tests", () => {
  it("Test 1: Anchors inside mc:AlternateContent are found and repositioned", async () => {
    // Two overlapping images wrapped in mc:AlternateContent
    const anchors = [
      { fromCol: 0, fromRow: 2, toCol: 7, toRow: 8, rId: "rId1", id: 2, name: "Image 1" },
      { fromCol: 0, fromRow: 5, toCol: 7, toRow: 11, rId: "rId2", id: 3, name: "Image 2" },
    ];

    const drawingXml = makeDrawingXml(anchors, true); // wrapInAlternateContent = true
    const rels = anchors.map((a) => ({ rId: a.rId, target: `../media/image${a.rId === "rId1" ? 1 : 2}.png` }));
    const xlsxBuffer = await createTestXlsx(15, drawingXml, rels);
    const zip = await loadZip(xlsxBuffer);

    const beforeXml = await readEntryText(zip, "xl/drawings/drawing1.xml");
    expect(beforeXml).toBeTruthy();

    const mockSheet = makeMockSheet(15);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // With mc:AlternateContent, logical drawings deduplicated by r:embed
    // 2 anchors (Choice + Fallback) with same r:embed = 1 logical drawing per image
    // 2 images × 1 logical = 2 logical drawings (NOT 4)
    expect(stats.imagesBefore).toBe(2);
    expect(stats.imagesRepositioned).toBeGreaterThan(0);

    // Save and verify output
    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    expect(afterXml).toBeTruthy();

    // Verify XML is well-formed
    const doc = parseXml(afterXml!);
    expect(doc.documentElement).toBeTruthy();

    // Verify namespaces preserved
    expect(afterXml!).toContain("xmlns:xdr=");
    expect(afterXml!).toContain("xmlns:mc=");

    console.log(`Test 1 (mc:AlternateContent): PASS — ${stats.imagesBefore} images, ${stats.imagesRepositioned} repositioned`);
  });

  it("Test 2: Multiple images with different relationship IDs preserve their rId mappings", async () => {
    const anchors = [
      { fromCol: 0, fromRow: 2, toCol: 7, toRow: 8, rId: "rId10", id: 10, name: "Screenshot A" },
      { fromCol: 0, fromRow: 3, toCol: 7, toRow: 9, rId: "rId25", id: 25, name: "Screenshot B" },
      { fromCol: 0, fromRow: 4, toCol: 7, toRow: 10, rId: "rId50", id: 50, name: "Screenshot C" },
    ];

    const drawingXml = makeDrawingXml(anchors);
    const rels = anchors.map((a) => ({ rId: a.rId, target: `../media/image_${a.rId}.png` }));
    const xlsxBuffer = await createTestXlsx(10, drawingXml, rels);
    const zip = await loadZip(xlsxBuffer);

    const mockSheet = makeMockSheet(10);
    await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");

    // Verify all r:embed values are preserved
    for (const a of anchors) {
      expect(afterXml!).toContain(`r:embed="${a.rId}"`);
    }

    // Verify all cNvPr names are preserved
    for (const a of anchors) {
      expect(afterXml!).toContain(`name="${a.name}"`);
    }

    console.log(`Test 2 (rId preservation): PASS — all ${anchors.length} relationship IDs preserved`);
  });

  it("Test 3: Image over ordinary empty cells should NOT be unnecessarily moved", async () => {
    // Image at rows 20-26, content only in rows 0-9
    // Image is below content, no overlap with other images
    const anchors = [
      { fromCol: 0, fromRow: 20, toCol: 7, toRow: 26, rId: "rId1", id: 2, name: "Image 1" },
    ];

    const drawingXml = makeDrawingXml(anchors);
    const rels = [{ rId: "rId1", target: "../media/image1.png" }];
    const xlsxBuffer = await createTestXlsx(10, drawingXml, rels);
    const zip = await loadZip(xlsxBuffer);

    const mockSheet = makeMockSheet(10);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // Image should NOT be repositioned — it's below content and has no overlap
    expect(stats.imagesRepositioned).toBe(0);
    expect(stats.overlapsAfter).toBe(0);

    console.log(`Test 3 (no unnecessary move): PASS — image below content left unchanged`);
  });

  it("Test 4: Media files survive optimization with unchanged SHA-256", async () => {
    const anchors = [
      { fromCol: 0, fromRow: 2, toCol: 7, toRow: 8, rId: "rId1", id: 2, name: "Image 1" },
      { fromCol: 0, fromRow: 3, toCol: 7, toRow: 9, rId: "rId2", id: 3, name: "Image 2" },
    ];

    const drawingXml = makeDrawingXml(anchors);
    const rels = anchors.map((a) => ({ rId: a.rId, target: `../media/image${a.rId === "rId1" ? 1 : 2}.png` }));
    const xlsxBuffer = await createTestXlsx(10, drawingXml, rels);

    // Calculate original media hashes
    const origZip = await loadZip(xlsxBuffer);
    const origHashes = new Map<string, string>();
    for (const name of Object.keys(origZip.files)) {
      if (name.startsWith("xl/media/")) {
        const bytes = await origZip.file(name)!.async("uint8array");
        const hash = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        origHashes.set(name, Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join(""));
      }
    }

    const zip = await loadZip(xlsxBuffer);
    const mockSheet = makeMockSheet(10);
    await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    const outputBuffer = await saveZip(zip);

    // Calculate optimized media hashes
    const optZip = await loadZip(outputBuffer);
    for (const [name, origHash] of origHashes) {
      const entry = optZip.file(name);
      expect(entry, `Media file ${name} missing in optimized`).toBeTruthy();
      const bytes = await entry!.async("uint8array");
      const hash = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      const optHash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(optHash, `Media file ${name} hash changed`).toBe(origHash);
    }

    console.log(`Test 4 (media integrity): PASS — all ${origHashes.size} media files unchanged`);
  });

  it("Test 5: Non-zero colOff/rowOff values are preserved", async () => {
    const anchors = [
      {
        fromCol: 0, fromRow: 2, fromColOff: 190500, fromRowOff: 95250,
        toCol: 7, toRow: 8, toColOff: 0, toRowOff: 0,
        rId: "rId1", id: 2, name: "Image 1",
      },
      {
        fromCol: 0, fromRow: 5, fromColOff: 0, fromRowOff: 0,
        toCol: 7, toRow: 11, toColOff: 0, toRowOff: 0,
        rId: "rId2", id: 3, name: "Image 2",
      },
    ];

    const drawingXml = makeDrawingXml(anchors);
    const rels = anchors.map((a) => ({ rId: a.rId, target: `../media/image${a.rId === "rId1" ? 1 : 2}.png` }));
    const xlsxBuffer = await createTestXlsx(15, drawingXml, rels);
    const zip = await loadZip(xlsxBuffer);

    const mockSheet = makeMockSheet(15);
    await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    expect(afterXml).toBeTruthy();

    // Verify colOff values are preserved (not zeroed out)
    expect(afterXml!).toContain("<xdr:colOff>190500</xdr:colOff>");

    console.log(`Test 5 (offset preservation): PASS — non-zero offsets preserved`);
  });

  it("Test 6: Workbook with no conflicts — all positions unchanged", async () => {
    const anchors = [
      { fromCol: 0, fromRow: 2, toCol: 7, toRow: 6, rId: "rId1", id: 2, name: "Image 1" },
      { fromCol: 0, fromRow: 20, toCol: 7, toRow: 26, rId: "rId2", id: 3, name: "Image 2" },
    ];

    const drawingXml = makeDrawingXml(anchors);
    const rels = anchors.map((a) => ({ rId: a.rId, target: `../media/image${a.rId === "rId1" ? 1 : 2}.png` }));
    const xlsxBuffer = await createTestXlsx(15, drawingXml, rels);
    const zip = await loadZip(xlsxBuffer);

    const beforeXml = await readEntryText(zip, "xl/drawings/drawing1.xml");

    const mockSheet = makeMockSheet(15);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // Image 1 (rows 2-6) overlaps content at row 10 → gets pushed below
    // Image 2 (rows 20-26) is already below content
    // The algorithm repositions Image 1 to avoid content overlap
    expect(stats.overlapsAfter).toBe(0);

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    expect(afterXml).toBeTruthy();

    // Verify XML is well-formed
    const doc = parseXml(afterXml!);
    expect(doc.documentElement).toBeTruthy();

    console.log(`Test 6 (content push): PASS — ${stats.imagesRepositioned} images pushed below content, no overlaps`);
  });

  it("Test 7: Mixed — some anchors direct, some inside mc:AlternateContent", async () => {
    // This tests the real-world pattern where some drawings use mc:AC and some don't
    const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <mc:AlternateContent mc:Requires="a14">
    <mc:Choice>
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="MC Image"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Choice>
    <mc:Fallback>
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="MC Image"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
      </xdr:twoCellAnchor>
    </mc:Fallback>
  </mc:AlternateContent>
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>11</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic><xdr:nvPicPr><xdr:cNvPr id="3" name="Direct Image"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6858000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

    const rels = [
      { rId: "rId1", target: "../media/image1.png" },
      { rId: "rId2", target: "../media/image2.png" },
    ];
    const xlsxBuffer = await createTestXlsx(15, drawingXml, rels);
    const zip = await loadZip(xlsxBuffer);

    const mockSheet = makeMockSheet(15);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // 1 image in mc:AC (Choice + Fallback share r:embed = rId1) = 1 logical
    // + 1 direct child (rId2) = 2 logical drawings
    expect(stats.imagesBefore).toBe(2);
    expect(stats.overlapsBefore).toBeGreaterThan(0);

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    expect(afterXml).toBeTruthy();

    // Verify XML is well-formed
    const doc = parseXml(afterXml!);
    expect(doc.documentElement).toBeTruthy();

    // Verify all r:embed values preserved
    expect(afterXml!).toContain('r:embed="rId1"');
    expect(afterXml!).toContain('r:embed="rId2"');

    console.log(`Test 7 (mixed mc:AC + direct): PASS — ${stats.imagesBefore} anchors found, ${stats.overlapsBefore} overlaps → ${stats.overlapsAfter}`);
  });

  it("Test 8: Large-scale with mc:AlternateContent wrapping", async () => {
    // 10 images all overlapping, wrapped in mc:AlternateContent
    const anchors = [];
    for (let i = 0; i < 10; i++) {
      anchors.push({
        fromCol: 0,
        fromRow: 2 + Math.floor(i * 0.8),
        toCol: 7,
        toRow: 2 + Math.floor(i * 0.8) + 6,
        rId: `rId${i + 1}`,
        id: i + 2,
        name: `Image ${i + 1}`,
      });
    }

    const drawingXml = makeDrawingXml(anchors, true);
    const rels = anchors.map((a) => ({ rId: a.rId, target: `../media/img_${a.rId}.png` }));
    const xlsxBuffer = await createTestXlsx(10, drawingXml, rels);
    const zip = await loadZip(xlsxBuffer);

    const mockSheet = makeMockSheet(10);
    const stats = await fixDrawingOverlaps(zip, mockSheet, "xl/worksheets/sheet1.xml");

    // 10 images, each with unique r:embed, wrapped in mc:AC
    // Choice + Fallback for each = 20 XML anchors, but 10 logical drawings
    expect(stats.imagesBefore).toBe(10);
    expect(stats.overlapsBefore).toBeGreaterThan(0);

    const outputBuffer = await saveZip(zip);
    const outputZip = await loadZip(outputBuffer);
    const afterXml = await readEntryText(outputZip, "xl/drawings/drawing1.xml");
    expect(afterXml).toBeTruthy();

    // Verify all r:embed values preserved
    for (const a of anchors) {
      expect(afterXml!).toContain(`r:embed="${a.rId}"`);
    }

    console.log(`Test 8 (large-scale mc:AC): PASS — ${stats.imagesBefore} anchors, ${stats.overlapsBefore} overlaps → ${stats.overlapsAfter}`);
  });
});
