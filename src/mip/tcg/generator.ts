// ============================================================
// Requirement → Test Case Generator — Business-Flow-First Engine (v2)
// Fixed: requirement-knowledge mapping, entity-based flow grouping,
// meaningful E2E scenario design.
// ============================================================

import type {
  ExtractedKnowledge,
  GeneratedTestCase,
  TestCaseGenType,
  TestCaseSource,
  TcgDocument,
  SqlParsedContent,
  BusinessFlow,
  ExtractedRequirement,
  TcgGenerationSummary,
  TestPriority,
} from "./types";

let tcCounter = 0;
let reqCounter = 0;

// ============================================================
// STAGE 1: DOCUMENT INGESTION — Consolidated understanding
// ============================================================
interface ConsolidatedKnowledge {
  requirements: ExtractedRequirement[];
  businessRules: string[];
  validations: string[];
  flowSteps: string[];
  dbInteractions: string[];
  systemInteractions: string[];
  schemaInfo: { tables: string[]; columns: Map<string, string[]> };
  errorHandling: string[];
  boundaryConditions: string[];
  allKnowledge: ExtractedKnowledge[];
}

function consolidateKnowledge(
  knowledge: ExtractedKnowledge[],
  sources: TestCaseSource[],
): ConsolidatedKnowledge {
  const consolidated: ConsolidatedKnowledge = {
    requirements: [],
    businessRules: [],
    validations: [],
    flowSteps: [],
    dbInteractions: [],
    systemInteractions: [],
    schemaInfo: { tables: [], columns: new Map() },
    errorHandling: [],
    boundaryConditions: [],
    allKnowledge: knowledge,
  };

  let reqIdx = 0;
  for (const k of knowledge) {
    // Skip section headings — they are context, not testable requirements
    if (k.text.startsWith("Section:")) continue;

    const reqId = `REQ-${String(++reqIdx).padStart(3, "0")}`;
    const source = sources.find(s => s.documentId === k.documentId) || sources[0];

    consolidated.requirements.push({
      id: reqId,
      text: k.text,
      flowId: null,
      sourceRef: source ? `${source.documentName} → ${k.sourceRef}` : k.sourceRef,
      kind: mapKnowledgeToReqKind(k.kind),
      sourceKnowledgeId: k.id, // EXPLICIT LINK — never use ID string manipulation
      relatedTables: [...k.relatedTables],
      relatedFields: [...k.relatedFields],
    });

    switch (k.kind) {
      case "requirement_statement":
      case "business_rule":
        consolidated.businessRules.push(k.text);
        break;
      case "validation_rule":
        consolidated.validations.push(k.text);
        break;
      case "flow_step":
        consolidated.flowSteps.push(k.text);
        break;
      case "database_interaction":
        consolidated.dbInteractions.push(k.text);
        for (const t of k.relatedTables) {
          if (!consolidated.schemaInfo.tables.includes(t)) {
            consolidated.schemaInfo.tables.push(t);
          }
        }
        break;
      case "system_interaction":
        consolidated.systemInteractions.push(k.text);
        break;
      case "error_handling":
        consolidated.errorHandling.push(k.text);
        break;
      case "boundary_condition":
        consolidated.boundaryConditions.push(k.text);
        break;
      case "schema_info":
        for (const t of k.relatedTables) {
          if (!consolidated.schemaInfo.tables.includes(t)) {
            consolidated.schemaInfo.tables.push(t);
          }
          if (k.relatedFields.length > 0) {
            consolidated.schemaInfo.columns.set(t, k.relatedFields);
          }
        }
        break;
    }
  }

  return consolidated;
}

function mapKnowledgeToReqKind(kind: ExtractedKnowledge["kind"]): ExtractedRequirement["kind"] {
  switch (kind) {
    case "requirement_statement": return "functional";
    case "business_rule": return "business_rule";
    case "validation_rule": return "validation";
    case "boundary_condition": return "boundary";
    case "error_handling": return "error_handling";
    case "database_interaction": return "database";
    case "system_interaction": return "integration";
    case "input_output": return "ui";
    case "flow_step": return "functional";
    default: return "functional";
  }
}

// ============================================================
// STAGE 2: BUSINESS FLOW IDENTIFICATION — Entity-based grouping
// ============================================================
function identifyBusinessFlows(consolidated: ConsolidatedKnowledge): BusinessFlow[] {
  const flows: BusinessFlow[] = [];

  // --- Step 1: Extract entity clusters from all knowledge ---
  const entityClusters = extractEntityClusters(consolidated);

  // --- Step 2: Build flows from entity clusters ---
  for (const cluster of entityClusters) {
    if (cluster.knowledgeIds.length < 1) continue;

    // Collect all tables, systems, jobs from this cluster's knowledge
    const clusterKnowledge = consolidated.allKnowledge.filter(k => cluster.knowledgeIds.includes(k.id));
    const allTables = [...new Set(clusterKnowledge.flatMap(k => k.relatedTables))];
    const allUpstream = extractSystemNames(clusterKnowledge, "upstream");
    const allDownstream = extractSystemNames(clusterKnowledge, "downstream");
    const allJobs = extractJobNames(clusterKnowledge);

    flows.push({
      id: `flow_${flows.length + 1}`,
      name: cluster.name,
      description: cluster.description,
      steps: clusterKnowledge.map(k => k.text.slice(0, 200)),
      knowledgeIds: cluster.knowledgeIds,
      upstreamSystems: allUpstream,
      downstreamSystems: allDownstream,
      databases: allTables,
      jobs: allJobs,
    });
  }

  // --- Step 3: Assign requirements to flows via sourceKnowledgeId mapping ---
  for (const req of consolidated.requirements) {
    for (const flow of flows) {
      if (flow.knowledgeIds.includes(req.sourceKnowledgeId)) {
        req.flowId = flow.id;
        break;
      }
    }
    // If no flow matched, try to match by entity overlap
    if (!req.flowId) {
      let bestFlow: string | null = null;
      let bestOverlap = 0;
      for (const flow of flows) {
        const overlap = req.relatedTables.filter(t => flow.databases.includes(t)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestFlow = flow.id;
        }
      }
      if (bestFlow) {
        req.flowId = bestFlow;
      }
    }
  }

  // --- Step 4: Collect unclassified requirements into a catch-all ---
  const unclassified = consolidated.requirements.filter(r => !r.flowId);
  if (unclassified.length > 0) {
    const unclassKnowledge = unclassified.map(r => r.sourceKnowledgeId);
    const unclassTexts = unclassified.map(r => r.text);

    // Try to sub-divide unclassified by keyword themes
    const themes = subDivideByTheme(unclassified);
    for (const theme of themes) {
      flows.push({
        id: `flow_${flows.length + 1}`,
        name: theme.name,
        description: theme.description,
        steps: theme.texts.slice(0, 20),
        knowledgeIds: theme.knowledgeIds,
        upstreamSystems: [],
        downstreamSystems: [],
        databases: [...new Set(theme.tables)],
        jobs: [],
      });
    }

    // If still some unclassified, put into General
    const stillUnclassified = consolidated.requirements.filter(r => !r.flowId);
    if (stillUnclassified.length > 0) {
      flows.push({
        id: "flow_general",
        name: "General Business Logic",
        description: "Remaining business logic not assigned to a specific flow",
        steps: stillUnclassified.map(r => r.text.slice(0, 200)),
        knowledgeIds: stillUnclassified.map(r => r.sourceKnowledgeId),
        upstreamSystems: [],
        downstreamSystems: [],
        databases: [...new Set(stillUnclassified.flatMap(r => r.relatedTables))],
        jobs: [],
      });
      for (const r of stillUnclassified) {
        r.flowId = "flow_general";
      }
    }
  }

  return flows;
}

