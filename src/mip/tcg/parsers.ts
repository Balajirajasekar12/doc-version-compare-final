// ============================================================
// Requirement → Test Case Generator — Client-Side Parsers (v3)
// All parsing happens in the browser. No data leaves the device.
// Supports: docx, pdf, md, txt, sql, jpg/jpeg/png, java, xml, sh, json, yaml, yml, plsql
// ============================================================

import type {
  TcgDocument,
  ParsedContent,
  TextParsedContent,
  SqlParsedContent,
  ImageParsedContent,
  ExtractedTable,
  SqlTableDef,
  SqlStatement,
  SqlColumnDef,
  SqlConstraint,
} from "./types";

// --- Main entry: parse any supported file ---
export async function parseDocument(doc: TcgDocument): Promise<ParsedContent> {
  const ext = doc.extension.toLowerCase();

  if (ext === ".docx") return parseDocx(doc.rawFile);
  if (ext === ".pdf") return parsePdf(doc.rawFile);
  if (ext === ".md" || ext === ".txt") return parseText(doc.rawFile);
  if (ext === ".sql" || ext === ".plsql") return parseSql(doc.rawFile);
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") return parseImage(doc.rawFile);
  if (ext === ".java") return parseJava(doc.rawFile);
  if (ext === ".xml") return parseXml(doc.rawFile);
  if (ext === ".sh") return parseShellScript(doc.rawFile);
  if (ext === ".json") return parseJson(doc.rawFile);
  if (ext === ".yaml" || ext === ".yml") return parseYaml(doc.rawFile);

  // Fallback: try reading as text
  return parseText(doc.rawFile);
}

// ============================================================
// DOCUMENT PARSERS
// ============================================================

// --- DOCX Parser (using mammoth) ---
async function parseDocx(file: File): Promise<TextParsedContent> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.default.extractRawText({ arrayBuffer });
  const fullText = result.value || "";
  return buildTextContent(fullText);
}

// --- PDF Parser (using pdfjs-dist) ---
async function parsePdf(file: File): Promise<TextParsedContent> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    textParts.push(pageText);
  }
  const fullText = textParts.join("\n\n");
  return buildTextContent(fullText);
}

// --- Plain Text / Markdown Parser ---
async function parseText(file: File): Promise<TextParsedContent> {
  const fullText = await readFileAsText(file);
  return buildTextContent(fullText);
}

// --- Image Parser ---
async function parseImage(file: File): Promise<ImageParsedContent> {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        kind: "image",
        dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        description: `Architecture/design diagram: ${file.name} (${img.naturalWidth}×${img.naturalHeight})`,
      });
    };
    img.onerror = () => {
      resolve({
        kind: "image",
        dataUrl,
        width: 0,
        height: 0,
        description: `Image: ${file.name} (could not read dimensions)`,
      });
    };
    img.src = dataUrl;
  });
}

// ============================================================
// SOURCE CODE PARSERS
// ============================================================

// --- Java Parser ---
async function parseJava(file: File): Promise<TextParsedContent> {
  const fullText = await readFileAsText(file);
  // Java files are parsed as text with enhanced extraction
  const content = buildTextContent(fullText);

  // Extract Java-specific structures
  const classMatches = fullText.matchAll(/\b(?:public|private|protected)?\s*(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)/g);
  const methodMatches = fullText.matchAll(/\b(?:public|private|protected)\s+[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)/g);
  const dtoMatches = fullText.matchAll(/\b(\w+DTO)\b/g);
  const importMatches = fullText.matchAll(/\bimport\s+([\w.]+)\s*;/g);

  // Add extracted items to lists for downstream analysis
  for (const m of classMatches) {
    content.lists.push(`CLASS: ${m[1]}`);
  }
  for (const m of methodMatches) {
    content.lists.push(`METHOD: ${m[1]}`);
  }
  for (const m of dtoMatches) {
    content.lists.push(`DTO: ${m[1]}`);
  }
  for (const m of importMatches) {
    content.lists.push(`IMPORT: ${m[1]}`);
  }

  return content;
}

