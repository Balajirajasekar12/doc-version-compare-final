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

/** OOXML internal paths that must never appear as document content. */
const OOXML_PATHS_RE = /^(\[Content_Types\]\.xml|_rels\/|word\/|xl\/|ppt\/)/;

/** Extract raw paragraph text from a .docx file (in-browser). */
export async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = (await mammothModule.extractRawText({ arrayBuffer })) as MammothResult;

  // Check for error-level messages from mammoth
  const errors = (result.messages || []).filter(
    (m) => m.type === "error",
  );
  if (errors.length > 0 && (!result.value || result.value.trim() === "")) {
    throw new Error(
      `DOCX extraction failed: ${errors.map((e) => e.message).join("; ")}`,
    );
  }

  // Filter out OOXML internal paths that mammoth might include
  const lines = result.value.split("\n").filter((line) => {
    const t = line.trim();
    if (t === "") return false;
    if (OOXML_PATHS_RE.test(t)) return false;
    return true;
  });

  return lines.join("\n");
}
