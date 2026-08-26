// ============================================================
// Requirement → Test Case Generator — Generator (v3)
// 26-stage pipeline. Never invents information.
// Every technical detail traceable to source evidence.
// ============================================================

import type {
  ExtractedKnowledge,
  ExtractedRequirement,
  BusinessFlow,
  GeneratedTestCase,
  TcgGenerationSummary,
  TestPriority,
  TestCaseGenType,
  TestCaseSource,
  MissingInformation,
  SourceConfidence,
  TechnicalEntity,
  TcgDocument,
} from "./types";

export interface GenerateResult {
  cases: GeneratedTestCase[];
  summary: TcgGenerationSummary;
  flows: BusinessFlow[];
}

/**
 * Main generation entry point. Implements the full 26-stage pipeline.
 */
export function generateTestCases(
  knowledge: ExtractedKnowledge[],
  documents: TcgDocument[],
  analysis?: {
    requirements: ExtractedRequirement[];
    flows: BusinessFlow[];
    missingInformation: MissingInformation[];
    technicalEntities: TechnicalEntity[];
    knownTables: Map<string, Set<string>>;
  }
): GenerateResult {
  // Use pre-computed analysis if available, otherwise run basics
  const reqs = analysis?.requirements || extractBasicRequirements(knowledge);
  const flows = analysis?.flows || [{ id: "flow_1", name: "General Business Logic", description: "", steps: [], knowledgeIds: knowledge.map(k => k.id), upstreamSystems: [], downstreamSystems: [], databases: [], jobs: [], classes: [], services: [] }];
  const missingInfo = analysis?.missingInformation || [];
  const entities = analysis?.technicalEntities || [];
  const knownTables = analysis?.knownTables || new Map();

  // STAGE 13-14: E2E Scenario Construction per flow
  const candidateScenarios = constructE2EScenarios(reqs, flows, knowledge, entities, knownTables, missingInfo);

  // STAGE 15: Scenario Optimization (merge related)
  const optimizedScenarios = optimizeScenarios(candidateScenarios);

  // STAGE 16: Duplicate Detection
  const deduplicated = deduplicateScenarios(optimizedScenarios);

  // STAGE 17: Positive/Negative/Boundary Analysis
  const withVariations = addVariations(deduplicated, reqs);

  // STAGE 18: Priority Assignment
  const prioritized = assignPriorities(withVariations, entities);

  // STAGE 19-20: Test Case Construction + Query Generation
  const testCases = constructTestCases(prioritized, knownTables, entities, missingInfo, documents);

  // STAGE 21: Completeness Validation
  const validated = validateCompleteness(testCases, missingInfo);

  // STAGE 22: Requirement Coverage Validation
  const coverageResult = validateCoverage(validated, reqs);

  // STAGE 23: Quality/Language Validation
  const qualityChecked = validateQuality(validated);

  // Build summary
  const summary = buildSummary(qualityChecked, reqs, flows, candidateScenarios.length, deduplicated.length, missingInfo, coverageResult);

  return { cases: qualityChecked, summary, flows };
}

// ============================================================
// STAGE 13-14: E2E SCENARIO CONSTRUCTION
// ============================================================

interface CandidateScenario {
  id: string;
  flowId: string;
  flowName: string;
  requirementIds: string[];
  knowledgeIds: string[];
  description: string;
  steps: string[];
  expectedOutcome: string;
  isNegative: boolean;
  isBoundary: boolean;
  involvedEntities: string[];
  involvedTables: string[];
  involvedJobs: string[];
  involvedServices: string[];
  involvedClasses: string[];
  sourceEvidence: TestCaseSource[];
}

