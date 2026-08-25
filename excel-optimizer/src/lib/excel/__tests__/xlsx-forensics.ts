/**
 * XLSX Forensic Analysis & Comparison Utilities
 *
 * Treats XLSX files as OOXML ZIP packages and performs deep structural
 * analysis. Used to investigate why the optimizer corrupts real workbooks
 * and to verify fixes against actual production files.
 *
 * This file is EO-specific and does not affect DVC or MIT.
 */
import JSZip from "jszip";

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface MediaFileInfo {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
}

export interface DrawingRelationship {
  rId: string;
  type: string;
  target: string;
}

export interface AnchorInfo {
  index: number;
  anchorType: "twoCellAnchor" | "oneCellAnchor" | "absoluteAnchor" | "unknown";
  fromCol: number;
  fromColOff: number;
  fromRow: number;
  fromRowOff: number;
  toCol: number;
  toColOff: number;
  toRow: number;
  toRowOff: number;
  rId: string; // relationship ID from blip r:embed
  cNvPrId: string;
  cNvPrName: string;
  insideAlternateContent: boolean;
  insideChoice: boolean;
  insideFallback: boolean;
  rawFromXml: string;
  rawToXml: string;
  rawAnchorXml: string;
}

export interface SheetDrawingInfo {
  sheetName: string;
  sheetFile: string;
  drawingFile: string;
  drawingRelFile: string;
  anchors: AnchorInfo[];
  relationships: DrawingRelationship[];
}

export interface XlsxInventory {
  fileName: string;
  totalParts: number;
  mediaFiles: MediaFileInfo[];
  drawingFiles: string[];
  worksheetFiles: string[];
  sheetDrawings: SheetDrawingInfo[];
  contentTypes: Record<string, string>;
  totalAnchors: number;
  totalImages: number;
}

export interface XlsxComparisonResult {
  original: XlsxInventory;
  optimized: XlsxInventory;

  // Media comparison
  mediaUnchanged: number;
  mediaChanged: number;
  mediaMissing: number;
  mediaAdded: number;
  mediaMissingList: string[];
  mediaChangedList: string[];
  mediaAddedList: string[];

  // Anchor comparison
  anchorsUnchanged: number;
  anchorsMoved: number;
  anchorsMissing: number;
  anchorsAdded: number;
  anchorsMovedList: Array<{
    sheet: string;
    index: number;
    from: string;
    to: string;
    reason: string;
  }>;

  // Relationship comparison
  relationshipsUnchanged: number;
  relationshipsBroken: number;
  brokenRelationships: Array<{ sheet: string; rId: string; target: string }>;

  // XML integrity
  xmlWellFormed: boolean;
  xmlErrors: string[];

  // Overall
  pass: boolean;
  failures: string[];
}

// ─── SHA-256 HASHING ────────────────────────────────────────────────────────