// --- Entity cluster extraction ---
interface EntityCluster {
  name: string;
  description: string;
  knowledgeIds: string[];
  texts: string[];
  tables: string[];
  entities: string[];
}

function extractEntityClusters(consolidated: ConsolidatedKnowledge): EntityCluster[] {
  const clusters: EntityCluster[] = [];

  // Build entity -> knowledge mapping
  const entityMap = new Map<string, Set<string>>(); // entity -> set of knowledge IDs

  for (const k of consolidated.allKnowledge) {
    const entities = extractEntitiesFromText(k.text);
    entities.forEach(entity => {
      if (!entityMap.has(entity)) entityMap.set(entity, new Set());
      entityMap.get(entity)!.add(k.id);
    });
    // Also index by related tables
    k.relatedTables.forEach(table => {
      const normalizedTable = table.toUpperCase();
      if (!entityMap.has(normalizedTable)) entityMap.set(normalizedTable, new Set());
      entityMap.get(normalizedTable)!.add(k.id);
    });
  }

  // Cluster entities that co-occur in the same knowledge items
  const visited = new Set<string>();
  const entityList = [...entityMap.keys()].sort((a, b) => (entityMap.get(b)?.size || 0) - (entityMap.get(a)?.size || 0));

  for (const entity of entityList) {
    if (visited.has(entity)) continue;
    const knowledgeIds = entityMap.get(entity);
    if (!knowledgeIds || knowledgeIds.size === 0) continue;

    // Find all co-occurring entities
    const clusterEntities = new Set<string>([entity]);
    const clusterKnowledge = new Set<string>(knowledgeIds);

    // Expand: find other entities that share knowledge items
    for (const otherEntity of entityList) {
      if (otherEntity === entity || visited.has(otherEntity)) continue;
      const otherKnowledge = entityMap.get(otherEntity);
      if (!otherKnowledge) continue;

      // If >30% overlap, they belong together
      const overlap = [...otherKnowledge].filter(kid => clusterKnowledge.has(kid)).length;
      if (overlap >= 1 && overlap >= otherKnowledge.size * 0.2) {
        clusterEntities.add(otherEntity);
        otherKnowledge.forEach(kid => clusterKnowledge.add(kid));
      }
    }

    if (clusterKnowledge.size < 1) continue;

    // Name the cluster based on primary entity
    const name = humanizeEntityName(entity);
    const tables = [...clusterEntities].filter(e => e === e.toUpperCase() && e.length >= 3);

    clusters.push({
      name,
      description: `Business flow covering ${name.toLowerCase()} functionality`,
      knowledgeIds: [...clusterKnowledge],
      texts: [...clusterKnowledge].map(kid => {
        const k = consolidated.allKnowledge.find(kk => kk.id === kid);
        return k ? k.text.slice(0, 200) : "";
      }).filter(Boolean),
      tables,
      entities: [...clusterEntities],
    });

    clusterEntities.forEach(e => visited.add(e));
    clusterKnowledge.forEach(kid => visited.add(kid));
  }

  return clusters;
}

