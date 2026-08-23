// ============================================================================
// MIPTE PL/SQL Analyzer — Extracts packages, procedures, functions, triggers,
// cursors, SQL statements, table references, conditional logic, and
// exception handling.
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

function upper(s: string) {
  return s.toUpperCase();
}

function extractTableRefs(sql: string, lineStart: number, lineEnd: number): TableReference[] {
  const refs: TableReference[] = [];
  const seen = new Set<string>();
  const patterns: [RegExp, TableReference["operation"]][] = [
    [/\bFROM\s+(?:\w+\.)?(\w+)/gi, "SELECT"],
    [/\bJOIN\s+(?:\w+\.)?(\w+)/gi, "SELECT"],
    [/\bINTO\s+(?:\w+\.)?(\w+)/gi, "INSERT"],
    [/\bUPDATE\s+(?:\w+\.)?(\w+)/gi, "UPDATE"],
    [/\bDELETE\s+FROM\s+(?:\w+\.)?(\w+)/gi, "DELETE"],
    [/\bINSERT\s+INTO\s+(?:\w+\.)?(\w+)/gi, "INSERT"],
  ];
  for (const [pat, op] of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(sql)) !== null) {
      const name = upper(m[1]);
      if (!seen.has(`${name}:${op}`) && name.length > 1) {
        seen.add(`${name}:${op}`);
        refs.push({
          name,
          operation: op,
          lineStart,
          lineEnd,
          isView: /\bVIEW\b/.test(sql.slice(Math.max(0, m.index - 30), m.index)),
        });
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Main Analyzer
// ---------------------------------------------------------------------------

export const analyzePlSql: AnalyzerFn = (content, fileName) => {
  const lines = content.split("\n");
  const entities: Entity[] = [];
  const tablesReferenced: TableReference[] = [];
  const dependencies: CodeDependency[] = [];
  const seenTables = new Set<string>();

  // --- Package / Package Body ---
  for (let i = 0; i < lines.length; i++) {
    const pkgMatch = lines[i].match(
      /CREATE\s+(OR\s+REPLACE\s+)?PACKAGE\s+(BODY\s+)?(\w+\.\w+|\w+)/i,
    );
    if (pkgMatch) {
      const isBody = !!pkgMatch[2];
      const pkgName = upper(pkgMatch[3]);

      // Find END <pkgName> or end of file
      let endLine = lines.length - 1;
      const endPat = new RegExp(`\\bEND\\s+${pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      for (let k = i + 1; k < lines.length; k++) {
        if (endPat.test(lines[k])) {
          endLine = k;
          break;
        }
      }

      pushEntity(entities, {
        type: isBody ? "package_body" : "package_declaration",
        name: pkgName,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Procedures ---
  for (let i = 0; i < lines.length; i++) {
    const procMatch = lines[i].match(
      /CREATE\s+(OR\s+REPLACE\s+)?PROCEDURE\s+(\w+(?:\.\w+)?)\s*(?:\(([^)]*)\))?/i,
    );
    if (procMatch) {
      const name = upper(procMatch[2]);
      const params = procMatch[3]?.trim();

      let endLine = i;
      let depth = 0;
      let started = false;
      for (let k = i; k < lines.length; k++) {
        for (const ch of lines[k]) {
          if (ch === ";") { // PL/SQL uses ; as statement terminator but block ends at END;
            // check for END; or END name;
          }
        }
        if (lines[k].match(new RegExp(`\\bEND\\b.*?;`, "i"))) {
          // Simple end detection
        }
        // Actually let's use BEGIN...END detection
        if (lines[k].match(/\bBEGIN\b/i)) started = true;
        if (started) {
          if (lines[k].match(new RegExp(`\\bEND\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`, "i"))) {
            endLine = k;
            break;
          }
          if (lines[k].match(/\bEND\s*;/i) && k > i + 1) {
            endLine = k;
            // Continue scanning for the named END
          }
        }
      }
      if (endLine === i) endLine = Math.min(i + 100, lines.length - 1);

      pushEntity(entities, {
        type: "procedure",
        name,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: `${name}(${params || ""})`,
        metadata: { parameters: params },
      });

      // Scan for SQL in procedure body
      const body = lines.slice(i, endLine + 1).join("\n");
      const tableRefs = extractTableRefs(body, i + 1, endLine + 1);
      for (const ref of tableRefs) {
        const key = `${ref.name}:${ref.operation}`;
        if (!seenTables.has(key)) {
          seenTables.add(key);
          tablesReferenced.push(ref);
          dependencies.push({
            type: ref.operation === "SELECT" ? "reads_table" : "writes_table",
            source: name,
            target: ref.name,
            lineStart: ref.lineStart,
            lineEnd: ref.lineEnd,
          });
        }
      }

      // Check for calls to other procedures/functions
      const callMatches = body.matchAll(/\b(\w+(?:\.\w+)?)\s*\(/gi);
      for (const cm of callMatches) {
        const callee = upper(cm[1]);
        if (
          callee !== name &&
          callee !== "IF" &&
          callee !== "WHEN" &&
          callee !== "LOOP" &&
          callee.length > 2
        ) {
          dependencies.push({
            type: "calls",
            source: name,
            target: callee,
            lineStart: i + 1,
            lineEnd: endLine + 1,
          });
        }
      }
    }
  }

  // --- Functions ---
  for (let i = 0; i < lines.length; i++) {
    const fnMatch = lines[i].match(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(\w+(?:\.\w+)?)\s*(?:\(([^)]*)\))?\s*RETURN/i,
    );
    if (fnMatch) {
      const name = upper(fnMatch[2]);
      const params = fnMatch[3]?.trim();

      let endLine = i;
      let started = false;
      for (let k = i; k < lines.length; k++) {
        if (lines[k].match(/\bBEGIN\b/i)) started = true;
        if (started && lines[k].match(new RegExp(`\\bEND\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`, "i"))) {
          endLine = k;
          break;
        }
      }
      if (endLine === i) endLine = Math.min(i + 80, lines.length - 1);

      pushEntity(entities, {
        type: "function",
        name,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: `${name}(${params || ""}) RETURN ...`,
        metadata: { parameters: params },
      });

      const body = lines.slice(i, endLine + 1).join("\n");
      const tableRefs = extractTableRefs(body, i + 1, endLine + 1);
      for (const ref of tableRefs) {
        const key = `${ref.name}:${ref.operation}`;
        if (!seenTables.has(key)) {
          seenTables.add(key);
          tablesReferenced.push(ref);
          dependencies.push({
            type: ref.operation === "SELECT" ? "reads_table" : "writes_table",
            source: name,
            target: ref.name,
            lineStart: ref.lineStart,
            lineEnd: ref.lineEnd,
          });
        }
      }
    }
  }

  // --- Triggers ---
  for (let i = 0; i < lines.length; i++) {
    const trigMatch = lines[i].match(
      /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER\s+(\w+(?:\.\w+)?)/i,
    );
    if (trigMatch) {
      const name = upper(trigMatch[2]);
      let endLine = i;
      for (let k = i; k < lines.length; k++) {
        if (lines[k].match(new RegExp(`\\bEND\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`, "i"))) {
          endLine = k;
          break;
        }
        if (lines[k].match(/\bEND\s*;/i) && k > i + 2) {
          endLine = k;
        }
      }
      if (endLine === i) endLine = Math.min(i + 50, lines.length - 1);

      pushEntity(entities, {
        type: "trigger",
        name,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Cursors ---
  for (let i = 0; i < lines.length; i++) {
    const curMatch = lines[i].match(/\bCURSOR\s+(\w+)\s+IS\s+(.*)/i);
    if (curMatch) {
      const name = upper(curMatch[1]);
      // Try to find the closing semicolon or multi-line end
      let endLine = i;
      const stmtText = lines[i];
      if ((stmtText.match(/;/g) || []).length < 2) {
        // Multi-line cursor — find the closing ;
        for (let k = i; k < Math.min(i + 20, lines.length); k++) {
          if (lines[k].match(/;/)) {
            endLine = k;
            break;
          }
        }
      }

      pushEntity(entities, {
        type: "cursor",
        name,
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: lines[i].trim(),
      });

      // Extract tables from cursor SQL
      const cursorSql = lines.slice(i, endLine + 1).join("\n");
      const tableRefs = extractTableRefs(cursorSql, i + 1, endLine + 1);
      for (const ref of tableRefs) {
        const key = `${ref.name}:${ref.operation}`;
        if (!seenTables.has(key)) {
          seenTables.add(key);
          tablesReferenced.push(ref);
        }
      }
    }
  }

  // --- IF / ELSIF / CASE / LOOP ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*IF\s+/i)) {
      pushEntity(entities, {
        type: "conditional",
        name: "IF",
        subType: "if",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*ELSIF\s+/i)) {
      pushEntity(entities, {
        type: "conditional",
        name: "ELSIF",
        subType: "elsif",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*CASE\s+/i)) {
      pushEntity(entities, {
        type: "case_expression",
        name: "CASE",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*FOR\s+/i) || lines[i].match(/^\s*WHILE\s+/i)) {
      pushEntity(entities, {
        type: "loop",
        name: lines[i].match(/^\s*(FOR|WHILE)/i)?.[1] || "loop",
        subType: lines[i].trim().startsWith("FOR") ? "for" : "while",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Exception handlers ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*EXCEPTION\s/i)) {
      pushEntity(entities, {
        type: "exception_handler",
        name: "EXCEPTION",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*WHEN\s+/i)) {
      pushEntity(entities, {
        type: "exception_handler",
        name: lines[i].match(/WHEN\s+(\w+)/i)?.[1] || "WHEN",
        subType: "when_handler",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Variable declarations (for completeness) ---
  for (let i = 0; i < lines.length; i++) {
    const varMatch = lines[i].match(/^\s*(\w+)\s+(IS\s+TABLE\s+OF|VARCHAR2|NUMBER|DATE|INTEGER|BOOLEAN|CLOB|CHAR|TIMESTAMP)/i);
    if (varMatch) {
      const name = upper(varMatch[1]);
      pushEntity(entities, {
        type: "variable",
        name,
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
        metadata: { dataType: varMatch[2] },
      });
    }
  }

  return {
    language: "plsql",
    entities,
    tablesReferenced,
    dependencies,
    summary: buildSummary(entities, tablesReferenced, dependencies),
  };
};

function pushEntity(
  entities: Entity[],
  e: Omit<Entity, "metadata"> & { metadata?: Record<string, unknown> },
) {
  entities.push(e);
}
