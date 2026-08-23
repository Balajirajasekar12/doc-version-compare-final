/**
 * Component Extraction Engine
 *
 * Extracts structured components from uploaded source files.
 * Handles Java, PL/SQL, SQL, Shell, and XML.
 * Returns ExtractedComponent[] with call relationships, table refs, etc.
 */

import type {
  ExtractedComponent,
  ComponentType,
  DependencyEdge,
  EdgeType,
} from "./types";

// ── Helpers ───────────────────────────────────────────────────

let _componentCounter = 0;
function nextId(): string {
  return `comp-${++_componentCounter}`;
}

function makeId(): string {
  return nextId();
}

// Table name extraction from SQL/text
const TABLE_NAME_RE =
  /\b(?:FROM|INTO|UPDATE|JOIN|INSERT\s+INTO|DELETE\s+FROM|MERGE\s+INTO)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)/gi;

function extractTableRefs(text: string): string[] {
  const tables = new Set<string>();
  let m;
  while ((m = TABLE_NAME_RE.exec(text)) !== null) {
    const name = m[1].toUpperCase();
    // Filter common false positives
    if (
      !["THE", "A", "AN", "SET", "WHERE", "AND", "OR", "NOT", "VALUES",
        "SELECT", "DUAL", "NULL", "TRUE", "FALSE", "SYSDATE", "ROWNUM",
        "LEVEL", "CONNECT", "PRIOR", "START", "WITH", "AS", "ON",
        "USING", "NATURAL", "CROSS", "OUTER", "INNER", "LEFT", "RIGHT",
        "FULL", "GROUP", "ORDER", "HAVING", "UNION", "INTERSECT",
        "MINUS", "EXCEPT", "CASE", "WHEN", "THEN", "ELSE", "END",
        "IF", "ELSIF", "LOOP", "EXIT", "FOR", "WHILE", "BEGIN",
        "DECLARE", "EXCEPTION", "RAISE", "RETURN", "CURSOR", "OPEN",
        "CLOSE", "FETCH", "BULK", "COLLECT", "FORALL", "SAVE",
        "EXCEPTIONS", "INTO", "TYPE", "RECORD", "TABLE", "VARRAY",
        "IS", "IN", "OUT", "INOUT", "NOCOPY", "DEFAULT", "CONSTANT",
        "PRAGMA", "AUTONOMOUS", "TRANSACTION", "ABORT", "PIPE",
        "ROW", "SUBTYPE", "AUTHID", "ACCESSIBLE",
      ].includes(name)
    ) {
      tables.add(name);
    }
  }
  return Array.from(tables);
}