function extractEntitiesFromText(text: string): string[] {
  const entities = new Set<string>();
  const upper = text.toUpperCase();

  // Extract CAPS identifiers (table names, system names, etc.)
  const capsMatches = upper.matchAll(/\b([A-Z][A-Z0-9_]{2,30})\b/g);
  const excludes = new Set(["THE", "AND", "FOR", "NOT", "BUT", "WAS", "ARE", "HAS", "HAD", "ITS", "ALL",
    "CAN", "HER", "OUR", "ONE", "ANY", "MAY", "USE", "YES", "WHO", "GET", "NEW", "NOW", "OLD", "SEE",
    "HOW", "LET", "SAY", "SHE", "TOO", "WAY", "MUST", "SHALL", "WILL", "THIS", "THAT", "WITH", "FROM",
    "HAVE", "BEEN", "DOES", "ONLY", "ALSO", "EACH", "BOTH", "SOME", "WHAT", "WHEN", "TIME", "VERY",
    "JUST", "INTO", "THAN", "MORE", "MOST", "WELL", "BACK", "MANY", "SUCH", "TAKE", "COME", "COULD",
    "BEING", "WOULD", "SHOULD", "AFTER", "BELOW", "ABOVE", "WHICH", "WHERE", "THESE", "THOSE", "OTHER",
    "EVERY", "FIRST", "NEXT", "THEN", "WILL", "BEEN", "MAKE", "LIKE", "LONG", "LOOK", "MANY", "SOME",
    "THAN", "THEM", "ALSO", "USED", "EACH", "GIVE", "MOST", "HERE", "WHEN", "UPON", "DONE", "GOOD",
    "EACH", "EACH", "LEFT", "REAL", "LIFE", "KEEP", "SAME", "LAST", "VIEW", "SEEN", "THUS", "DATA"]);

  for (const m of capsMatches) {
    const word = m[1];
    if (!excludes.has(word) && word.length >= 3 && word.length <= 30) {
      entities.add(word);
    }
  }

  // Extract domain keywords as entities
  const lower = text.toLowerCase();
  const domainPatterns: [RegExp, string][] = [
    [/\b(?:claim|claims)\b/, "Claims"],
    [/\b(?:credit|credits)\b/, "Credit"],
    [/\b(?:billing|bill)\b/, "Billing"],
    [/\b(?:charge|charges)\b/, "Charge"],
    [/\b(?:payment|payments)\b/, "Payment"],
    [/\b(?:calculation|calculate|comput)\b/, "Calculation"],
    [/\b(?:validation|validate|verify)\b/, "Validation"],
    [/\b(?:eligib)\w*/, "Eligibility"],
    [/\b(?:cap|threshold|limit|maximum|minimum)\b/, "Threshold/Cap"],
    [/\b(?:batch|job|queue|process)\b/, "Batch/Job Processing"],
    [/\b(?:report|summary|export)\b/, "Reporting"],
    [/\b(?:config|setting|parameter)\b/, "Configuration"],
    [/\b(?:error|exception|rejection|fail)\b/, "Error Handling"],
    [/\b(?:status|lifecycle|state)\b/, "Status/State"],
    [/\b(?:insert|update|delete|persist|store|create|write)\b/, "Data Persistence"],
    [/\b(?:extract|select|read|query|fetch|load)\b/, "Data Retrieval"],
    [/\b(?:ui|screen|page|form|field|input|button|display)\b/, "UI"],
    [/\b(?:api|service|endpoint|request|response|rest)\b/, "API/Service"],
    [/\b(?:downstream|upstream|integration|feed)\b/, "Integration"],
  ];

  for (const [pattern, entity] of domainPatterns) {
    if (pattern.test(lower)) {
      entities.add(entity.toUpperCase());
    }
  }

  return [...entities];
}

function humanizeEntityName(entity: string): string {
  // If it's a TABLE_LIKE_NAME, convert to human readable
  if (entity === entity.toUpperCase() && entity.includes("_")) {
    return entity.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
  }
  if (entity === entity.toUpperCase()) {
    return entity.charAt(0) + entity.slice(1).toLowerCase();
  }
  // camelCase → Title Case
  return entity.replace(/([A-Z])/g, " $1").trim().replace(/\b\w/g, c => c.toUpperCase());
}

// --- Sub-divide unclassified by theme ---
function subDivideByTheme(reqs: ExtractedRequirement[]): EntityCluster[] {
  const themes: EntityCluster[] = [];
  const themeMap = new Map<string, { reqs: ExtractedRequirement[]; texts: string[]; tables: string[]; knowledgeIds: string[] }>();

  for (const req of reqs) {
    const theme = guessTheme(req.text);
    if (!themeMap.has(theme)) {
      themeMap.set(theme, { reqs: [], texts: [], tables: [], knowledgeIds: [] });
    }
    const t = themeMap.get(theme)!;
    t.reqs.push(req);
    t.texts.push(req.text.slice(0, 200));
    t.tables.push(...req.relatedTables);
    t.knowledgeIds.push(req.sourceKnowledgeId);
  }

  for (const [themeName, data] of themeMap) {
    if (data.reqs.length === 0) continue;
    for (const r of data.reqs) r.flowId = `flow_themes_${themes.length}`;
    themes.push({
      name: themeName,
      description: `Business flow covering ${themeName.toLowerCase()} functionality`,
      knowledgeIds: data.knowledgeIds,
      texts: data.texts,
      tables: [...new Set(data.tables)],
      entities: [],
    });
  }

  return themes;
}

function guessTheme(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(?:calculat|compute|amount|fee|credit|rate|charge|total|sum|balance)\b/.test(lower)) return "Calculation & Financial Processing";
  if (/\b(?:valid|check|verify|confirm|rule|constraint|condition|eligib|qualif)\b/.test(lower)) return "Validation & Business Rules";
  if (/\b(?:error|exception|fail|reject|invalid|denied|timeout|missing|null|empty)\b/.test(lower)) return "Error Handling & Rejection";
  if (/\b(?:insert|update|delete|create|persist|store|write|save|database|table|record)\b/.test(lower)) return "Data Persistence & Storage";
  if (/\b(?:extract|select|read|query|fetch|load|get|search|find|lookup)\b/.test(lower)) return "Data Retrieval & Querying";
  if (/\b(?:job|batch|queue|schedule|process|run|execute|trigger|start|stop)\b/.test(lower)) return "Batch & Job Processing";
  if (/\b(?:ui|screen|page|form|field|input|button|display|show|render|navigate|click)\b/.test(lower)) return "User Interface & Interaction";
  if (/\b(?:api|service|endpoint|request|response|rest|soap|message|publish|subscribe)\b/.test(lower)) return "API & Service Integration";
  if (/\b(?:report|summary|export|import|download|upload|print|pdf|excel)\b/.test(lower)) return "Reporting & Export";
  if (/\b(?:config|setting|parameter|option|preference|threshold|limit|cap)\b/.test(lower)) return "Configuration & Settings";
  if (/\b(?:status|lifecycle|state|transition|workflow|approval|reject|pending|complete)\b/.test(lower)) return "Status & Workflow Management";
  if (/\b(?:log|audit|trail|history|track|monitor|trace)\b/.test(lower)) return "Logging & Audit";
  return "General Business Logic";
}

function extractSystemNames(knowledge: ExtractedKnowledge[], direction: "upstream" | "downstream"): string[] {
  const names = new Set<string>();
  for (const k of knowledge) {
    if (direction === "upstream") {
      const matches = k.text.match(/\b(EDW|KDW|SOURCE|INPUT|EXTRACT|UPSTREAM|FEEDER|STAGING)\b/gi);
      if (matches) matches.slice(0, 3).forEach(m => names.add(m.toUpperCase()));
    } else {
      const matches = k.text.match(/\b(TARGET|OUTPUT|QUEUE|CORE|CLAIM|DESTINATION|DOWNSTREAM|RESULT)\b/gi);
      if (matches) matches.slice(0, 3).forEach(m => names.add(m.toUpperCase()));
    }
  }
  return Array.from(names).slice(0, 5);
}

