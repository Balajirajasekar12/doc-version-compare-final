// ============================================================================
// MIPTE Java Analyzer — Extracts classes, methods, annotations, SQL, tables,
// Spring Batch components, dependencies, and conditional logic.
// ============================================================================

import type {
  AnalyzerFn,
  AnalysisResult,
  Entity,
  TableReference,
  CodeDependency,
} from "./types";
import { buildSummary } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushEntity(
  entities: Entity[],
  e: Omit<Entity, "metadata"> & { metadata?: Record<string, unknown> },
) {
  entities.push(e);
}

function extractStringLiterals(code: string): string[] {
  const matches: string[] = [];
  // Java string literals — handle escaped quotes
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function extractSqlFromStrings(code: string): string[] {
  const literals = extractStringLiterals(code);
  const keywords =
    /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INTO|VALUES|SET|MERGE|CREATE|ALTER|DROP|TABLE|VIEW)\b/i;
  return literals.filter((s) => keywords.test(s));
}

function extractTableNamesFromSql(sql: string): string[] {
  const tables: string[] = [];
  const seen = new Set<string>();
  // FROM table / JOIN table / INTO table / UPDATE table / DELETE FROM table
  const patterns = [
    /\bFROM\s+(?:[A-Z_]\w*\.)?([A-Z_]\w*)/gi,
    /\bJOIN\s+(?:[A-Z_]\w*\.)?([A-Z_]\w*)/gi,
    /\bINTO\s+(?:[A-Z_]\w*\.)?([A-Z_]\w*)/gi,
    /\bUPDATE\s+(?:[A-Z_]\w*\.)?([A-Z_]\w*)/gi,
    /\bDELETE\s+FROM\s+(?:[A-Z_]\w*\.)?([A-Z_]\w*)/gi,
    /\bTABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[A-Z_]\w*\.)?([A-Z_]\w*)/gi,
    /\bVIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[A-Z_]\w*\.)?([A-Z_]\w*)/gi,
    /@Table\s*\(\s*(?:name|value)\s*=\s*"([^"]+)"/gi,
  ];
  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(sql)) !== null) {
      const name = m[1].toUpperCase();
      if (!seen.has(name)) {
        seen.add(name);
        tables.push(name);
      }
    }
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Main Analyzer
// ---------------------------------------------------------------------------

