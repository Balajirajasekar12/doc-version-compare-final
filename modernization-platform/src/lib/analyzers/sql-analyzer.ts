// ============================================================================
// MIPTE SQL Analyzer — Extracts SQL statements, table references, joins,
// conditions, subqueries, and view definitions.
// ============================================================================

import type {
  AnalyzerFn,
  AnalysisResult,
  Entity,
  TableReference,
  CodeDependency,
} from "./types";
import { buildSummary } from "./types";

function upper(s: string) {
  return s.toUpperCase().trim();
}

export const analyzeSql: AnalyzerFn = (content, _fileName) => {
  const lines = content.split("\n");
  const entities: Entity[] = [];
  const tablesReferenced: TableReference[] = [];
  const dependencies: CodeDependency[] = [];
  const seenTables = new Set<string>();

  function addTable(name: string, operation: TableReference["operation"], lineStart: number, lineEnd: number, isView: boolean) {
    const key = `${name}:${operation}`;
    if (!seenTables.has(key) && name.length > 1) {
      seenTables.add(key);
      tablesReferenced.push({ name, operation, lineStart, lineEnd, isView });
    }
  }

  // Join consecutive lines to handle multi-line statements
  const fullText = lines.join("\n");
  // Split on semicolons to get individual statements (simplified)
  const statements: Array<{ text: string; startLine: number }> = [];
  let currentStatement = "";
  let currentStartLine = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentStatement += line + "\n";
    // Check if this line ends a statement (ends with ; and isn't a comment)
    const trimmed = line.trim();
    if (trimmed.endsWith(";") && !trimmed.startsWith("--")) {
      statements.push({ text: currentStatement.trim(), startLine: currentStartLine });
      currentStatement = "";
      currentStartLine = i + 2;
    }
  }
  if (currentStatement.trim()) {
    statements.push({ text: currentStatement.trim(), startLine: currentStartLine });
  }

  // --- Analyze each statement ---
  for (let si = 0; si < statements.length; si++) {
    const stmt = statements[si];
    const text = stmt.text;
    const stmtLines = text.split("\n");
    const startLine = stmt.startLine;
    const endLine = startLine + stmtLines.length - 1;
    const upperText = upper(text);

    // Determine statement type
    let stmtType = "unknown";
    if (upperText.startsWith("CREATE") && upperText.includes("TABLE")) stmtType = "CREATE_TABLE";
    else if (upperText.startsWith("CREATE") && upperText.includes("VIEW")) stmtType = "CREATE_VIEW";
    else if (upperText.startsWith("CREATE") && upperText.includes("INDEX")) stmtType = "CREATE_INDEX";
    else if (upperText.startsWith("CREATE") && upperText.includes("SEQUENCE")) stmtType = "CREATE_SEQUENCE";
    else if (upperText.startsWith("CREATE") && upperText.includes("PROCEDURE")) stmtType = "CREATE_PROCEDURE";
    else if (upperText.startsWith("CREATE") && upperText.includes("FUNCTION")) stmtType = "CREATE_FUNCTION";
    else if (upperText.startsWith("CREATE") && upperText.includes("TRIGGER")) stmtType = "CREATE_TRIGGER";
    else if (upperText.startsWith("INSERT")) stmtType = "INSERT";
    else if (upperText.startsWith("UPDATE")) stmtType = "UPDATE";
    else if (upperText.startsWith("DELETE")) stmtType = "DELETE";
    else if (upperText.startsWith("SELECT")) stmtType = "SELECT";
    else if (upperText.startsWith("ALTER")) stmtType = "ALTER";
    else if (upperText.startsWith("DROP")) stmtType = "DROP";
    else if (upperText.startsWith("MERGE")) stmtType = "MERGE";

    // Extract entity name for DDL statements
    if (stmtType.startsWith("CREATE")) {
      const nameMatch = text.match(
        /CREATE\s+(?:OR\s+REPLACE\s+)?(?:GLOBAL\s+TEMPORARY\s+)?(?:PUBLIC\s+)?(?:PRIVATE\s+)?(?:FORCE\s+)?(?:FORCE\s+)?\w+\s+(?:IF\s+(?:NOT\s+EXISTS|EXISTS)\s+)?(\w+(?:\.\w+)?)/i,
      );
      if (nameMatch) {
        const isView = upperText.includes("VIEW");
        pushEntity(entities, {
          type: isView ? "view" : stmtType === "CREATE_TABLE" ? "sql_statement" : "sql_statement",
          name: upper(nameMatch[1]),
          subType: stmtType,
          lineStart: startLine,
          lineEnd: endLine,
          signature: text.slice(0, 200),
        });
        addTable(upper(nameMatch[1]), "CREATE", startLine, endLine, isView);
      }
    } else {
      pushEntity(entities, {
        type: "sql_statement",
        name: stmtType,
        subType: stmtType,
        lineStart: startLine,
        lineEnd: endLine,
        signature: text.slice(0, 200),
      });
    }

    // --- Extract table references ---
    // FROM clause tables
    const fromMatches = text.matchAll(/\bFROM\s+([\w."]+(?:\s+(?:AS\s+)?\w+)?(?:\s*,\s*[\w."]+(?:\s+(?:AS\s+)?\w+)?)*)/gi);
    for (const fm of fromMatches) {
      const tableList = fm[1];
      // Split by comma, handle JOINs
      const parts = tableList.split(/\s*,\s*|\s+JOIN\s+/i);
      for (const part of parts) {
        const tableName = part.replace(/\s+(?:AS\s+)?\w+/i, "").replace(/"/g, "").split(".").pop()?.trim();
        if (tableName && tableName.length > 1 && !tableName.match(/^(AND|OR|WHERE|ON|SET|INTO|VALUES|GROUP|ORDER|HAVING|LIMIT|UNION|INTERSECT|EXCEPT)$/i)) {
          addTable(upper(tableName), upperText.startsWith("SELECT") ? "SELECT" : "REFERENCE", startLine, endLine, false);
        }
      }
    }

    // JOIN tables
    const joinMatches = text.matchAll(/\b(?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)JOIN\s+([\w."]+)(?:\s+(?:AS\s+)?\w+)?/gi);
    for (const jm of joinMatches) {
      const tableName = jm[1].replace(/"/g, "").split(".").pop()?.trim();
      if (tableName && tableName.length > 1) {
        addTable(upper(tableName), "SELECT", startLine, endLine, false);
      }
    }

    // INTO clause
    const intoMatch = text.match(/\bINTO\s+(?:TABLE\s+)?([\w."]+)/i);
    if (intoMatch) {
      const tableName = intoMatch[1].replace(/"/g, "").split(".").pop()?.trim();
      if (tableName && tableName.length > 1) {
        addTable(upper(tableName), "INSERT", startLine, endLine, false);
      }
    }

    // UPDATE table
    const updateMatch = text.match(/\bUPDATE\s+([\w."]+)/i);
    if (updateMatch) {
      const tableName = updateMatch[1].replace(/"/g, "").split(".").pop()?.trim();
      if (tableName && tableName.length > 1) {
        addTable(upper(tableName), "UPDATE", startLine, endLine, false);
      }
    }

    // DELETE FROM table
    const deleteMatch = text.match(/\bDELETE\s+FROM\s+([\w."]+)/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1].replace(/"/g, "").split(".").pop()?.trim();
      if (tableName && tableName.length > 1) {
        addTable(upper(tableName), "DELETE", startLine, endLine, false);
      }
    }

    // MERGE INTO table
    const mergeMatch = text.match(/\bMERGE\s+INTO\s+([\w."]+)/i);
    if (mergeMatch) {
      const tableName = mergeMatch[1].replace(/"/g, "").split(".").pop()?.trim();
      if (tableName && tableName.length > 1) {
        addTable(upper(tableName), "UPDATE", startLine, endLine, false);
      }
    }

    // --- Detect JOIN conditions ---
    const onMatches = text.matchAll(/\bON\s+([\w."]+\s*=\s*[\w."]+)/gi);
    for (const om of onMatches) {
      pushEntity(entities, {
        type: "join",
        name: om[1],
        subType: "on_condition",
        lineStart: startLine,
        lineEnd: endLine,
        signature: om[0],
      });
    }

    // --- Detect WHERE conditions ---
    const whereMatch = text.match(/\bWHERE\s+(.{10,200}?)(?:\bGROUP\s|\bORDER\s|\bHAVING\s|\bLIMIT\s|$)/is);
    if (whereMatch) {
      pushEntity(entities, {
        type: "conditional",
        name: "WHERE",
        subType: "where_clause",
        lineStart: startLine,
        lineEnd: endLine,
        signature: whereMatch[1].trim(),
      });
    }

    // --- Detect subqueries ---
    if (text.match(/\(\s*SELECT\b/i)) {
      pushEntity(entities, {
        type: "subquery",
        name: "subquery",
        lineStart: startLine,
        lineEnd: endLine,
        signature: text.slice(0, 200),
      });
    }

    // --- Detect UNION ---
    if (upperText.includes("UNION")) {
      pushEntity(entities, {
        type: "sql_statement",
        name: "UNION",
        subType: upperText.includes("UNION ALL") ? "union_all" : "union",
        lineStart: startLine,
        lineEnd: endLine,
      });
    }
  }

  // --- Process-level: find all table names across the whole file ---
  const allTableNameMatches = fullText.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(?:[\w]+\.)?([A-Z_]\w+)/gi);
  for (const tm of allTableNameMatches) {
    const name = upper(tm[1]);
    if (name.length > 1 && !name.match(/^(AND|OR|WHERE|ON|SET|VALUES|AS|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|SEQUENCE|PROCEDURE|FUNCTION|TRIGGER|BEGIN|END|DECLARE|IF|THEN|ELSE|ELSIF|LOOP|FOR|WHILE|CURSOR|EXCEPTION|WHEN|RETURN|COMMIT|ROLLBACK|NULL|TRUE|FALSE|NOT|IN|EXISTS|BETWEEN|LIKE|IS|AND|OR)$/)) {
      if (!seenTables.has(`${name}:REFERENCE`)) {
        // Only add if not already tracked with a more specific operation
        const hasSpecific = [...seenTables].some(k => k.startsWith(`${name}:`));
        if (!hasSpecific) {
          addTable(name, "REFERENCE", 1, lines.length, false);
        }
      }
    }
  }

  return {
    language: "sql",
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