function constructE2EScenarios(
  reqs: ExtractedRequirement[],
  flows: BusinessFlow[],
  knowledge: ExtractedKnowledge[],
  entities: TechnicalEntity[],
  knownTables: Map<string, Set<string>>,
  missingInfo: MissingInformation[]
): CandidateScenario[] {
  const scenarios: CandidateScenario[] = [];
  let scenarioId = 1;

  for (const flow of flows) {
    const flowReqs = reqs.filter(r => r.flowId === flow.id);
    if (flowReqs.length === 0) continue;

    // Group requirements by sub-theme within the flow
    const groups = groupRequirementsByTheme(flowReqs, knowledge);

    for (const group of groups) {
      // Build E2E scenario from the group
      const scenario = buildE2EScenario(
        group, flow, knowledge, entities, knownTables, missingInfo, scenarioId++
      );
      if (scenario) scenarios.push(scenario);
    }
  }

  // Handle ungrouped requirements
  const groupedReqIds = new Set(scenarios.flatMap(s => s.requirementIds));
  const ungroupedReqs = reqs.filter(r => !groupedReqIds.has(r.id));
  if (ungroupedReqs.length > 0) {
    const groups = groupRequirementsByTheme(ungroupedReqs, knowledge);
    for (const group of groups) {
      const scenario = buildE2EScenario(
        group, flows[0] || flows[0], knowledge, entities, knownTables, missingInfo, scenarioId++
      );
      if (scenario) scenarios.push(scenario);
    }
  }

  return scenarios;
}

function groupRequirementsByTheme(
  reqs: ExtractedRequirement[],
  knowledge: ExtractedKnowledge[]
): ExtractedRequirement[][] {
  const groups: Map<string, ExtractedRequirement[]> = new Map();

  for (const req of reqs) {
    // Group by related tables (same business entity = same group)
    const key = req.relatedTables.length > 0
      ? req.relatedTables.sort().join(":")
      : req.kind;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(req);
  }

  return [...groups.values()];
}

function buildE2EScenario(
  reqs: ExtractedRequirement[],
  flow: BusinessFlow,
  knowledge: ExtractedKnowledge[],
  entities: TechnicalEntity[],
  knownTables: Map<string, Set<string>>,
  missingInfo: MissingInformation[],
  id: number
): CandidateScenario | null {
  if (reqs.length === 0) return null;

  // Gather all involved entities
  const involvedTables = [...new Set(reqs.flatMap(r => r.relatedTables))];
  const involvedJobs = flow.jobs;
  const involvedServices = flow.services;
  const involvedClasses = flow.classes;

  // Build E2E steps from knowledge
  const steps = buildE2ESteps(reqs, knowledge, involvedTables, involvedJobs, involvedServices, involvedClasses, knownTables, missingInfo);

  // Determine if this is a negative/boundary scenario
  const isNegative = reqs.some(r => r.kind === "error_handling" || r.kind === "validation");
  const isBoundary = reqs.some(r => r.kind === "boundary");

  // Build description from the primary requirement
  const primaryReq = reqs[0];
  const description = buildScenarioDescription(reqs, flow, involvedTables);

  // Build expected outcome
  const expectedOutcome = buildExpectedOutcome(reqs, involvedTables, knownTables);

  // Build sources
  const sources: TestCaseSource[] = reqs.flatMap(r =>
    r.sourceEvidence.map(se => ({
      documentId: se.documentId,
      documentName: se.documentName,
      sectionRef: se.sectionRef,
      kind: se.kind,
      excerpt: se.excerpt,
    }))
  );

  return {
    id: `sc_${id}`,
    flowId: flow.id,
    flowName: flow.name,
    requirementIds: reqs.map(r => r.id),
    knowledgeIds: reqs.map(r => r.sourceKnowledgeId),
    description,
    steps,
    expectedOutcome,
    isNegative,
    isBoundary,
    involvedEntities: [...involvedTables, ...involvedJobs, ...involvedServices, ...involvedClasses],
    involvedTables,
    involvedJobs,
    involvedServices,
    involvedClasses,
    sourceEvidence: sources,
  };
}