// --- XML Parser ---
async function parseXml(file: File): Promise<TextParsedContent> {
  const fullText = await readFileAsText(file);
  const content = buildTextContent(fullText);

  // Extract XML structure
  const tagMatches = fullText.matchAll(/<(\w+)(?:\s[^>]*)?>/g);
  const uniqueTags = new Set<string>();
  for (const m of tagMatches) {
    uniqueTags.add(m[1].toUpperCase());
  }
  content.lists.push(`XML_TAGS: ${Array.from(uniqueTags).join(", ")}`);

  return content;
}

// --- Shell Script Parser ---
async function parseShellScript(file: File): Promise<TextParsedContent> {
  const fullText = await readFileAsText(file);
  const content = buildTextContent(fullText);

  // Extract shell commands and variables
  const commandMatches = fullText.matchAll(/^\s*(\w+)\s/gm);
  const varMatches = fullText.matchAll(/\b([A-Z_]{2,})\s*=/gm);
  const jobMatches = fullText.matchAll(/\b(\w+_JOB|\w+_BATCH|\w+_PROCESS)\b/gi);

  const commands = new Set<string>();
  for (const m of commandMatches) commands.add(m[1].toUpperCase());
  content.lists.push(`SHELL_COMMANDS: ${Array.from(commands).slice(0, 20).join(", ")}`);

  const vars = new Set<string>();
  for (const m of varMatches) vars.add(m[1]);
  content.lists.push(`SHELL_VARS: ${Array.from(vars).slice(0, 20).join(", ")}`);

  for (const m of jobMatches) {
    content.lists.push(`JOB: ${m[1]}`);
  }

  return content;
}

// --- JSON Parser ---
async function parseJson(file: File): Promise<TextParsedContent> {
  const fullText = await readFileAsText(file);
  const content = buildTextContent(fullText);

  try {
    const json = JSON.parse(fullText);
    const keys = extractJsonKeys(json, "");
    content.lists.push(`JSON_KEYS: ${keys.slice(0, 50).join(", ")}`);
  } catch {
    // Not valid JSON — treat as text
  }

  return content;
}

// --- YAML Parser ---
async function parseYaml(file: File): Promise<TextParsedContent> {
  const fullText = await readFileAsText(file);
  const content = buildTextContent(fullText);

  // Extract YAML keys (simple regex approach)
  const keyMatches = fullText.matchAll(/^(\s*)(\w[\w-]*):/gm);
  const keys = new Set<string>();
  for (const m of keyMatches) keys.add(m[2]);
  content.lists.push(`YAML_KEYS: ${Array.from(keys).slice(0, 50).join(", ")}`);

  return content;
}

function extractJsonKeys(obj: any, prefix: string): string[] {
  const keys: string[] = [];
  if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.push(fullKey);
      if (typeof obj[key] === "object" && keys.length < 50) {
        keys.push(...extractJsonKeys(obj[key], fullKey));
      }
    }
  }
  return keys.slice(0, 50);
}

// ============================================================
// SQL PARSER
// ============================================================

async function parseSql(file: File): Promise<SqlParsedContent> {
  const fullText = await readFileAsText(file);
  const tables = extractTableDefinitions(fullText);
  const statements = extractStatements(fullText);
  const constraints = extractConstraints(fullText);
  return { kind: "sql", fullText, tables, statements, constraints };
}

// ============================================================
// SHARED TEXT CONTENT BUILDER
// ============================================================

