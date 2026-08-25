// ============================================================
// Requirement → Test Case Generator — Client-Side Parsers
// All parsing happens in the browser. No data leaves the device.
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
  if (ext === ".sql") return parseSql(doc.rawFile);
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") return parseImage(doc.rawFile);

  // Fallback: try reading as text
  return parseText(doc.rawFile);
}

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

  // Set worker source to the CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
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

// --- SQL Parser (deterministic, regex-based) ---
async function parseSql(file: File): Promise<SqlParsedContent> {
  const fullText = await readFileAsText(file);

  const tables = extractTableDefinitions(fullText);
  const statements = extractStatements(fullText);
  const constraints = extractConstraints(fullText);

  return {
    kind: "sql",
    fullText,
    tables,
    statements,
    constraints,
  };
}

// --- Image Parser (extract metadata + basic description) ---
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
// Shared text content builder
// ============================================================
function buildTextContent(fullText: string): TextParsedContent {
  const lines = fullText.split("\n");

  // Extract headings (lines that look like titles / all caps / markdown headings)
  const headings: string[] = [];
  const sectionHeaders: string[] = [];
  const paragraphs: string[] = [];
  const lists: string[] = [];
  const tables: ExtractedTable[] = [];

  let currentParagraph = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = "";
      }
      continue;
    }

    // Markdown heading
    if (/^#{1,6}\s/.test(trimmed)) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = "";
      }
      const heading = trimmed.replace(/^#{1,6}\s*/, "");
      headings.push(heading);
      sectionHeaders.push(heading);
      continue;
    }

    // All caps line (likely a heading/section title)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /^[A-Z\s\d\-_.,:;()\/]+$/.test(trimmed)) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = "";
      }
      headings.push(trimmed);
      sectionHeaders.push(trimmed);
      continue;
    }

    // List items
    if (/^[\-\*\•\▪\➤\→\►\●\○\◆\◇\■\□]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = "";
      }
      lists.push(trimmed);
      continue;
    }

    // Tab-separated or pipe-separated (might be table data)
    if ((trimmed.includes("\t") && trimmed.split("\t").length >= 3) ||
        (trimmed.includes("|") && trimmed.split("|").length >= 3)) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = "";
      }
      // Collect table rows
      const delimiter = trimmed.includes("|") ? "|" : "\t";
      const cells = trimmed.split(delimiter).map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        // Heuristic: if we're building a table, accumulate rows
        // For now, create a single-row "table" per line group
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

  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }

  return {
    kind: "text",
    fullText,
    headings,
    paragraphs,
    tables,
    lists,
    sectionHeaders,
  };
}

// ============================================================
// SQL Analysis Helpers
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

    tables.push({
      name: tableName.toUpperCase(),
      columns,
      constraints,
    });
  }

  return tables;
}