// Status/lifecycle code extraction
const STATUS_CODE_RE =
  /\b(?:status|lifecycle|state|phase|code)\s*[=:]\s*['"]?([A-Z][A-Z0-9_-]{1,20})['"]?/gi;

function extractStatusCodes(text: string): string[] {
  const codes = new Set<string>();
  let m;
  while ((m = STATUS_CODE_RE.exec(text)) !== null) {
    if (m[1].length >= 2) codes.add(m[1]);
  }
  return Array.from(codes);
}

// Condition extraction (IF/WHERE/CASE conditions)
const CONDITION_RE =
  /\b(?:IF|ELSIF|ELSE\s+IF|WHERE|WHEN|AND\s+|OR\s+|CASE|HAVING)\s+(.{5,120}?)(?:\bTHEN\b|\bLOOP\b|\bBEGIN\b|\bGROUP\b|\bORDER\b|\bHAVING\b|;|,\s*(?:SELECT|FROM))/gi;

function extractConditions(text: string): string[] {
  const conditions: string[] = [];
  let m;
  while ((m = CONDITION_RE.exec(text)) !== null) {
    const cond = m[1].trim();
    if (cond.length >= 5 && cond.length <= 120) {
      conditions.push(cond);
    }
  }
  return conditions.slice(0, 30); // Cap at 30
}

// External dependency detection
const EXTERNAL_DEP_RE =
  /\b(?:CLOB|RULES_CLOB|RULE_TABLE|CONFIG_TABLE|PARAMETER_TABLE|MASTER_TABLE|REFERENCE_TABLE|LOOKUP_TABLE)\b/gi;

function extractExternalDeps(text: string): string[] {
  const deps = new Set<string>();
  let m;
  while ((m = EXTERNAL_DEP_RE.exec(text)) !== null) {
    deps.add(m[0].toUpperCase());
  }
  return Array.from(deps);
}

// Rule reference detection
const RULE_REF_RE =
  /\b([RDTE]\d{2,4})\b/g;

function extractRuleRefs(text: string): string[] {
  const refs = new Set<string>();
  let m;
  while ((m = RULE_REF_RE.exec(text)) !== null) {
    refs.add(m[1]);
  }
  return Array.from(refs);
}

// ── Java Extraction ───────────────────────────────────────────

function extractJavaComponents(
  content: string,
  fileId: string,
  fileName: string,
  sourceType: "LEGACY" | "MOD",
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const lines = content.split("\n");

  // Class/interface/enum declarations
  const classRe =
    /(?:public|private|protected)?\s*(?:abstract\s+|final\s+|static\s+)*(class|interface|enum)\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?/g;

  let m;
  while ((m = classRe.exec(content)) !== null) {
    const type = m[1].toUpperCase() as ComponentType;
    const name = m[2];
    const lineNum = content.substring(0, m.index).split("\n").length;

    // Extract annotations for this class
    const preceding = content.substring(Math.max(0, m.index - 500), m.index);
    const annotations = [...preceding.matchAll(/@(\w+)/g)].map((a) => a[1]);

    // Determine if it's a Spring component
    const isSpringBatch = annotations.some((a) =>
      ["JobConfiguration", "StepConfiguration", "BatchConfiguration"].includes(a),
    );
    const isService = annotations.includes("Service");
    const isRepository = annotations.includes("Repository");
    const isController = annotations.includes("Controller");
    const isProcessor = name.includes("Processor");
    const isWriter = name.includes("Writer");
    const isReader = name.includes("Reader");
    const isJob = name.includes("Job") || annotations.includes("Scheduled");

    let effectiveType: ComponentType = type;
    if (isJob) effectiveType = "JOB";
    else if (isService) effectiveType = "SERVICE";
    else if (isRepository) effectiveType = "REPOSITORY";
    else if (isController) effectiveType = "CONTROLLER";
    else if (isProcessor) effectiveType = "PROCESSOR";
    else if (isWriter) effectiveType = "WRITER";
    else if (isReader) effectiveType = "READER";

    const bodyMatch = content.substring(m.index).match(/\{/);
    const bodyStart = bodyMatch ? m.index + bodyMatch.index! : m.index;
    // Find matching closing brace (simplified)
    let depth = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < content.length; i++) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    const bodyText = content.substring(bodyStart, bodyEnd + 1);

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: effectiveType,
      name,
      qualifiedName: name,
      lineStart: lineNum,
      lineEnd: content.substring(0, bodyEnd).split("\n").length,
      tableRefs: extractTableRefs(bodyText),
      callRefs: [...bodyText.matchAll(/\b(\w+)\.\w+\(/g)].map((c) => c[1]).filter((c) => c !== name && c !== "this" && c !== "super" && c !== "ctx" && c !== "db"),
      conditions: extractConditions(bodyText),
      statusCodes: extractStatusCodes(bodyText),
      externalDeps: extractExternalDeps(bodyText),
      inputs: [...bodyText.matchAll(/(?:input|request|param|arg|payload)\w*\s*[:=]\s*(\w+)/gi)].map((i) => i[1]),
      outputs: [...bodyText.matchAll(/(?:output|response|result|return)\w*\s*[:=]\s*(\w+)/gi)].map((o) => o[1]),
      annotations,
      imports: content.match(/^import\s+[\w.]+;/gm)?.map((i) => i.replace("import ", "").replace(";", "")) || [],
      sqlSnippets: [...bodyText.matchAll(/["']([^"']*(?:SELECT|INSERT|UPDATE|DELETE|MERGE)[^"']*)["']/gi)].map((s) => s[1]),
      ruleRefs: extractRuleRefs(bodyText),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "HIGH",
    });
  }

  // Method extraction within classes
  const methodRe =
    /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(\w+(?:<[\w,\s?]+>)?)\s+(\w+)\s*\(([^)]*)\)/g;

  while ((m = methodRe.exec(content)) !== null) {
    const returnType = m[1];
    const methodName = m[2];
    const params = m[3];
    const lineNum = content.substring(0, m.index).split("\n").length;

    // Skip if inside a class we already captured
    const lineText = lines[lineNum - 1] || "";
    if (lineText.includes("@Override") || lineText.includes("@Test")) {
      // Still include test methods
    }

    const bodyMatch = content.substring(m.index).match(/\{/);
    if (!bodyMatch) continue;
    const bodyStart = m.index + bodyMatch.index!;
    let depth = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < content.length; i++) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") {
        depth--;
        if (depth === 0) { bodyEnd = i; break; }
      }
    }
    const bodyText = content.substring(bodyStart, bodyEnd + 1);

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "METHOD",
      name: methodName,
      qualifiedName: methodName,
      lineStart: lineNum,
      lineEnd: content.substring(0, bodyEnd).split("\n").length,
      tableRefs: extractTableRefs(bodyText),
      callRefs: [...bodyText.matchAll(/\b(\w+)\.\w+\(/g)].map((c) => c[1]).filter((c) => c !== methodName),
      conditions: extractConditions(bodyText),
      statusCodes: extractStatusCodes(bodyText),
      externalDeps: extractExternalDeps(bodyText),
      inputs: params.split(",").map((p) => p.trim().split(/\s+/).pop() || "").filter(Boolean),
      outputs: returnType !== "void" ? [returnType] : [],
      annotations: [],
      imports: [],
      sqlSnippets: [...bodyText.matchAll(/["']([^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*)["']/gi)].map((s) => s[1]),
      ruleRefs: extractRuleRefs(bodyText),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "HIGH",
    });
  }

  return components;
}

// ── PL/SQL Extraction ─────────────────────────────────────────

function extractPLSQLComponents(
  content: string,
  fileId: string,
  fileName: string,
  sourceType: "LEGACY" | "MOD",
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const lines = content.split("\n");

  // Package spec
  const pkgRe = /CREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE\s+(?:BODY\s+)?(\w+)/gi;
  let m;
  while ((m = pkgRe.exec(content)) !== null) {
    const pkgName = m[1];
    const lineNum = content.substring(0, m.index).split("\n").length;
    const isBody = content.substring(m.index, m.index + 100).includes("PACKAGE BODY");

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "PACKAGE",
      name: pkgName,
      qualifiedName: pkgName,
      lineStart: lineNum,
      lineEnd: lineNum,
      tableRefs: extractTableRefs(content.substring(m.index)),
      callRefs: [],
      conditions: [],
      statusCodes: extractStatusCodes(content.substring(m.index)),
      externalDeps: extractExternalDeps(content.substring(m.index)),
      inputs: [],
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [],
      ruleRefs: extractRuleRefs(content.substring(m.index)),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: isBody ? "HIGH" : "MEDIUM",
    });
  }

  // Procedures
  const procRe = /(?:CREATE\s+(?:OR\s+REPLACE\s+))?PROCEDURE\s+(\w+)\s*(?:\(([^)]*)\))?/gi;
  while ((m = procRe.exec(content)) !== null) {
    const procName = m[1];
    const params = m[2] || "";
    const lineNum = content.substring(0, m.index).split("\n").length;

    // Find procedure body
    const bodyStart = content.indexOf("IS", m.index + m[0].length);
    if (bodyStart < 0) continue;
    const bodyEndIdx = content.indexOf("END\s+" + procName, bodyStart);
    const bodyText = bodyEndIdx > bodyStart
      ? content.substring(bodyStart, bodyEndIdx)
      : content.substring(bodyStart, bodyStart + 5000);

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "PROCEDURE",
      name: procName,
      qualifiedName: procName,
      lineStart: lineNum,
      lineEnd: bodyEndIdx > bodyStart
        ? content.substring(0, bodyEndIdx).split("\n").length
        : lineNum + 20,
      tableRefs: extractTableRefs(bodyText),
      callRefs: [...bodyText.matchAll(/\b(\w+)\.\w+/g)].map((c) => c[1]).filter((c) => c !== procName && !["DBMS", "SQL", "UTL", "PIPE", "Oracle"].includes(c)),
      conditions: extractConditions(bodyText),
      statusCodes: extractStatusCodes(bodyText),
      externalDeps: extractExternalDeps(bodyText),
      inputs: params.split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean),
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [...bodyText.matchAll(/(["'])(SELECT[^"']*?)\1/gi)].map((s) => s[2]),
      ruleRefs: extractRuleRefs(bodyText),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "HIGH",
    });
  }

  // Functions
  const funcRe = /(?:CREATE\s+(?:OR\s+REPLACE\s+))?FUNCTION\s+(\w+)\s*(?:\(([^)]*)\))?\s*RETURN\s+\w+/gi;
  while ((m = funcRe.exec(content)) !== null) {
    const funcName = m[1];
    const params = m[2] || "";
    const lineNum = content.substring(0, m.index).split("\n").length;

    const bodyStart = content.indexOf("IS", m.index + m[0].length);
    if (bodyStart < 0) continue;
    const bodyText = content.substring(bodyStart, bodyStart + 5000);

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "FUNCTION",
      name: funcName,
      qualifiedName: funcName,
      lineStart: lineNum,
      lineEnd: lineNum + 20,
      tableRefs: extractTableRefs(bodyText),
      callRefs: [...bodyText.matchAll(/\b(\w+)\.\w+/g)].map((c) => c[1]).filter((c) => c !== funcName),
      conditions: extractConditions(bodyText),
      statusCodes: extractStatusCodes(bodyText),
      externalDeps: extractExternalDeps(bodyText),
      inputs: params.split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean),
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [...bodyText.matchAll(/(["'])(SELECT[^"']*?)\1/gi)].map((s) => s[2]),
      ruleRefs: extractRuleRefs(bodyText),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "HIGH",
    });
  }

  // Triggers
  const triggerRe = /(?:CREATE\s+(?:OR\s+REPLACE\s+))?TRIGGER\s+(\w+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+(\w+(?:\s+OR\s+\w+)*)\s+ON\s+(\w+)/gi;
  while ((m = triggerRe.exec(content)) !== null) {
    const trigName = m[1];
    const timing = m[2];
    const event = m[3];
    const tableName = m[4];
    const lineNum = content.substring(0, m.index).split("\n").length;

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "TRIGGER",
      name: trigName,
      qualifiedName: trigName,
      lineStart: lineNum,
      lineEnd: lineNum + 20,
      tableRefs: [tableName.toUpperCase()],
      callRefs: [],
      conditions: [`${timing} ${event} ON ${tableName}`],
      statusCodes: extractStatusCodes(content.substring(m.index, m.index + 2000)),
      externalDeps: extractExternalDeps(content.substring(m.index, m.index + 2000)),
      inputs: [],
      outputs: [tableName.toUpperCase()],
      annotations: [],
      imports: [],
      sqlSnippets: [],
      ruleRefs: extractRuleRefs(content.substring(m.index, m.index + 2000)),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "HIGH",
    });
  }

  return components;
}

