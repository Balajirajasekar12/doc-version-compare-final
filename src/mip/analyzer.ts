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
  EvidenceRequest,
  KnowledgeEntry,
  BusinessExplanation,
  ExtractedBusinessRule,
  MissingInformation,
  DifferenceCategory,
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
// ============================================================
// Business Explanation Generator
// Converts technical differences into plain-English explanations
// ============================================================

function generateBusinessExplanation(params: {
  title: string;
  category: string;
  legacyBehavior: string;
  modernBehavior: string;
  whatChanged: string;
  whatIsMissing: string;
  businessImpact: string;
  legacyFiles: SourceFile[];
  modernFiles: SourceFile[];
  legacyAnalyses: AnalysisResult[];
  modernAnalyses: AnalysisResult[];
  affectedTable?: string;
  affectedFile?: string;
  severity: string;
  confidence: string;
}): BusinessExplanation {
  const { title, category, legacyBehavior, modernBehavior, whatChanged, whatIsMissing, businessImpact, affectedTable, severity, confidence } = params;

  // Determine difference category
  let differenceCategory: DifferenceCategory = "UNKNOWN";
  if (category.includes("missing") || category === "logic_missing") differenceCategory = "MISSING_FUNCTIONALITY";
  else if (category.includes("changed") || category === "logic_changed") differenceCategory = "CHANGED_BEHAVIOR";
  else if (category === "validation_removed") differenceCategory = "MISSING_VALIDATION";
  else if (category === "validation_changed") differenceCategory = "CHANGED_VALIDATION";
  else if (category === "error_handling_removed") differenceCategory = "MISSING_ERROR_HANDLING";
  else if (category === "db_operation_changed") differenceCategory = "CHANGED_DATABASE_INTERACTION";
  else if (category === "table_mapping_changed") differenceCategory = "CHANGED_DATA_MAPPING";
  else if (category === "field_mapping_changed") differenceCategory = "CHANGED_DATA_MAPPING";
  else if (category === "condition_removed") differenceCategory = "MISSING_VALIDATION";
  else if (category === "condition_added") differenceCategory = "ADDED_BEHAVIOR";

  // Generate plain English summary
  const plainEnglishSummary = generatePlainEnglishSummary(title, category, legacyBehavior, modernBehavior, whatIsMissing, confidence);

  // Generate what legacy does
  const whatLegacyDoes = generateWhatLegacyDoes(legacyBehavior, params.legacyAnalyses, params.legacyFiles);

  // Generate what mod does
  const whatModDoes = generateWhatModDoes(modernBehavior, whatIsMissing, params.modernAnalyses, params.modernFiles);

  // Generate why it matters
  const whyItMatters = generateWhyItMatters(businessImpact, category, severity);

  // Generate possible impact
  const possibleImpact = generatePossibleImpact(businessImpact, category, severity);

  // Generate confidence explanation
  const confidenceExplanation = generateConfidenceExplanation(confidence, legacyBehavior, modernBehavior);

  // Generate missing information
  const missingInformation = generateMissingInformation(category, affectedTable, params.affectedFile, params.legacyAnalyses, params.modernAnalyses);

  // Generate suggested question for dev
  const suggestedQuestionForDev = generateDevQuestion(title, legacyBehavior, modernBehavior, whatIsMissing, category);

  // Extract business rules from legacy analysis
  const extractedRules = extractBusinessRulesFromAnalysis(params.legacyAnalyses, params.legacyFiles);

  // Determine functionality
  const functionality = detectFunctionality(params.legacyAnalyses, params.legacyFiles);

  return {
    plainEnglishSummary,
    whatLegacyDoes,
    whatModDoes,
    whatIsDifferent: generateWhatIsDifferent(title, category, legacyBehavior, whatChanged, whatIsMissing),
    whyItMatters,
    possibleImpact,
    missingInformation,
    suggestedQuestionForDev,
    extractedRules,
    functionality,
    confidenceExplanation,
  };
}

function generatePlainEnglishSummary(title: string, category: string, legacy: string, modern: string, missing: string, confidence: string): string {
  // Extract business intent from class names, method names, and behavior text
  const businessContext = extractBusinessContext(title, legacy, missing);
  const confLabel = confidence === "confirmed" ? "HIGH" : confidence === "inferred" ? "MEDIUM" : "LOW";
  
  if (category.includes("missing") || category === "logic_missing") {
    return `${businessContext.impact}. The Legacy system ${businessContext.legacyAction}, but we could not identify equivalent handling in the MOD code reviewed. This ${businessContext.risk}. Confidence: ${confLabel}.`;
  }
  if (category.includes("changed") || category === "db_operation_changed") {
    return `${businessContext.impact}. Legacy ${businessContext.legacyAction}, while MOD ${businessContext.modAction}. This change ${businessContext.risk}.`;
  }
  if (category === "validation_removed" || category === "condition_removed") {
    return `${businessContext.impact}. Legacy includes checks that ${businessContext.legacyAction}. These checks appear to be absent in MOD, which ${businessContext.risk}.`;
  }
  if (category === "error_handling_removed") {
    return `${businessContext.impact}. Legacy handles error situations by ${businessContext.legacyAction}. The MOD code may not handle these scenarios the same way.`;
  }
  if (category === "db_operation_changed") {
    return `${businessContext.impact}. The way Legacy ${businessContext.legacyAction} has changed in MOD. ${businessContext.risk}.`;
  }
  return `${businessContext.impact}. ${businessContext.legacyAction}. ${businessContext.modAction ? "MOD: " + businessContext.modAction + "." : ""} ${businessContext.risk}.`;
}