function buildE2ESteps(
  reqs: ExtractedRequirement[],
  knowledge: ExtractedKnowledge[],
  tables: string[],
  jobs: string[],
  services: string[],
  classes: string[],
  knownTables: Map<string, Set<string>>,
  missingInfo: MissingInformation[]
): string[] {
  const steps: string[] = [];
  let stepNum = 1;

  // Step 1: Prepare prerequisite data
  const tableDescriptions = tables.map(t => {
    const missing = missingInfo.find(m => m.entityName === t);
    if (missing) return `${t} (schema not provided)`;
    return t;
  });
  if (tables.length > 0) {
    steps.push(`${stepNum++}. Prepare the required prerequisite test data in ${tableDescriptions.join(" and ")} based on the documented test conditions.`);
  } else {
    steps.push(`${stepNum++}. Prepare the required prerequisite test data as documented.`);
  }

  // Step 2: Configure application parameters (if config-related knowledge exists)
  const configKnowledge = knowledge.filter(k => k.kind === "field_definition" || k.kind === "status_behavior");
  if (configKnowledge.length > 0) {
    const configText = configKnowledge[0].text.slice(0, 150);
    steps.push(`${stepNum++}. Configure the required application parameters: ${configText}`);
  }

  // Step 3: Create request (if DTOs/classes are involved)
  if (classes.length > 0) {
    steps.push(`${stepNum++}. Create the request using the documented ${classes.join(", ")} structure.`);
  } else if (services.length > 0) {
    steps.push(`${stepNum++}. Submit the request through the documented ${services.join(", ")} service(s).`);
  }

  // Step 4: Submit job (if jobs are involved)
  if (jobs.length > 0) {
    steps.push(`${stepNum++}. Submit the documented ${jobs.join(", ")} processing job(s).`);
  }

  // Step 5: Verify processing
  steps.push(`${stepNum++}. Verify that the processing job completes successfully.`);

  // Step 6: Verify database persistence (only if schema is available)
  if (tables.length > 0) {
    const availableTables = tables.filter(t => knownTables.has(t) && knownTables.get(t)!.size > 0);
    const missingTables = tables.filter(t => !knownTables.has(t) || knownTables.get(t)!.size === 0);

    if (availableTables.length > 0) {
      steps.push(`${stepNum++}. Verify the expected records are created or updated in ${availableTables.join(", ")} using the database validation query.`);
    }
    if (missingTables.length > 0) {
      steps.push(`${stepNum++}. Verify the expected records are created or updated in ${missingTables.join(", ")} (schema not available — manual verification required).`);
    }
  }

  // Step 7: Verify downstream integration (if services are involved)
  if (services.length > 0) {
    steps.push(`${stepNum++}. Verify the downstream processing through ${services.join(", ")} completes as expected.`);
  }

  // Step 8: Verify business outcome
  steps.push(`${stepNum++}. Verify the final business outcome matches the documented requirement.`);

  return steps;
}

function buildScenarioDescription(reqs: ExtractedRequirement[], flow: BusinessFlow, tables: string[]): string {
  // Build a meaningful description from the requirements
  const texts = reqs.map(r => r.text);

  // Find the most descriptive requirement
  const primary = texts.reduce((a, b) => a.length > b.length ? a : b, "");

  // If primary is too long, summarize
  if (primary.length > 200) {
    return primary.slice(0, 197) + "...";
  }

  return primary;
}

function buildExpectedOutcome(
  reqs: ExtractedRequirement[],
  tables: string[],
  knownTables: Map<string, Set<string>>
): string {
  const outcomes: string[] = [];

  // Summarize expected outcomes from requirements
  const validationReqs = reqs.filter(r => r.kind === "validation" || r.kind === "business_rule");
  if (validationReqs.length > 0) {
    outcomes.push(`Validation rules are applied correctly: ${validationReqs.map(r => r.text.slice(0, 80)).join("; ")}`);
  }

  // Database persistence outcome
  if (tables.length > 0) {
    const available = tables.filter(t => knownTables.has(t));
    if (available.length > 0) {
      outcomes.push(`Expected records are persisted in ${available.join(", ")}`);
    }
  }

  // Business rule outcomes
  const functionalReqs = reqs.filter(r => r.kind === "functional");
  if (functionalReqs.length > 0) {
    outcomes.push(`Business processing follows the documented rules`);
  }

  return outcomes.length > 0 ? outcomes.join(". ") : "Processing completes successfully and business outcome matches documented requirements.";
}