// ── SQL Extraction ────────────────────────────────────────────

function extractSQLComponents(
  content: string,
  fileId: string,
  fileName: string,
  sourceType: "LEGACY" | "MOD",
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const statements = content.split(/;\s*\n/);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (stmt.length < 10) continue;

    const upper = stmt.toUpperCase();
    let type: ComponentType = "SQL_QUERY";
    let name = `statement_${i + 1}`;

    if (upper.startsWith("CREATE TABLE")) {
      type = "TABLE";
      name = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i)?.[1] || name;
    } else if (upper.startsWith("CREATE VIEW")) {
      type = "VIEW";
      name = stmt.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(\w+)/i)?.[1] || name;
    } else if (upper.startsWith("CREATE INDEX")) {
      type = "INDEX";
      name = stmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)/i)?.[1] || name;
    } else if (upper.startsWith("CREATE SEQUENCE")) {
      type = "SEQUENCE";
      name = stmt.match(/CREATE\s+SEQUENCE\s+(\w+)/i)?.[1] || name;
    } else if (upper.startsWith("MERGE")) {
      name = stmt.match(/MERGE\s+INTO\s+(\w+)/i)?.[1] || name;
    } else if (upper.startsWith("INSERT")) {
      name = "INSERT_" + (stmt.match(/INTO\s+(\w+)/i)?.[1] || `${i + 1}`);
    } else if (upper.startsWith("UPDATE")) {
      name = "UPDATE_" + (stmt.match(/UPDATE\s+(\w+)/i)?.[1] || `${i + 1}`);
    } else if (upper.startsWith("DELETE")) {
      name = "DELETE_" + (stmt.match(/FROM\s+(\w+)/i)?.[1] || `${i + 1}`);
    } else if (upper.startsWith("SELECT")) {
      name = "SELECT_" + (stmt.match(/FROM\s+(\w+)/i)?.[1] || `${i + 1}`);
    }

    const lineStart = content.substring(0, content.indexOf(stmt)).split("\n").length;

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: type,
      name,
      qualifiedName: name,
      lineStart,
      lineEnd: lineStart + stmt.split("\n").length,
      tableRefs: extractTableRefs(stmt),
      callRefs: [],
      conditions: extractConditions(stmt),
      statusCodes: extractStatusCodes(stmt),
      externalDeps: extractExternalDeps(stmt),
      inputs: [],
      outputs: extractTableRefs(stmt),
      annotations: [],
      imports: [],
      sqlSnippets: [],
      ruleRefs: extractRuleRefs(stmt),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "MEDIUM",
    });
  }

  return components;
}