function extractBusinessContext(title: string, legacy: string, missing: string): { impact: string; legacyAction: string; modAction: string; risk: string } {
  const all = (title + " " + legacy + " " + missing).toLowerCase();
  
  // Determine what the code does in business terms
  let impact = "A difference was detected between Legacy and MOD";
  let legacyAction = "performs processing logic";
  let modAction = "";
  let risk = "may affect business operations";
  
  // Extract business meaning from class/method names and behavior
  if (/charge|billing|invoice/.test(all)) {
    impact = "The charge and billing process";
    legacyAction = "creates and manages charges for billing";
    risk = "could result in incorrect charges being created or valid charges being missed";
  } else if (/claim/.test(all) && /valid/.test(all)) {
    impact = "The claim validation process";
    legacyAction = "checks whether claims meet the required criteria before processing";
    risk = "could allow invalid claims to be processed or reject valid ones";
  } else if (/claim/.test(all)) {
    impact = "The claim handling process";
    legacyAction = "processes claims through validation and routing";
    risk = "may affect how claims are handled";
  } else if (/driver/.test(all) && /charge/.test(all)) {
    impact = "The driver charge matching process";
    legacyAction = "matches claims against driver charge configuration to determine eligibility";
    risk = "could result in incorrect charge assignments";
  } else if (/driver/.test(all)) {
    impact = "The driver configuration lookup";
    legacyAction = "looks up driver configuration to determine processing rules";
    risk = "may use incorrect processing rules";
  } else if (/queue|batch|job/.test(all)) {
    impact = "The batch processing flow";
    legacyAction = "processes records through a batch job pipeline";
    risk = "may not process all records correctly";
  } else if (/table|sql|database/.test(all)) {
    impact = "A database interaction";
    legacyAction = "reads from or writes to database tables";
    risk = "may affect data integrity";
  } else if (/condition|validation|rule/.test(all)) {
    impact = "A validation check";
    legacyAction = "validates data against business rules";
    risk = "may allow invalid data through or block valid data";
  } else if (/error|exception/.test(all)) {
    impact = "Error handling";
    legacyAction = "catches and handles error conditions";
    risk = "may not handle errors the same way, potentially causing unhandled failures";
  }
  
  // Refine based on missing info — keep language cautious and plain
  if (/not found|not equivalent|not migrated|not present/.test(missing.toLowerCase())) {
    modAction = "we could not identify the equivalent logic in the MOD source code reviewed";
  } else if (/fewer|less|reduced/.test(missing.toLowerCase())) {
    modAction = "MOD has fewer checks or operations than Legacy";
  }
  
  return { impact, legacyAction, modAction, risk };
}

function humanizeClassName(name: string): string {
  // Convert CamelCase/PascalCase to readable form
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/Bean$/i, " component")
    .replace(/Processor$/i, " processor")
    .replace(/Service$/i, " service")
    .replace(/Repository$/i, " data access")
    .replace(/Job$/i, " batch job")
    .replace(/Writer$/i, " writer")
    .replace(/Reader$/i, " reader")
    .toLowerCase();
}

function generateWhatLegacyDoes(legacyBehavior: string, analyses: AnalysisResult[], files: SourceFile[]): string {
  if (!legacyBehavior) return "We could not determine the Legacy behavior from the available source code.";
  
  const classNames = analyses.flatMap(a => a.classes.map(c => c.name));
  const methodNames = analyses.flatMap(a => a.methods);
  const sqlStatements = analyses.flatMap(a => a.sqlStatements);
  const conditions = analyses.flatMap(a => a.conditions);
  const tables = [...new Set(analyses.flatMap(a => a.tableReferences.map(t => t.name)))];
  const businessRules = analyses.flatMap(a => a.businessRules);
  const validations = analyses.flatMap(a => a.validations);
  const errorHandlers = analyses.flatMap(a => a.errorHandlers);
  
  // Build a narrative explanation
  let explanation = "";
  
  // Start with what the code does
  if (/charge|billing|invoice/.test(legacyBehavior.toLowerCase())) {
    explanation += "The Legacy system uses this code to create and manage charges for billing. It determines which charges should be created and how they should be processed. ";
  } else if (/claim/.test(legacyBehavior.toLowerCase())) {
    explanation += "The Legacy system uses this code to process claims. It validates claim data and determines how each claim should be handled. ";
  } else if (/driver/.test(legacyBehavior.toLowerCase())) {
    explanation += "The Legacy system uses this code to match claims against driver configuration data. It checks whether claims meet the eligibility criteria. ";
  } else if (/queue|batch|job/.test(legacyBehavior.toLowerCase())) {
    explanation += "The Legacy system uses this code to process records in batches through a job pipeline. ";
  } else if (/table|sql|database/.test(legacyBehavior.toLowerCase())) {
    explanation += "The Legacy system uses this code to interact with database tables, reading and writing data as part of the business process. ";
  } else if (/error|exception/.test(legacyBehavior.toLowerCase())) {
    explanation += "The Legacy system uses this code to handle error conditions and exceptional situations. ";
  } else {
    explanation += `In the Legacy system, ${legacyBehavior}. `;
  }
  
  // Mention what components are involved (use human-readable names)
  if (classNames.length > 0) {
    const humanNames = classNames.map(humanizeClassName);
    explanation += `The code is organized in components such as ${humanNames.join(", ")}. `;
  }
  
  // Describe what the code checks/validates
  if (conditions.length > 0) {
    const condDescriptions = conditions.slice(0, 5).map(c => {
      const expr = c.expression;
      // Make conditions readable
      if (/group/i.test(expr)) return "checks the Group value";
      if (/product/i.test(expr)) return "checks the Product value";
      if (/payroll/i.test(expr)) return "checks the Payroll Location";
      if (/status/i.test(expr)) return "checks the status code";
      if (/date/i.test(expr)) return "validates dates";
      if (/amount|total/i.test(expr)) return "validates monetary amounts";
      if (/null|empty/i.test(expr)) return "checks for missing values";
      if (/select|exists/i.test(expr)) return "queries the database for related records";
      return `evaluates: ${expr.slice(0, 60)}`;
    });
    explanation += `It ${condDescriptions.join(", ")}. `;
  }
  
  // Describe database interactions
  if (tables.length > 0) {
    const ops = sqlStatements.map(s => s.type.toLowerCase());
    const uniqueOps = [...new Set(ops)];
    if (uniqueOps.length > 0) {
      explanation += `It ${uniqueOps.includes("select") ? "reads from" : "interacts with"} database tables including ${tables.slice(0, 4).join(", ")}. `;
    }
  }
  
  // Describe validations
  if (validations.length > 0) {
    explanation += `The code includes ${validations.length} validation check(s) to ensure data meets business requirements. `;
  }
  
  // Describe error handling
  if (errorHandlers.length > 0) {
    explanation += `It also includes ${errorHandlers.length} error handling block(s) to manage exceptional situations. `;
  }
  
  // Describe business rules
  if (businessRules.length > 0) {
    const ruleSummaries = businessRules.slice(0, 3).map(r => r.description);
    if (ruleSummaries.length > 0) {
      explanation += `Key business rules include: ${ruleSummaries.join("; ")}. `;
    }
  }
  
  // Mention files
  const fileNames = files.map(f => f.name);
  if (fileNames.length > 0) {
    explanation += `This is implemented in: ${fileNames.join(", ")}.`;
  }
  
  return explanation || `Legacy behavior: ${legacyBehavior}`;
}

