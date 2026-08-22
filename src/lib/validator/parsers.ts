import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

import { splitVersion } from "./grouping";
import { extractDocxText } from "./mammoth";
import { rtfToText } from "./rtf";
import type { DocKind, ParsedDoc, SheetData } from "./types";

/**
 * All parsing happens inside the user's browser. No document bytes or
 * extracted content ever leave this page — there are no network calls here.
 */

let pdfWorkerConfigured = false;
function ensurePdfWorker(): void {
  if (!pdfWorkerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfWorkerConfigured = true;
  }
}

function extOf(fileName: string): DocKind | null {
  const m = /\.([^.]+)$/.exec(fileName);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === "docx" || ext === "rtf" || ext === "xlsx" || ext === "xls" || ext === "csv" || ext === "pdf") {
    return ext;
  }
  return null;
}

// ── Magic byte / file signature detection ───────────────────────────────────

/** Detect the actual format of an ArrayBuffer by inspecting its first bytes. */
function detectFormatByMagicBytes(buf: ArrayBuffer): "pdf" | "zip" | "rtf" | "csv" | null {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 4) return null;
  // PDF: starts with %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  // ZIP (DOCX/XLSX/XLS): starts with PK\x03\x04 or PK\x05\x06 or PK\x01\x02
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x01)) return "zip";
  // RTF: starts with {\rtf (ASCII 7B 5C 72 74 66)
  if (bytes[0] === 0x7b && bytes[1] === 0x5c && bytes[2] === 0x72 && bytes[3] === 0x74) return "rtf";
  return null;
}

// ── Post-extraction artifact filter ────────────────────────────────────────

/** Known ZIP/OOXML internal paths that must never appear as document content. */
const OOXML_PATHS = [
  "word/document.xml", "word/styles.xml", "word/numbering.xml",
  "word/fontTable.xml", "word/settings.xml", "word/webSettings.xml",
  "word/theme/theme1.xml", "word/_rels/", "word/media/",
  "xl/workbook.xml", "xl/worksheets/sheet", "xl/sharedStrings.xml",
  "xl/styles.xml", "xl/theme/theme1.xml", "xl/_rels/", "xl/media/",
  "ppt/presentation.xml", "ppt/_rels/", "ppt/media/",
  "[Content_Types].xml", "_rels/.rels", "_rels/document.xml.rels",
  "_rels/workbook.xml.rels",
];

/** Check if a line is a known OOXML/ZIP internal path. */
function isOOXMLPath(line: string): boolean {
  const t = line.trim();
  return OOXML_PATHS.some(p => t === p || t.startsWith(p));
}

/** Check if a line looks like decoded ZIP binary garbage. */
function isZipBinaryGarbage(line: string): boolean {
  const t = line.trim();
  // Starts with PK signature bytes decoded as text
  if (/^PK[\x00-\x03\x05\x06\x07-\x1f]/.test(t)) return true;
  // Very short line that is just binary-looking characters
  if (t.length > 0 && t.length < 8 && /[\x00-\x08\x0e-\x1f]/.test(t)) return true;
  return false;
}

/** Check if a line is raw RTF control syntax that leaked through extraction. */
function isRawRTFControl(line: string): boolean {
  const t = line.trim();
  // Lines that are purely RTF control words
  if (/^\\(rtf|ansi|deff|fonttbl|colortbl|stylesheet|info|pict|pard|par|tab|fs\d|b|i|ul|cf\d|highlight\d)+/.test(t)) return true;
  if (/^\{\\(rtf|fonttbl|colortbl|stylesheet|info|pict)/.test(t)) return true;
  return false;
}

/**
 * Targeted artifact filter: remove lines that are clearly parser/container
 * artifacts, NOT legitimate document content.
 *
 * This is intentionally conservative — it only removes KNOWN artifacts:
 * - OOXML internal paths (word/document.xml, xl/workbook.xml, etc.)
 * - Decoded ZIP binary signatures (PK followed by binary bytes)
 * - Raw RTF control syntax that leaked through extraction
 * - Empty/whitespace-only lines
 *
 * This does NOT filter based on:
 * - Unicode/non-ASCII characters (legitimate content)
 * - Character frequency ratios
 * - Replacement characters
 * - Text length
 * - Specific field names or values
 */
function filterArtifacts(lines: string[]): string[] {
  return lines.filter(line => {
    const t = line.trim();
    if (t === "") return false;                    // empty lines
    if (isOOXMLPath(t)) return false;               // ZIP internal paths
    if (isZipBinaryGarbage(t)) return false;         // decoded binary
    if (isRawRTFControl(t)) return false;            // raw RTF syntax
    return true;
  });
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l, idx, arr) => !(l === "" && idx === arr.length - 1));
}