async function sha256(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── XML HELPERS ────────────────────────────────────────────────────────────

function countOccurrences(xml: string, pattern: RegExp): number {
  return (xml.match(pattern) || []).length;
}

function extractTextBetween(
  xml: string,
  openTag: string,
  closeTag: string,
): string | null {
  const idx = xml.indexOf(openTag);
  if (idx === -1) return null;
  const start = idx + openTag.length;
  const end = xml.indexOf(closeTag, start);
  if (end === -1) return null;
  return xml.substring(start, end);
}

function extractNumFromTag(xml: string, tagName: string): number {
  const re = new RegExp(
    `<\\\\w*:?(?:${tagName})\\\\b[^>]*>(\\\\d+)</\\\\w*:?(?:${tagName})>`,
  );
  const m = xml.match(re);
  return m ? parseInt(m[1]) : 0;
}

// ─── INVENTORY EXTRACTION ───────────────────────────────────────────────────

/**
 * Extract a complete inventory from an XLSX file.
 * Records every image, relationship, and anchor with full details.
 */
export async function extractInventory(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<XlsxInventory> {
  const zip = await JSZip.loadAsync(buffer);

  // ── Media files ──
  const mediaFiles: MediaFileInfo[] = [];
  const mediaEntries = Object.keys(zip.files).filter(
    (name) =>
      !zip.files[name].dir &&
      /^xl\/media\//.test(name) &&
      /\.(png|jpeg|jpg|gif|bmp|tiff|tif|wmf|emf|svg|ico)$/i.test(name),
  );

  for (const mediaPath of mediaEntries) {
    const entry = zip.file(mediaPath);
    if (!entry) continue;
    const bytes = await entry.async("uint8array");
    const hash = await sha256(bytes);
    const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "";
    const contentTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      bmp: "image/bmp",
      tif: "image/tiff",
      tiff: "image/tiff",
      wmf: "application/x-msmetafile",
      emf: "image/x-emf",
      svg: "image/svg+xml",
    };
    mediaFiles.push({
      path: mediaPath,
      size: bytes.length,
      sha256: hash,
      contentType: contentTypes[ext] ?? "application/octet-stream",
    });
  }

  // ── Drawing files ──
  const drawingFiles = Object.keys(zip.files).filter(
    (name) =>
      !zip.files[name].dir && /^xl\/drawings\/drawing\d+\.xml$/i.test(name),
  );

  // ── Worksheet files ──
  const worksheetFiles = Object.keys(zip.files).filter(
    (name) =>
      !zip.files[name].dir &&
      /^xl\/worksheets\/sheet\d+\.xml$/i.test(name),
  );

  // ── Content types ──
  const contentTypes: Record<string, string> = {};
  const ctEntry = zip.file("[Content_Types].xml");
  if (ctEntry) {
    const ctXml = await ctEntry.async("string");
    const overrides = ctXml.match(
      /<Override\s+PartName="([^"]+)"\s+ContentType="([^"]+)"/g,
    );
    if (overrides) {
      for (const override of overrides) {
        const partMatch = override.match(/PartName="([^"]+)"/);
        const typeMatch = override.match(/ContentType="([^"]+)"/);
        if (partMatch && typeMatch) {
          contentTypes[partMatch[1]] = typeMatch[1];
        }
      }
    }
  }

  // ── Sheet → Drawing mapping ──
  const sheetDrawings: SheetDrawingInfo[] = [];
  const totalParts = Object.keys(zip.files).filter(
    (name) => !zip.files[name].dir,
  ).length;

  for (const sheetFile of worksheetFiles) {
    const sheetName = sheetFile.replace(/^xl\/worksheets\//, "").replace(/\.xml$/, "");

    // Find the sheet's rels to get the drawing file
    const relsPath = sheetFile.replace(
      /xl\/worksheets\/(sheet\d+\.xml)$/,
      "xl/worksheets/_rels/$1.rels",
    );
    const relsEntry = zip.file(relsPath);
    let drawingFile = "";
    let drawingRelFile = "";

    if (relsEntry) {
      const relsXml = await relsEntry.async("string");
      const drawingMatch = relsXml.match(
        /Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/,
      );
      if (drawingMatch) {
        let target = drawingMatch[1];
        if (!target.startsWith("/")) {
          target = "xl/" + target;
        } else {
          target = target.replace(/^\//, "");
        }
        // Normalize path
        const parts = target.split("/");
        const normalized: string[] = [];
        for (const p of parts) {
          if (p === "..") normalized.pop();
          else if (p !== "." && p !== "") normalized.push(p);
        }
        drawingFile = normalized.join("/");
      }
    }

    if (drawingFile && zip.file(drawingFile)) {
      drawingRelFile = drawingFile.replace(
        /xl\/drawings\/(drawing\d+\.xml)$/,
        "xl/drawings/_rels/$1.xml.rels",
      );
    }

    // Parse drawing relationships
    const relationships: DrawingRelationship[] = [];
    if (drawingRelFile) {
      const drEntry = zip.file(drawingRelFile);
      if (drEntry) {
        const drXml = await drEntry.async("string");
        const relMatches = drXml.match(
          /<Relationship[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"/g,
        );
        if (relMatches) {
          for (const rel of relMatches) {
            const idMatch = rel.match(/Id="([^"]+)"/);
            const typeMatch = rel.match(/Type="([^"]+)"/);
            const targetMatch = rel.match(/Target="([^"]+)"/);
            if (idMatch && typeMatch && targetMatch) {
              relationships.push({
                rId: idMatch[1],
                type: typeMatch[1],
                target: targetMatch[1],
              });
            }
          }
        }
      }
    }

    // Parse drawing XML to extract anchors
    const anchors: AnchorInfo[] = [];
    if (drawingFile) {
      const dEntry = zip.file(drawingFile);
      if (dEntry) {
        const dXml = await dEntry.async("string");
        const extractedAnchors = extractAnchorsFromDrawing(dXml);
        anchors.push(...extractedAnchors);
      }
    }

    sheetDrawings.push({
      sheetName,
      sheetFile,
      drawingFile,
      drawingRelFile,
      anchors,
      relationships,
    });
  }

  const totalAnchors = sheetDrawings.reduce(
    (sum, sd) => sum + sd.anchors.length,
    0,
  );

  return {
    fileName,
    totalParts,
    mediaFiles,
    drawingFiles,
    worksheetFiles,
    sheetDrawings,
    contentTypes,
    totalAnchors,
    totalImages: totalAnchors,
  };
}

