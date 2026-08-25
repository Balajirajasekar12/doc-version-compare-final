// ============================================================
// Requirement → Test Case Generator — Knowledge Extractor
// Extracts structured knowledge from parsed documents.
// Deterministic / rule-based — no AI required.
// ============================================================

import type {
  TcgDocument,
  ParsedContent,
  TextParsedContent,
  SqlParsedContent,
  ImageParsedContent,
  ExtractedKnowledge,
  TestCaseSource,
} from "./types";

let knowledgeIdCounter = 0;
function genKnowledgeId(): string {
  return `ek_${Date.now()}_${++knowledgeIdCounter}`;
}

// --- Main entry: extract knowledge from all parsed documents ---
export function extractKnowledge(documents: TcgDocument[]): ExtractedKnowledge[] {
  const allKnowledge: ExtractedKnowledge[] = [];

  for (const doc of documents) {
    if (!doc.parsedContent || doc.status !== "parsed") continue;

    const content = doc.parsedContent;
    const docId = doc.id;

    if (content.kind === "text") {
      allKnowledge.push(...extractFromText(content, docId, doc.name, doc.category));
    } else if (content.kind === "sql") {
      allKnowledge.push(...extractFromSql(content, docId, doc.name));
    } else if (content.kind === "image") {
      allKnowledge.push(...extractFromImage(content, docId, doc.name));
    }
  }

  return allKnowledge;
}

// ============================================================
// Text Document Analysis
// ============================================================
function extractFromText(
  content: TextParsedContent,
  docId: string,
  docName: string,
  category: string,
): ExtractedKnowledge[] {
  const knowledge: ExtractedKnowledge[] = [];

  // Extract requirement statements from paragraphs
  for (const para of content.paragraphs) {
    const statements = extractRequirementStatements(para);
    for (const stmt of statements) {
      knowledge.push({
        id: genKnowledgeId(),
        documentId: docId,
        sourceRef: `${docName} → paragraph`,
        kind: stmt.kind,
        text: stmt.text,
        confidence: stmt.confidence,
        relatedTables: extractTableRefsFromText(stmt.text),
        relatedFields: extractFieldRefsFromText(stmt.text),
      });
    }
  }

  // Extract from headings as section context
  for (let i = 0; i < content.headings.length; i++) {
    knowledge.push({
      id: genKnowledgeId(),
      documentId: docId,
      sourceRef: `${docName} → heading ${i + 1}`,
      kind: "requirement_statement",
      text: `Section: ${content.headings[i]}`,
      confidence: "high",
      relatedTables: [],
      relatedFields: [],
      sectionRef: content.headings[i],
    });
  }

  // Extract list items as individual requirements/rules
  for (const item of content.lists) {
    const cleaned = item.replace(/^[\-\*\•\▪\➤\→\►\●\○\◆\◇\■\□]\s*/, "").replace(/^\d+[\.\)]\s*/, "");
    const kind = classifyText(cleaned);
    knowledge.push({
      id: genKnowledgeId(),
      documentId: docId,
      sourceRef: `${docName} → list item`,
      kind,
      text: cleaned,
      confidence: "medium",
      relatedTables: extractTableRefsFromText(cleaned),
      relatedFields: extractFieldRefsFromText(cleaned),
    });
  }

  // Extract table data as schema/field information
  for (const table of content.tables) {
    if (table.headers.length > 0) {
      knowledge.push({
        id: genKnowledgeId(),
        documentId: docId,
        sourceRef: `${docName} → table`,
        kind: "schema_info",
        text: `Table headers: ${table.headers.join(", ")}. ${table.rows.length} data rows.`,
        confidence: "high",
        relatedTables: table.headers.filter(h => h.toUpperCase() === h && h.length > 2),
        relatedFields: table.headers,
      });
    }
  }

  return knowledge;
}

// --- Requirement statement extraction ---
interface ExtractedStatement {
  kind: ExtractedKnowledge["kind"];
  text: string;
  confidence: "high" | "medium" | "low";
}