async function parseDocx(arrayBuffer: ArrayBuffer): Promise<string[]> {
  // Validate DOCX magic bytes before parsing
  const magic = detectFormatByMagicBytes(arrayBuffer);
  if (magic === "pdf") {
    throw new Error("This file appears to be a PDF but has a DOCX extension. Please rename it with the correct extension.");
  }
  if (magic === "rtf") {
    throw new Error("This file appears to be an RTF but has a DOCX extension. Please rename it with the correct extension.");
  }
  const text = await extractDocxText(arrayBuffer);
  return filterArtifacts(splitLines(text));
}

function parseRtf(arrayBuffer: ArrayBuffer): string[] {
  // Validate magic bytes before decoding
  const magic = detectFormatByMagicBytes(arrayBuffer);
  if (magic === "zip") {
    throw new Error("This file appears to be a ZIP-based document (DOCX/XLSX) but has an RTF extension. Please rename it with the correct extension.");
  }
  if (magic === "pdf") {
    throw new Error("This file appears to be a PDF but has an RTF extension. Please rename it with the correct extension.");
  }
  // Decode as windows-1252 — safe for RTF \xhh escapes.
  let text: string;
  try {
    text = new TextDecoder("windows-1252").decode(arrayBuffer);
  } catch (_e) {
    try {
      text = new TextDecoder("utf-8").decode(arrayBuffer);
    } catch (_e2) {
      throw new Error("Unable to decode RTF file content");
    }
  }
  // Strip BOM (UTF-8 EF BB BF or UTF-16 BOM) if present before the RTF header.
  text = text.replace(/^\ufeff/, "");
  // If the file doesn't start with {\rtf, try to find the RTF header
  // and skip any preamble bytes.
  if (!text.trimStart().startsWith("{\\rtf")) {
    const rtfStart = text.indexOf("{\\rtf");
    if (rtfStart > 0 && rtfStart < 100) {
      text = text.substring(rtfStart);
    } else if (rtfStart < 0) {
      // No RTF header found at all — treat as plain text
      return filterArtifacts(splitLines(text));
    }
  }
  // rtfToText is designed to never throw (catches internally),
  // but guard against any unexpected error.
  let plain: string;
  try {
    plain = rtfToText(text);
  } catch (_e) {
    // Best-effort: strip RTF control words from raw text as fallback
    plain = text.replace(/\\[a-zA-Z]+\d*\s?/g, "").replace(/\{[^}]*\}/g, "");
  }
  const lines = splitLines(plain);
  if (lines.length === 0 && arrayBuffer.byteLength > 0) {
    // If RTF parsing yielded nothing, try reading as plain text
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer);
    return filterArtifacts(splitLines(raw));
  }
  return filterArtifacts(lines);
}