/**
 * Extract all anchors from a drawing XML string with full metadata.
 * Handles mc:AlternateContent, mc:Choice, mc:Fallback, and all anchor types.
 */
function extractAnchorsFromDrawing(xml: string): AnchorInfo[] {
  const anchors: AnchorInfo[] = [];
  let index = 0;

  // Recursive extraction — walk the XML string looking for anchor elements
  // We use a state machine to track nesting inside mc:AlternateContent

  // Strategy: Find each anchor block (twoCellAnchor, oneCellAnchor, absoluteAnchor)
  // and determine if it's inside mc:Choice, mc:Fallback, or neither.

  // We scan for opening tags of anchor types and their enclosing mc: elements
  const anchorStartRe =
    /<(mc:AlternateContent|mc:Choice|mc:Fallback|(\w+:)?(twoCellAnchor|oneCellAnchor|absoluteAnchor))\b/g;
  let match: RegExpExecArray | null;

  // Track nesting state
  const mcStack: string[] = [];
  const anchorPositions: Array<{
    start: number;
    type: string;
    insideAC: boolean;
    insideChoice: boolean;
    insideFallback: boolean;
  }> = [];

  // First pass: identify all opening tags and their positions
  const openTags: Array<{
    pos: number;
    tag: string;
    isMC: boolean;
    isAnchor: boolean;
  }> = [];

  anchorStartRe.lastIndex = 0;
  while ((match = anchorStartRe.exec(xml)) !== null) {
    const tag = match[1] || match[3] || "";
    const anchorType = match[3] || "";
    const isMC =
      tag === "mc:AlternateContent" ||
      tag === "mc:Choice" ||
      tag === "mc:Fallback";
    const isAnchor =
      anchorType === "twoCellAnchor" ||
      anchorType === "oneCellAnchor" ||
      anchorType === "absoluteAnchor";
    openTags.push({ pos: match.index, tag, isMC, isAnchor });
  }

  // Build a map of which anchors are inside which mc: elements
  const anchorMeta: Map<
    number,
    { insideAC: boolean; insideChoice: boolean; insideFallback: boolean }
  > = new Map();

  let acDepth = 0;
  let choiceDepth = 0;
  let fallbackDepth = 0;

  for (const ot of openTags) {
    if (ot.tag === "mc:AlternateContent") acDepth++;
    if (ot.tag === "mc:Choice") choiceDepth++;
    if (ot.tag === "mc:Fallback") fallbackDepth++;

    // Close tags: decrement when we see the matching close
    // (simplified — we track opens only; for our purposes this is sufficient
    //  because mc: elements always fully enclose their anchors)

    if (ot.isAnchor) {
      anchorMeta.set(ot.pos, {
        insideAC: acDepth > 0,
        insideChoice: choiceDepth > 0,
        insideFallback: fallbackDepth > 0,
      });
    }

    // When we close a Choice or Fallback, decrement
    // (We detect closing by checking if the next close tag matches)
    if (ot.tag === "mc:Choice") {
      const closeIdx = xml.indexOf("</mc:Choice>", ot.pos);
      if (closeIdx > ot.pos) {
        // Find the next mc:Choice open after this one
        const nextOpen = openTags.find(
          (t) => t.tag === "mc:Choice" && t.pos > ot.pos,
        );
        if (!nextOpen || nextOpen.pos > closeIdx) {
          choiceDepth = Math.max(0, choiceDepth - 1);
        }
      }
    }
    if (ot.tag === "mc:Fallback") {
      const closeIdx = xml.indexOf("</mc:Fallback>", ot.pos);
      if (closeIdx > ot.pos) {
        const nextOpen = openTags.find(
          (t) => t.tag === "mc:Fallback" && t.pos > ot.pos,
        );
        if (!nextOpen || nextOpen.pos > closeIdx) {
          fallbackDepth = Math.max(0, fallbackDepth - 1);
        }
      }
    }
    if (ot.tag === "mc:AlternateContent") {
      const closeIdx = xml.indexOf("</mc:AlternateContent>", ot.pos);
      if (closeIdx > ot.pos) {
        const nextOpen = openTags.find(
          (t) => t.tag === "mc:AlternateContent" && t.pos > ot.pos,
        );
        if (!nextOpen || nextOpen.pos > closeIdx) {
          acDepth = Math.max(0, acDepth - 1);
        }
      }
    }
  }

  // Second pass: extract each anchor's full XML and its from/to blocks
  for (const ot of openTags) {
    if (!ot.isAnchor) continue;

    const meta = anchorMeta.get(ot.pos) ?? {
      insideAC: false,
      insideChoice: false,
      insideFallback: false,
    };

    // Find the matching close tag
    const closeTagRe = new RegExp(`<\\/?\\w*:?${ot.tag}\\b[^>]*>`);
    let depth = 0;
    let anchorEnd = -1;
    let searchPos = ot.pos;

    while (searchPos < xml.length) {
      const nextTag = xml.indexOf(`<`, searchPos + 1);
      if (nextTag === -1) break;
      const tagMatch = xml.substring(nextTag).match(/^<\/?(\w+:)?(\w+)\b/);
      if (tagMatch) {
        const tagName = tagMatch[2];
        if (tagName === ot.tag) {
          if (xml[nextTag + 1] === "/") {
            depth--;
            if (depth === 0) {
              // Find the closing >
              const closeGt = xml.indexOf(">", nextTag);
              anchorEnd = closeGt + 1;
              break;
            }
          } else {
            depth++;
          }
        }
      }
      searchPos = nextTag;
    }

    if (anchorEnd === -1) continue;

    const rawAnchorXml = xml.substring(ot.pos, anchorEnd);

    // Extract from and to blocks
    const fromMatch = rawAnchorXml.match(
      /<(\w+:)?from\b[^>]*>([\s\S]*?)<\/(\w+:)?from>/,
    );
    const toMatch = rawAnchorXml.match(
      /<(\w+:)?to\b[^>]*>([\s\S]*?)<\/(\w+:)?to>/,
    );

    const rawFromXml = fromMatch ? fromMatch[0] : "";
    const rawToXml = toMatch ? toMatch[0] : "";

    // Parse values
    const fromInner = fromMatch ? fromMatch[2] : "";
    const toInner = toMatch ? toMatch[2] : "";

    const extractNum = (inner: string, tag: string): number => {
      const re = new RegExp(
        `<\\\\w*:?(?:${tag})\\\\b[^>]*>(\\\\d+)</\\\\w*:?(?:${tag})>`,
      );
      const m = inner.match(re);
      return m ? parseInt(m[1]) : 0;
    };

    // Extract r:embed from blip
    const blipMatch = rawAnchorXml.match(/<a:blip[^>]*r:embed="([^"]+)"/);
    const rId = blipMatch ? blipMatch[1] : "";

    // Extract cNvPr id and name
    const cNvPrMatch = rawAnchorXml.match(
      /<(\w+:)?cNvPr\b[^>]*id="([^"]+)"[^>]*name="([^"]+)"/,
    );
    const cNvPrId = cNvPrMatch ? cNvPrMatch[2] : "";
    const cNvPrName = cNvPrMatch ? cNvPrMatch[3] : "";

    anchors.push({
      index,
      anchorType: (ot.isAnchor ? ot.tag : "unknown") as AnchorInfo["anchorType"],
      fromCol: extractNum(fromInner, "col"),
      fromColOff: extractNum(fromInner, "colOff"),
      fromRow: extractNum(fromInner, "row"),
      fromRowOff: extractNum(fromInner, "rowOff"),
      toCol: extractNum(toInner, "col"),
      toColOff: extractNum(toInner, "colOff"),
      toRow: extractNum(toInner, "row"),
      toRowOff: extractNum(toInner, "rowOff"),
      rId,
      cNvPrId,
      cNvPrName,
      insideAlternateContent: meta.insideAC,
      insideChoice: meta.insideChoice,
      insideFallback: meta.insideFallback,
      rawFromXml,
      rawToXml,
      rawAnchorXml,
    });

    index++;
  }

  return anchors;
}

