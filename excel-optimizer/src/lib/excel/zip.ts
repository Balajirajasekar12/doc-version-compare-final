/**
 * Zip helpers for OOXML (.xlsx/.xlsm) packages.
 *
 * The optimizer treats the uploaded file as a zip archive and only rewrites
 * the XML parts it needs to (worksheet + styles). Every other part — charts,
 * pivot tables, drawings, media, VBA projects, shared strings, etc. — is
 * preserved byte-for-byte by simply never touching it.
 */
import JSZip from "jszip";
import {
  XmlDoc,
  childElements,
  escapeIllegalXmlChars,
  firstChildElement,
  getAttr,
  parseXml,
  removeAttr,
  serializeXml,
  setAttr,
} from "./xml";

export type Zip = JSZip;

export async function loadZip(data: ArrayBuffer): Promise<Zip> {
  try {
    return await JSZip.loadAsync(data, { checkCRC32: true });
  } catch {
    throw new Error("The uploaded file is not a valid Excel workbook (.xlsx/.xlsm).");
  }
}

export async function saveZip(zip: Zip): Promise<ArrayBuffer> {
  await sanitizeXmlParts(zip);

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return await blob.arrayBuffer();
}

/**
 * Final safety pass over every XML part before the zip is written.
 *
 * 1. Illegal XML characters: a lenient DOM parser (xmldom) accepts them but
 *    Excel rejects the whole workbook, so escape them with Excel's own
 *    `_xHHHH_` convention (Excel decodes them back — no data is lost). This
 *    covers parts the engine re-serialized AND parts that pass through
 *    untouched (shared strings, comments, SheetJS-converted parts).
 * 2. SheetJS quirk: legacy .xls conversion writes `<col level="…">`, which
 *    is not part of CT_Col and can trigger Excel's repair prompt. It is
 *    rewritten to the schema-valid `outlineLevel`.
 *
 * Only entries that decode as valid UTF-8 are ever rewritten; everything
 * else stays byte-for-byte untouched.
 */
async function sanitizeXmlParts(zip: Zip): Promise<void> {
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (!/\.(xml|rels|vml)$/i.test(name)) continue;
    const bytes = await entry.async("uint8array");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      continue; // not valid UTF-8 — do not touch
    }

    let cleaned = escapeIllegalXmlChars(text);
    if (/^xl\/worksheets\/.*\.xml$/i.test(name) && /<col\b[^>]*\blevel\s*=/.test(cleaned)) {
      cleaned = normalizeColLevel(cleaned);
    }
    if (cleaned !== text) zip.file(name, cleaned);
  }
}

/** Rewrites a worksheet part's `<col level>` attributes to `outlineLevel`. */
function normalizeColLevel(xml: string): string {
  let doc: XmlDoc;
  try {
    doc = parseXml(xml);
  } catch {
    return xml;
  }
  const root = doc.documentElement!;
  const colsEl = firstChildElement(root, "cols");
  if (!colsEl) return xml;
  let changed = false;
  for (const col of childElements(colsEl, "col")) {
    const level = getAttr(col, "level");
    if (level === undefined) continue;
    if (getAttr(col, "outlineLevel") === undefined && level !== "0") {
      setAttr(col, "outlineLevel", level);
    }
    removeAttr(col, "level");
    changed = true;
  }
  return changed ? serializeXml(doc) : xml;
}

export async function readEntryText(zip: Zip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  try {
    return await entry.async("string");
  } catch {
    return null;
  }
}

export async function readEntryBinary(zip: Zip, path: string): Promise<Uint8Array | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  try {
    return await entry.async("uint8array");
  } catch {
    return null;
  }
}

export function listEntries(zip: Zip): string[] {
  return Object.keys(zip.files).filter((name) => !zip.files[name].dir);
}

export function countEntriesMatching(zip: Zip, re: RegExp): number {
  return listEntries(zip).filter((name) => re.test(name)).length;
}

/** Path of workbook.xml inside the package. */
export function workbookPath(zip: Zip): string {
  if (zip.file("xl/workbook.xml")) return "xl/workbook.xml";
  // Some tools emit workbook.xml at the root.
  if (zip.file("workbook.xml")) return "workbook.xml";
  throw new Error("This file does not appear to be an Excel workbook (missing xl/workbook.xml).");
}