// ============================================================
// STAGE 15: SCENARIO OPTIMIZATION
// ============================================================

function optimizeScenarios(scenarios: CandidateScenario[]): CandidateScenario[] {
  // Merge scenarios that share the same tables AND same flow AND same kind
  const merged: CandidateScenario[] = [];
  const used = new Set<string>();

  for (let i = 0; i < scenarios.length; i++) {
    if (used.has(scenarios[i].id)) continue;

    let current = { ...scenarios[i] };

    for (let j = i + 1; j < scenarios.length; j++) {
      if (used.has(scenarios[j].id)) continue;

      // Check if scenarios can be merged
      if (canMergeScenarios(current, scenarios[j])) {
        current = mergeScenarios(current, scenarios[j]);
        used.add(scenarios[j].id);
      }
    }

    merged.push(current);
  }

  return merged;
}

function canMergeScenarios(a: CandidateScenario, b: CandidateScenario): boolean {
  // Same flow
  if (a.flowId !== b.flowId) return false;

  // Same tables involved
  const aTables = new Set(a.involvedTables);
  const bTables = new Set(b.involvedTables);
  if (aTables.size > 0 && bTables.size > 0) {
    const overlap = [...aTables].filter(t => bTables.has(t));
    if (overlap.length === 0) return false;
  }

  // Both positive or both negative (don't merge positive with negative)
  if (a.isNegative !== b.isNegative) return false;

  return true;
}

function mergeScenarios(a: CandidateScenario, b: CandidateScenario): CandidateScenario {
  return {
    ...a,
    id: `${a.id}_merged`,
    requirementIds: [...new Set([...a.requirementIds, ...b.requirementIds])],
    knowledgeIds: [...new Set([...a.knowledgeIds, ...b.knowledgeIds])],
    description: a.description.length > b.description.length ? a.description : b.description,
    steps: [...new Set([...a.steps, ...b.steps])],
    involvedEntities: [...new Set([...a.involvedEntities, ...b.involvedEntities])],
    involvedTables: [...new Set([...a.involvedTables, ...b.involvedTables])],
    involvedJobs: [...new Set([...a.involvedJobs, ...b.involvedJobs])],
    involvedServices: [...new Set([...a.involvedServices, ...b.involvedServices])],
    involvedClasses: [...new Set([...a.involvedClasses, ...b.involvedClasses])],
    sourceEvidence: [...a.sourceEvidence, ...b.sourceEvidence],
    isBoundary: a.isBoundary || b.isBoundary,
  };
}

// ============================================================
// STAGE 16: DUPLICATE DETECTION
// ============================================================

function deduplicateScenarios(scenarios: CandidateScenario[]): CandidateScenario[] {
  const unique: CandidateScenario[] = [];
  const seen = new Set<string>();

  for (const scenario of scenarios) {
    const fingerprint = buildFingerprint(scenario);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(scenario);
    }
  }

  return unique;
}