function extractJobNames(knowledge: ExtractedKnowledge[]): string[] {
  const jobs = new Set<string>();
  for (const k of knowledge) {
    const matches = k.text.match(/\b(\w+Job|\w+Batch|\w+Process|[A-Z]{2,10}_\w+|Credit\w*Job|Claim\w*Job|Fee\w*Job)\b/g);
    if (matches) matches.slice(0, 3).forEach(m => jobs.add(m));
  }
  return Array.from(jobs).slice(0, 5);
}

// ============================================================
// STAGE 3–4: SCENARIO OPTIMIZATION — Meaningful E2E grouping
// ============================================================
interface CandidateScenario {
  id: string;
  flowId: string;
  flowName: string;
  title: string;
  description: string;
  requirementIds: string[];
  sourceKnowledgeIds: string[];
  condition: "positive" | "negative" | "boundary" | "error";
  keyEntities: string[];
  databaseTables: string[];
  knowledgeTexts: string[];
}

function optimizeScenarios(
  consolidated: ConsolidatedKnowledge,
  flows: BusinessFlow[],
): CandidateScenario[] {
  const scenarios: CandidateScenario[] = [];
  let scenarioIdx = 0;

  for (const flow of flows) {
    const flowReqs = consolidated.requirements.filter(r => r.flowId === flow.id);
    if (flowReqs.length === 0) continue;

    // Group requirements by their sub-theme within this flow
    const subGroups = groupRequirementsBySubTheme(flowReqs);

    for (const subGroup of subGroups) {
      // For each sub-group, create meaningful scenario variations
      const positiveReqs = subGroup.filter(r => ["functional", "ui", "database", "integration"].includes(r.kind));
      const validationReqs = subGroup.filter(r => ["validation", "business_rule"].includes(r.kind));
      const negativeReqs = subGroup.filter(r => ["error_handling"].includes(r.kind));
      const boundaryReqs = subGroup.filter(r => ["boundary"].includes(r.kind));

      // Scenario: Happy path / main E2E flow
      const happyPathReqs = [...positiveReqs, ...validationReqs];
      if (happyPathReqs.length > 0) {
        const reqIds = happyPathReqs.map(r => r.id);
        const kIds = happyPathReqs.map(r => r.sourceKnowledgeId);
        scenarios.push({
          id: `sc_${++scenarioIdx}`,
          flowId: flow.id,
          flowName: flow.name,
          title: buildScenarioTitle(flow.name, subGroup, "positive"),
          description: buildScenarioDescription(flow.name, subGroup, "positive"),
          requirementIds: reqIds,
          sourceKnowledgeIds: kIds,
          condition: "positive",
          keyEntities: extractKeyEntities(subGroup),
          databaseTables: [...new Set(subGroup.flatMap(r => r.relatedTables))],
          knowledgeTexts: subGroup.map(r => r.text),
        });
      }

      // Scenario: Negative / error (only if material negative behavior exists)
      if (negativeReqs.length > 0) {
        // Check if negative scenarios are meaningfully different from each other
        const negativeClusters = clusterByOutcome(negativeReqs);
        for (const negCluster of negativeClusters) {
          const reqIds = negCluster.map(r => r.id);
          const kIds = negCluster.map(r => r.sourceKnowledgeId);
          scenarios.push({
            id: `sc_${++scenarioIdx}`,
            flowId: flow.id,
            flowName: flow.name,
            title: buildScenarioTitle(flow.name, negCluster, "negative"),
            description: buildScenarioDescription(flow.name, negCluster, "negative"),
            requirementIds: reqIds,
            sourceKnowledgeIds: kIds,
            condition: "negative",
            keyEntities: extractKeyEntities(negCluster),
            databaseTables: [...new Set(negCluster.flatMap(r => r.relatedTables))],
            knowledgeTexts: negCluster.map(r => r.text),
          });
        }
      }

      // Scenario: Boundary (only when material boundary behavior exists)
      if (boundaryReqs.length > 0) {
        const reqIds = boundaryReqs.map(r => r.id);
        const kIds = boundaryReqs.map(r => r.sourceKnowledgeId);
        scenarios.push({
          id: `sc_${++scenarioIdx}`,
          flowId: flow.id,
          flowName: flow.name,
          title: buildScenarioTitle(flow.name, boundaryReqs, "boundary"),
          description: buildScenarioDescription(flow.name, boundaryReqs, "boundary"),
          requirementIds: reqIds,
          sourceKnowledgeIds: kIds,
          condition: "boundary",
          keyEntities: extractKeyEntities(boundaryReqs),
          databaseTables: [...new Set(boundaryReqs.flatMap(r => r.relatedTables))],
          knowledgeTexts: boundaryReqs.map(r => r.text),
        });
      }
    }
  }

  return deduplicateScenarios(scenarios);
}

// --- Group requirements within a flow by sub-theme ---
function groupRequirementsBySubTheme(reqs: ExtractedRequirement[]): ExtractedRequirement[][] {
  const groups = new Map<string, ExtractedRequirement[]>();

  for (const req of reqs) {
    const subTheme = guessSubTheme(req.text, req.kind);
    if (!groups.has(subTheme)) groups.set(subTheme, []);
    groups.get(subTheme)!.push(req);
  }

  return [...groups.values()];
}

