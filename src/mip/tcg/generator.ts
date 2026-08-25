// ============================================================
// Requirement → Test Case Generator — Deterministic Generator
// Generates test cases from extracted knowledge without AI.
// ============================================================

import type {
  ExtractedKnowledge,
  GeneratedTestCase,
  TestCaseGenType,
  TestCaseSource,
  TcgDocument,
  SqlParsedContent,
} from "./types";

let tcCounter = 0;

// --- Main entry ---
export function generateTestCases(
  knowledge: ExtractedKnowledge[],
  documents: TcgDocument[],
): GeneratedTestCase[] {
  tcCounter = 0;
  const cases: GeneratedTestCase[] = [];
  const sources = documents
    .filter(d => d.status === "parsed")
    .map(d => ({
      documentName: d.name,
      sectionRef: `${d.category}`,
      kind: d.category as TestCaseSource["kind"],
    }));

  // Get SQL documents for query generation
  const sqlDocs = documents.filter(d => d.parsedContent?.kind === "sql");
  const sqlContent = sqlDocs.map(d => d.parsedContent as SqlParsedContent);

  // Group knowledge by kind for targeted generation
  const byKind = groupByKind(knowledge);

  // 1. Generate from requirement statements
  for (const k of byKind.requirement_statement || []) {
    cases.push(...generateFromRequirement(k, sources));
  }

  // 2. Generate from validation rules
  for (const k of byKind.validation_rule || []) {
    cases.push(...generateFromValidation(k, sources, sqlContent));
  }

  // 3. Generate from business rules
  for (const k of byKind.business_rule || []) {
    cases.push(...generateFromBusinessRule(k, sources));
  }

  // 4. Generate from error handling
  for (const k of byKind.error_handling || []) {
    cases.push(...generateFromErrorHandling(k, sources, sqlContent));
  }

  // 5. Generate from database interactions
  for (const k of byKind.database_interaction || []) {
    cases.push(...generateFromDatabaseInteraction(k, sources, sqlContent));
  }

  // 6. Generate from flow steps
  for (const k of byKind.flow_step || []) {
    cases.push(...generateFromFlowStep(k, sources));
  }

  // 7. Generate from boundary conditions
  for (const k of byKind.boundary_condition || []) {
    cases.push(...generateFromBoundary(k, sources));
  }

  // 8. Generate from input/output
  for (const k of byKind.input_output || []) {
    cases.push(...generateFromInputOutput(k, sources));
  }

  // 9. Generate from schema info (database validation)
  for (const k of byKind.schema_info || []) {
    cases.push(...generateFromSchema(k, sources, sqlContent));
  }

  // 10. Generate from system interactions
  for (const k of byKind.system_interaction || []) {
    cases.push(...generateFromSystemInteraction(k, sources));
  }

  // 11. Generate from architecture flow
  for (const k of byKind.architecture_flow || []) {
    cases.push(...generateFromArchitecture(k, sources));
  }

  // Deduplicate cases by description similarity
  return deduplicateCases(cases);
}

// ============================================================
// Generator per knowledge type
// ============================================================

function generateFromRequirement(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  // Positive test: verify the requirement works
  cases.push(createCase(
    `Verify: ${k.text.slice(0, 120)}`,
    buildStepsFromRequirement(k.text),
    buildPrecondition(k),
    "",
    `The system should ${k.text.toLowerCase().replace(/^(the system |the application |the )/, "")}`,
    ["Functional", "Positive"],
    k,
    src,
  ));

  // Negative test: verify invalid input is rejected
  cases.push(createCase(
    `Verify rejection of invalid input for: ${k.text.slice(0, 80)}`,
    buildNegativeStepsFromRequirement(k.text),
    buildPrecondition(k),
    "",
    "The system should reject invalid input and display an appropriate error message",
    ["Functional", "Negative"],
    k,
    src,
  ));

  return cases;
}