// ── Shell Extraction ──────────────────────────────────────────

function extractShellComponents(
  content: string,
  fileId: string,
  fileName: string,
  sourceType: "LEGACY" | "MOD",
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const lines = content.split("\n");

  // Function definitions
  const funcRe = /^(\w+)\s*\(\)\s*\{/gm;
  let m;
  while ((m = funcRe.exec(content)) !== null) {
    const funcName = m[1];
    const lineNum = content.substring(0, m.index).split("\n").length;
    const bodyEnd = content.indexOf("\n}", m.index);
    const bodyText = bodyEnd > m.index
      ? content.substring(m.index, bodyEnd)
      : content.substring(m.index, m.index + 3000);

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "SHELL_FUNCTION",
      name: funcName,
      qualifiedName: funcName,
      lineStart: lineNum,
      lineEnd: bodyEnd > m.index ? content.substring(0, bodyEnd).split("\n").length : lineNum + 20,
      tableRefs: extractTableRefs(bodyText),
      callRefs: [...bodyText.matchAll(/\b(\w+)\b/g)].map((c) => c[1]).filter(
        (c) => c !== funcName && !["if", "then", "else", "fi", "do", "done", "for", "while", "case", "esac", "echo", "grep", "awk", "sed", "cat", "cd", "ls", "mkdir", "rm", "cp", "mv", "chmod", "exit", "return", "local", "export", "set", "source", "java", "jar"].includes(c),
      ),
      conditions: extractConditions(bodyText),
      statusCodes: extractStatusCodes(bodyText),
      externalDeps: extractExternalDeps(bodyText),
      inputs: [],
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [...bodyText.matchAll(/(["'])([^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*)\1/gi)].map((s) => s[2]),
      ruleRefs: extractRuleRefs(bodyText),
      embeddedRefs: [...bodyText.matchAll(/\bjava\s+-jar\s+(\S+)/g)].map((j) => j[1]),
      xmlRefs: [...bodyText.matchAll(/CONTROL-M|ctm-run|ctm-run-job/gi)].map((c) => c[0]),
      extractionConfidence: "HIGH",
    });
  }

  // Script-level analysis
  if (components.length === 0 && content.trim().length > 20) {
    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "SHELL_SCRIPT",
      name: fileName,
      qualifiedName: fileName,
      lineStart: 1,
      lineEnd: lines.length,
      tableRefs: extractTableRefs(content),
      callRefs: [...content.matchAll(/\bjava\s+-jar\s+(\S+)/g)].map((j) => j[1]),
      conditions: extractConditions(content),
      statusCodes: extractStatusCodes(content),
      externalDeps: extractExternalDeps(content),
      inputs: [],
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [...content.matchAll(/(["'])([^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*)\1/gi)].map((s) => s[2]),
      ruleRefs: extractRuleRefs(content),
      embeddedRefs: [...content.matchAll(/\bjava\s+-jar\s+(\S+)/g)].map((j) => j[1]),
      xmlRefs: [],
      extractionConfidence: "MEDIUM",
    });
  }

  return components;
}

// ── XML Extraction ────────────────────────────────────────────

function extractXMLComponents(
  content: string,
  fileId: string,
  fileName: string,
  sourceType: "LEGACY" | "MOD",
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];

  // Spring beans
  const beanRe = /<bean\s+id=["']([^"']+)["']\s+class=["']([^"']+)["']/g;
  let m;
  while ((m = beanRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length;
    const className = m[2].split(".").pop() || m[2];

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "BEAN",
      name: m[1],
      qualifiedName: m[2],
      lineStart: lineNum,
      lineEnd: lineNum,
      tableRefs: extractTableRefs(content.substring(m.index, m.index + 500)),
      callRefs: [],
      conditions: [],
      statusCodes: [],
      externalDeps: [],
      inputs: [],
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [...content.substring(m.index, m.index + 1000).matchAll(/<value[^>]*>([^<]*(?:SELECT|INSERT|UPDATE|DELETE)[^<]*)<\/value>/gi)].map((s) => s[1]),
      ruleRefs: [],
      embeddedRefs: [],
      xmlRefs: [m[2]],
      extractionConfidence: "HIGH",
    });
  }

  // Spring Batch job
  const jobRe = /<job\s+id=["']([^"']+)["']/g;
  while ((m = jobRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length;
    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "JOB",
      name: m[1],
      qualifiedName: m[1],
      lineStart: lineNum,
      lineEnd: lineNum,
      tableRefs: [],
      callRefs: [],
      conditions: [],
      statusCodes: [],
      externalDeps: [],
      inputs: [],
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [],
      ruleRefs: [],
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "HIGH",
    });
  }

  // MyBatis SQL
  const mybatisRe = /<select|<insert|<update|<delete|<statement|<resultMap/gi;
  while ((m = mybatisRe.exec(content)) !== null) {
    const tag = m[0].substring(1);
    const idMatch = content.substring(m.index).match(/id=["']([^"']+)["']/);
    const lineNum = content.substring(0, m.index).split("\n").length;
    const endTag = `</${tag}>`;
    const endIdx = content.indexOf(endTag, m.index);
    const bodyText = endIdx > m.index ? content.substring(m.index, endIdx) : content.substring(m.index, m.index + 2000);

    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "SQL_QUERY",
      name: idMatch?.[1] || `${tag}_${components.length}`,
      qualifiedName: idMatch?.[1] || tag,
      lineStart: lineNum,
      lineEnd: endIdx > lineNum ? content.substring(0, endIdx).split("\n").length : lineNum + 5,
      tableRefs: extractTableRefs(bodyText),
      callRefs: [],
      conditions: extractConditions(bodyText),
      statusCodes: extractStatusCodes(bodyText),
      externalDeps: extractExternalDeps(bodyText),
      inputs: [...bodyText.matchAll(/#\{(\w+)}/g)].map((p) => p[1]),
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [],
      ruleRefs: extractRuleRefs(bodyText),
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "MEDIUM",
    });
  }

  // Control-M job definitions
  const ctmRe = /<OJOB|<JOB|<BOX/g;
  while ((m = ctmRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length;
    const nameMatch = content.substring(m.index).match(/JOBNAME=["']([^"']+)["']/);
    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "JOB",
      name: nameMatch?.[1] || `CTM_Job_${components.length}`,
      qualifiedName: nameMatch?.[1] || `CTM_Job`,
      lineStart: lineNum,
      lineEnd: lineNum + 5,
      tableRefs: [],
      callRefs: [],
      conditions: [],
      statusCodes: [],
      externalDeps: ["CONTROL-M"],
      inputs: [],
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [],
      ruleRefs: [],
      embeddedRefs: [],
      xmlRefs: ["CONTROL-M"],
      extractionConfidence: "HIGH",
    });
  }

  // Maven/Gradle dependencies
  const depRe = /<dependency>[\s\S]*?<groupId>([\w.]+)<\/groupId>[\s\S]*?<artifactId>([\w.-]+)<\/artifactId>/g;
  while ((m = depRe.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split("\n").length;
    components.push({
      id: makeId(),
      fileId,
      fileName,
      sourceType,
      componentType: "UNKNOWN",
      name: `${m[1]}:${m[2]}`,
      qualifiedName: `${m[1]}:${m[2]}`,
      lineStart: lineNum,
      lineEnd: lineNum,
      tableRefs: [],
      callRefs: [],
      conditions: [],
      statusCodes: [],
      externalDeps: [`${m[1]}:${m[2]}`],
      inputs: [],
      outputs: [],
      annotations: [],
      imports: [],
      sqlSnippets: [],
      ruleRefs: [],
      embeddedRefs: [],
      xmlRefs: [],
      extractionConfidence: "HIGH",
    });
  }

  return components;
}

// ── Main Entry Point ──────────────────────────────────────────

export function extractComponents(
  fileId: string,
  fileName: string,
  content: string,
  sourceType: "LEGACY" | "MOD",
  language: string,
): ExtractedComponent[] {
  const lang = language.toLowerCase();

  if (lang === "java") {
    return extractJavaComponents(content, fileId, fileName, sourceType);
  }
  if (lang === "plsql" || lang === "pl/sql") {
    return extractPLSQLComponents(content, fileId, fileName, sourceType);
  }
  if (lang === "sql") {
    return extractSQLComponents(content, fileId, fileName, sourceType);
  }
  if (lang === "shell" || lang === "bash" || lang === "sh") {
    return extractShellComponents(content, fileId, fileName, sourceType);
  }
  if (lang === "xml") {
    return extractXMLComponents(content, fileId, fileName, sourceType);
  }

  // Fallback: try to detect language from content
  const upper = content.toUpperCase();
  if (upper.includes("CREATE PACKAGE") || upper.includes("BEGIN") && upper.includes("END;")) {
    return extractPLSQLComponents(content, fileId, fileName, sourceType);
  }
  if (upper.includes("CREATE TABLE") || upper.includes("SELECT") && upper.includes("FROM")) {
    return extractSQLComponents(content, fileId, fileName, sourceType);
  }
  if (upper.includes("CLASS ") || upper.includes("PUBLIC ") && upper.includes("VOID ")) {
    return extractJavaComponents(content, fileId, fileName, sourceType);
  }
  if (content.startsWith("#!/bin/bash") || content.startsWith("#!/bin/sh")) {
    return extractShellComponents(content, fileId, fileName, sourceType);
  }
  if (content.trimStart().startsWith("<")) {
    return extractXMLComponents(content, fileId, fileName, sourceType);
  }

  // Empty result for unrecognized
  return [];
}

// ── Dependency Edge Building ──────────────────────────────────

export function buildDependencyEdges(
  components: ExtractedComponent[],
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const compNames = new Set(components.map((c) => c.name.toUpperCase()));

  for (const comp of components) {
    // CALLS edges
    for (const callRef of comp.callRefs) {
      const target = components.find(
        (c) => c.name.toUpperCase() === callRef.toUpperCase() && c.fileId !== comp.fileId,
      );
      if (target) {
        edges.push({
          sourceId: comp.id,
          targetId: target.id,
          edgeType: "CALLS",
          evidence: `${comp.name} calls ${target.name} (${comp.fileName})`,
        });
      }
    }

    // READS edges (from table refs in SELECT/FROM/JOIN)
    for (const tableRef of comp.tableRefs) {
      const tableComp = components.find(
        (c) =>
          c.name.toUpperCase() === tableRef &&
          (c.componentType === "TABLE" || c.componentType === "VIEW"),
      );
      if (tableComp) {
        edges.push({
          sourceId: comp.id,
          targetId: tableComp.id,
          edgeType: "READS",
          evidence: `${comp.name} reads ${tableComp.name}`,
        });
      }
    }

    // WRITES edges (from INSERT/UPDATE/DELETE targets)
    if (
      comp.componentType === "SQL_QUERY" &&
      (comp.name.startsWith("INSERT_") || comp.name.startsWith("UPDATE_") || comp.name.startsWith("DELETE_") || comp.name.startsWith("MERGE_"))
    ) {
      for (const tableRef of comp.tableRefs) {
        edges.push({
          sourceId: comp.id,
          targetId: tableRef,
          edgeType: "WRITES",
          evidence: `${comp.name} writes to ${tableRef}`,
        });
      }
    }

    // TRIGGERS edges
    if (comp.componentType === "TRIGGER") {
      for (const tableRef of comp.tableRefs) {
        edges.push({
          sourceId: comp.id,
          targetId: tableRef,
          edgeType: "TRIGGERS",
          evidence: `${comp.name} triggers on ${tableRef}`,
        });
      }
    }
  }

  return edges;
}

// ── Reset counter (for testing) ───────────────────────────────

export function resetExtractionCounter(): void {
  _componentCounter = 0;
}