function extractRequirementStatements(text: string): ExtractedStatement[] {
  const statements: ExtractedStatement[] = [];
  const sentences = splitSentences(text);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 10) continue;

    const lower = trimmed.toLowerCase();

    // Functional requirement patterns
    if (/\b(?:shall|must|should|will|needs to|is required to|has to)\b/.test(lower)) {
      statements.push({
        kind: "requirement_statement",
        text: trimmed,
        confidence: "high",
      });
      continue;
    }

    // Validation / business rule patterns
    if (/\b(?:validat|verif|check|ensur|confirm|reject|accept|allow|prevent|restrict|must not|shall not|cannot)\b/.test(lower)) {
      statements.push({
        kind: "validation_rule",
        text: trimmed,
        confidence: "high",
      });
      continue;
    }

    // Error handling patterns
    if (/\b(?:error|exception|fail|invalid|incorrect|wrong|missing|null|empty|timeout|overflow)\b/.test(lower)) {
      statements.push({
        kind: "error_handling",
        text: trimmed,
        confidence: "medium",
      });
      continue;
    }

    // Database interaction patterns
    if (/\b(?:table|column|insert|update|delete|select|query|record|row|database|schema|index|join|constraint|trigger|procedure|function|view)\b/.test(lower)) {
      statements.push({
        kind: "database_interaction",
        text: trimmed,
        confidence: "medium",
      });
      continue;
    }

    // System interaction patterns
    if (/\b(?:api|request|response|service|endpoint|header|payload|message|queue|notification|email|log|audit|session|token|auth)\b/.test(lower)) {
      statements.push({
        kind: "system_interaction",
        text: trimmed,
        confidence: "medium",
      });
      continue;
    }

    // Flow / process patterns
    if (/\b(?:step|process|flow|sequence|first|then|next|after|before|during|when|once|upon|finally)\b/.test(lower)) {
      statements.push({
        kind: "flow_step",
        text: trimmed,
        confidence: "medium",
      });
      continue;
    }

    // Boundary conditions
    if (/\b(?:min|max|maximum|minimum|limit|threshold|range|between|at least|at most|not exceed|greater than|less than|equal|zero|negative|positive)\b/.test(lower)) {
      statements.push({
        kind: "boundary_condition",
        text: trimmed,
        confidence: "medium",
      });
      continue;
    }

    // Input/Output patterns
    if (/\b(?:input|output|display|show|return|render|print|export|import|upload|download|send|receive|display|present|show|list|summary|report|dashboard)\b/.test(lower)) {
      statements.push({
        kind: "input_output",
        text: trimmed,
        confidence: "medium",
      });
      continue;
    }

    // General business rule (anything with conditional logic)
    if (/\b(?:if|when|unless|provided that|in case of|scenario)\b/.test(lower)) {
      statements.push({
        kind: "business_rule",
        text: trimmed,
        confidence: "low",
      });
    }
  }

  return statements;
}

// ============================================================
// SQL Analysis
// ============================================================
function extractFromSql(
  content: SqlParsedContent,
  docId: string,
  docName: string,
): ExtractedKnowledge[] {
  const knowledge: ExtractedKnowledge[] = [];

  // Table definitions → schema knowledge
  for (const table of content.tables) {
    const colDesc = table.columns.map(c => {
      let desc = `${c.name} (${c.dataType})`;
      if (c.isPrimaryKey) desc += " PRIMARY KEY";
      if (!c.nullable) desc += " NOT NULL";
      if (c.isForeignKey) desc += ` REFERENCES ${c.references}`;
      return desc;
    }).join(", ");

    knowledge.push({
      id: genKnowledgeId(),
      documentId: docId,
      sourceRef: `${docName} → CREATE TABLE ${table.name}`,
      kind: "schema_info",
      text: `Table ${table.name} has columns: ${colDesc}. ${table.constraints.length > 0 ? `Constraints: ${table.constraints.join("; ")}` : ""}`,
      confidence: "high",
      relatedTables: [table.name],
      relatedFields: table.columns.map(c => c.name),
    });
  }

  // SELECT statements → read operations / data patterns
  for (const stmt of content.statements) {
    if (stmt.type === "SELECT" && stmt.tables.length > 0) {
      knowledge.push({
        id: genKnowledgeId(),
        documentId: docId,
        sourceRef: `${docName} → SQL SELECT`,
        kind: "database_interaction",
        text: `Query reads from ${stmt.tables.join(", ")}${stmt.conditions.length > 0 ? ` with conditions: ${stmt.conditions.join(" AND ")}` : ""}. ${stmt.columns.length > 0 ? `Selects columns: ${stmt.columns.join(", ")}` : "Selects all columns."}`,
        confidence: "high",
        relatedTables: stmt.tables,
        relatedFields: stmt.columns,
      });
    }

    // INSERT/UPDATE/DELETE → write operations
    if (stmt.type === "INSERT" || stmt.type === "UPDATE" || stmt.type === "DELETE") {
      knowledge.push({
        id: genKnowledgeId(),
        documentId: docId,
        sourceRef: `${docName} → SQL ${stmt.type}`,
        kind: "database_interaction",
        text: `${stmt.type} operation on ${stmt.tables.join(", ")}${stmt.conditions.length > 0 ? ` with conditions: ${stmt.conditions.join(" AND ")}` : ""}.`,
        confidence: "high",
        relatedTables: stmt.tables,
        relatedFields: stmt.columns,
      });
    }

    // CREATE TABLE → schema definition
    if (stmt.type === "CREATE") {
      knowledge.push({
        id: genKnowledgeId(),
        documentId: docId,
        sourceRef: `${docName} → SQL CREATE`,
        kind: "schema_info",
        text: `DDL statement: ${stmt.raw.slice(0, 200)}`,
        confidence: "high",
        relatedTables: stmt.tables,
        relatedFields: stmt.columns,
      });
    }
  }

  // Constraints
  for (const constraint of content.constraints) {
    knowledge.push({
      id: genKnowledgeId(),
      documentId: docId,
      sourceRef: `${docName} → SQL constraint`,
      kind: "constraint",
      text: `${constraint.type} on ${constraint.columns.join(", ")}: ${constraint.definition}`,
      confidence: "high",
      relatedTables: constraint.table ? [constraint.table] : [],
      relatedFields: constraint.columns,
    });
  }

  return knowledge;
}