function buildTextContent(fullText: string): TextParsedContent {
  const lines = fullText.split("\n");
  const headings: string[] = [];
  const sectionHeaders: string[] = [];
  const paragraphs: string[] = [];
  const lists: string[] = [];
  const tables: ExtractedTable[] = [];
  let currentParagraph = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentParagraph) { paragraphs.push(currentParagraph); currentParagraph = ""; }
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      if (currentParagraph) { paragraphs.push(currentParagraph); currentParagraph = ""; }
      const heading = trimmed.replace(/^#{1,6}\s*/, "");
      headings.push(heading);
      sectionHeaders.push(heading);
      continue;
    }

    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /^[A-Z\s\d\-_.,:;()\/]+$/.test(trimmed)) {
      if (currentParagraph) { paragraphs.push(currentParagraph); currentParagraph = ""; }
      headings.push(trimmed);
      sectionHeaders.push(trimmed);
      continue;
    }

    if (/^[\-\*•▪➤→►●○◆◇■□]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
      if (currentParagraph) { paragraphs.push(currentParagraph); currentParagraph = ""; }
      lists.push(trimmed);
      continue;
    }

    if ((trimmed.includes("\t") && trimmed.split("\t").length >= 3) ||
        (trimmed.includes("|") && trimmed.split("|").length >= 3)) {
      if (currentParagraph) { paragraphs.push(currentParagraph); currentParagraph = ""; }
      const delimiter = trimmed.includes("|") ? "|" : "\t";
      const cells = trimmed.split(delimiter).map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        if (tables.length === 0 || tables[tables.length - 1].rows.length > 20) {
          tables.push({ headers: cells, rows: [] });
        } else {
          tables[tables.length - 1].rows.push(cells);
        }
      }
      continue;
    }

    currentParagraph += (currentParagraph ? " " : "") + trimmed;
  }

  if (currentParagraph) paragraphs.push(currentParagraph);
  return { kind: "text", fullText, headings, paragraphs, tables, lists, sectionHeaders };
}

// ============================================================
// SQL ANALYSIS HELPERS
// ============================================================

function extractTableDefinitions(sql: string): SqlTableDef[] {
  const tables: SqlTableDef[] = [];
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\)\s*[;,]/gi;
  let match;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns = parseColumnDefs(body);
    const constraints = extractTableConstraints(body);
    tables.push({ name: tableName.toUpperCase(), columns, constraints });
  }
  return tables;
}

function parseColumnDefs(body: string): SqlColumnDef[] {
  const columns: SqlColumnDef[] = [];
  const parts = splitByComma(body);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|INDEX)/i.test(trimmed)) continue;
    const colMatch = trimmed.match(/^[`"]?(\w+)["`]?\s+([\w()]+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/i);
    if (colMatch) {
      const colName = colMatch[1].toUpperCase();
      const dataType = colMatch[2].toUpperCase();
      const isPk = /\bPRIMARY\s+KEY\b/i.test(trimmed);
      const isNullable = /\bNOT\s+NULL\b/i.test(trimmed);
      const fkMatch = trimmed.match(/REFERENCES\s+[`"]?(\w+)["`]?\s*\(\s*[`"]?(\w+)["`]?\s*\)/i);
      columns.push({
        name: colName, dataType, nullable: !isNullable,
        isPrimaryKey: isPk, isForeignKey: !!fkMatch,
        references: fkMatch ? `${fkMatch[1].toUpperCase()}.${fkMatch[2].toUpperCase()}` : undefined,
      });
    }
  }
  return columns;
}

function extractTableConstraints(body: string): string[] {
  const constraints: string[] = [];
  const pkMatch = body.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/gi);
  if (pkMatch) constraints.push(...pkMatch.map(m => m.trim()));
  const fkMatches = body.match(/FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+[^,)]+/gi);
  if (fkMatches) constraints.push(...fkMatches.map(m => m.trim()));
  const uqMatches = body.match(/UNIQUE\s*(?:\([^)]+\))?/gi);
  if (uqMatches) constraints.push(...uqMatches.map(m => m.trim()));
  return constraints;
}