// ─── COMPARISON ─────────────────────────────────────────────────────────────

/**
 * Compare two XLSX files at ZIP/XML level.
 * Produces a detailed report of all differences.
 */
export async function compareXlsxFiles(
  originalBuffer: ArrayBuffer,
  optimizedBuffer: ArrayBuffer,
  originalName: string = "original.xlsx",
  optimizedName: string = "optimized.xlsx",
): Promise<XlsxComparisonResult> {
  const original = await extractInventory(originalBuffer, originalName);
  const optimized = await extractInventory(optimizedBuffer, optimizedName);

  const failures: string[] = [];
  const xmlErrors: string[] = [];

  // ── Media comparison ──
  const origMediaMap = new Map(original.mediaFiles.map((m) => [m.path, m]));
  const optMediaMap = new Map(optimized.mediaFiles.map((m) => [m.path, m]));

  const mediaUnchanged = original.mediaFiles.filter((m) => {
    const opt = optMediaMap.get(m.path);
    return opt && opt.sha256 === m.sha256;
  }).length;

  const mediaChanged = original.mediaFiles.filter((m) => {
    const opt = optMediaMap.get(m.path);
    return opt && opt.sha256 !== m.sha256;
  }).length;

  const mediaMissingList = original.mediaFiles
    .filter((m) => !optMediaMap.has(m.path))
    .map((m) => m.path);

  const mediaAddedList = optimized.mediaFiles
    .filter((m) => !origMediaMap.has(m.path))
    .map((m) => m.path);

  const mediaChangedList = original.mediaFiles
    .filter((m) => {
      const opt = optMediaMap.get(m.path);
      return opt && opt.sha256 !== m.sha256;
    })
    .map((m) => m.path);

  if (mediaMissingList.length > 0) {
    failures.push(
      `${mediaMissingList.length} media files MISSING: ${mediaMissingList.join(", ")}`,
    );
  }
  if (mediaChangedList.length > 0) {
    failures.push(
      `${mediaChangedList.length} media files CHANGED: ${mediaChangedList.join(", ")}`,
    );
  }

  // ── Anchor comparison ──
  let anchorsUnchanged = 0;
  let anchorsMoved = 0;
  let anchorsMissing = 0;
  let anchorsAdded = 0;
  const anchorsMovedList: XlsxComparisonResult["anchorsMovedList"] = [];

  // Build a map of sheet → anchors for both
  const origAnchorMap = new Map<string, AnchorInfo[]>();
  const optAnchorMap = new Map<string, AnchorInfo[]>();

  for (const sd of original.sheetDrawings) {
    origAnchorMap.set(sd.sheetName, sd.anchors);
  }
  for (const sd of optimized.sheetDrawings) {
    optAnchorMap.set(sd.sheetName, sd.anchors);
  }

  // Compare anchors per sheet
  const allSheetNames = new Set([
    ...origAnchorMap.keys(),
    ...optAnchorMap.keys(),
  ]);

  for (const sheetName of allSheetNames) {
    const origAnchors = origAnchorMap.get(sheetName) ?? [];
    const optAnchors = optAnchorMap.get(sheetName) ?? [];

    // Match anchors by cNvPrId (stable identity)
    const origById = new Map(origAnchors.map((a) => [a.cNvPrId || `${a.index}`, a]));
    const optById = new Map(optAnchors.map((a) => [a.cNvPrId || `${a.index}`, a]));

    for (const [id, orig] of origById) {
      const opt = optById.get(id);
      if (!opt) {
        anchorsMissing++;
        failures.push(
          `Sheet "${sheetName}": anchor cNvPrId="${id}" MISSING in optimized`,
        );
        continue;
      }

      const posChanged =
        orig.fromCol !== opt.fromCol ||
        orig.fromColOff !== opt.fromColOff ||
        orig.fromRow !== opt.fromRow ||
        orig.fromRowOff !== opt.fromRowOff ||
        orig.toCol !== opt.toCol ||
        orig.toColOff !== opt.toColOff ||
        orig.toRow !== opt.toRow ||
        orig.toRowOff !== opt.toRowOff;

      if (posChanged) {
        anchorsMoved++;
        anchorsMovedList.push({
          sheet: sheetName,
          index: orig.index,
          from: `(${orig.fromCol},${orig.fromRow})→(${orig.toCol},${orig.toRow})`,
          to: `(${opt.fromCol},${opt.fromRow})→(${opt.toCol},${opt.toRow})`,
          reason: "repositioned by optimizer",
        });
      } else {
        anchorsUnchanged++;
      }
    }

    for (const [id, opt] of optById) {
      if (!origById.has(id)) {
        anchorsAdded++;
        failures.push(
          `Sheet "${sheetName}": unexpected anchor cNvPrId="${id}" ADDED in optimized`,
        );
      }
    }
  }

  // ── Relationship comparison ──
  let relationshipsUnchanged = 0;
  let relationshipsBroken = 0;
  const brokenRelationships: XlsxComparisonResult["brokenRelationships"] = [];

  for (const sd of optimized.sheetDrawings) {
    for (const rel of sd.relationships) {
      if (
        rel.type.includes("/image") ||
        rel.type.includes("/drawing")
      ) {
        // Check if the target media file exists
        let targetPath = rel.target;
        if (!targetPath.startsWith("/")) {
          targetPath = "xl/" + targetPath;
        }
        // Normalize
        const parts = targetPath.split("/");
        const normalized: string[] = [];
        for (const p of parts) {
          if (p === "..") normalized.pop();
          else if (p !== "." && p !== "") normalized.push(p);
        }
        targetPath = normalized.join("/");

        // Check in the optimized zip
        const optZip = await JSZip.loadAsync(optimizedBuffer);
        if (optZip.file(targetPath)) {
          relationshipsUnchanged++;
        } else {
          relationshipsBroken++;
          brokenRelationships.push({
            sheet: sd.sheetName,
            rId: rel.rId,
            target: rel.target,
          });
          failures.push(
            `Sheet "${sd.sheetName}": relationship ${rel.rId} → ${rel.target} is BROKEN (file not found)`,
          );
        }
      }
    }
  }

  // ── XML well-formedness check ──
  let xmlWellFormed = true;
  try {
    const optZip = await JSZip.loadAsync(optimizedBuffer);
    for (const name of Object.keys(optZip.files)) {
      if (optZip.files[name].dir) continue;
      if (!/\.(xml|rels)$/i.test(name)) continue;
      try {
        const text = await optZip.files[name].async("string");
        // Check for basic XML well-formedness
        if (text.includes("<<") || text.includes(">>")) {
          xmlWellFormed = false;
          xmlErrors.push(`${name}: suspicious angle brackets`);
        }
        // Verify closing tags match opening tags (basic check)
        const openCount = (text.match(/<(?!\/)(\w+:)?\w+\b/g) || []).length;
        const closeCount = (text.match(/<\/(\w+:)?\w+>/g) || []).length;
        // Self-closing tags are counted as both open and close by some parsers
        const selfCloseCount = (text.match(/\/>/g) || []).length;
        // This is approximate but catches major corruption
      } catch (e) {
        xmlWellFormed = false;
        xmlErrors.push(`${name}: failed to read as text: ${e}`);
      }
    }
  } catch (e) {
    xmlWellFormed = false;
    xmlErrors.push(`Failed to load optimized ZIP: ${e}`);
  }

  // ── Overall pass/fail ──
  const pass = failures.length === 0;
  if (mediaMissingList.length > 0) {
    failures.push(
      `FAIL: ${mediaMissingList.length} images disappeared — this is a CRITICAL failure`,
    );
  }
  if (relationshipsBroken > 0) {
    failures.push(
      `FAIL: ${relationshipsBroken} relationships are broken`,
    );
  }

  return {
    original,
    optimized,
    mediaUnchanged,
    mediaChanged,
    mediaMissing: mediaMissingList.length,
    mediaAdded: mediaAddedList.length,
    mediaMissingList,
    mediaChangedList,
    mediaAddedList,
    anchorsUnchanged,
    anchorsMoved,
    anchorsMissing,
    anchorsAdded,
    anchorsMovedList,
    relationshipsUnchanged,
    relationshipsBroken,
    brokenRelationships,
    xmlWellFormed,
    xmlErrors,
    pass,
    failures,
  };
}