function parseColumnDefs(body: string): SqlColumnDef[] {
  const columns: SqlColumnDef[] = [];
  // Split by comma, but not commas inside parentheses
  const parts = splitByComma(body);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Skip constraint lines
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|INDEX)/i.test(trimmed)) continue;

    // Column definition: name type [NOT NULL] [DEFAULT ...] [PRIMARY KEY]
    const colMatch = trimmed.match(/^["`]?(\w+)["`]?\s+([\w()]+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/i);
    if (colMatch) {
      const colName = colMatch[1].toUpperCase();
      const dataType = colMatch[2].toUpperCase();
      const isPk = /\bPRIMARY\s+KEY\b/i.test(trimmed);
      const isNullable = /\bNOT\s+NULL\b/i.test(trimmed);
      const fkMatch = trimmed.match(/REFERENCES\s+["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i);

      columns.push({
        name: colName,
        dataType,
        nullable: !isNullable,
        isPrimaryKey: isPk,
        isForeignKey: !!fkMatch,
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
  // Split by semicolons (simple split, not perfect for all SQL but sufficient for analysis)
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

    // Extract table references
    const tables = extractTableRefs(trimmed);
    const columns = extractColumnRefs(trimmed);
    const conditions = extractWhereConditions(trimmed);

    statements.push({
      type,
      raw: trimmed.slice(0, 500),
      tables,
      columns,
      conditions,
    });
  }

  return statements;
}

function extractTableRefs(sql: string): string[] {
  const tables = new Set<string>();
  const upper = sql.toUpperCase();

  // FROM table
  const fromMatches = upper.matchAll(/\bFROM\s+["`]?(\w+)["`]?/gi);
  for (const m of fromMatches) tables.add(m[1].toUpperCase());

  // JOIN table
  const joinMatches = upper.matchAll(/\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+)?JOIN\s+["`]?(\w+)["`]?/gi);
  for (const m of joinMatches) tables.add(m[1].toUpperCase());

  // INTO table
  const intoMatches = upper.matchAll(/\bINTO\s+["`]?(\w+)["`]?/gi);
  for (const m of intoMatches) tables.add(m[1].toUpperCase());

  // UPDATE table
  const updateMatches = upper.matchAll(/\bUPDATE\s+["`]?(\w+)["`]?/gi);
  for (const m of updateMatches) tables.add(m[1].toUpperCase());

  return Array.from(tables);
}

function extractColumnRefs(sql: string): string[] {
  const columns = new Set<string>();
  const upper = sql.toUpperCase();

  // SELECT columns
  const selectMatch = upper.match(/SELECT\s+([\s\S]*?)\bFROM\b/i);
  if (selectMatch) {
    const colPart = selectMatch[1];
    if (!/^\s*\*/.test(colPart)) {
      const colMatches = colPart.matchAll(/["`]?(\w+)["`]?(?:\s+AS\s+["`]?\w+["`]?)?/gi);
      for (const m of colMatches) {
        const col = m[1].toUpperCase();
        if (!["AS", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE", "WHEN", "THEN", "ELSE", "END", "NVL", "COALESCE", "TRIM", "UPPER", "LOWER", "LENGTH", "SUBSTR", "DECODE", "ROUND", "TRUNC"].includes(col)) {
          columns.add(col);
        }
      }
    }
  }

  return Array.from(columns);
}

function extractWhereConditions(sql: string): string[] {
  const conditions: string[] = [];
  const whereMatch = sql.match(/\bWHERE\s+([\s\S]*?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|\bFETCH\b|$)/i);
  if (whereMatch) {
    const whereClause = whereMatch[1];
    // Split by AND/OR
    const parts = whereClause.split(/\b(?:AND|OR)\b/i);
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

  // Primary key constraints
  const pkMatches = upper.matchAll(/PRIMARY\s+KEY\s*\(([^)]+)\)/gi);
  for (const m of pkMatches) {
    const cols = m[1].split(",").map(c => c.trim().replace(/["`]/g, "").toUpperCase());
    constraints.push({ type: "PRIMARY KEY", table: "", columns: cols, definition: m[0] });
  }

  // Foreign key constraints
  const fkMatches = sql.matchAll(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+["`]?(\w+)["`]?\s*\(([^)]+)\)/gi);
  for (const m of fkMatches) {
    const cols = m[1].split(",").map(c => c.trim().replace(/["`]/g, "").toUpperCase());
    constraints.push({ type: "FOREIGN KEY", table: m[2].toUpperCase(), columns: cols, definition: m[0] });
  }

  // NOT NULL constraints
  const nnMatches = upper.matchAll(/(\w+)\s+\w+.*?\bNOT\s+NULL\b/gi);
  for (const m of nnMatches) {
    constraints.push({ type: "NOT NULL", table: "", columns: [m[1].toUpperCase()], definition: m[0] });
  }

  // Check constraints
  const checkMatches = upper.matchAll(/CHECK\s*\(([^)]+)\)/gi);
  for (const m of checkMatches) {
    constraints.push({ type: "CHECK", table: "", columns: [], definition: m[0] });
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
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// ============================================================
// Utility Readers
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