function generateWhatModDoes(modernBehavior: string, whatIsMissing: string, analyses: AnalysisResult[], files: SourceFile[]): string {
  if (whatIsMissing && (whatIsMissing.toLowerCase().includes("not found") || whatIsMissing.toLowerCase().includes("not present") || whatIsMissing.toLowerCase().includes("not migrated"))) {
    let explanation = "In the MOD source code that has been reviewed, we could not identify the equivalent processing logic. ";
    
    const classNames = analyses.flatMap(a => a.classes.map(c => c.name));
    if (classNames.length > 0) {
      explanation += `The MOD code does include ${classNames.map(humanizeClassName).join(", ")}, but none of these appear to implement the same business logic that the Legacy code performs. `;
    }
    
    explanation += "This does not necessarily mean the functionality is missing — it may be implemented in MOD code that has not yet been provided for review, or it may be handled by a different component or external system.";
    return explanation;
  }
  
  if (!modernBehavior) return "We could not determine the MOD behavior from the available source code.";
  
  let explanation = `In the MOD system: ${modernBehavior}. `;
  const classNames = analyses.flatMap(a => a.classes.map(c => c.name));
  if (classNames.length > 0) {
    explanation += `The MOD implementation uses ${classNames.map(humanizeClassName).join(", ")}.`;
  }
  return explanation;
}

function generateWhyItMatters(businessImpact: string, category: string, severity: string): string {
  if (severity === "critical") return `This is important because ${businessImpact.toLowerCase()} If this is confirmed, it could significantly affect how the business operates, potentially leading to financial or compliance issues.`;
  if (severity === "high") return `This matters because ${businessImpact.toLowerCase()} If not addressed, it could lead to incorrect business outcomes that affect customers or financial records.`;
  if (severity === "medium") return `This is worth noting because ${businessImpact.toLowerCase()} It may affect certain business scenarios that should be tested.`;
  return `${businessImpact}`;
}

function generatePossibleImpact(businessImpact: string, category: string, severity: string): string {
  if (category.includes("missing") || category === "logic_missing") {
    if (severity === "critical" || severity === "high") {
      return "If this functionality is genuinely missing from MOD, it could mean that certain business operations that worked in Legacy may not work the same way in MOD. This could result in incorrect data processing, missing records, or business rules not being enforced. Testing should verify whether this is truly missing or implemented differently.";
    }
    return "This functionality may be implemented in a different way in MOD, or it may be handled by an external system. Testing should verify the actual MOD behavior for this scenario.";
  }
  if (category.includes("changed")) {
    return "The change in behavior may be intentional as part of modernization, or it may be an unintended consequence. Business stakeholders should confirm whether the new behavior meets requirements.";
  }
  return "The impact needs to be evaluated against business requirements. It may or may not affect end users depending on how the system is configured.";
}

function generateWhatIsDifferent(title: string, category: string, legacy: string, changed: string, missing: string): string {
  // Produce a plain-English explanation of what changed, without technical jargon
  const isMissing = category.includes("missing") || category === "logic_missing";
  const isChanged = category.includes("changed") || category === "db_operation_changed";
  const isTable = title.includes("Table ") || title.includes("table ");
  const isValidation = category.includes("validation") || category.includes("condition");
  const isError = category.includes("error");
  const isRule = title.includes("business rule");

  if (isTable && isMissing) {
    return "Legacy reads from or writes to a database table that MOD does not appear to access. This means the data that Legacy processes through this table may not be handled the same way in MOD.";
  }
  if (isTable && isChanged) {
    return "The way Legacy interacts with a database table has changed in MOD. The type of operation (such as reading vs writing) is different, which could affect how data flows through the system.";
  }
  if (isValidation && isMissing) {
    return "Legacy includes validation checks that verify data meets business requirements before processing. MOD has fewer checks, which could mean some validations are not enforced.";
  }
  if (isError && isMissing) {
    return "Legacy handles error situations to prevent the system from failing unexpectedly. MOD may not handle these situations the same way.";
  }
  if (isRule && isMissing) {
    return "Legacy contains business rules that control how data is processed. Some of these rules may not be implemented in MOD yet.";
  }
  if (isMissing) {
    return "Legacy includes a processing step that we could not find in the MOD code reviewed. This step may handle part of the business process.";
  }
  if (isChanged) {
    return "The behavior has changed between Legacy and MOD. This change may be intentional as part of modernization, or it may be an unintended difference.";
  }

  // Generic fallback
  return `${legacy}. ${changed}.`;
}

function generateConfidenceExplanation(confidence: string, legacy: string, modern: string): string {
  if (confidence === "confirmed") {
    return "We are confident about this finding because the Legacy source code explicitly shows this behavior, and after reviewing the MOD source code provided, we did not find equivalent logic. The MOD code was thoroughly checked for matching patterns.";
  }
  if (confidence === "inferred") {
    return "We believe this finding is likely accurate, but we cannot be completely certain. The Legacy code shows this behavior, but the MOD code provided may not include all relevant files. The equivalent functionality might exist in MOD code that was not included in the upload, or it may be handled by a configuration or external system.";
  }
  return "We have limited information about this finding. The Legacy source does not fully reveal the complete behavior, and more context is needed to confirm whether this is a real difference.";
}