export const analyzeJava: AnalyzerFn = (content, fileName) => {
  const lines = content.split("\n");
  const entities: Entity[] = [];
  const tablesReferenced: TableReference[] = [];
  const dependencies: CodeDependency[] = [];
  const seenTables = new Set<string>();

  // --- Package declaration ---
  for (let i = 0; i < lines.length; i++) {
    const pkgMatch = lines[i].match(/^\s*package\s+([\w.]+)\s*;/);
    if (pkgMatch) {
      pushEntity(entities, {
        type: "package",
        name: pkgMatch[1],
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Imports ---
  for (let i = 0; i < lines.length; i++) {
    const impMatch = lines[i].match(
      /^\s*import\s+(static\s+)?([\w.*]+)\s*;/,
    );
    if (impMatch) {
      const isStatic = !!impMatch[1];
      const importPath = impMatch[2];
      pushEntity(entities, {
        type: "import",
        name: importPath,
        subType: isStatic ? "static" : "regular",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
      dependencies.push({
        type: "imports",
        source: fileName,
        target: importPath,
        lineStart: i + 1,
        lineEnd: i + 1,
      });
    }
  }

  // --- Annotations (collect preceding annotations for classes/methods) ---
  function collectAnnotations(lineIndex: number): string[] {
    const annotations: string[] = [];
    let j = lineIndex;
    while (j >= 0) {
      const annMatch = lines[j]?.match(/^\s*@(\w+)/);
      if (annMatch) {
        annotations.unshift(annMatch[1]);
        j--;
      } else if (lines[j]?.trim() === "" || lines[j]?.match(/^\s*\/[\/\*]/)) {
        j--;
      } else {
        break;
      }
    }
    return annotations;
  }

  // --- Class / Interface / Enum declarations ---
  for (let i = 0; i < lines.length; i++) {
    const classMatch = lines[i].match(
      /^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+|static\s+)*(class|interface|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{?/,
    );
    if (classMatch) {
      const kind = classMatch[1];
      const name = classMatch[2];
      const extendsClass = classMatch[3];
      const implementsIfaces = classMatch[4];
      const annotations = collectAnnotations(i);
      const modifiers = lines[i]
        .match(
          /\b(public|private|protected|abstract|final|static|sealed)\b/g,
        )
        ?.filter(Boolean) || [];

      // Find closing brace
      let depth = 0;
      let endLine = i;
      let started = false;
      for (let k = i; k < lines.length; k++) {
        for (const ch of lines[k]) {
          if (ch === "{") { depth++; started = true; }
          if (ch === "}") depth--;
        }
        if (started && depth <= 0) {
          endLine = k;
          break;
        }
      }

      pushEntity(entities, {
        type: kind as "class" | "interface" | "enum",
        name,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: lines[i].trim(),
        annotations,
        modifiers,
        metadata: { extends: extendsClass, implements: implementsIfaces?.split(",").map(s => s.trim()) },
      });

      if (extendsClass) {
        dependencies.push({
          type: "extends_class",
          source: name,
          target: extendsClass,
          lineStart: i + 1,
          lineEnd: i + 1,
        });
      }
      if (implementsIfaces) {
        for (const iface of implementsIfaces.split(",")) {
          const trimmed = iface.trim();
          if (trimmed) {
            dependencies.push({
              type: "implements_interface",
              source: name,
              target: trimmed,
              lineStart: i + 1,
              lineEnd: i + 1,
            });
          }
        }
      }

      // Detect Spring stereotypes
      const springAnnotations = ["Service", "Repository", "Controller", "RestController", "Component", "Configuration"];
      for (const ann of annotations) {
        if (springAnnotations.includes(ann)) {
          dependencies.push({
            type: "annotated_with",
            source: name,
            target: `@${ann}`,
            lineStart: i + 1,
            lineEnd: i + 1,
          });
        }
      }
    }
  }

  // --- Methods and constructors ---
  // Match lines that look like method/constructor declarations
  const methodRe =
    /^\s*((?:@\w+(?:\(.*?\))?\s+)*)?\s*(?:public|private|protected|static|final|abstract|synchronized|native)\s+(?:<[^>]+>\s+)?(\w[\w<>\[\]?,\s]*?)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/;
  const constructorRe =
    /^\s*((?:@\w+(?:\(.*?\))?\s+)*)?\s*(?:public|private|protected)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/;

  for (let i = 0; i < lines.length; i++) {
    // Method
    const mMatch = lines[i].match(methodRe);
    if (mMatch) {
      const annotations = collectAnnotations(i);
      const name = mMatch[3];
      const returnType = mMatch[2];
      const modifiers = lines[i]
        .match(/\b(public|private|protected|static|final|abstract|synchronized|native)\b/g)
        ?.filter(Boolean) || [];

      // Find method end
      let depth = 0;
      let endLine = i;
      let started = false;
      for (let k = i; k < Math.min(i + 200, lines.length); k++) {
        for (const ch of lines[k]) {
          if (ch === "{") { depth++; started = true; }
          if (ch === "}") depth--;
        }
        if (started && depth <= 0) { endLine = k; break; }
      }

      // Check for Spring Batch annotations
      const isBatchReader = annotations.some(a => /Reader|ItemReader/i.test(a));
      const isBatchWriter = annotations.some(a => /Writer|ItemWriter/i.test(a));
      const isBatchProcessor = annotations.some(a => /Processor|ItemProcessor/i.test(a));
      const isJobOrStep = annotations.some(a => /Job|Step|JobListener|StepListener/i.test(a));

      pushEntity(entities, {
        type: "method",
        name,
        subType: isBatchReader ? "batch_reader" : isBatchWriter ? "batch_writer" : isBatchProcessor ? "batch_processor" : isJobOrStep ? "batch_step" : "method",
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: `${returnType} ${name}(...)`.trim(),
        annotations,
        modifiers,
        metadata: { returnType },
      });

      // Check for SQL in method body
      const methodBody = lines.slice(i, endLine + 1).join("\n");
      const sqlStrings = extractSqlFromStrings(methodBody);
      for (const sql of sqlStrings) {
        const tableNames = extractTableNamesFromSql(sql);
        for (const tName of tableNames) {
          const op = sql.match(/\b(SELECT|INSERT|UPDATE|DELETE)\b/i)?.[1]?.toUpperCase() || "REFERENCE";
          if (!seenTables.has(`${tName}:${op}`)) {
            seenTables.add(`${tName}:${op}`);
            tablesReferenced.push({
              name: tName,
              operation: op as TableReference["operation"],
              lineStart: i + 1,
              lineEnd: endLine + 1,
              isView: false,
            });
            dependencies.push({
              type: op === "SELECT" ? "reads_table" : "writes_table",
              source: name,
              target: tName,
              lineStart: i + 1,
              lineEnd: endLine + 1,
              evidence: sql.slice(0, 200),
            });
          }
        }
      }

      // Detect procedure/function calls (CamelCase method calls on objects)
      const callMatches = methodBody.matchAll(/\b(\w+)\.(\w+)\s*\(/g);
      for (const cm of callMatches) {
        const caller = cm[1];
        const callee = cm[2];
        if (callee.length > 2 && callee[0] === callee[0].toUpperCase()) {
          // Potential class method call — add as a dependency if caller looks like an injected field
          dependencies.push({
            type: "calls",
            source: name,
            target: `${caller}.${callee}`,
            lineStart: i + 1,
            lineEnd: endLine + 1,
          });
        }
      }

      i = endLine;
      continue;
    }

    // Constructor
    const cMatch = lines[i].match(constructorRe);
    if (cMatch && !mMatch) {
      const name = cMatch[2];
      let depth = 0;
      let endLine = i;
      let started = false;
      for (let k = i; k < Math.min(i + 200, lines.length); k++) {
        for (const ch of lines[k]) {
          if (ch === "{") { depth++; started = true; }
          if (ch === "}") depth--;
        }
        if (started && depth <= 0) { endLine = k; break; }
      }

      pushEntity(entities, {
        type: "constructor",
        name,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: `${name}(...)`,
      });
      i = endLine;
    }
  }

  // --- @Autowired / @Value fields ---
  for (let i = 0; i < lines.length; i++) {
    const fieldMatch = lines[i].match(
      /^\s*((?:@\w+(?:\(.*?\))?\s+)*)\s*(?:private|protected|public|final)?\s*(\w[\w<>\[\]?,.\s]*?)\s+(\w+)\s*[;=]/,
    );
    if (fieldMatch) {
      const annotations = collectAnnotations(i);
      if (annotations.some((a) => ["Autowired", "Value", "Inject"].includes(a))) {
        pushEntity(entities, {
          type: "field",
          name: fieldMatch[3],
          subType: annotations.includes("Value") ? "config_value" : "injected_dependency",
          lineStart: i + 1,
          lineEnd: i + 1,
          signature: lines[i].trim(),
          annotations,
          metadata: { fieldType: fieldMatch[2] },
        });
      }
    }
  }

  // --- Try/catch blocks ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/\btry\s*\{/)) {
      let depth = 0;
      let endLine = i;
      let started = false;
      for (let k = i; k < Math.min(i + 300, lines.length); k++) {
        for (const ch of lines[k]) {
          if (ch === "{") { depth++; started = true; }
          if (ch === "}") depth--;
        }
        if (started && depth <= 0) { endLine = k; break; }
      }
      pushEntity(entities, {
        type: "try_catch",
        name: "try-catch",
        lineStart: i + 1,
        lineEnd: endLine + 1,
      });
    }
  }

  // --- Conditional branches ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*(if|else\s+if)\s*\(/)) {
      pushEntity(entities, {
        type: "conditional",
        name: lines[i].match(/if\s*\((.+)\)/)?.[1]?.slice(0, 80) || "condition",
        subType: lines[i].trim().startsWith("else") ? "else_if" : "if",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*switch\s*\(/)) {
      pushEntity(entities, {
        type: "conditional",
        name: lines[i].match(/switch\s*\((.+)\)/)?.[1]?.slice(0, 80) || "switch",
        subType: "switch",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Top-level SQL string table extraction (outside methods) ---
  const sqlStrings = extractSqlFromStrings(content);
  for (const sql of sqlStrings) {
    const tableNames = extractTableNamesFromSql(sql);
    for (const tName of tableNames) {
      if (!seenTables.has(`${tName}:REFERENCE`)) {
        seenTables.add(`${tName}:REFERENCE`);
        tablesReferenced.push({
          name: tName,
          operation: "REFERENCE",
          lineStart: 0,
          lineEnd: 0,
          isView: false,
        });
      }
    }
  }

  return {
    language: "java",
    entities,
    tablesReferenced,
    dependencies,
    summary: buildSummary(entities, tablesReferenced, dependencies),
  };
};