function generateFromValidation(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
  sqlContent: SqlParsedContent[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  // Positive: validation passes
  cases.push(createCase(
    `Verify validation passes: ${k.text.slice(0, 100)}`,
    `1. Provide valid input that satisfies the validation rule.\n2. Submit the request.\n3. Verify the system accepts the input.`,
    buildPrecondition(k),
    generateQueryIfPossible(k, sqlContent),
    "The system should accept the valid input and proceed with processing",
    ["Functional", "Positive"],
    k,
    src,
  ));

  // Negative: validation fails
  cases.push(createCase(
    `Verify validation failure: ${k.text.slice(0, 100)}`,
    `1. Provide input that violates the validation rule.\n2. Submit the request.\n3. Verify the system rejects the input.`,
    buildPrecondition(k),
    generateQueryIfPossible(k, sqlContent),
    "The system should reject the invalid input and display the appropriate validation error",
    ["Functional", "Negative"],
    k,
    src,
  ));

  // Regression
  cases.push(createCase(
    `Regression: Verify existing validation still works: ${k.text.slice(0, 80)}`,
    `1. Use known valid test data.\n2. Execute the validation flow.\n3. Confirm expected outcome.`,
    buildPrecondition(k),
    "",
    "The existing validation behavior should continue to work as previously verified",
    ["Regression"],
    k,
    src,
  ));

  return cases;
}

function generateFromBusinessRule(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  cases.push(createCase(
    `Verify business rule: ${k.text.slice(0, 110)}`,
    buildStepsFromRequirement(k.text),
    buildPrecondition(k),
    "",
    `The system should correctly apply the business rule: ${k.text.slice(0, 150)}`,
    ["Functional", "Positive"],
    k,
    src,
  ));

  cases.push(createCase(
    `Verify business rule failure scenario: ${k.text.slice(0, 90)}`,
    `1. Set up conditions where the business rule is NOT met.\n2. Execute the process.\n3. Verify the system handles the rule violation correctly.`,
    buildPrecondition(k),
    "",
    "The system should detect the rule violation and handle it according to the documented behavior",
    ["Functional", "Negative"],
    k,
    src,
  ));

  return cases;
}

function generateFromErrorHandling(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
  sqlContent: SqlParsedContent[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  cases.push(createCase(
    `Verify error handling: ${k.text.slice(0, 110)}`,
    `1. Trigger the error condition described in the source.\n2. Verify the system handles the error gracefully.\n3. Verify an appropriate error message is displayed.\n4. Verify the system remains in a stable state.`,
    buildPrecondition(k),
    generateQueryIfPossible(k, sqlContent),
    "The system should handle the error gracefully, display a meaningful error message, and not crash or corrupt data",
    ["Functional", "Negative"],
    k,
    src,
  ));

  return cases;
}

function generateFromDatabaseInteraction(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
  sqlContent: SqlParsedContent[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  // Verify data is correctly persisted/retreived
  cases.push(createCase(
    `Verify database operation: ${k.text.slice(0, 110)}`,
    `1. Execute the action that triggers the database operation.\n2. Verify the data is correctly stored/retrieved in the database.\n3. Verify data integrity and constraints are maintained.`,
    buildPrecondition(k),
    generateQueryIfPossible(k, sqlContent),
    "The database operation should complete successfully with correct data integrity",
    ["Functional"],
    k,
    src,
  ));

  // Verify query returns expected results
  if (k.relatedTables.length > 0) {
    cases.push(createCase(
      `Verify data query: ${k.relatedTables.join(", ")} from ${k.text.slice(0, 80)}`,
      `1. Set up test data in the relevant tables.\n2. Execute the query/operation.\n3. Verify the returned data matches expected results.`,
      buildPrecondition(k),
      generateQueryIfPossible(k, sqlContent),
      "The query should return the correct data matching the test conditions",
      ["Functional"],
      k,
      src,
    ));
  }

  return cases;
}

function generateFromFlowStep(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  cases.push(createCase(
    `Verify process flow: ${k.text.slice(0, 110)}`,
    `1. Start at the beginning of the described flow.\n2. Execute each step in sequence.\n3. Verify each step completes successfully.\n4. Verify the final outcome matches expected behavior.`,
    buildPrecondition(k),
    "",
    "The process flow should execute in the documented sequence with correct outcomes at each step",
    ["Functional", "Positive"],
    k,
    src,
  ));

  return cases;
}

function generateFromBoundary(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  // Test at boundary
  cases.push(createCase(
    `Boundary test: ${k.text.slice(0, 110)}`,
    `1. Set the input to the exact boundary value described in the source.\n2. Submit the request.\n3. Verify the system handles the boundary value correctly.`,
    buildPrecondition(k),
    "",
    "The system should correctly handle the boundary value according to the documented constraints",
    ["Functional"],
    k,
    src,
  ));

  // Test just outside boundary
  cases.push(createCase(
    `Boundary exceeded: ${k.text.slice(0, 110)}`,
    `1. Set the input to a value just beyond the documented boundary.\n2. Submit the request.\n3. Verify the system rejects or handles the out-of-bound value.`,
    buildPrecondition(k),
    "",
    "The system should reject or handle the value that exceeds the documented boundary",
    ["Functional", "Negative"],
    k,
    src,
  ));

  return cases;
}

function generateFromInputOutput(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  cases.push(createCase(
    `Verify input/output: ${k.text.slice(0, 110)}`,
    `1. Provide the documented input.\n2. Execute the operation.\n3. Verify the expected output is displayed/returned.`,
    buildPrecondition(k),
    "",
    "The system should produce the documented output for the given input",
    ["Functional", "Positive"],
    k,
    src,
  ));

  return cases;
}

function generateFromSchema(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
  sqlContent: SqlParsedContent[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  // Generate database validation test for each table
  for (const table of k.relatedTables) {
    const query = generateSchemaQuery(table, sqlContent);

    cases.push(createCase(
      `Verify database schema and data for ${table}`,
      `1. Set up test data in ${table}.\n2. Execute the relevant operation.\n3. Query the database to verify the record was created/updated correctly.`,
      `Test data is prepared and database is accessible`,
      query,
      `The ${table} table should contain the expected records with correct column values`,
      ["Functional"],
      k,
      src,
    ));
  }

  return cases;
}

function generateFromSystemInteraction(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  cases.push(createCase(
    `Verify system interaction: ${k.text.slice(0, 110)}`,
    `1. Trigger the system interaction described in the source.\n2. Verify the request/response is correctly handled.\n3. Verify the system state is updated accordingly.`,
    buildPrecondition(k),
    "",
    "The system interaction should complete successfully with correct request/response handling",
    ["Functional"],
    k,
    src,
  ));

  return cases;
}

function generateFromArchitecture(
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  const src = sources.filter(s => s.documentName === getDocName(k.documentId, sources));

  cases.push(createCase(
    `End-to-end flow verification from architecture diagram`,
    `1. Start at the system entry point.\n2. Follow the documented flow through each component.\n3. Verify each processing stage completes correctly.\n4. Verify the final output/response.\n5. Verify database state if applicable.`,
    "All system components are operational and test data is prepared",
    "",
    "The end-to-end flow should work as depicted in the architecture diagram",
    ["Functional", "Positive"],
    k,
    src,
  ));

  cases.push(createCase(
    `Verify error handling at each flow stage from architecture diagram`,
    `1. At each component in the flow, introduce a failure condition.\n2. Verify the system handles the failure gracefully at each stage.\n3. Verify no data corruption occurs.`,
    "All system components are operational and test data is prepared",
    "",
    "The system should handle failures at each stage gracefully without data corruption",
    ["Functional", "Negative"],
    k,
    src,
  ));

  return cases;
}

// ============================================================
// SQL Query Generation
// ============================================================

function generateQueryIfPossible(
  k: ExtractedKnowledge,
  sqlContent: SqlParsedContent[],
): string {
  if (k.relatedTables.length === 0) return "";

  // Try to find the table in SQL content
  for (const sql of sqlContent) {
    for (const table of sql.tables) {
      if (k.relatedTables.some(rt => rt.toUpperCase() === table.name.toUpperCase())) {
        // Found the table — generate a query
        return generateSchemaQuery(table.name, sqlContent);
      }
    }
  }

  // If we have table references but no schema, generate a placeholder query
  if (k.relatedTables.length > 0) {
    const table = k.relatedTables[0];
    return `SELECT *\nFROM ${table}\nWHERE <CONDITION>;\n\n-- Placeholder: replace <CONDITION> with the actual filter condition`;
  }

  return "";
}

function generateSchemaQuery(
  tableName: string,
  sqlContent: SqlParsedContent[],
): string {
  for (const sql of sqlContent) {
    const tableDef = sql.tables.find(t => t.name.toUpperCase() === tableName.toUpperCase());
    if (tableDef) {
      // Build a SELECT query from the schema
      const cols = tableDef.columns.map(c => c.name).join(", ");
      const pkCol = tableDef.columns.find(c => c.isPrimaryKey);
      if (pkCol) {
        return `SELECT ${cols}\nFROM ${tableName}\nWHERE ${pkCol.name} = <${pkCol.name}>;`;
      }
      return `SELECT ${cols}\nFROM ${tableName}\nWHERE <CONDITION>;`;
    }
  }

  // No schema found
  return `SELECT *\nFROM ${tableName}\nWHERE <CONDITION>;\n\n-- Unable to generate precise query — required table/column information is not fully available in the uploaded sources.`;
}

// ============================================================
// Helper Builders
// ============================================================

function buildStepsFromRequirement(text: string): string {
  // Convert requirement text into test steps
  const lower = text.toLowerCase();

  if (/\b(validat|verif|check|ensur)\b/.test(lower)) {
    return `1. Set up the required test conditions.\n2. Execute the validation/check described.\n3. Verify the system validates correctly.\n4. Confirm the expected outcome.`;
  }

  if (/\b(create|add|insert|submit|send|post)\b/.test(lower)) {
    return `1. Navigate to the relevant screen/endpoint.\n2. Provide the required input data.\n3. Submit/create the record.\n4. Verify the record is created successfully.`;
  }

  if (/\b(update|modify|change|edit)\b/.test(lower)) {
    return `1. Locate an existing record.\n2. Modify the required fields.\n3. Save the changes.\n4. Verify the update is reflected correctly.`;
  }

  if (/\b(delete|remove|cancel|void)\b/.test(lower)) {
    return `1. Locate an existing record.\n2. Initiate the delete/remove operation.\n3. Confirm the action.\n4. Verify the record is removed/voided.`;
  }

  if (/\b(display|show|render|present|list)\b/.test(lower)) {
    return `1. Navigate to the relevant screen.\n2. Trigger the display operation.\n3. Verify the correct data is displayed.\n4. Verify formatting and layout.`;
  }

  return `1. Set up the required test conditions.\n2. Execute the operation described in the requirement.\n3. Verify the system behaves as documented.\n4. Confirm the expected outcome.`;
}

function buildNegativeStepsFromRequirement(text: string): string {
  return `1. Set up conditions where the requirement is NOT satisfied.\n2. Attempt the operation.\n3. Verify the system rejects/prevents the invalid operation.\n4. Verify an appropriate error/warning message is shown.`;
}

function buildPrecondition(k: ExtractedKnowledge): string {
  const parts: string[] = ["User is logged in and has appropriate access"];

  if (k.relatedTables.length > 0) {
    parts.push(`Test data exists in: ${k.relatedTables.join(", ")}`);
  }

  if (k.kind === "validation_rule" || k.kind === "business_rule") {
    parts.push("Valid test data is prepared for both positive and negative scenarios");
  }

  if (k.kind === "database_interaction") {
    parts.push("Database connection is available and test schema is set up");
  }

  if (k.kind === "system_interaction") {
    parts.push("All system components and dependencies are operational");
  }

  return parts.join(". ");
}

function createCase(
  description: string,
  steps: string,
  precondition: string,
  query: string,
  expectedResults: string,
  types: TestCaseGenType[],
  k: ExtractedKnowledge,
  sources: TestCaseSource[],
): GeneratedTestCase {
  const id = `TC-${String(++tcCounter).padStart(3, "0")}`;

  const caseSources: TestCaseSource[] = k.documentId
    ? sources.filter(s => s.documentName.includes(getDocName(k.documentId, sources)))
    : sources;

  // If no matching sources, use all available sources
  const finalSources = caseSources.length > 0 ? caseSources : sources.slice(0, 1);

  return {
    id,
    caseNumber: id,
    description,
    steps,
    precondition,
    query,
    expectedResults,
    types,
    sources: finalSources,
    status: "kept",
    originalData: {
      id,
      caseNumber: id,
      description,
      steps,
      precondition,
      query,
      expectedResults,
      types,
      sources: finalSources,
    },
  };
}

// ============================================================
// Utilities
// ============================================================

function groupByKind(knowledge: ExtractedKnowledge[]): Record<string, ExtractedKnowledge[]> {
  const groups: Record<string, ExtractedKnowledge[]> = {};
  for (const k of knowledge) {
    if (!groups[k.kind]) groups[k.kind] = [];
    groups[k.kind].push(k);
  }
  return groups;
}

function getDocName(documentId: string, sources: TestCaseSource[]): string {
  // documentId is the TcgDocument.id; we need to match it
  // Since sources don't carry documentId, return a generic match
  return "";
}

function deduplicateCases(cases: GeneratedTestCase[]): GeneratedTestCase[] {
  const seen = new Map<string, GeneratedTestCase>();

  for (const tc of cases) {
    // Simple dedup by first 80 chars of description
    const key = tc.description.slice(0, 80).toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.set(key, tc);
    }
  }

  return Array.from(seen.values());
}