function buildFingerprint(s: CandidateScenario): string {
  // Normalize for comparison
  const tables = s.involvedTables.sort().join(",");
  const negative = s.isNegative ? "N" : "P";
  const descNorm = s.description.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${s.flowId}:${tables}:${negative}:${descNorm}`;
}

// ============================================================
// STAGE 17: POSITIVE/NEGATIVE/VARIATION ANALYSIS
// ============================================================

function addVariations(
  scenarios: CandidateScenario[],
  reqs: ExtractedRequirement[]
): CandidateScenario[] {
  // For scenarios with boundary conditions, ensure we have meaningful variations
  const withVariations: CandidateScenario[] = [];

  for (const scenario of scenarios) {
    withVariations.push(scenario);

    // If there are boundary requirements, create a boundary variation if not already covered
    const boundaryReqs = reqs.filter(r =>
      r.kind === "boundary" && scenario.requirementIds.includes(r.id)
    );
    if (boundaryReqs.length > 0 && !scenario.isBoundary) {
      withVariations.push({
        ...scenario,
        id: `${scenario.id}_boundary`,
        description: `${scenario.description} (Boundary condition)`,
        isBoundary: true,
        requirementIds: boundaryReqs.map(r => r.id),
      });
    }
  }

  return withVariations;
}

// ============================================================
// STAGE 18: PRIORITY ASSIGNMENT (risk-based)
// ============================================================

function assignPriorities(
  scenarios: CandidateScenario[],
  entities: TechnicalEntity[]
): (CandidateScenario & { priority: TestPriority; riskRationale: string })[] {
  return scenarios.map(scenario => {
    const { priority, riskRationale: rationale } = determinePriority(scenario, entities);
    return { ...scenario, priority, riskRationale: rationale };
  });
}

function determinePriority(
  scenario: CandidateScenario,
  entities: TechnicalEntity[]
): { priority: TestPriority; riskRationale: string } {
  const tables = scenario.involvedTables;
  const jobs = scenario.involvedJobs;
  const hasFinancialTables = tables.some(t => /claim|billing|payment|credit|charge|invoice|cap/i.test(t));
  const hasCriticalJobs = jobs.some(j => /process|batch|credit|claim|billing/i.test(j));
  const isNegative = scenario.isNegative;
  const hasMultipleEntities = scenario.involvedEntities.length > 3;

  // P0: Financial/critical
  if (hasFinancialTables && hasCriticalJobs) {
    return { priority: "P0", riskRationale: "Financial calculation with batch processing — critical business impact" };
  }
  if (hasFinancialTables) {
    return { priority: "P0", riskRationale: "Financial data processing — potential billing/payment impact" };
  }

  // P1: Important business functionality
  if (hasCriticalJobs || hasMultipleEntities) {
    return { priority: "P1", riskRationale: "Important business processing flow with multiple system interactions" };
  }
  if (scenario.requirementIds.length > 3) {
    return { priority: "P1", riskRationale: "Covers multiple requirements — significant functional scope" };
  }

  // P2: Secondary
  if (isNegative) {
    return { priority: "P2", riskRationale: "Negative/error scenario — important for validation coverage" };
  }
  if (scenario.isBoundary) {
    return { priority: "P2", riskRationale: "Boundary condition — moderate business risk" };
  }

  // P3: Low risk
  return { priority: "P3", riskRationale: "Standard functional validation — lower business risk" };
}

// ============================================================
// STAGE 19-20: TEST CASE CONSTRUCTION + QUERY GENERATION
// ============================================================

function constructTestCases(
  scenarios: (CandidateScenario & { priority: TestPriority; riskRationale: string })[],
  knownTables: Map<string, Set<string>>,
  entities: TechnicalEntity[],
  missingInfo: MissingInformation[],
  documents: TcgDocument[]
): GeneratedTestCase[] {
  const testCases: GeneratedTestCase[] = [];
  let tcCounter = 1;

  for (const scenario of scenarios) {
    const caseNumber = `TC-${String(tcCounter++).padStart(3, "0")}`;

    // Generate query (only from known schema)
    const { query, queryStatus, queryIncompleteReason } = generateQuery(
      scenario.involvedTables, knownTables, missingInfo
    );

    // Determine completeness
    const incompleteReasons = determineIncompleteReasons(scenario, missingInfo);
    const completeness = incompleteReasons.length > 0 ? "INCOMPLETE" as const : "COMPLETE" as const;

    // Determine test types
    const types = determineTestTypes(scenario);

    // Build precondition
    const precondition = buildPrecondition(scenario, missingInfo);

    // Build expected results
    const expectedResults = buildExpectedResults(scenario, knownTables);

    // Build sources
    const sources: TestCaseSource[] = scenario.sourceEvidence.slice(0, 10);

    testCases.push({
      id: `tc_${Date.now()}_${tcCounter}`,
      caseNumber,
      description: scenario.description,
      steps: scenario.steps.join("\n"),
      precondition,
      query,
      queryStatus,
      queryIncompleteReason,
      expectedResults,
      types,
      priority: scenario.priority,
      businessFlow: scenario.flowName,
      requirementIds: scenario.requirementIds,
      sources,
      riskRationale: scenario.riskRationale,
      status: "kept",
      completeness,
      incompleteReasons,
      missingEntities: scenario.involvedEntities.filter(e =>
        missingInfo.some(m => m.entityName === e)
      ),
      originalData: {
        id: "", caseNumber: "", description: scenario.description, steps: scenario.steps.join("\n"),
        precondition: "", query: "", queryStatus: "NOT_REQUIRED", expectedResults: "",
        types: [], priority: scenario.priority, businessFlow: scenario.flowName,
        requirementIds: scenario.requirementIds, sources, riskRationale: scenario.riskRationale,
        completeness, incompleteReasons, missingEntities: [],
      },
    });
  }

  return testCases;
}

function generateQuery(
  tables: string[],
  knownTables: Map<string, Set<string>>,
  missingInfo: MissingInformation[]
): { query: string; queryStatus: "COMPLETE" | "INCOMPLETE" | "NOT_REQUIRED"; queryIncompleteReason?: string } {
  if (tables.length === 0) {
    return { query: "N/A — Database validation is not required for this testcase.", queryStatus: "NOT_REQUIRED" };
  }

  const availableTables = tables.filter(t => knownTables.has(t) && knownTables.get(t)!.size > 0);
  const missingTables = tables.filter(t => !knownTables.has(t) || knownTables.get(t)!.size === 0);

  if (availableTables.length === 0) {
    // All tables are missing
    const missingNames = missingTables.join(", ");
    return {
      query: `🟡 Query Pending — ${missingNames} is/are referenced in source material but schema/column information was not found in uploaded sources.`,
      queryStatus: "INCOMPLETE",
      queryIncompleteReason: `Schema information for ${missingNames} is required. Upload SQL schema containing these tables.`,
    };
  }

  // Generate SQL for available tables
  const queries: string[] = [];
  for (const tableName of availableTables) {
    const columns = knownTables.get(tableName)!;
    const colList = [...columns].slice(0, 10).join(", ");
    queries.push(`SELECT ${colList}\nFROM ${tableName}\nWHERE <CONDITION>`);
  }

  let finalQuery = queries.join("\n\n");
  if (missingTables.length > 0) {
    finalQuery += `\n\n🟡 Note: ${missingTables.join(", ")} also require validation but schema was not provided.`;
    return {
      query: finalQuery,
      queryStatus: "INCOMPLETE",
      queryIncompleteReason: `Additional schema required for: ${missingTables.join(", ")}`,
    };
  }

  return { query: finalQuery, queryStatus: "COMPLETE" };
}

function determineIncompleteReasons(
  scenario: CandidateScenario,
  missingInfo: MissingInformation[]
): string[] {
  const reasons: string[] = [];

  for (const entity of scenario.involvedEntities) {
    const missing = missingInfo.find(m => m.entityName === entity);
    if (missing) {
      reasons.push(`${missing.entityKind} "${missing.entityName}" — ${missing.reason}`);
    }
  }

  return reasons;
}

function determineTestTypes(scenario: CandidateScenario): TestCaseGenType[] {
  const types: TestCaseGenType[] = ["Functional"];

  if (scenario.isNegative) types.push("Negative");
  if (scenario.isBoundary) types.push("Positive"); // boundary is typically positive testing
  if (scenario.requirementIds.length > 2) types.push("Regression");

  return types;
}

function buildPrecondition(scenario: CandidateScenario, missingInfo: MissingInformation[]): string {
  const preconditions: string[] = [];

  preconditions.push("User has access to the application.");

  if (scenario.involvedTables.length > 0) {
    const tableStatus = scenario.involvedTables.map(t => {
      const missing = missingInfo.find(m => m.entityName === t);
      return missing ? `${t} (schema not provided)` : t;
    });
    preconditions.push(`Required test data in ${tableStatus.join(" and ")} is available.`);
  }

  if (scenario.involvedJobs.length > 0) {
    preconditions.push(`Required processing jobs (${scenario.involvedJobs.join(", ")}) are available.`);
  }

  if (scenario.involvedServices.length > 0) {
    preconditions.push(`Required services (${scenario.involvedServices.join(", ")}) are operational.`);
  }

  preconditions.push("Required application configuration is completed.");

  return preconditions.join("\n");
}

function buildExpectedResults(
  scenario: CandidateScenario,
  knownTables: Map<string, Set<string>>
): string {
  const results: string[] = [];

  results.push("Processing completes successfully.");

  if (scenario.involvedTables.length > 0) {
    const available = scenario.involvedTables.filter(t => knownTables.has(t));
    if (available.length > 0) {
      results.push(`Expected records are created or updated in ${available.join(", ")}.`);
    }
  }

  results.push("Business processing follows the documented rules.");
  results.push("Final outcome matches the documented requirement.");

  return results.join("\n");
}

// ============================================================
// STAGE 21: COMPLETENESS VALIDATION
// ============================================================

function validateCompleteness(
  testCases: GeneratedTestCase[],
  missingInfo: MissingInformation[]
): GeneratedTestCase[] {
  return testCases.map(tc => {
    const incompleteReasons = determineIncompleteReasons(
      { involvedEntities: tc.missingEntities } as any,
      missingInfo
    );

    if (incompleteReasons.length > 0 && tc.completeness !== "INCOMPLETE") {
      return { ...tc, completeness: "INCOMPLETE" as const, incompleteReasons };
    }

    return tc;
  });
}

// ============================================================
// STAGE 22: REQUIREMENT COVERAGE VALIDATION
// ============================================================

function validateCoverage(
  testCases: GeneratedTestCase[],
  requirements: ExtractedRequirement[]
): { covered: string[]; partiallyCovered: string[]; notCovered: string[] } {
  const covered = new Set<string>();
  const partiallyCovered = new Set<string>();

  for (const req of requirements) {
    const matchingTCs = testCases.filter(tc =>
      tc.requirementIds.includes(req.id) && tc.status !== "ignored"
    );

    if (matchingTCs.length > 0) {
      const hasComplete = matchingTCs.some(tc => tc.completeness === "COMPLETE");
      if (hasComplete) {
        covered.add(req.id);
      } else {
        partiallyCovered.add(req.id);
      }
    }
  }

  const notCovered = requirements
    .filter(r => !covered.has(r.id) && !partiallyCovered.has(r.id))
    .map(r => r.id);

  return {
    covered: [...covered],
    partiallyCovered: [...partiallyCovered],
    notCovered,
  };
}

// ============================================================
// STAGE 23: QUALITY/LANGUAGE VALIDATION
// ============================================================

function validateQuality(testCases: GeneratedTestCase[]): GeneratedTestCase[] {
  return testCases.map(tc => ({
    ...tc,
    description: cleanLanguage(tc.description),
    steps: cleanLanguage(tc.steps),
    expectedResults: cleanLanguage(tc.expectedResults),
    precondition: cleanLanguage(tc.precondition),
  }));
}

function cleanLanguage(text: string): string {
  // Fix common issues while preserving technical identifiers
  let cleaned = text;

  // Remove duplicated words
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, "$1");

  // Fix common grammar
  cleaned = cleaned.replace(/\bthe the\b/gi, "the");
  cleaned = cleaned.replace(/\ba a\b/gi, "a");
  cleaned = cleaned.replace(/\bis is\b/gi, "is");

  // Capitalize first letter of sentences
  cleaned = cleaned.replace(/(^|\.\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());

  return cleaned;
}

// ============================================================
// STAGE 24: BUILD SUMMARY
// ============================================================

function buildSummary(
  testCases: GeneratedTestCase[],
  reqs: ExtractedRequirement[],
  flows: BusinessFlow[],
  candidateCount: number,
  dedupCount: number,
  missingInfo: MissingInformation[],
  coverage: { covered: string[]; partiallyCovered: string[]; notCovered: string[] }
): TcgGenerationSummary {
  const activeTCs = testCases.filter(tc => tc.status !== "ignored");

  return {
    businessFlows: flows.length,
    requirementsAnalyzed: reqs.length,
    candidateScenarios: candidateCount,
    duplicatesRemoved: candidateCount - dedupCount,
    optimizedScenarios: dedupCount,
    finalTestCases: activeTCs.length,
    completeTestCases: activeTCs.filter(tc => tc.completeness === "COMPLETE").length,
    incompleteTestCases: activeTCs.filter(tc => tc.completeness === "INCOMPLETE").length,
    p0Count: activeTCs.filter(tc => tc.priority === "P0").length,
    p1Count: activeTCs.filter(tc => tc.priority === "P1").length,
    p2Count: activeTCs.filter(tc => tc.priority === "P2").length,
    p3Count: activeTCs.filter(tc => tc.priority === "P3").length,
    requirementCoverage: reqs.length > 0 ? Math.round((coverage.covered.length / reqs.length) * 100) : 100,
    totalRequirements: reqs.length,
    coveredRequirements: coverage.covered.length,
    partiallyCoveredRequirements: coverage.partiallyCovered.length,
    uncoveredRequirements: coverage.notCovered,
    uncoveredRequirementDetails: reqs
      .filter(r => coverage.notCovered.includes(r.id))
      .map(r => ({ id: r.id, text: r.text.slice(0, 200), reason: "No test case covers this requirement" })),
    dbValidationCases: activeTCs.filter(tc => tc.queryStatus === "COMPLETE").length,
    dbValidationIncomplete: activeTCs.filter(tc => tc.queryStatus === "INCOMPLETE").length,
    e2eFlows: flows.length,
    flowNames: flows.map(f => f.name),
    missingInformation: missingInfo,
    sourceConflicts: [],
    technicalEntitiesFound: 0,
    technicalEntitiesReferenced: 0,
    technicalEntitiesMissing: missingInfo.length,
  };
}

// ============================================================
// BASIC REQUIREMENT EXTRACTION (fallback)
// ============================================================

function extractBasicRequirements(knowledge: ExtractedKnowledge[]): ExtractedRequirement[] {
  const reqs: ExtractedRequirement[] = [];
  let counter = 1;

  for (const k of knowledge) {
    if (["requirement_statement", "business_rule", "validation_rule", "boundary_condition"].includes(k.kind)) {
      reqs.push({
        id: `REQ-${String(counter++).padStart(3, "0")}`,
        text: k.text,
        flowId: null,
        sourceRef: k.sourceRef,
        sourceEvidence: k.sourceEvidence,
        kind: k.kind === "requirement_statement" ? "functional" :
              k.kind === "business_rule" ? "business_rule" :
              k.kind === "validation_rule" ? "validation" : "boundary",
        sourceKnowledgeId: k.id,
        relatedTables: k.relatedTables,
        relatedFields: k.relatedFields,
        relatedEntities: k.relatedEntities,
        coverageStatus: "NOT_COVERED",
      });
    }
  }

  return reqs;
}