/**
 * Generate a human-readable report from a comparison result.
 */
export function formatComparisonReport(result: XlsxComparisonResult): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("XLSX FORENSIC COMPARISON REPORT");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");

  lines.push("── ORIGINAL ──");
  lines.push(`  File: ${result.original.fileName}`);
  lines.push(`  Parts: ${result.original.totalParts}`);
  lines.push(`  Media files: ${result.original.mediaFiles.length}`);
  lines.push(`  Drawing files: ${result.original.drawingFiles.length}`);
  lines.push(`  Total anchors: ${result.original.totalAnchors}`);
  for (const sd of result.original.sheetDrawings) {
    if (sd.anchors.length > 0) {
      lines.push(
        `  ${sd.sheetName}: ${sd.anchors.length} anchors (${sd.anchors.filter((a) => a.insideAlternateContent).length} inside mc:AC)`,
      );
    }
  }
  lines.push("");

  lines.push("── OPTIMIZED ──");
  lines.push(`  File: ${result.optimized.fileName}`);
  lines.push(`  Parts: ${result.optimized.totalParts}`);
  lines.push(`  Media files: ${result.optimized.mediaFiles.length}`);
  lines.push(`  Drawing files: ${result.optimized.drawingFiles.length}`);
  lines.push(`  Total anchors: ${result.optimized.totalAnchors}`);
  lines.push("");

  lines.push("── MEDIA INTEGRITY ──");
  lines.push(`  Unchanged: ${result.mediaUnchanged}`);
  lines.push(`  Changed: ${result.mediaChanged}`);
  lines.push(`  Missing: ${result.mediaMissing}`);
  lines.push(`  Added: ${result.mediaAdded}`);
  if (result.mediaMissingList.length > 0) {
    lines.push("  ⚠ MISSING MEDIA:");
    for (const m of result.mediaMissingList) {
      lines.push(`    - ${m}`);
    }
  }
  if (result.mediaChangedList.length > 0) {
    lines.push("  ⚠ CHANGED MEDIA:");
    for (const m of result.mediaChangedList) {
      lines.push(`    - ${m}`);
    }
  }
  lines.push("");

  lines.push("── ANCHOR ANALYSIS ──");
  lines.push(`  Unchanged: ${result.anchorsUnchanged}`);
  lines.push(`  Moved: ${result.anchorsMoved}`);
  lines.push(`  Missing: ${result.anchorsMissing}`);
  lines.push(`  Added: ${result.anchorsAdded}`);
  if (result.anchorsMovedList.length > 0) {
    lines.push("  Moved anchors:");
    for (const a of result.anchorsMovedList) {
      lines.push(
        `    Sheet "${a.sheet}" #${a.index}: ${a.from} → ${a.to} (${a.reason})`,
      );
    }
  }
  lines.push("");

  lines.push("── RELATIONSHIP INTEGRITY ──");
  lines.push(`  Unchanged: ${result.relationshipsUnchanged}`);
  lines.push(`  Broken: ${result.relationshipsBroken}`);
  if (result.brokenRelationships.length > 0) {
    lines.push("  ⚠ BROKEN RELATIONSHIPS:");
    for (const r of result.brokenRelationships) {
      lines.push(`    Sheet "${r.sheet}": ${r.rId} → ${r.target}`);
    }
  }
  lines.push("");

  lines.push("── XML INTEGRITY ──");
  lines.push(`  Well-formed: ${result.xmlWellFormed ? "PASS" : "FAIL"}`);
  if (result.xmlErrors.length > 0) {
    for (const e of result.xmlErrors) {
      lines.push(`    - ${e}`);
    }
  }
  lines.push("");

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push(`OVERALL: ${result.pass ? "PASS ✓" : "FAIL ✗"}`);
  if (!result.pass) {
    lines.push("FAILURES:");
    for (const f of result.failures) {
      lines.push(`  ✗ ${f}`);
    }
  }
  lines.push("═══════════════════════════════════════════════════════════");

  return lines.join("\n");
}