function extractStatements(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  const parts = sql.split(/;\s*\n|;\s*$/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    let type: SqlStatement["type"] = "OTHER";
    if (/\bSELECT\b/.test(upper)) type = "SELECT";
    else if (/\bINSERT\b/.test(upper)) type = "INSERT";
    else if (/\bUPDATE\b/.test(upper)) type = "UPDATE";
    else if (/\bDELETE\b/.test(upper)) type = "DELETE";
    else if (/\bCREATE\b/.test(upper)) type = "CREATE";
    else if (/\bALTER\b/.test(upper)) type = "ALTER";
    else if (/\bMERGE\b/.test(upper)) type = "MERGE";
    statements.push({
      type, raw: trimmed.slice(0, 500),
      tables: extractTableRefs(trimmed),
      columns: extractColumnRefs(trimmed),
      conditions: extractWhereConditions(trimmed),
    });
  }
  return statements;
}

function extractTableRefs(sql: string): string[] {
  const tables = new Set<string>();
  const upper = sql.toUpperCase();
  for (const m of upper.matchAll(/\bFROM\s+[`"]?(\w+)["`]?/gi)) tables.add(m[1].toUpperCase());
  for (const m of upper.matchAll(/\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+)?JOIN\s+[`"]?(\w+)["`]?/gi)) tables.add(m[1].toUpperCase());
  for (const m of upper.matchAll(/\bINTO\s+[`"]?(\w+)["`]?/gi)) tables.add(m[1].toUpperCase());
  for (const m of upper.matchAll(/\bUPDATE\s+[`"]?(\w+)["`]?/gi)) tables.add(m[1].toUpperCase());
  return Array.from(tables);
}

function extractColumnRefs(sql: string): string[] {
  const columns = new Set<string>();
  const upper = sql.toUpperCase();
  const selectMatch = upper.match(/SELECT\s+([\s\S]*?)\bFROM\b/i);
  if (selectMatch) {
    const colPart = selectMatch[1];
    if (!/^\s*\*/.test(colPart)) {
      const ignore = new Set(["AS", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE", "WHEN", "THEN", "ELSE", "END", "NVL", "COALESCE", "TRIM", "UPPER", "LOWER", "LENGTH", "SUBSTR", "DECODE", "ROUND", "TRUNC"]);
      for (const m of colPart.matchAll(/[`"]?(\w+)["`]?(?:\s+AS\s+[`"]?\w+["`]?)?/gi)) {
        const col = m[1].toUpperCase();
        if (!ignore.has(col)) columns.add(col);
      }
    }
  }
  return Array.from(columns);
}

function extractWhereConditions(sql: string): string[] {
  const conditions: string[] = [];
  const whereMatch = sql.match(/\bWHERE\s+([\s\S]*?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|\bFETCH\b|$)/i);
  if (whereMatch) {
    const parts = whereMatch[1].split(/\b(?:AND|OR)\b/i);
    for (const part of parts) {
      const trimmed = part.trim().replace(/;$/, "").trim();
      if (trimmed) conditions.push(trimmed);
    }
  }
  return conditions;
}

function extractConstraints(sql: string): SqlConstraint[] {
  const constraints: SqlConstraint[] = [];
  const upper = sql.toUpperCase();
  for (const m of upper.matchAll(/PRIMARY\s+KEY\s*\(([^)]+)\)/gi)) {
    const cols = m[1].split(",").map(c => c.trim().replace(/[`"]/g, "").toUpperCase());
    constraints.push({ type: "PRIMARY KEY", table: "", columns: cols, definition: m[0] });
  }
  for (const m of sql.matchAll(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"]?(\w+)["`]?\s*\(([^)]+)\)/gi)) {
    const cols = m[1].split(",").map(c => c.trim().replace(/[`"]/g, "").toUpperCase());
    constraints.push({ type: "FOREIGN KEY", table: m[2].toUpperCase(), columns: cols, definition: m[0] });
  }
  return constraints;
}

function splitByComma(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of str) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) { parts.push(current); current = ""; }
    else { current += char; }
  }
  if (current) parts.push(current);
  return parts;
}

// ============================================================
// UTILITY READERS
// ============================================================

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
