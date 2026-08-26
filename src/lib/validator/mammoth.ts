/**
 * Typed wrapper around mammoth's browser UMD bundle (no bundled types).
 * The untyped import is confined to this one file.
 */
// @ts-ignore — mammoth.browser is a UMD bundle without type declarations.
import mammothModule from "mammoth/mammoth.browser";

interface MammothResult {
  value: string;
  messages: Array<{ type?: string; message: string }>;
}

interface MammothHtmlResult {
  value: string;
  messages: Array<{ type?: string; message: string }>;
}

/** OOXML internal paths that must never appear as document content. */
const OOXML_PATHS_RE = /^(\[Content_Types\]\.xml|_rels\/|word\/|xl\/|ppt\/)/;

/**
 * Extract text from a .docx file using HTML conversion.
 * This preserves structure better than extractRawText which concatenates
 * text runs without line breaks.
 */
export async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  // Use HTML conversion to preserve structure
  const result = (await mammothModule.convertToHtml({ arrayBuffer })) as MammothHtmlResult;

  // Check for error-level messages from mammoth
  const errors = (result.messages || []).filter(
    (m) => m.type === "error",
  );
  if (errors.length > 0 && (!result.value || result.value.trim() === "")) {
    throw new Error(
      `DOCX extraction failed: ${errors.map((e) => e.message).join("; ")}`,
    );
  }

  // Convert HTML to text with proper line breaks at block elements
  const lines = htmlToText(result.value);

  // Filter out OOXML internal paths
  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (t === "") return false;
    if (OOXML_PATHS_RE.test(t)) return false;
    return true;
  });

  return filtered.join("\n");
}

/**
 * Strip all HTML tags from a fragment and decode entities.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

/**
 * Extract rows from a <table> HTML fragment and convert to pipe-delimited lines.
 * This preserves cell boundaries so the canonicalizer can recognize table structure.
 */
function extractTableRows(tableHtml: string): string[] {
  const rows: string[] = [];
  // Match each <tr>...</tr>
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const rowContent = trMatch[1];
    const cells: string[] = [];
    // Match each <td> or <th> cell
    const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellText = stripHtml(cellMatch[1]);
      if (cellText !== "") {
        cells.push(cellText);
      }
    }
    if (cells.length > 0) {
      rows.push(cells.join(" | "));
    }
  }
  return rows;
}

/**
 * Convert HTML to structured text, preserving line breaks at block elements.
 * Tables are converted to pipe-delimited rows so the canonicalizer can
 * recognize row/cell structure instead of flattening cells into paragraphs.
 */
function htmlToText(html: string): string[] {
  const lines: string[] = [];

  // Step 1: Extract tables as pipe-delimited rows BEFORE any processing.
  // This preserves the row/cell structure that would otherwise be lost
  // when <td> content gets flattened by the generic HTML-to-text conversion.
  let processed = html.replace(
    /<table\b[^>]*>([\s\S]*?)<\/table>/gi,
    (_match, tableContent: string) => {
      const rows = extractTableRows(tableContent);
      return "\n" + rows.join("\n") + "\n";
    },
  );

  // Step 2: Split by block-level elements and extract text
  const blockRegex = /<(p|div|h[1-6]|li|tr|br|hr)\b[^>]*>/gi;
  processed = processed
    // Add newlines before block elements
    .replace(blockRegex, "\n")
    // Add newlines after closing block elements
    .replace(/<\/(p|div|h[1-6]|li|tr)\b[^>]*>/gi, "\n")
    // Handle explicit <br> tags
    .replace(/<br\s*\/?>/gi, "\n")
    // Handle <hr> tags
    .replace(/<hr\s*\/?>/gi, "\n")
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Split by newlines and clean up
  const rawLines = processed.split(/\n/);
  
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed !== "") {
      lines.push(trimmed);
    }
  }

  return lines;
}