function generateMissingInformation(category: string, affectedTable?: string, affectedFile?: string, legacyAnalyses?: AnalysisResult[], modernAnalyses?: AnalysisResult[]): MissingInformation[] {
  const items: MissingInformation[] = [];
  if (affectedTable) {
    items.push({ type: "table_schema", description: `Schema definition for table ${affectedTable}`, whyNeeded: `To understand the data structure used by the Legacy ${affectedTable} reference`, suggestedQuery: `DESCRIBE ${affectedTable};` });
    items.push({ type: "sample_data", description: `Representative sample data from ${affectedTable}`, whyNeeded: `To understand the actual data patterns and values used`, suggestedQuery: `SELECT * FROM ${affectedTable} WHERE ROWNUM <= 10;` });
  }
  if (category.includes("validation") || category.includes("condition")) {
    items.push({ type: "configuration", description: "Validation configuration or rule table data", whyNeeded: "To understand what values are considered valid/invalid" });
  }
  if (category.includes("status_code")) {
    items.push({ type: "status_code_meaning", description: "Status code descriptions and their business meanings", whyNeeded: "To explain what each status code means in business terms" });
  }
  if (category.includes("clob") || category.includes("external")) {
    items.push({ type: "clob_content", description: "CLOB column contents or configuration data", whyNeeded: "The code reads business rules from a CLOB; the actual rules are not in the source code" });
  }
  if (items.length === 0) {
    items.push({ type: "other", description: "Additional MOD source code or configuration", whyNeeded: "To verify whether the Legacy behavior is implemented elsewhere in MOD" });
  }
  return items;
}

function generateDevQuestion(title: string, legacy: string, modern: string, missing: string, category: string): string {
  const ctx = extractBusinessContext(title, legacy, missing);
  if (category.includes("missing") || category === "logic_missing") {
    return `The Legacy system ${ctx.legacyAction}. We could not identify equivalent behavior in the MOD source code reviewed.\n\nCan you please confirm:\n1. Where is this functionality implemented in MOD?\n2. If it has been intentionally removed, what is the business reason?\n3. What is the expected behavior in MOD for this scenario?\n\nIf this is handled by a different MOD component or external system, please provide the relevant source code.`;
  }
  if (category.includes("changed")) {
    return `The Legacy system ${ctx.legacyAction}, but MOD ${ctx.modAction || "behaves differently"}.\n\nCan you please confirm:\n1. Is this change in behavior intentional?\n2. What is the expected behavior in MOD?\n3. Are there any business rules that govern this change?`;
  }
  return `We identified a difference related to: ${title}.\n\nLegacy: ${legacy}\nMOD: ${modern || "Not identified"}\n\nCan you help clarify the intended MOD behavior and whether any business rules apply?`;
}

function extractBusinessRulesFromAnalysis(analyses: AnalysisResult[], files: SourceFile[]): ExtractedBusinessRule[] {
  const rules: ExtractedBusinessRule[] = [];
  let ruleNum = 1;
  
  for (const analysis of analyses) {
    const fileName = files.find(f => f.id === analysis.fileId)?.name || "unknown";
    
    // Convert detected business rules to human-readable form
    for (const rule of analysis.businessRules) {
      const humanCondition = humanizeCondition(rule.condition);
      const humanAction = humanizeAction(rule.context);
      rules.push({
        id: genId("br"),
        ruleNumber: `BR-${String(ruleNum++).padStart(3, "0")}`,
        title: humanizeRuleTitle(rule.description, rule.condition),
        description: `${humanCondition}. When this condition is met, ${humanAction}.`,
        condition: humanCondition,
        action: humanAction,
        otherwise: "The system follows alternative handling (verify with development team)",
        sourceRef: `${fileName}${rule.line ? ` (line ${rule.line})` : ""}`,
        confidence: rule.confidence === "confirmed" ? "high" : rule.confidence === "inferred" ? "medium" : "low",
        statusInLegacy: "identified",
        statusInMod: "unknown",
      });
    }
    
    // Convert conditions to business rules
    for (const condition of analysis.conditions) {
      if (condition.expression.length > 10) {
        const humanExpr = humanizeCondition(condition.expression);
        const contextDesc = humanizeClassName(condition.context);
        rules.push({
          id: genId("br"),
        ruleNumber: `BR-${String(ruleNum++).padStart(3, "0")}`,
          title: humanizeRuleTitle(`Check in ${contextDesc}`, condition.expression),
          description: `In the ${contextDesc}: ${humanExpr}.`,
          condition: humanExpr,
          action: condition.type === "if" ? "The process continues with this condition met" : `Handles the ${condition.type} case`,
          otherwise: "Alternative processing path is followed",
          sourceRef: `${fileName}${condition.line ? ` (line ${condition.line})` : ""}`,
          confidence: "medium",
          statusInLegacy: "identified",
          statusInMod: "unknown",
        });
      }
    }
    
    // Convert SQL to business rules
    for (const sql of analysis.sqlStatements) {
      if (sql.type === "SELECT" && sql.tables.length > 0) {
        rules.push({
          id: genId("br"),
          ruleNumber: `BR-${String(ruleNum++).padStart(3, "0")}`,
          title: `Database lookup: reads from ${sql.tables.join(", ")}`,
          description: `The system reads data from ${sql.tables.join(", ")}${sql.conditions.length > 0 ? " where " + sql.conditions.slice(0, 2).map(c => humanizeCondition(c)).join(" and ") : ""} to support business processing.`,
          condition: sql.conditions.length > 0 ? sql.conditions.map(c => humanizeCondition(c)).join(" and ") : "Data exists in the table",
          action: `Retrieves information from ${sql.tables.join(", ")}`,
          otherwise: "Default values or error handling may apply",
          sourceRef: `${fileName}${sql.line ? ` (line ${sql.line})` : ""}`,
          confidence: "high",
          statusInLegacy: "identified",
          statusInMod: "unknown",
        });
      }
    }
  }
  
  // Deduplicate by title
  const seen = new Set<string>();
  return rules.filter(r => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  }).slice(0, 20);
}