// ============================================================
// Image Analysis (basic flow extraction)
// ============================================================
function extractFromImage(
  content: ImageParsedContent,
  docId: string,
  docName: string,
): ExtractedKnowledge[] {
  return [{
    id: genKnowledgeId(),
    documentId: docId,
    sourceRef: `${docName} → architecture diagram`,
    kind: "architecture_flow",
    text: `Architecture/design diagram (${content.width}×${content.height}). This diagram may contain system flow, components, decision points, and data flow. Review the diagram for: system components, processing stages, decision points, data flow direction, inputs/outputs, database interactions, and error handling paths.`,
    confidence: "low",
    relatedTables: [],
    relatedFields: [],
  }];
}

// ============================================================
// Text Classification Helpers
// ============================================================
function classifyText(text: string): ExtractedKnowledge["kind"] {
  const lower = text.toLowerCase();
  if (/\b(validat|verif|check|ensur|confirm|reject|must not|shall not)\b/.test(lower)) return "validation_rule";
  if (/\b(error|exception|fail|invalid|null|empty|timeout)\b/.test(lower)) return "error_handling";
  if (/\b(table|column|insert|update|delete|select|query|database|schema)\b/.test(lower)) return "database_interaction";
  if (/\b(api|service|endpoint|request|response|message|queue)\b/.test(lower)) return "system_interaction";
  if (/\b(step|process|flow|sequence|first|then|next|after|before)\b/.test(lower)) return "flow_step";
  if (/\b(input|output|display|show|return|export|import|upload)\b/.test(lower)) return "input_output";
  if (/\b(min|max|limit|threshold|range|between|at least|greater than|less than)\b/.test(lower)) return "boundary_condition";
  if (/\b(if|when|unless|provided that|scenario)\b/.test(lower)) return "business_rule";
  return "requirement_statement";
}

function splitSentences(text: string): string[] {
  // Split on sentence boundaries, keeping the delimiter
  return text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .filter(s => s.trim().length > 5);
}

function extractTableRefsFromText(text: string): string[] {
  const tables = new Set<string>();
  const upper = text.toUpperCase();
  const matches = upper.matchAll(/\b([A-Z][A-Z0-9_]{2,30})\b/g);
  for (const m of matches) {
    const word = m[1];
    // Heuristic: all-caps words that look like table names
    if (/^[A-Z][A-Z0-9_]+$/.test(word) && word.length >= 3 && word.length <= 30) {
      // Exclude common English words
      const excludes = ["THE", "AND", "FOR", "NOT", "BUT", "WAS", "ARE", "HAS", "HAD", "ITS", "ALL", "CAN", "HER", "OUR", "ONE", "ANY", "MAY", "USE", "YES", "WHO", "GET", "NEW", "NOW", "OLD", "SEE", "HOW", "LET", "SAY", "SHE", "TOO", "WAY", "MUST", "SHALL", "WILL", "THIS", "THAT", "WITH", "FROM", "HAVE", "BEEN", "WILL", "DOES", "ONLY", "ALSO", "EACH", "BOTH", "SOME", "WHAT", "WHEN", "TIME", "VERY", "JUST", "BEEN", "INTO", "THAN", "MORE", "MOST", "WELL", "BACK", "MANY", "SUCH", "TAKE", "COME", "COULD", "BEING", "WOULD", "SHOULD", "AFTER", "BELOW", "ABOVE", "WHICH", "WHERE", "THESE", "THOSE", "OTHER", "EACH", "EVERY", "MUST", "SHALL"];
      if (!excludes.includes(word)) {
        tables.add(word);
      }
    }
  }
  return Array.from(tables).slice(0, 5); // Limit to avoid noise
}

function extractFieldRefsFromText(text: string): string[] {
  const fields = new Set<string>();
  // Look for patterns like "column_name" or "Field: value" or camelCase identifiers
  const patterns = [
    /[_][a-z][a-z0-9_]+/gi, // snake_case
    /\b([a-z]+[A-Z][a-z]+(?:[A-Z][a-z]+)*)\b/g, // camelCase
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const m of matches) {
      const field = m[0];
      if (field.length >= 3 && field.length <= 40) {
        fields.add(field);
      }
    }
  }

  return Array.from(fields).slice(0, 10);
}

// ============================================================
// Source/Traceability Builder
// ============================================================
export function buildSources(documents: TcgDocument[]): TestCaseSource[] {
  return documents
    .filter(d => d.status === "parsed")
    .map(d => ({
      documentName: d.name,
      sectionRef: `${d.category} document`,
      kind: d.category as TestCaseSource["kind"],
    }));
}