function parseSheet(arrayBuffer: ArrayBuffer, ext: "xlsx" | "xls" | "csv"): SheetData[] {
  // CSV has no magic bytes — hand it to SheetJS as text for reliable detection.
  const workbook =
    ext === "csv"
      ? XLSX.read(new TextDecoder().decode(arrayBuffer), { type: "string" })
      : XLSX.read(arrayBuffer, { type: "array" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
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
}async function parsePdf(arrayBuffer: ArrayBuffer): Promise<string[]> {
  ensurePdfWorker();
  const data = new Uint8Array(arrayBuffer);
  const doc = await pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const lines: string[] = [];
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Collect all text items with their positions
      const items: Array<{ str: string; x: number; y: number }> = [];
      for (const item of textContent.items) {
        const str = (item as { str?: unknown }).str;
        if (typeof str !== "string") continue;
        const transform = (item as { transform?: number[] }).transform;
        items.push({
          str,
          x: transform?.[4] ?? 0,
          y: transform?.[5] ?? 0,
        });
      }

      // Group items by Y-position (within 2.5px) into rows
      const rows: Array<Array<{ str: string; x: number; y: number }>> = [];
      let currentRow: Array<{ str: string; x: number; y: number }> = [];
      let lastY: number | null = null;

      for (const item of items) {
        if (lastY !== null && Math.abs(item.y - lastY) > 2.5) {
          if (currentRow.length > 0) rows.push(currentRow);
          currentRow = [];
        }
        currentRow.push(item);
        lastY = item.y;
      }
      if (currentRow.length > 0) rows.push(currentRow);

      // Cross-row table detection: check if multiple rows have items at
      // consistent X-positions. If so, insert pipes at those positions.
      // This handles tables where per-row gap detection fails because
      // column gaps are too small (e.g., compact ReportLab tables).
      
      // First, sort each row by X and collect X-position sets
      const rowXPositions: number[][] = [];
      for (const row of rows) {
        row.sort((a, b) => a.x - b.x);
        const nonEmpty = row.filter(item => item.str.trim() !== "");
        rowXPositions.push(nonEmpty.map(it => Math.round(it.x)));
      }
      
      // Find X-positions that appear in 2+ rows (within tolerance of 5px)
      const xPosCounts = new Map<number, number>();
      for (const xPosArr of rowXPositions) {
        // Deduplicate within the same row
        const unique = [...new Set(xPosArr)];
        for (const x of unique) {
          // Find if there's a close existing position
          let merged = false;
          for (const [key, count] of xPosCounts) {
            if (Math.abs(key - x) <= 5) {
              xPosCounts.set(key, count + 1);
              merged = true;
              break;
            }
          }
          if (!merged) xPosCounts.set(x, 1);
        }
      }
      
      // Column X-positions: positions appearing in 2+ rows
      const columnXPositions = Array.from(xPosCounts.entries())
        .filter(([_, count]) => count >= 2)
        .map(([x, _]) => x)
        .sort((a, b) => a - b);
      
      // For each row, use column positions to insert pipes
      for (const row of rows) {
        const nonEmptyItems = row.filter(item => item.str.trim() !== "");
        if (nonEmptyItems.length < 2) {
          if (nonEmptyItems.length === 1) lines.push(nonEmptyItems[0].str.trim());
          continue;
        }
        
        const avgCharWidth = 5;
        
        // Method 1: Cross-row table detection
        if (columnXPositions.length >= 2) {
          // Map each item to its nearest column position
          const itemsByCol = new Map<number, string[]>();
          for (const item of nonEmptyItems) {
            let bestCol = columnXPositions[0];
            let bestDist = Math.abs(item.x - bestCol);
            for (const colX of columnXPositions) {
              const dist = Math.abs(item.x - colX);
              if (dist < bestDist) {
                bestCol = colX;
                bestDist = dist;
              }
            }
            // Only assign if within 20px of a column position
            if (bestDist <= 20) {
              if (!itemsByCol.has(bestCol)) itemsByCol.set(bestCol, []);
              itemsByCol.get(bestCol)!.push(item.str.trim());
            } else {
              // Item not in any column — append to nearest or create new
              const key = -1; // fallback bucket
              if (!itemsByCol.has(key)) itemsByCol.set(key, []);
              itemsByCol.get(key)!.push(item.str.trim());
            }
          }
          
          // Build line from column positions
          const sortedCols = Array.from(itemsByCol.keys()).sort((a, b) => a - b);
          const lineParts: string[] = [];
          for (const col of sortedCols) {
            const texts = itemsByCol.get(col)!;
            lineParts.push(texts.join(" "));
          }
          const line = lineParts.filter(p => p !== "").join(" | ");
          if (line.trim() !== "") lines.push(line.trim());
          continue;
        }
        
        // Method 2: Per-row gap detection (fallback for non-table layouts)
        const gaps: number[] = [];
        for (let gi = 1; gi < nonEmptyItems.length; gi++) {
          const prev = nonEmptyItems[gi - 1];
          const curr = nonEmptyItems[gi];
          const estimatedPrevEnd = prev.x + prev.str.length * 5;
          const gap = curr.x - estimatedPrevEnd;
          if (gap > 0) gaps.push(gap);
        }
        
        let colGapThreshold = 30;
        if (gaps.length > 0) {
          const sortedGaps = [...gaps].sort((a, b) => a - b);
          const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
          colGapThreshold = Math.max(20, Math.min(medianGap * 1.5, 80));
        }
        
        let line = "";
        let lastX: number | null = null;
        for (const item of nonEmptyItems) {
          if (lastX !== null) {
            const estimatedPrevEnd = lastX;
            const gap = item.x - estimatedPrevEnd;
            line += gap > colGapThreshold ? " | " : " ";
          }
          line += item.str;
          lastX = item.x + item.str.length * avgCharWidth;
        }
        
        // Post-process: for 2-item rows with any gap, force pipe
        if (!line.includes("|") && nonEmptyItems.length === 2) {
          const gap = nonEmptyItems[1].x - (nonEmptyItems[0].x + nonEmptyItems[0].str.trim().length * avgCharWidth);
          if (gap > 15) {
            line = `${nonEmptyItems[0].str.trim()} | ${nonEmptyItems[1].str.trim()}`;
          }
        }
        
        if (line.trim() !== "") lines.push(line.trim());
      }

      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  // Trim fully-blank trailing lines (page breaks etc.).
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return filterArtifacts(lines);
}

/** Parse a single file into extracted content. Throws on failure. */
export async function parseFileBytes(
  fileName: string,
  arrayBuffer: ArrayBuffer,
): Promise<{ ext: DocKind; content: { type: "text"; lines: string[] } | { type: "sheet"; sheets: SheetData[] } }> {
  const ext = extOf(fileName);
  if (!ext) {
    throw new Error(`Unsupported file type: ${fileName}`);
  }
  if (ext === "docx") {
    return { ext, content: { type: "text", lines: await parseDocx(arrayBuffer) } };
  }
  if (ext === "rtf") {
    return { ext, content: { type: "text", lines: parseRtf(arrayBuffer) } };
  }
  if (ext === "pdf") {
    return { ext, content: { type: "text", lines: await parsePdf(arrayBuffer) } };
  }
  // xlsx / xls / csv
  return { ext, content: { type: "sheet", sheets: parseSheet(arrayBuffer, ext) } };
}

/** Full pipeline: build a ParsedDoc from a File (with optional path hint). */
export async function parseFile(file: File): Promise<ParsedDoc> {
  const path = file.webkitRelativePath || file.name;
  const fileName = path.split("/").pop() || file.name;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  const ext = extOf(fileName);
  const id = `${path}::${file.size}`;

  const { stem, version } = splitVersion(fileName);

  if (!ext) {
    return {
      id,
      path,
      dir,
      fileName,
      ext: "docx",
      stem,
      versionTag: version,
      size: file.size,
      error: "Unsupported file type",
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const { content } = await parseFileBytes(fileName, arrayBuffer);
    return {
      id,
      path,
      dir,
      fileName,
      ext,
      stem,
      versionTag: version,
      size: file.size,
      content,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Failed to parse file";
    // Build a diagnostic error message with file metadata
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const magic = detectFormatByMagicBytes(buf);
    const firstBytes = Array.from(bytes.slice(0, 16))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const firstChars = Array.from(bytes.slice(0, 64))
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
      .join("");
    const detail = [
      errMsg,
      `Size: ${file.size} bytes`,
      `Magic bytes: ${firstBytes}`,
      `Magic detected: ${magic ?? "none"}`,
      `First chars: ${firstChars}`,
    ].join(" | ");
    return {
      id,
      path,
      dir,
      fileName,
      ext,
      stem,
      versionTag: version,
      size: file.size,
      error: detail,
    };
  }
}

/** Pick supported files out of a FileList. */
export function filterSupported(files: File[]): File[] {
  return files.filter((f) => extOf(f.name) !== null);
}