function humanizeCondition(expr: string): string {
  if (!expr) return "a condition is evaluated";
  let s = expr
    .replace(/\bif\s*\(/i, "")
    .replace(/\)$/g, "")
    .replace(/\.equals\s*\(/gi, " equals ")
    .replace(/\.equalsIgnoreCase\s*\(/gi, " equals (case-insensitive) ")
    .replace(/==/g, " equals ")
    .replace(/!=/g, " does not equal ")
    .replace(/>=/g, " is at least ")
    .replace(/<=/g, " is at most ")
    .replace(/>/g, " is greater than ")
    .replace(/</g, " is less than ")
    .replace(/\band\b/gi, "AND")
    .replace(/\bor\b/gi, "OR")
    .replace(/\bnull\b/gi, "empty/missing")
    .replace(/\.length/g, " length")
    .replace(/\.size\(\)/g, " count")
    .replace(/\.isEmpty\(\)/g, " is empty")
    .replace(/\bget\s*\(/gi, "get ")
    .trim();
  // Clean up field references
  s = s.replace(/claim\.group/gi, "claim Group")
    .replace(/claim\.product/gi, "claim Product")
    .replace(/claim\.payroll/gi, "claim Payroll Location")
    .replace(/driver\.group/gi, "driver Group")
    .replace(/driver\.product/gi, "driver Product")
    .replace(/driver\.payroll/gi, "driver Payroll Location")
    .replace(/status\s*equals\s*'([\w]+)'/gi, "status is '$1'")
    .replace(/groupId/gi, "Group")
    .replace(/productId/gi, "Product")
    .replace(/payrollLocation/gi, "Payroll Location")
    .replace(/chargeId/gi, "Charge ID")
    .replace(/claimId/gi, "Claim ID")
    .replace(/amount/gi, "amount")
    .replace(/total/gi, "total");
  return s.length > 120 ? s.slice(0, 120) + "..." : s;
}

function humanizeAction(context: string): string {
  if (!context) return "a business action is performed";
  let s = context
    .replace(/createCharge/gi, "a charge record is created")
    .replace(/createChargeDetail/gi, "a charge detail record is created")
    .replace(/updateStatus/gi, "the record status is updated")
    .replace(/insert/gi, "a new record is inserted")
    .replace(/update/gi, "an existing record is updated")
    .replace(/delete/gi, "a record is removed")
    .replace(/select/gi, "data is retrieved from the database")
    .replace(/throw.*exception/gi, "an error condition is raised")
    .replace(/return/gi, "the result is returned")
    .trim();
  return s.length > 100 ? s.slice(0, 100) + "..." : s;
}

function humanizeRuleTitle(description: string, condition: string): string {
  if (description && description.length > 10 && !description.startsWith("Condition:")) {
    // Capitalize first letter and clean up
    return description.charAt(0).toUpperCase() + description.slice(1);
  }
  // Generate from condition
  const human = humanizeCondition(condition);
  if (human.length > 10) {
    return `Rule: ${human.charAt(0).toUpperCase() + human.slice(1)}`;
  }
  return description || "Business rule detected";
}

function generateBusinessTitle(technicalTitle: string, category: string, affectedTable?: string, affectedFile?: string): string {
  // Convert technical finding titles to plain-English business titles
  // NO class names, NO method names, NO code references

  const isMissing = category.includes("missing") || category === "logic_missing";
  const isChanged = category.includes("changed") || category === "db_operation_changed" || category === "table_mapping_changed";
  const isValidation = category.includes("validation") || category.includes("condition");
  const isError = category.includes("error");
  const isTable = technicalTitle.includes("Table ") || technicalTitle.includes("table ");
  const isSQL = technicalTitle.includes("SQL ");
  const isRule = technicalTitle.includes("business rule");

  // Extract human-readable name from file/class name
  let componentDesc = "a Legacy component";
  if (affectedFile) {
    componentDesc = humanizeClassName(affectedFile.replace(/\.(java|sql|pls|pks|pkb|sh|xml|json|ts|js)$/i, ""));
  }

  let tableDesc = "a database table";
  if (affectedTable) {
    tableDesc = `the ${affectedTable} table`;
  }

  if (isTable && isMissing) {
    return `Legacy uses ${tableDesc} that MOD does not appear to access`;
  }
  if (isTable && isChanged && technicalTitle.includes("New table")) {
    return `MOD introduces ${tableDesc} that was not in Legacy`;
  }
  if (isTable && isChanged) {
    return `How ${tableDesc} is used has changed between Legacy and MOD`;
  }
  if (isSQL && isMissing) {
    return `Database operations on ${tableDesc} are missing from MOD`;
  }
  if (isValidation && isMissing) {
    return `Legacy includes validation checks that MOD may not have`;
  }
  if (isValidation && isChanged) {
    return `Validation rules have changed between Legacy and MOD`;
  }
  if (isError && isMissing) {
    return `Legacy handles error situations that MOD may not cover`;
  }
  if (isRule && isMissing) {
    return `Legacy has business rules that were not found in MOD`;
  }
  if (isMissing && affectedFile) {
    return `${componentDesc} may not have been migrated to MOD`;
  }
  if (isChanged && affectedFile) {
    return `The behavior of ${componentDesc} has changed in MOD`;
  }
  if (isMissing) {
    return `A Legacy process was not identified in the MOD code reviewed`;
  }
  if (isChanged) {
    return `A process has changed between Legacy and MOD`;
  }

  // Fallback: strip class/method names from technical title
  return technicalTitle
    .replace(/class\s+\w+/gi, "a Legacy component")
    .replace(/method\s+\w+\.\w+/gi, "a Legacy process")
    .replace(/\(\d+ vs \d+ in legacy\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectFunctionality(analyses: AnalysisResult[], files: SourceFile[]): string {
  const names = files.map(f => f.name.toLowerCase()).join(" ");
  const content = analyses.map(a => a.classes.map(c => c.name).join(" ")).join(" ").toLowerCase();
  const all = names + " " + content;
  if (/charge|billing|invoice/.test(all)) return "Charge/Billing Processing";
  if (/claim|validation/.test(all)) return "Claim Processing";
  if (/driver/.test(all)) return "Driver Configuration";
  if (/queue|batch|job/.test(all)) return "Batch Processing";
  if (/adjust|correction/.test(all)) return "Adjustment Processing";
  return "General Processing";
}

// ============================================================
// Comparison Engine: Legacy vs Modern Analysis
// Generates findings, evidence requests, and business rules
// ============================================================

export interface ComparisonResult {
  findings: Finding[];
  evidenceRequests: EvidenceRequest[];
  knowledgeEntries: KnowledgeEntry[];
}

export function compareLegacyModern(
  legacyAnalyses: AnalysisResult[],
  modernAnalyses: AnalysisResult[],
  legacyFiles: SourceFile[],
  modernFiles: SourceFile[],
  projectId: string,
): ComparisonResult {
  const findings: Finding[] = [];
  const evidenceRequests: EvidenceRequest[] = [];
  const knowledgeEntries: KnowledgeEntry[] = [];

  // 1. Compare table references
  const legacyTables = new Map<string, { op: string; refs: TableReference[] }>();
  const modernTables = new Map<string, { op: string; refs: TableReference[] }>();

  for (const a of legacyAnalyses) {
    for (const t of a.tableReferences) {
      const key = t.name.toUpperCase();
      if (!legacyTables.has(key)) legacyTables.set(key, { op: t.operation, refs: [] });
      legacyTables.get(key)!.refs.push(t);
    }
  }
  for (const a of modernAnalyses) {
    for (const t of a.tableReferences) {
      const key = t.name.toUpperCase();
      if (!modernTables.has(key)) modernTables.set(key, { op: t.operation, refs: [] });
      modernTables.get(key)!.refs.push(t);
    }
  }

  // Tables in legacy but not in modern
  for (const [tableName, legacyInfo] of legacyTables) {
    if (!modernTables.has(tableName)) {
      const legacyFile = legacyFiles.find(f => legacyAnalyses.some(a => a.fileId === f.id && a.tableReferences.some(t => t.name.toUpperCase() === tableName)));
      findings.push({
        id: genId("finding"),
        projectId,
        title: generateBusinessTitle(`Table ${tableName} not referenced in MOD`, "table_mapping_changed", tableName),
        description: `Legacy code reads from or writes to the ${tableName} table, but the MOD code reviewed does not appear to interact with this table. This could mean the table was renamed, replaced, or the data access is handled differently in MOD.`,
        category: "table_mapping_changed",
        severity: "high",
        status: "open",
        legacyBehavior: `Legacy references table ${tableName} with ${legacyInfo.op} operations`,
        modernBehavior: `No MOD code references ${tableName}`,
        whatChanged: `Table reference ${tableName} absent in MOD`,
        whatIsMissing: `MOD does not interact with table ${tableName}`,
        businessImpact: `Data previously read/written to ${tableName} may not be handled`,
        technicalImpact: `Potential missing data migration or table mapping`,
        affectedTable: tableName,
        legacySource: legacyFile ? { fileId: legacyFile.id, fileName: legacyFile.name } : undefined,
        recommendation: `Verify if ${tableName} was renamed, replaced, or intentionally removed in MOD`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: "inferred",
      });
    }
  }

  // Tables in modern but not in legacy
  for (const [tableName, modernInfo] of modernTables) {
    if (!legacyTables.has(tableName)) {
      const modernFile = modernFiles.find(f => modernAnalyses.some(a => a.fileId === f.id && a.tableReferences.some(t => t.name.toUpperCase() === tableName)));
      findings.push({
        id: genId("finding"),
        projectId,
        title: generateBusinessTitle(`New table ${tableName} in MOD (not in legacy)`, "table_mapping_changed", tableName),
        description: `MOD code interacts with the ${tableName} table, but Legacy does not. This may be a new table introduced during modernization, or it could be a renamed version of an existing Legacy table.`,
        category: "table_mapping_changed",
        severity: "medium",
        status: "open",
        legacyBehavior: `No legacy code references ${tableName}`,
        modernBehavior: `MOD references table ${tableName} with ${modernInfo.op} operations`,
        whatChanged: `New table ${tableName} introduced in MOD`,
        whatIsMissing: `N/A - new in MOD`,
        businessImpact: `New data storage introduced`,
        technicalImpact: `New table requires schema definition and data migration plan`,
        affectedTable: tableName,
        modernSource: modernFile ? { fileId: modernFile.id, fileName: modernFile.name } : undefined,
        recommendation: `Document purpose of new table ${tableName} and ensure schema is defined`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: "observed",
      });
    }
  }

  // 2. Compare SQL operations per table
  for (const [tableName, legacyInfo] of legacyTables) {
    const modernInfo = modernTables.get(tableName);
    if (modernInfo && legacyInfo.op !== modernInfo.op) {
      findings.push({
        id: genId("finding"),
        projectId,
        title: generateBusinessTitle(`SQL operation changed for ${tableName}`, "db_operation_changed", tableName),
        description: `Legacy performs a ${legacyInfo.op} operation on the ${tableName} table, while MOD performs a ${modernInfo.op} operation. The type of database interaction has changed, which could affect how data flows through the system.`,
        category: "db_operation_changed",
        severity: "medium",
        status: "open",
        legacyBehavior: `Legacy performs ${legacyInfo.op} on ${tableName}`,
        modernBehavior: `MOD performs ${modernInfo.op} on ${tableName}`,
        whatChanged: `Operation type changed from ${legacyInfo.op} to ${modernInfo.op}`,
        whatIsMissing: "",
        businessImpact: `Data flow pattern changed for ${tableName}`,
        technicalImpact: `Different SQL operations may affect data integrity`,
        affectedTable: tableName,
        recommendation: `Verify the operation change is intentional and complete`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: "confirmed",
      });
    }
  }

  // 3. Compare class/method structures
  const legacyClassNames = new Set(legacyAnalyses.flatMap(a => a.classes.map(c => c.name)));
  const modernClassNames = new Set(modernAnalyses.flatMap(a => a.classes.map(c => c.name)));

  // Classes in legacy not in modern (potential missing migration)
  for (const className of legacyClassNames) {
    if (!modernClassNames.has(className)) {
      const legacyAnalysis = legacyAnalyses.find(a => a.classes.some(c => c.name === className));
      const legacyClass = legacyAnalysis?.classes.find(c => c.name === className);
      const legacyFile = legacyFiles.find(f => f.id === legacyAnalysis?.fileId);
      findings.push({
        id: genId("finding"),
        projectId,
        title: generateBusinessTitle(`Legacy class ${className} has no MOD equivalent`, "logic_missing", undefined, legacyFile?.name),
        description: `The Legacy system includes ${humanizeClassName(className)} (${legacyClass?.methods?.length || 0} methods) which handles part of the business process. The MOD code reviewed does not appear to contain equivalent functionality. This does not necessarily mean it is missing—it may be implemented in MOD code that was not provided, or handled by a different component.`,
        category: "logic_missing",
        severity: legacyClass && legacyClass.methods.length > 3 ? "high" : "medium",
        status: "open",
        legacyBehavior: `Legacy class ${className} with methods: ${(legacyClass?.methods || []).join(", ")}`,
        modernBehavior: `No equivalent class found in MOD code`,
        whatChanged: `Class ${className} not migrated`,
        whatIsMissing: `All logic in ${className}`,
        businessImpact: `Functionality from ${className} may be missing in MOD`,
        technicalImpact: `Unimplemented legacy behavior`,
        affectedFile: legacyFile?.name,
        legacySource: legacyFile ? { fileId: legacyFile.id, fileName: legacyFile.name } : undefined,
        recommendation: `Investigate whether ${className} functionality was merged into another class or intentionally removed`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: "inferred",
      });
    }
  }

  // 4. Compare methods within matching class names
  for (const className of legacyClassNames) {
    if (modernClassNames.has(className)) {
      const legacyAnalysis = legacyAnalyses.find(a => a.classes.some(c => c.name === className));
      const modernAnalysis = modernAnalyses.find(a => a.classes.some(c => c.name === className));
      const legacyClass = legacyAnalysis?.classes.find(c => c.name === className);
      const modernClass = modernAnalysis?.classes.find(c => c.name === className);

      if (legacyClass && modernClass) {
        const legacyMethods = new Set(legacyClass.methods);
        const modernMethods = new Set(modernClass.methods);

        for (const method of legacyMethods) {
          if (!modernMethods.has(method)) {
            const legacyFile = legacyFiles.find(f => f.id === legacyAnalysis?.fileId);
            findings.push({
              id: genId("finding"),
              projectId,
              title: generateBusinessTitle(`Method ${className}.${method} missing in MOD`, "logic_missing", undefined, legacyFile?.name),
              description: `The Legacy ${humanizeClassName(className)} includes a step called ${method} that was not found in the equivalent MOD component. This step may handle part of the business process that needs verification.`,
              category: "logic_missing",
              severity: "medium",
              status: "open",
              legacyBehavior: `Method ${method} exists in legacy ${className}`,
              modernBehavior: `Method ${method} not found in MOD ${className}`,
              whatChanged: `Method not migrated`,
              whatIsMissing: `Logic in ${method}`,
              businessImpact: `Behavior from ${method} may be missing`,
              technicalImpact: `Unimplemented method`,
              affectedFile: legacyFile?.name,
              legacySource: legacyFile ? { fileId: legacyFile.id, fileName: legacyFile.name } : undefined,
              recommendation: `Verify if ${method} was renamed, merged, or intentionally removed`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              confidence: "inferred",
            });
          }
        }
      }
    }
  }

  // 5. Compare SQL statements
  const legacySqlTables = new Set(legacyAnalyses.flatMap(a => a.sqlStatements.flatMap(s => s.tables)));
  const modernSqlTables = new Set(modernAnalyses.flatMap(a => a.sqlStatements.flatMap(s => s.tables)));

  for (const sqlTable of legacySqlTables) {
    if (!modernSqlTables.has(sqlTable)) {
      const legacyFile = legacyFiles.find(f => legacyAnalyses.some(a => a.fileId === f.id && a.sqlStatements.some(s => s.tables.includes(sqlTable))));
      findings.push({
        id: genId("finding"),
        projectId,
        title: generateBusinessTitle(`SQL references to ${sqlTable} missing in MOD`, "missing_functionality", sqlTable),
        description: `Legacy code includes database queries that access the ${sqlTable} table, but the MOD code reviewed does not contain equivalent queries. The data operations on this table may need to be verified.`,
        category: "db_operation_changed",
        severity: "medium",
        status: "open",
        legacyBehavior: `Legacy SQL queries/updates ${sqlTable}`,
        modernBehavior: `No MOD SQL references ${sqlTable}`,
        whatChanged: `SQL table reference missing in MOD`,
        whatIsMissing: `SQL operations on ${sqlTable}`,
        businessImpact: `Data operations on ${sqlTable} may be missing`,
        technicalImpact: `Missing SQL migration`,
        affectedTable: sqlTable,
        legacySource: legacyFile ? { fileId: legacyFile.id, fileName: legacyFile.name } : undefined,
        recommendation: `Verify if ${sqlTable} references were intentionally removed or mapped to another table`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        confidence: "inferred",
      });
    }
  }

  // 6. Compare conditions/validation logic
  const legacyConditionCount = legacyAnalyses.reduce((sum, a) => sum + a.conditions.length, 0);
  const modernConditionCount = modernAnalyses.reduce((sum, a) => sum + a.conditions.length, 0);

  if (legacyConditionCount > modernConditionCount + 2) {
    findings.push({
      id: genId("finding"),
      projectId,
      title: generateBusinessTitle(`Fewer validation conditions in MOD (${modernConditionCount} vs ${legacyConditionCount} in legacy)`, "validation_removed"),
      description: `Legacy code includes ${legacyConditionCount} validation checks that verify data before processing. MOD code includes only ${modernConditionCount} checks. This could mean ${legacyConditionCount - modernConditionCount} validation(s) are not implemented in MOD, which may allow invalid data to pass through.`,
      category: "validation_removed",
      severity: "high",
      status: "open",
      legacyBehavior: `${legacyConditionCount} conditions/validation checks`,
      modernBehavior: `${modernConditionCount} conditions/validation checks`,
      whatChanged: `${legacyConditionCount - modernConditionCount} fewer conditions in MOD`,
      whatIsMissing: `Potentially ${legacyConditionCount - modernConditionCount} validation checks`,
      businessImpact: `Missing validations may allow invalid data through`,
      technicalImpact: `Reduced defensive programming in MOD`,
      recommendation: `Compare individual conditions to verify which validations were intentionally removed vs accidentally omitted`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      confidence: "inferred",
    });
  }

  // 7. Compare error handlers
  const legacyErrorCount = legacyAnalyses.reduce((sum, a) => sum + a.errorHandlers.length, 0);
  const modernErrorCount = modernAnalyses.reduce((sum, a) => sum + a.errorHandlers.length, 0);

  if (legacyErrorCount > modernErrorCount + 1) {
    findings.push({
      id: genId("finding"),
      projectId,
      title: generateBusinessTitle(`Fewer error handlers in MOD (${modernErrorCount} vs ${legacyErrorCount} in legacy)`, "error_handling_removed"),
      description: `Legacy code includes ${legacyErrorCount} error handling blocks that catch and manage exceptional situations. MOD code includes only ${modernErrorCount}. Missing error handlers could cause the system to fail unexpectedly when something goes wrong.`,
      category: "error_handling_removed",
      severity: "medium",
      status: "open",
      legacyBehavior: `${legacyErrorCount} error handlers`,
      modernBehavior: `${modernErrorCount} error handlers`,
      whatChanged: `${legacyErrorCount - modernErrorCount} fewer error handlers in MOD`,
      whatIsMissing: `Error handling logic`,
      businessImpact: `Errors may not be handled the same way`,
      technicalImpact: `Different error handling behavior`,
      recommendation: `Compare error handling strategies between legacy and MOD`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      confidence: "inferred",
    });
  }

  // 8. Compare business rules detected
  const legacyRuleCount = legacyAnalyses.reduce((sum, a) => sum + a.businessRules.length, 0);
  const modernRuleCount = modernAnalyses.reduce((sum, a) => sum + a.businessRules.length, 0);

  if (legacyRuleCount > modernRuleCount) {
    findings.push({
      id: genId("finding"),
      projectId,
      title: generateBusinessTitle(`Fewer business rules detected in MOD (${modernRuleCount} vs ${legacyRuleCount} in legacy)`, "logic_missing"),
      description: `The code analysis found ${legacyRuleCount} business rules in Legacy (such as validation conditions, data checks, and processing logic). MOD code only shows ${modernRuleCount}. Some business rules may not be fully implemented in MOD yet.`,
      category: "logic_missing",
      severity: "high",
      status: "open",
      legacyBehavior: `${legacyRuleCount} business rules detected in legacy`,
      modernBehavior: `${modernRuleCount} business rules detected in MOD`,
      whatChanged: `${legacyRuleCount - modernRuleCount} fewer business rules in MOD`,
      whatIsMissing: `Business rule logic`,
      businessImpact: `Business rules may not be fully implemented in MOD`,
      technicalImpact: `Missing business logic`,
      recommendation: `Review individual business rules to identify which are missing or renamed in MOD`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      confidence: "inferred",
    });
  }

  // 9. Generate evidence requests for findings
  for (const finding of findings) {
    if (finding.severity === "critical" || finding.severity === "high") {
      evidenceRequests.push({
        id: genId("evidence"),
        projectId,
        title: `Evidence needed: ${finding.title}`,
        description: `${finding.description}\n\nRecommendation: ${finding.recommendation}`,
        status: "open",
        findingId: finding.id,
        createdAt: Date.now(),
      });
    }
  }

  // 10. Generate knowledge entries from analysis
  // Table knowledge
  for (const [tableName, info] of legacyTables) {
    knowledgeEntries.push({
      id: genId("knowledge"),
      projectId,
      category: "database_observation",
      title: `Legacy table: ${tableName}`,
      content: `Table ${tableName} is referenced in legacy code with ${info.op} operations. Found in ${info.refs.length} location(s).`,
      sourceFileIds: info.refs.map(r => ""),
      tags: ["legacy", "table", tableName.toLowerCase()],
      createdAt: Date.now(),
    });
  }

  // Summary knowledge
  knowledgeEntries.push({
    id: genId("knowledge"),
    projectId,
    category: "legacy_behavior",
    title: "Legacy analysis summary",
    content: `Legacy: ${legacyAnalyses.length} files analyzed, ${legacyClassNames.size} classes, ${legacyTables.size} tables, ${legacyConditionCount} conditions, ${legacyRuleCount} business rules, ${legacyErrorCount} error handlers.`,
    sourceFileIds: legacyFiles.map(f => f.id),
    tags: ["summary", "legacy"],
    createdAt: Date.now(),
  });

  knowledgeEntries.push({
    id: genId("knowledge"),
    projectId,
    category: "legacy_behavior",
    title: "MOD analysis summary",
    content: `MOD: ${modernAnalyses.length} files analyzed, ${modernClassNames.size} classes, ${modernTables.size} tables, ${modernConditionCount} conditions, ${modernRuleCount} business rules, ${modernErrorCount} error handlers.`,
    sourceFileIds: modernFiles.map(f => f.id),
    tags: ["summary", "modern"],
    createdAt: Date.now(),
  });

  // Generate business explanations for all findings
  for (const finding of findings) {
    finding.businessExplanation = generateBusinessExplanation({
      title: finding.title,
      category: finding.category,
      legacyBehavior: finding.legacyBehavior,
      modernBehavior: finding.modernBehavior,
      whatChanged: finding.whatChanged,
      whatIsMissing: finding.whatIsMissing,
      businessImpact: finding.businessImpact,
      legacyFiles,
      modernFiles,
      legacyAnalyses,
      modernAnalyses,
      affectedTable: finding.affectedTable,
      affectedFile: finding.affectedFile,
      severity: finding.severity,
      confidence: finding.confidence,
    });
  }

  return { findings, evidenceRequests, knowledgeEntries };
}

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