function guessSubTheme(text: string, kind: string): string {
  const lower = text.toLowerCase();

  // If it's a database requirement, group by table
  if (kind === "database") {
    const tables = text.match(/\b([A-Z][A-Z0-9_]{2,20})\b/g) || [];
    if (tables.length > 0) return `DB: ${tables[0]}`;
    return "DB Operations";
  }

  // If it's a validation, group by what's being validated
  if (kind === "validation" || kind === "business_rule") {
    if (/\b(amount|fee|credit|charge|calculation|rate|total)\b/.test(lower)) return "Financial Validation";
    if (/\b(status|state|lifecycle|code)\b/.test(lower)) return "Status Validation";
    if (/\b(eligib|qualif|criteria|requirement|condition)\b/.test(lower)) return "Eligibility Validation";
    if (/\b(data|integrity|completeness|format|length)\b/.test(lower)) return "Data Validation";
    return "Business Rule Validation";
  }

  // Functional requirements — group by domain area
  if (kind === "functional" || kind === "ui") {
    if (/\b(batch|job|queue|schedule|process|run)\b/.test(lower)) return "Batch Processing";
    if (/\b(ui|screen|page|form|field|input|button|display|show)\b/.test(lower)) return "User Interface";
    if (/\b(report|summary|export|import|download)\b/.test(lower)) return "Reporting";
    if (/\b(config|setting|parameter|option)\b/.test(lower)) return "Configuration";
  }

  // Integration
  if (kind === "integration") {
    if (/\b(api|service|endpoint|rest|soap)\b/.test(lower)) return "API Integration";
    if (/\b(downstream|upstream|feed|interface)\b/.test(lower)) return "System Integration";
    return "Integration";
  }

  return "Core Logic";
}

