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
 * Convert HTML to structured text, preserving line breaks at block elements.
 * This handles the case where mammoth produces HTML like:
 * <p>Paid Claims Month<b>August 2026</b></p>
 * and we need to extract text with proper line breaks.
 */
function htmlToText(html: string): string[] {
  const lines: string[] = [];

  // Split by block-level elements and extract text
  // Block elements: p, div, h1-h6, li, tr, table, etc.
  const blockRegex = /<(p|div|h[1-6]|li|tr|br|hr)\b[^>]*>/gi;
  
  // Replace block elements with newlines
  let processed = html
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
