// ============================================================
// MIP Source Code Analysis Engine (Deterministic, Client-Side)
// ============================================================
// No AI. No external APIs. Uses regex, lexical parsing, pattern detection.

import type {
  SourceFile,
  AnalysisResult,
  ClassInfo,
  MethodInfo,
  FunctionInfo,
  ProcedureInfo,
  SqlInfo,
  ConditionInfo,
  DetectedBusinessRule,
  ValidationInfo,
  ErrorHandlerInfo,
  SchedulerInfo,
  DependencyInfo,
  TableReference,
  FieldMapping,
  TransformationInfo,
  TestScenario,
  Finding,
  BusinessRule,
  TestCase,
} from "./types";

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}_a${Date.now()}_${++idCounter}`;
}

// ============================================================
// Main Analysis Entry Point
// ============================================================

export function analyzeSourceFile(file: SourceFile): AnalysisResult {
  const content = file.content;
  const language = file.language;

  const base: AnalysisResult = {
    id: genId("analysis"),
    projectId: file.projectId,
    fileId: file.id,
    side: file.side,
    language,
    imports: [],
    classes: [],
    methods: [],
    functions: [],
    procedures: [],
    sqlStatements: [],
    conditions: [],
    businessRules: [],
    validations: [],
    errorHandlers: [],
    schedulerTriggers: [],
    dependencies: [],
    tableReferences: [],
    fieldMappings: [],
    transformations: [],
  };

  switch (language) {
    case "Java":
      analyzeJava(content, base);
      break;
    case "PL/SQL":
      analyzePLSQL(content, base);
      break;
    case "SQL":
      analyzeSQL(content, base);
      break;
    case "Shell":
      analyzeShell(content, base);
      break;
    case "JSON":
      analyzeJSON(content, base);
      break;
    case "XML":
      analyzeXML(content, base);
      break;
    default:
      analyzeGeneric(content, base);
      break;
  }

  // Common analysis passes
  extractTableReferences(content, base);
  extractBusinessRules(content, base);
  extractSchedulerReferences(content, base);

  return base;
}

// ============================================================
// Java Analysis
// ============================================================

function analyzeJava(content: string, result: AnalysisResult) {
  const lines = content.split("\n");

  // Imports
  for (const line of lines) {
    const m = line.match(/^\s*import\s+(static\s+)?([a-zA-Z0-9_.]+)\s*;/);
    if (m) result.imports.push(m[2]);
  }

  // Classes
  const classRe = /(?:public|private|protected)?\s*(?:abstract|final|static)?\s*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(content)) !== null) {
    const classInfo: ClassInfo = {
      name: m[1],
      extends: m[2],
      implements: m[3]?.split(",").map(s => s.trim()),
      methods: [],
      fields: [],
      annotations: [],
      startLine: content.slice(0, m.index).split("\n").length,
    };

    // Find methods within class scope
    const methodRe = /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
    let mm: RegExpExecArray | null;
    while ((mm = methodRe.exec(content)) !== null) {
      const method: MethodInfo = {
        name: mm[2],
        className: m[1],
        returnType: mm[1],
        parameters: mm[3].split(",").map(p => p.trim()).filter(Boolean),
        sqlCalls: [],
        conditions: [],
        startLine: content.slice(0, mm.index).split("\n").length,
      };
      classInfo.methods.push(method.name);
      result.methods.push(method);
    }

    // Fields
    const fieldRe = /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(\w+)\s+(\w+)\s*[=;]/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(content)) !== null) {
      classInfo.fields.push(fm[2]);
    }

    result.classes.push(classInfo);
  }

  // Conditions in Java
  analyzeConditions(content, result, "Java");

  // Error handling
  analyzeErrorHandling(content, result, "Java");

  // SQL calls (embedded)
  extractEmbeddedSql(content, result);
}

// ============================================================
// PL/SQL Analysis
// ============================================================

function analyzePLSQL(content: string, result: AnalysisResult) {
  const upper = content.toUpperCase();
  const lines = content.split("\n");

  // Procedures / Functions
  const procRe = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?)?(?:PROCEDURE|FUNCTION)\s+(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = procRe.exec(content)) !== null) {
    const isFunc = m[0].toUpperCase().includes("FUNCTION");
    const proc: ProcedureInfo = {
      name: m[1],
      parameters: [],
      sqlCalls: [],
      conditions: [],
      startLine: content.slice(0, m.index).split("\n").length,
    };
    result.procedures.push(proc);

    if (isFunc) {
      const fn: FunctionInfo = {
        name: m[1],
        parameters: [],
        sqlCalls: [],
        conditions: [],
        isStoredProcedure: false,
        startLine: proc.startLine,
      };
      result.functions.push(fn);
    }
  }

  // Package bodies
  const pkgRe = /(?:CREATE\s+(?:OR\s+REPLACE\s+)?)?PACKAGE\s+(?:BODY\s+)?(\w+)/gi;
  while ((m = pkgRe.exec(content)) !== null) {
    result.dependencies.push({ type: "call", target: m[1], line: content.slice(0, m.index).split("\n").length });
  }

  // SQL statements
  extractSqlStatements(content, result);

  // Conditions
  analyzeConditions(content, result, "PL/SQL");

  // Cursor operations
  const cursorRe = /(?:OPEN|FETCH|CLOSE|FOR\s+\w+\s+IN\s+SELECT)/gi;
  while ((m = cursorRe.exec(content)) !== null) {
    // Note cursor usage in nearest procedure
    if (result.procedures.length > 0) {
      const lastProc = result.procedures[result.procedures.length - 1];
      lastProc.conditions.push(`Cursor: ${m[0].trim()}`);
    }
  }

  // Exception handling
  const excRe = /(?:WHEN\s+(OTHERS|[\w\s|]+)\s+THEN)/gi;
  while ((m = excRe.exec(content)) !== null) {
    result.errorHandlers.push({
      type: "exception",
      handling: m[0],
      context: lines[Math.min(content.slice(0, m.index).split("\n").length - 1, lines.length - 1)]?.trim() || "",
      line: content.slice(0, m.index).split("\n").length,
    });
  }

  // FORALL / BULK COLLECT
  const bulkRe = /(?:FORALL|BULK\s+COLLECT\s+INTO)/gi;
  while ((m = bulkRe.exec(content)) !== null) {
    result.transformations.push({
      type: "bulk_operation",
      input: m[0],
      output: m[0],
      expression: m[0],
      line: content.slice(0, m.index).split("\n").length,
    });
  }
}

// ============================================================
// SQL Analysis
// ============================================================

function analyzeSQL(content: string, result: AnalysisResult) {
  extractSqlStatements(content, result);
}

function extractSqlStatements(content: string, result: AnalysisResult) {
  const sqlRe = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = sqlRe.exec(content)) !== null) {
    const type = m[1].toUpperCase().includes("SELECT") ? "SELECT" :
      m[1].toUpperCase().includes("INSERT") ? "INSERT" :
      m[1].toUpperCase().includes("UPDATE") ? "UPDATE" :
      m[1].toUpperCase().includes("DELETE") ? "DELETE" :
      m[1].toUpperCase().includes("MERGE") ? "MERGE" :
      m[1].toUpperCase().includes("CREATE") ? "CREATE" :
      m[1].toUpperCase().includes("ALTER") ? "ALTER" :
      m[1].toUpperCase().includes("DROP") ? "DROP" : "OTHER";

    // Extract the full statement (until semicolon or next keyword)
    const startIdx = m.index;
    const remaining = content.slice(startIdx);
    const semiIdx = remaining.indexOf(";");
    const stmtText = semiIdx >= 0 ? remaining.slice(0, semiIdx) : remaining.slice(0, 500);

    // Extract table references
    const tables = extractTableNames(stmtText);

    result.sqlStatements.push({
      type: type as SqlInfo["type"],
      raw: stmtText.trim().slice(0, 200),
      tables,
      conditions: extractWhereConditions(stmtText),
      line: content.slice(0, startIdx).split("\n").length,
    });
  }
}

function extractTableNames(sql: string): string[] {
  const tables = new Set<string>();
  const upper = sql.toUpperCase();

  // FROM clause
  const fromRe = /\bFROM\s+([a-zA-Z_][\w.]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(sql)) !== null) tables.add(m[1].toUpperCase());

  // JOIN clause
  const joinRe = /\bJOIN\s+([a-zA-Z_][\w.]*)/gi;
  while ((m = joinRe.exec(sql)) !== null) tables.add(m[1].toUpperCase());

  // INTO clause
  const intoRe = /\bINTO\s+([a-zA-Z_][\w.]*)/gi;
  while ((m = intoRe.exec(sql)) !== null) tables.add(m[1].toUpperCase());

  // UPDATE clause
  const updateRe = /\bUPDATE\s+([a-zA-Z_][\w.]*)/gi;
  while ((m = updateRe.exec(sql)) !== null) tables.add(m[1].toUpperCase());

  // INSERT INTO
  const insertRe = /\bINSERT\s+INTO\s+([a-zA-Z_][\w.]*)/gi;
  while ((m = insertRe.exec(sql)) !== null) tables.add(m[1].toUpperCase());

  return Array.from(tables);
}

function extractWhereConditions(sql: string): string[] {
  const conditions: string[] = [];
  const condRe = /\b(WHERE|AND|OR|WHEN|THEN|ELSE|ON)\s+([^\n;]{3,80})/gi;
  let m: RegExpExecArray | null;
  while ((m = condRe.exec(sql)) !== null) {
    conditions.push(m[0].trim());
  }
  return conditions;
}

// ============================================================
// Shell Script Analysis
// ============================================================

function analyzeShell(content: string, result: AnalysisResult) {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Source/include
    if (/^\.\s+/.test(line) || /^source\s+/.test(line)) {
      const target = line.replace(/^(\.\s+|source\s+)/, "").trim().replace(/["']/g, "");
      result.dependencies.push({ type: "file", target, line: lineNum });
    }

    // If/then/elif/else
    if (/^\s*(if|elif|else|then|fi|case|esac)\b/.test(line)) {
      result.conditions.push({
        type: line.trim().startsWith("if") ? "if" : line.trim().startsWith("elif") ? "else" : "case",
        expression: line.slice(0, 100),
        context: line,
        line: lineNum,
      });
    }

    // SQL commands in shell
    if (/\bsqlplus\b|\bmysql\b|\bpsql\b|\bsqlcmd\b/i.test(line)) {
      result.sqlStatements.push({
        type: "OTHER",
        raw: line.slice(0, 200),
        tables: [],
        conditions: [],
        line: lineNum,
      });
    }

    // External calls
    const extCall = line.match(/^\s*(curl|wget|ssh|scp|rsync|ftp|sftp)\s+/);
    if (extCall) {
      result.dependencies.push({ type: "call", target: extCall[1], line: lineNum });
    }
  }
}

// ============================================================
// JSON Analysis
// ============================================================

function analyzeJSON(content: string, result: AnalysisResult) {
  try {
    const parsed = JSON.parse(content);
    analyzeJsonValue(parsed, "", result, 0);
  } catch {
    // Not valid JSON, skip
  }
}

function analyzeJsonValue(value: unknown, path: string, result: AnalysisResult, depth: number) {
  if (depth > 10) return;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (typeof val === "string") {
        // Check for SQL-like values
        if (/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(val)) {
          result.sqlStatements.push({
            type: val.toUpperCase().includes("SELECT") ? "SELECT" : "OTHER",
            raw: val.slice(0, 200),
            tables: extractTableNames(val),
            conditions: [],
          });
        }
      }
      analyzeJsonValue(val, currentPath, result, depth + 1);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      analyzeJsonValue(item, `${path}[${idx}]`, result, depth + 1);
    });
  }
}

// ============================================================
// XML Analysis
// ============================================================

function analyzeXML(content: string, result: AnalysisResult) {
  const tagRe = /<([a-zA-Z_][\w.-]*)((?:\s+[a-zA-Z_][\w.-]*\s*=\s*"[^"]*")*)\s*\/?>/g;
  const classNames = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(content)) !== null) {
    const tagName = m[1];
    if (tagName.includes(".") && tagName.includes("class")) {
      classNames.add(tagName);
    }
    result.dependencies.push({ type: "include", target: tagName });
  }

  // Detect Spring XML configuration
  if (content.includes("beans") || content.includes("spring")) {
    const beanRe = /class\s*=\s*"([^"]+)"/g;
    while ((m = beanRe.exec(content)) !== null) {
      result.classes.push({
        name: m[1].split(".").pop() || m[1],
        methods: [],
        fields: [],
        annotations: ["@Component"],
      });
    }
  }

  // Detect SQL in XML (MyBatis, etc.)
  const selectRe = /<select[^>]*id\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi;
  while ((m = selectRe.exec(content)) !== null) {
    result.sqlStatements.push({
      type: "SELECT",
      raw: m[2].trim().slice(0, 200),
      tables: extractTableNames(m[2]),
      conditions: extractWhereConditions(m[2]),
    });
  }
}

// ============================================================
// Generic Analysis
// ============================================================

function analyzeGeneric(content: string, result: AnalysisResult) {
  // Try SQL detection
  if (/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(content)) {
    extractSqlStatements(content, result);
  }
  analyzeConditions(content, result, "generic");
}

// ============================================================
// Cross-Cutting Analysis
// ============================================================

function analyzeConditions(content: string, result: AnalysisResult, lang: string) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim().toUpperCase();

    // IF conditions
    if (/\bIF\b|\bELSIF\b|\bELSE\s+IF\b/.test(trimmed) || /^\s*if\s*\(/.test(line)) {
      const expr = line.trim().slice(0, 150);
      let condType: ConditionInfo["type"] = "if";
      if (/\bCASE\b|\bWHEN\b/.test(trimmed)) condType = "case";
      else if (/NULL|ISNULL|IS\s+NULL/i.test(trimmed)) condType = "null_check";
      else if (/\bBETWEEN\b|\b>\s*\d|\b<\s*\d|\b>=\s*\d/.test(trimmed)) condType = "range_check";
      else if (/STATUS|STATE|ACTIVE|INACTIVE|ENABLED|DISABLED/i.test(trimmed)) condType = "status_check";
      else if (/\bDATE\b|\bSYSDATE\b|\bTO_DATE\b/i.test(trimmed)) condType = "date_check";
      else if (/\bAMOUNT\b|\bBALANCE\b|\bTOTAL\b|\bSUM\b/i.test(trimmed)) condType = "amount_check";

      result.conditions.push({ type: condType, expression: expr, context: line.trim(), line: lineNum });
    }

    // WHEN/CASE
    if (/\bWHEN\b/.test(trimmed) && /\bCASE\b/.test(trimmed)) {
      result.conditions.push({ type: "case", expression: line.trim().slice(0, 150), context: line.trim(), line: lineNum });
    }

    // Validation patterns
    if (/VALIDATE|CHECK|VERIFY|ASSERT|REQUIRE|ENSURE/i.test(trimmed)) {
      result.validations.push({
        type: "validation",
        expression: line.trim().slice(0, 150),
        context: line.trim(),
        line: lineNum,
      });
    }
  }
}

function analyzeErrorHandling(content: string, result: AnalysisResult, lang: string) {
  const errorPatterns = lang === "Java"
    ? [/\bcatch\s*\(\s*(\w+)\s+(\w+)\s*\)/g, /\bthrows\s+([\w,\s]+)/g]
    : [/\bEXCEPTION\b/gi, /\bWHEN\s+OTHERS\b/gi, /\bERROR\b/gi];

  for (const pattern of errorPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split("\n").length;
      result.errorHandlers.push({
        type: "error_handler",
        handling: m[0],
        context: content.split("\n")[lineNum - 1]?.trim() || "",
        line: lineNum,
      });
    }
  }
}

function extractEmbeddedSql(content: string, result: AnalysisResult) {
  // String-enclosed SQL in Java
  const sqlStringRe = /"(SELECT\s+.+?)"|'(SELECT\s+.+?)'|"(INSERT\s+.+?)"|'(INSERT\s+.+?)'|"(UPDATE\s+.+?)"|'(UPDATE\s+.+?)'|"(DELETE\s+.+?)"|'(DELETE\s+.+?)'/gi;
  let m: RegExpExecArray | null;
  while ((m = sqlStringRe.exec(content)) !== null) {
    const sql = m[1] || m[2] || m[3] || m[4] || m[5] || m[6] || m[7] || m[8] || "";
    if (sql) {
      result.sqlStatements.push({
        type: sql.toUpperCase().startsWith("SELECT") ? "SELECT" :
          sql.toUpperCase().startsWith("INSERT") ? "INSERT" :
          sql.toUpperCase().startsWith("UPDATE") ? "UPDATE" : "DELETE",
        raw: sql.slice(0, 200),
        tables: extractTableNames(sql),
        conditions: extractWhereConditions(sql),
        line: content.slice(0, m.index).split("\n").length,
      });
    }
  }
}

function extractTableReferences(content: string, result: AnalysisResult) {
  const upper = content.toUpperCase();
  const tableRe = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([A-Z_][A-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(content)) !== null) {
    const tableName = m[1];
    if (!["SET", "WHERE", "AND", "OR", "VALUES", "SELECT", "DISTINCT", "AS", "ON", "NULL", "TRUE", "FALSE", "DUAL", "SYS"].includes(tableName)) {
      const existing = result.tableReferences.find(t => t.name === tableName);
      if (existing) {
        if (upper.includes(`${tableName} =`) || upper.includes(`SET ${tableName}`)) {
          existing.operation = "both";
        }
      } else {
        result.tableReferences.push({
          name: tableName,
          operation: upper.includes(`INSERT INTO ${tableName}`) || upper.includes(`UPDATE ${tableName}`) || upper.includes(`DELETE FROM ${tableName}`) ? "write" : "read",
        });
      }
    }
  }
}

function extractBusinessRules(content: string, result: AnalysisResult) {
  // Detect rule-like patterns
  const rulePatterns = [
    { re: /(?:IF|WHEN|CHECK|VALIDATE)\s*\(([^)]{5,80})\)\s*(?:THEN|RETURN|RAISE)/gi, type: "condition_check" },
    { re: /\b(?:must|shall|should|required|mandatory|mandatory|cannot|not\s+allow)\b[^.]*\./gi, type: "business_rule" },
    { re: /\b(?:STATUS|STATE)\s*=\s*'([^']+)'/gi, type: "status_rule" },
    { re: /\b(?:VALIDATE|CHECK|VERIFY)\s*\(\s*(\w+)\s*(?:>|<|>=|<=|!=|=|BETWEEN)\s*([^)]+)\)/gi, type: "validation_rule" },
  ];

  for (const { re, type } of rulePatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split("\n").length;
      result.businessRules.push({
        id: genId("br"),
        description: m[0].trim().slice(0, 200),
        condition: m[1]?.trim() || m[0].trim(),
        context: content.split("\n")[lineNum - 1]?.trim() || "",
        sourceFile: "",
        line: lineNum,
        confidence: "inferred",
      });
    }
  }
}

function extractSchedulerReferences(content: string, result: AnalysisResult) {
  const schedPatterns = [
    { re: /\b(CRON|SCHEDULE|JOB|TIMER|PERIODIC|DAILY|WEEKLY|MONTHLY)\b/gi, type: "scheduler" },
    { re: /\b(CONTROL.M|CONTROL-M|CMLIB|CMAGENT)\b/gi, type: "control_m" },
    { re: /\b(QUARTZ|SPRING_BATCH|SCHEDULER)\b/gi, type: "spring_scheduler" },
  ];

  for (const { re, type } of schedPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      result.schedulerTriggers.push({
        type,
        name: m[0],
        expression: content.split("\n")[content.slice(0, m.index).split("\n").length - 1]?.trim() || m[0],
        line: content.slice(0, m.index).split("\n").length,
      });
    }
  }
}

// ============================================================
// Test Case Generation from Scenarios
// ============================================================

export function generateCasesFromScenarios(
  scenarios: TestScenario[],
  findings: Finding[],
  rules: BusinessRule[],
  files: SourceFile[],
  projectId: string,
): TestCase[] {
  const cases: TestCase[] = [];

  for (const scenario of scenarios) {
    const linkedFindings = findings.filter(f => scenario.linkedFindingIds.includes(f.id));
    const linkedRules = rules.filter(r => scenario.linkedRuleIds.includes(r.id));

    // Determine steps based on scenario content
    const steps = generateStepsFromScenario(scenario, linkedFindings, linkedRules, files);

    const tc: TestCase = {
      id: genId("tc"),
      projectId,
      caseNumber: `TC-${String(cases.length + 1).padStart(3, "0")}`,
      type: "manual",
      title: scenario.title,
      objective: scenario.objective,
      requirement: linkedRules.map(r => r.ruleNumber).join(", ") || "General",
      preconditions: [`Project is in testable state`, `Test data is available`],
      steps,
      expectedResult: scenario.expectedOutcome,
      priority: scenario.priority,
      automationCandidate: false,
      status: "not_run",
      linkedScenarioId: scenario.id,
      linkedRuleIds: scenario.linkedRuleIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      generatedAt: Date.now(),
    };

    cases.push(tc);
  }

  return cases;
}

function generateStepsFromScenario(
  scenario: TestScenario,
  findings: Finding[],
  rules: BusinessRule[],
  files: SourceFile[],
): TestCase["steps"] {
  const steps: TestCase["steps"] = [];
  let stepNum = 1;

  // Step 1: Preparation
  steps.push({
    stepNumber: stepNum++,
    action: `Prepare test data for: ${scenario.title}`,
    expectedResult: "Test data is ready",
  });

  // Step 2: Execute
  steps.push({
    stepNumber: stepNum++,
    action: `Execute the scenario: ${scenario.description}`,
    expectedResult: scenario.expectedOutcome,
  });

  // Step 3: Verify findings if any
  if (findings.length > 0) {
    const finding = findings[0];
    steps.push({
      stepNumber: stepNum++,
      action: `Verify: ${finding.whatIsMissing || finding.whatChanged}`,
      expectedResult: finding.modernBehavior || "Expected behavior observed",
    });
  }

  // Step 4: SQL validation if there are SQL-related rules
  const sqlRules = rules.filter(r =>
    /SELECT|INSERT|UPDATE|DELETE|TABLE/i.test(r.condition)
  );
  if (sqlRules.length > 0) {
    steps.push({
      stepNumber: stepNum++,
      action: "Execute validation SQL query",
      expectedResult: "Database state matches expected values",
      sql: generateValidationSql(sqlRules[0]),
    });
  }

  // Step 5: Final verification
  steps.push({
    stepNumber: stepNum++,
    action: "Verify end-to-end scenario completion",
    expectedResult: `Scenario "${scenario.title}" passes all checks`,
  });

  return steps;
}

function generateValidationSql(rule: BusinessRule): string {
  // Generate a sensible validation SQL based on the rule
  const condition = rule.condition;
  if (/\bSTATUS\b/i.test(condition)) {
    const match = condition.match(/STATUS\s*=\s*'?(\w+)'?/i);
    const status = match ? match[1] : "ACTIVE";
    return `SELECT COUNT(*) FROM dual WHERE EXISTS (SELECT 1 FROM target_table WHERE status = '${status}')`;
  }
  return `SELECT COUNT(*) FROM target_table WHERE /* ${rule.ruleNumber}: ${rule.title} */ 1=1`;
}

// ============================================================
// Compute Coverage Metrics (called from context)
// ============================================================
export function computeCoverageMetrics(
  analyses: AnalysisResult[],
  findings: Finding[],
  rules: BusinessRule[],
  scenarios: TestScenario[],
  testCases: TestCase[],
): import("./types").CoverageMetrics {
  const totalConditions = analyses.reduce((sum, a) => sum + a.conditions.length, 0);
  const totalRules = rules.length;
  const totalFindings = findings.length;
  const executedCases = testCases.filter(t => t.status !== "not_run");

  return {
    legacyLogicAnalyzed: analyses.length,
    legacyConditions: totalConditions,
    conditionsMapped: findings.length,
    conditionsMissing: totalConditions - findings.length,
    businessRulesIdentified: totalRules,
    rulesWithScenarios: rules.filter(r => r.linkedScenarioIds.length > 0).length,
    rulesWithManualTests: rules.filter(r => r.linkedTestCaseIds.length > 0).length,
    rulesWithAutomation: 0,
    findingsResolved: findings.filter(f => f.status === "resolved").length,
    findingsDeferred: findings.filter(f => f.status === "deferred").length,
    findingsAccepted: findings.filter(f => f.status === "accepted").length,
    totalFindings,
    executionCoverage: testCases.length > 0 ? (executedCases.length / testCases.length) * 100 : 0,
    passRate: executedCases.length > 0 ? (executedCases.filter(t => t.status === "pass").length / executedCases.length) * 100 : 0,
    failureRate: executedCases.length > 0 ? (executedCases.filter(t => t.status === "fail").length / executedCases.length) * 100 : 0,
  };
}