// --- Cluster negative requirements by their outcome ---
function clusterByOutcome(reqs: ExtractedRequirement[]): ExtractedRequirement[][] {
  if (reqs.length <= 2) return [reqs];

  const groups: ExtractedRequirement[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < reqs.length; i++) {
    if (used.has(i)) continue;
    const group = [reqs[i]];
    used.add(i);

    for (let j = i + 1; j < reqs.length; j++) {
      if (used.has(j)) continue;
      // If they describe similar failure outcomes, merge
      if (areSimilarOutcomes(reqs[i].text, reqs[j].text)) {
        group.push(reqs[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }

  return groups;
}

function areSimilarOutcomes(text1: string, text2: string): boolean {
  const lower1 = text1.toLowerCase();
  const lower2 = text2.toLowerCase();

  // Same failure keyword = same outcome category
  const failPatterns = [
    /\b(?:reject|denied|blocked)\b/,
    /\b(?:error|exception|fail)\b/,
    /\b(?:invalid|incorrect|wrong)\b/,
    /\b(?:missing|null|empty|blank)\b/,
    /\b(?:timeout|expired|overdue)\b/,
    /\b(?:duplicate|conflict|already)\b/,
  ];

  for (const pattern of failPatterns) {
    if (pattern.test(lower1) && pattern.test(lower2)) return true;
  }

  return false;
}

// --- Build meaningful scenario titles ---
function buildScenarioTitle(flowName: string, reqs: ExtractedRequirement[], condition: string): string {
  const keyEntities = extractKeyEntities(reqs);
  const entityStr = keyEntities.length > 0 ? keyEntities.slice(0, 2).join(" & ") : "";

  if (condition === "positive") {
    if (entityStr) return `${flowName} — ${entityStr} Processing`;
    return `${flowName} — Happy Path`;
  }
  if (condition === "negative") {
    const failType = detectFailureType(reqs);
    if (entityStr) return `${flowName} — ${failType} for ${entityStr}`;
    return `${flowName} — ${failType}`;
  }
  if (condition === "boundary") {
    if (entityStr) return `${flowName} — Boundary Conditions for ${entityStr}`;
    return `${flowName} — Boundary Conditions`;
  }
  return `${flowName} — Scenario`;
}

function detectFailureType(reqs: ExtractedRequirement[]): string {
  const allText = reqs.map(r => r.text.toLowerCase()).join(" ");
  if (/\breject\b/.test(allText)) return "Rejection Handling";
  if (/\b(invalid|incorrect|wrong)\b/.test(allText)) return "Invalid Input Handling";
  if (/\b(missing|null|empty|blank)\b/.test(allText)) return "Missing Data Handling";
  if (/\b(error|exception|fail)\b/.test(allText)) return "Error Handling";
  if (/\b(timeout|expired)\b/.test(allText)) return "Timeout Handling";
  if (/\b(duplicate|conflict)\b/.test(allText)) return "Duplicate Handling";
  return "Negative Scenario";
}

function buildScenarioDescription(flowName: string, reqs: ExtractedRequirement[], condition: string): string {
  const texts = reqs.map(r => r.text).join(" | ");

  // Extract key actions
  const actions = new Set<string>();
  for (const req of reqs) {
    const lower = req.text.toLowerCase();
    if (/\bcalculat/.test(lower)) actions.add("calculates");
    if (/\bvalid/.test(lower)) actions.add("validates");
    if (/\breject/.test(lower)) actions.add("rejects");
    if (/\b(insert|create|store|persist|write)\b/.test(lower)) actions.add("creates/updates records");
    if (/\b(extract|select|read|query|fetch)\b/.test(lower)) actions.add("retrieves data");
    if (/\b(process|batch|job)\b/.test(lower)) actions.add("processes");
    if (/\b(display|show|render)\b/.test(lower)) actions.add("displays results");
    if (/\b(error|fail|exception)\b/.test(lower)) actions.add("handles errors");
  }

  const actionStr = [...actions].slice(0, 3).join(", ");
  return `${flowName} flow that ${actionStr || "handles"} the applicable business scenario.`;
}

function extractKeyEntities(reqs: ExtractedRequirement[]): string[] {
  const entities = new Set<string>();
  for (const r of reqs) {
    for (const table of r.relatedTables) {
      if (table.length >= 3) entities.add(table);
    }
    const matches = r.text.match(/\b([A-Z][A-Z_]{2,20})\b/g);
    if (matches) matches.slice(0, 3).forEach(m => entities.add(m));
  }
  return Array.from(entities).slice(0, 5);
}

// --- Deduplicate scenarios ---
function deduplicateScenarios(scenarios: CandidateScenario[]): CandidateScenario[] {
  const unique: CandidateScenario[] = [];
  const seenSignatures = new Set<string>();

  for (const sc of scenarios) {
    const sig = buildScenarioSignature(sc);
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      unique.push(sc);
    } else {
      // Merge requirement IDs into the existing scenario
      const existing = unique.find(u => buildScenarioSignature(u) === sig);
      if (existing) {
        existing.requirementIds = [...new Set([...existing.requirementIds, ...sc.requirementIds])];
        existing.sourceKnowledgeIds = [...new Set([...existing.sourceKnowledgeIds, ...sc.sourceKnowledgeIds])];
        existing.knowledgeTexts = [...new Set([...existing.knowledgeTexts, ...sc.knowledgeTexts])];
      }
    }
  }

  return unique;
}

function buildScenarioSignature(sc: CandidateScenario): string {
  // Normalize for comparison
  const title = sc.title.toLowerCase().replace(/[^a-z0-9& ]/g, "").replace(/\s+/g, " ").trim();
  return `${sc.flowName}|${sc.condition}|${title}`;
}

// ============================================================
// STAGE 5–6: E2E TESTCASE DESIGN + QUALITY
// ============================================================
function designTestCases(
  scenarios: CandidateScenario[],
  consolidated: ConsolidatedKnowledge,
  flows: BusinessFlow[],
  sqlContent: SqlParsedContent[],
  sources: TestCaseSource[],
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];

  for (const sc of scenarios) {
    const flow = flows.find(f => f.id === sc.flowId);
    const priority = assignPriority(sc, consolidated);
    const type = assignPrimaryType(sc);

    const steps = buildE2ESteps(sc, flow, consolidated);
    const precondition = buildPrecondition(sc, flow);
    const expectedResults = buildExpectedResults(sc, flow);
    const query = buildQuery(sc, sqlContent);
    const riskRationale = buildRiskRationale(sc, priority);

    const caseSources: TestCaseSource[] = buildCaseSources(sc, consolidated, sources);

    cases.push({
      id: `TC-${String(++tcCounter).padStart(3, "0")}`,
      caseNumber: `TC-${String(tcCounter).padStart(3, "0")}`,
      description: sc.title,
      steps,
      precondition,
      query,
      expectedResults,
      types: [type],
      priority,
      businessFlow: sc.flowName,
      requirementIds: sc.requirementIds,
      sources: caseSources.length > 0 ? caseSources : sources.slice(0, 1),
      riskRationale,
      status: "kept",
      originalData: {} as any,
    });
  }

  // Set originalData for all cases
  for (const tc of cases) {
    tc.originalData = {
      id: tc.id,
      caseNumber: tc.caseNumber,
      description: tc.description,
      steps: tc.steps,
      precondition: tc.precondition,
      query: tc.query,
      expectedResults: tc.expectedResults,
      types: [...tc.types],
      priority: tc.priority,
      businessFlow: tc.businessFlow,
      requirementIds: [...tc.requirementIds],
      sources: [...tc.sources],
      riskRationale: tc.riskRationale,
    };
  }

  return cases;
}

// ============================================================
// STAGE 7: PRIORITY ASSIGNMENT — Risk-based
// ============================================================
function assignPriority(
  scenario: CandidateScenario,
  consolidated: ConsolidatedKnowledge,
): TestPriority {
  let score = 0;
  const allText = scenario.knowledgeTexts.join(" ").toLowerCase();

  // Financial/calculation = highest priority
  if (/\b(calculat|amount|fee|credit|charge|billing|payment|financial|money|currency)\b/.test(allText)) score += 4;
  // Core validation
  if (/\b(validat|verify|check|ensur|confirm)\b/.test(allText)) score += 2;
  // Database persistence (data integrity)
  if (/\b(insert|create|update|delete|database|record|persist|store)\b/.test(allText)) score += 2;
  // Error handling
  if (/\b(error|fail|reject|invalid|exception)\b/.test(allText)) score += 1;
  // Batch/Job processing
  if (/\b(job|batch|queue|process|extract|schedule)\b/.test(allText)) score += 2;
  // Integration
  if (/\b(api|service|endpoint|request|response|message|integration)\b/.test(allText)) score += 1;

  // Multi-requirement scenarios are more important
  if (scenario.requirementIds.length >= 5) score += 2;
  else if (scenario.requirementIds.length >= 3) score += 1;

  // Positive flows are generally higher priority than negative
  if (scenario.condition === "positive") score += 1;

  // DB-heavy scenarios = data integrity risk
  if (scenario.databaseTables.length >= 2) score += 1;

  if (score >= 7) return "P0";
  if (score >= 4) return "P1";
  if (score >= 2) return "P2";
  return "P3";
}

function assignPrimaryType(scenario: CandidateScenario): TestCaseGenType {
  switch (scenario.condition) {
    case "positive": return "Functional";
    case "negative": return "Negative";
    case "boundary": return "Functional";
    case "error": return "Negative";
    default: return "Functional";
  }
}

// ============================================================
// STAGE 5: E2E STEP BUILDING — Specific, professional, business-aware
// ============================================================
function buildE2ESteps(
  scenario: CandidateScenario,
  flow: BusinessFlow | undefined,
  consolidated: ConsolidatedKnowledge,
): string {
  const steps: string[] = [];
  let stepNum = 1;

  // Step 1: Setup — specific to the flow
  if (flow?.databases && flow.databases.length > 0) {
    steps.push(`${stepNum++}. Prepare prerequisite test data in ${flow.databases.slice(0, 2).join(" and ")}.`);
  } else {
    steps.push(`${stepNum++}. Prepare prerequisite test data and verify the test environment is available.`);
  }

  // Step 2: Configuration — if configuration is needed
  const allTexts = [...new Set(scenario.knowledgeTexts)];
  const hasConfig = allTexts.some(t => /\b(config|setting|parameter|threshold|cap|limit)\b/i.test(t));
  if (hasConfig) {
    const configText = allTexts.find(t => /\b(config|setting|parameter|threshold|cap|limit)\b/i.test(t));
    steps.push(`${stepNum++}. Configure the required ${extractConfigTarget(configText || "")} through the application.`);
  }

  // Step 3+: Build meaningful steps from requirements, ordered logically
  const orderedSteps = orderStepsByLogic(allTexts, scenario.condition);
  for (const text of orderedSteps) {
    const step = buildSingleStep(text, scenario.condition);
    if (step) steps.push(`${stepNum++}. ${step}`);
  }

  // Step: Database validation if applicable
  if (scenario.databaseTables.length > 0) {
    steps.push(`${stepNum++}. Verify the expected records exist in ${scenario.databaseTables.slice(0, 3).join(", ")}.`);
  }

  // Step: Final outcome
  if (scenario.condition === "positive") {
    steps.push(`${stepNum++}. Verify the final business outcome is correct and all processing completed successfully.`);
  } else if (scenario.condition === "negative") {
    steps.push(`${stepNum++}. Verify the system correctly handles the error condition and no incorrect data is committed.`);
  } else if (scenario.condition === "boundary") {
    steps.push(`${stepNum++}. Verify the system correctly processes the boundary condition per the documented business rules.`);
  }

  return steps.join("\n");
}

function extractConfigTarget(text: string): string {
  const lower = text.toLowerCase();
  if (/cap|threshold|limit/.test(lower)) return "cap amount / threshold configuration";
  if (/rate|fee|charge/.test(lower)) return "rate / fee configuration";
  if (/rule|policy/.test(lower)) return "business rule configuration";
  if (/status|code/.test(lower)) return "status code configuration";
  return "application configuration";
}

function orderStepsByLogic(texts: string[], condition: string): string[] {
  // Order: trigger → process → validate → result
  const trigger: string[] = [];
  const process: string[] = [];
  const validate: string[] = [];
  const result: string[] = [];

  for (const text of texts) {
    const lower = text.toLowerCase();
    if (/\b(submit|send|trigger|start|initiate|enter|input|configure)\b/.test(lower)) {
      trigger.push(text);
    } else if (/\b(calculat|comput|determin|evaluat|transform|process)\b/.test(lower)) {
      process.push(text);
    } else if (/\b(verify|validate|confirm|check|ensure|assert)\b/.test(lower)) {
      validate.push(text);
    } else if (/\b(result|output|display|show|return|record|store|insert|create)\b/.test(lower)) {
      result.push(text);
    } else {
      process.push(text); // default to process
    }
  }

  return [...trigger, ...process, ...validate, ...result].slice(0, 10);
}

function buildSingleStep(text: string, condition: string): string | null {
  let step = cleanSentence(text);
  if (!step) return null;

  // Ensure step starts with a verb or action
  const lower = step.toLowerCase();
  if (!/^(verify|validate|check|confirm|ensure|submit|enter|configure|execute|run|process|check|open|navigate|select|input|create|update|delete|insert|extract|load|send|trigger|start|initiate)\b/.test(lower)) {
    // Prefix with appropriate action
    if (/\b(reject|fail|error|invalid|denied|block)\b/.test(lower)) {
      step = `Submit data that triggers: ${step.charAt(0).toLowerCase() + step.slice(1)}`;
    } else if (/\b(should|must|shall|can|does|will)\b/.test(lower)) {
      step = `Verify that ${step.charAt(0).toLowerCase() + step.slice(1)}`;
    }
  }

  return step;
}

function buildPrecondition(
  scenario: CandidateScenario,
  flow: BusinessFlow | undefined,
): string {
  const parts: string[] = [];

  parts.push("User has appropriate access to the application.");

  if (scenario.databaseTables.length > 0) {
    parts.push(`Required test data exists in ${scenario.databaseTables.slice(0, 3).join(", ")}.`);
  }

  if (flow?.jobs && flow.jobs.length > 0) {
    parts.push(`Batch processing infrastructure is operational (${flow.jobs.slice(0, 2).join(", ")}).`);
  }

  if (flow?.upstreamSystems && flow.upstreamSystems.length > 0) {
    parts.push(`Upstream systems (${flow.upstreamSystems.slice(0, 2).join(", ")}) are available and returning expected data.`);
  }

  if (scenario.condition === "negative") {
    parts.push("Test data is configured to trigger the specific error/invalid condition.");
  }

  if (scenario.condition === "boundary") {
    parts.push("Boundary/threshold values are configured per the documented business rules.");
  }

  return parts.join(" ");
}

function buildExpectedResults(
  scenario: CandidateScenario,
  flow: BusinessFlow | undefined,
): string {
  const parts: string[] = [];

  if (scenario.condition === "positive") {
    parts.push(`The ${scenario.flowName} flow completes successfully.`);
    parts.push("All validations pass and data is processed correctly.");
    if (scenario.databaseTables.length > 0) {
      parts.push(`Expected records are created/updated in ${scenario.databaseTables.slice(0, 3).join(", ")}.`);
    }
    parts.push("The business outcome matches the documented expected behavior.");
  } else if (scenario.condition === "negative") {
    parts.push("The system correctly identifies the error/invalid condition.");
    parts.push("An appropriate error message or rejection behavior is displayed.");
    parts.push("No incorrect data is committed to the database.");
    parts.push("The system maintains data integrity.");
  } else if (scenario.condition === "boundary") {
    parts.push("The system correctly handles the boundary condition.");
    parts.push("The behavior at the edge value is consistent with the documented business rules.");
    if (scenario.databaseTables.length > 0) {
      parts.push(`Database records reflect the expected boundary behavior.`);
    }
  } else {
    parts.push(`The ${scenario.flowName} flow produces the expected business outcome.`);
  }

  return parts.join(" ");
}

function buildQuery(
  scenario: CandidateScenario,
  sqlContent: SqlParsedContent[],
): string {
  if (scenario.databaseTables.length === 0) return "N/A — no database validation required";

  const queries: string[] = [];

  for (const tableName of scenario.databaseTables.slice(0, 3)) {
    const tableDef = sqlContent
      .flatMap(s => s.tables)
      .find(t => t.name.toUpperCase() === tableName.toUpperCase());

    if (tableDef && tableDef.columns.length > 0) {
      const cols = tableDef.columns.map(c => `       ${c.name}`).join(",\n");
      const pkCol = tableDef.columns.find(c => c.isPrimaryKey);
      if (pkCol) {
        queries.push(`SELECT\n       ${tableDef.columns.map(c => c.name).join(",\n       ")}\nFROM ${tableName}\nWHERE ${pkCol.name} = '<${pkCol.name}>';`);
      } else {
        queries.push(`SELECT\n       ${tableDef.columns.map(c => c.name).join(",\n       ")}\nFROM ${tableName}\nWHERE <CONDITION>;`);
      }
    } else if (tableDef) {
      queries.push(`SELECT *\nFROM ${tableName}\nWHERE <CONDITION>;\n-- Note: specific column list not available from uploaded schema.`);
    } else {
      queries.push(`SELECT *\nFROM ${tableName}\nWHERE <CONDITION>;\n-- Schema information required: table/column details not found in uploaded sources.`);
    }
  }

  return queries.length > 0 ? queries.join("\n\n") : "N/A — no database validation required";
}

function buildRiskRationale(scenario: CandidateScenario, priority: TestPriority): string {
  const parts: string[] = [];

  if (priority === "P0") {
    parts.push("Critical business flow with high financial/data integrity risk.");
  } else if (priority === "P1") {
    parts.push("Important functional scenario with moderate business impact.");
  } else if (priority === "P2") {
    parts.push("Secondary functionality with lower business risk.");
  } else {
    parts.push("Low-risk edge case or informational validation.");
  }

  if (scenario.requirementIds.length >= 3) {
    parts.push(`Covers ${scenario.requirementIds.length} requirements in a single E2E flow.`);
  }

  if (scenario.databaseTables.length > 0) {
    parts.push(`Validates data integrity in ${scenario.databaseTables.length} database table(s).`);
  }

  return parts.join(" ");
}

function buildCaseSources(sc: CandidateScenario, consolidated: ConsolidatedKnowledge, sources: TestCaseSource[]): TestCaseSource[] {
  const sourceMap = new Map<string, TestCaseSource>();

  for (const reqId of sc.requirementIds) {
    const req = consolidated.requirements.find(r => r.id === reqId);
    if (!req) continue;
    const docName = req.sourceRef.split(" → ")[0] || "Unknown";
    if (!sourceMap.has(docName)) {
      // Find matching source by documentName
      const matchingSource = sources.find(s => s.documentName === docName);
      sourceMap.set(docName, {
        documentId: matchingSource?.documentId || "",
        documentName: docName,
        sectionRef: req.sourceRef,
        kind: "requirement",
      });
    }
  }

  return [...sourceMap.values()];
}

// ============================================================
// TEXT QUALITY
// ============================================================
function cleanSentence(text: string): string {
  let cleaned = text.trim();

  // Remove markdown artifacts
  cleaned = cleaned.replace(/^\*\*|^#+\s*/, "");
  cleaned = cleaned.replace(/\*\*$/g, "");

  // Fix common grammar issues
  cleaned = cleaned.replace(/\bverify that that\b/gi, "verify that");
  cleaned = cleaned.replace(/\bcheck that that\b/gi, "check that");
  cleaned = cleaned.replace(/\bthe the\b/gi, "the");
  cleaned = cleaned.replace(/\ba a\b/gi, "a");
  cleaned = cleaned.replace(/\ban an\b/gi, "an");

  // Ensure proper capitalization
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Ensure ends with period
  if (cleaned.length > 0 && !cleaned.endsWith(".") && !cleaned.endsWith(";") && !cleaned.endsWith(":")) {
    cleaned += ".";
  }

  return cleaned;
}

// ============================================================
// STAGE 8–9: COMPUTE SUMMARY
// ============================================================
function computeSummary(
  cases: GeneratedTestCase[],
  consolidated: ConsolidatedKnowledge,
  flows: BusinessFlow[],
  candidateCount: number,
): TcgGenerationSummary {
  const totalReqs = consolidated.requirements.length;
  const coveredReqIds = new Set(cases.filter(c => c.status !== "ignored").flatMap(c => c.requirementIds));
  const covered = coveredReqIds.size;
  const uncovered = consolidated.requirements
    .filter(r => !coveredReqIds.has(r.id))
    .map(r => r.id);

  return {
    businessFlows: flows.length,
    requirementsAnalyzed: totalReqs,
    candidateScenarios: candidateCount,
    duplicatesRemoved: candidateCount - cases.length,
    optimizedScenarios: cases.length,
    finalTestCases: cases.length,
    p0Count: cases.filter(c => c.priority === "P0").length,
    p1Count: cases.filter(c => c.priority === "P1").length,
    p2Count: cases.filter(c => c.priority === "P2").length,
    p3Count: cases.filter(c => c.priority === "P3").length,
    requirementCoverage: totalReqs > 0 ? Math.round((covered / totalReqs) * 1000) / 10 : 0,
    totalRequirements: totalReqs,
    coveredRequirements: covered,
    uncoveredRequirements: uncovered,
    dbValidationCases: cases.filter(c => c.query !== "N/A — no database validation required" && c.query !== "N/A").length,
    e2eFlows: flows.length,
    flowNames: flows.map(f => f.name),
  };
}

// ============================================================
// MAIN ENTRY — Full pipeline
// ============================================================
export function generateTestCases(
  knowledge: ExtractedKnowledge[],
  documents: TcgDocument[],
): { cases: GeneratedTestCase[]; summary: TcgGenerationSummary; flows: BusinessFlow[] } {
  tcCounter = 0;
  reqCounter = 0;

  const sources = documents
    .filter(d => d.status === "parsed")
    .map(d => ({
      documentName: d.name,
      documentId: d.id,
      sectionRef: d.category,
      kind: d.category as TestCaseSource["kind"],
    }));

  const sqlDocs = documents.filter(d => d.parsedContent?.kind === "sql");
  const sqlContent = sqlDocs.map(d => d.parsedContent as SqlParsedContent);

  // STAGE 1: Consolidate knowledge
  const consolidated = consolidateKnowledge(knowledge, sources);

  // STAGE 2: Identify business flows
  const flows = identifyBusinessFlows(consolidated);

  // STAGE 3–4: Optimize scenarios
  const scenarios = optimizeScenarios(consolidated, flows);
  const candidateCount = scenarios.length;

  // STAGE 5–6: Design E2E test cases
  const cases = designTestCases(scenarios, consolidated, flows, sqlContent, sources);

  // STAGE 8–9: Compute summary
  const summary = computeSummary(cases, consolidated, flows, candidateCount);

  // Sort by priority
  const priorityOrder: Record<TestPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  cases.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { cases, summary, flows };
}
