// ============================================================
// Requirement → Test Case Generator — Knowledge Analyzer (v3)
// Source-truth-based extraction with traceability, reconciliation,
// conflict detection, and missing information analysis.
// ============================================================

import type {
  TcgDocument,
  ExtractedKnowledge,
  SourceEvidence,
  SourceConfidence,
  TechnicalEntity,
  TechnicalEntityKind,
  MissingInformation,
  SourceConflict,
  ExtractedRequirement,
  BusinessFlow,
  SqlParsedContent,
  TextParsedContent,
  ImageParsedContent,
} from "./types";

// ============================================================
// PUBLIC API
// ============================================================

export interface AnalysisResult {
  knowledge: ExtractedKnowledge[];
  technicalEntities: TechnicalEntity[];
  requirements: ExtractedRequirement[];
  flows: BusinessFlow[];
  missingInformation: MissingInformation[];
  sourceConflicts: SourceConflict[];
  knownTables: Map<string, Set<string>>;  // tableName -> Set<columnName>
}

/**
 * Main analysis entry point. Analyzes ALL documents together.
 * Builds a unified knowledge model with source traceability.
 */
export function analyzeAll(documents: TcgDocument[]): AnalysisResult {
  const knownTables = extractAllTableSchemas(documents);
  const technicalEntities = extractAllTechnicalEntities(documents);
  const knowledge = extractAllKnowledge(documents, technicalEntities);
  const requirements = extractRequirements(knowledge);
  const sourceConflicts = detectConflicts(technicalEntities, knowledge, documents);
  const flows = identifyBusinessFlows(knowledge, requirements, technicalEntities);
  const missingInformation = analyzeMissingInformation(flows, requirements, technicalEntities, knownTables);

  // Link requirements to flows
  linkRequirementsToFlows(requirements, flows, knowledge);

  return {
    knowledge,
    technicalEntities,
    requirements,
    flows,
    missingInformation,
    sourceConflicts,
    knownTables,
  };
}

/**
 * Build source evidence for a document.
 */
export function buildSourceEvidence(doc: TcgDocument, excerpt?: string, sectionRef?: string): SourceEvidence {
  return {
    documentId: doc.id,
    documentName: doc.name,
    sectionRef: sectionRef || doc.name,
    kind: (doc.category === "source_code" ? "source_code" : doc.category === "architecture_image" ? "architecture" : doc.category) as SourceEvidence["kind"],
    excerpt,
  };
}

/**
 * Build sources for a test case.
 */
export function buildSources(docs: TcgDocument[]): SourceEvidence[] {
  return docs.map(doc => buildSourceEvidence(doc));
}

// ============================================================
// STAGE 1-4: TABLE SCHEMA EXTRACTION
// ============================================================

function extractAllTableSchemas(documents: TcgDocument[]): Map<string, Set<string>> {
  const schemas = new Map<string, Set<string>>();

  for (const doc of documents) {
    if (doc.parsedContent?.kind === "sql") {
      const sql = doc.parsedContent as SqlParsedContent;
      for (const table of sql.tables) {
        const name = table.name.toUpperCase();
        if (!schemas.has(name)) schemas.set(name, new Set());
        for (const col of table.columns) {
          schemas.get(name)!.add(col.name.toUpperCase());
        }
      }
      // Also extract from statements
      for (const stmt of sql.statements) {
        for (const tableName of stmt.tables) {
          const name = tableName.toUpperCase();
          if (!schemas.has(name)) schemas.set(name, new Set());
          for (const col of stmt.columns) {
            schemas.get(name)!.add(col.toUpperCase());
          }
        }
      }
    }
  }

  return schemas;
}

// ============================================================
// STAGE 5-6: TECHNICAL ENTITY EXTRACTION
// ============================================================

function extractAllTechnicalEntities(documents: TcgDocument[]): TechnicalEntity[] {
  const entities: TechnicalEntity[] = [];
  let idCounter = 0;

  for (const doc of documents) {
    if (!doc.parsedContent) continue;

    if (doc.parsedContent.kind === "sql") {
      entities.push(...extractSqlEntities(doc, doc.parsedContent as SqlParsedContent, idCounter));
      idCounter += 1000;
    } else if (doc.parsedContent.kind === "text") {
      entities.push(...extractTextEntities(doc, doc.parsedContent as TextParsedContent, idCounter));
      idCounter += 1000;
    }
  }

  // Cross-reference: mark entities that are referenced but not defined
  markReferencedEntities(entities);

  return entities;
}

function extractSqlEntities(doc: TcgDocument, sql: SqlParsedContent, baseId: number): TechnicalEntity[] {
  const entities: TechnicalEntity[] = [];
  const evidence = buildSourceEvidence(doc);

  // Tables
  for (const table of sql.tables) {
    entities.push({
      id: `te_${baseId++}`,
      name: table.name.toUpperCase(),
      kind: "table",
      sourceEvidence: [{ ...evidence, excerpt: `CREATE TABLE ${table.name}`, sectionRef: `${doc.name} → Schema` }],
      confidence: "CONFIRMED",
      details: table.columns.map(c => `${c.name} ${c.dataType}`).join(", "),
    });
  }

  // Columns from statements
  for (const stmt of sql.statements) {
    for (const tableName of stmt.tables) {
      const existing = entities.find(e => e.kind === "table" && e.name === tableName.toUpperCase());
      if (!existing) {
        entities.push({
          id: `te_${baseId++}`,
          name: tableName.toUpperCase(),
          kind: "table",
          sourceEvidence: [{ ...evidence, excerpt: stmt.raw.slice(0, 200), sectionRef: `${doc.name} → Statement` }],
          confidence: "REFERENCED",
          details: `Referenced in ${stmt.type} statement`,
        });
      }
    }
  }

  // Stored procedures / functions
  const spMatches = sql.fullText.matchAll(/\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?)?(?:PROCEDURE|FUNCTION)\s+(\w+)/gi);
  for (const m of spMatches) {
    entities.push({
      id: `te_${baseId++}`,
      name: m[1].toUpperCase(),
      kind: "stored_procedure",
      sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Procedure/Function` }],
      confidence: "CONFIRMED",
    });
  }

  // Triggers
  const trigMatches = sql.fullText.matchAll(/\bCREATE\s+TRIGGER\s+(\w+)/gi);
  for (const m of trigMatches) {
    entities.push({
      id: `te_${baseId++}`,
      name: m[1].toUpperCase(),
      kind: "trigger",
      sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Trigger` }],
      confidence: "CONFIRMED",
    });
  }

  return entities;
}

function extractTextEntities(doc: TcgDocument, content: TextParsedContent, baseId: number): TechnicalEntity[] {
  const entities: TechnicalEntity[] = [];
  const evidence = buildSourceEvidence(doc);
  const allText = content.fullText;
  const upperText = allText.toUpperCase();

  // Java classes
  const classMatches = allText.matchAll(/\b(?:public|private|protected)?\s*(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)/g);
  for (const m of classMatches) {
    const name = m[1];
    // Check if it's a DTO
    const kind: TechnicalEntityKind = /DTO|Request|Response|Event/i.test(name) ? "dto" : "class";
    entities.push({
      id: `te_${baseId++}`,
      name,
      kind,
      sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → ${kind.toUpperCase()}` }],
      confidence: "CONFIRMED",
    });
  }

  // Methods
  const methodMatches = allText.matchAll(/\b(?:public|private|protected)\s+[\w<>\[\],\s]+\s+(\w+)\s*\(([^)]*)\)/g);
  for (const m of methodMatches) {
    entities.push({
      id: `te_${baseId++}`,
      name: m[1],
      kind: "method",
      sourceEvidence: [{ ...evidence, excerpt: m[0].slice(0, 150), sectionRef: `${doc.name} → Method` }],
      confidence: "CONFIRMED",
      details: `(${m[2]})`,
    });
  }

  // Services / APIs
  const serviceMatches = allText.matchAll(/\b(\w+Service)\b/g);
  const seenServices = new Set<string>();
  for (const m of serviceMatches) {
    if (!seenServices.has(m[1])) {
      seenServices.add(m[1]);
      entities.push({
        id: `te_${baseId++}`,
        name: m[1],
        kind: "service",
        sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Service` }],
        confidence: "CONFIRMED",
      });
    }
  }

  // Jobs / Batch processes
  const jobPatterns = [
    /\b(\w+_JOB)\b/gi,
    /\b(\w+_BATCH)\b/gi,
    /\b(?:job|batch|process)\s*[=:]\s*["']?(\w+)["']?/gi,
    /\bControl-M\b.*?(\w+)/gi,
  ];
  for (const regex of jobPatterns) {
    for (const m of allText.matchAll(regex)) {
      const name = m[1].toUpperCase();
      if (!entities.find(e => e.kind === "job" && e.name === name)) {
        entities.push({
          id: `te_${baseId++}`,
          name,
          kind: "job",
          sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Job` }],
          confidence: "REFERENCED",
        });
      }
    }
  }

  // Tables referenced in text (not defined in SQL)
  const tableRefMatches = upperText.matchAll(/\b(?:table|FROM|INTO|UPDATE|JOIN)\s+[`"]?([A-Z_]{3,})["`]?/g);
  for (const m of tableRefMatches) {
    const name = m[1];
    if (!entities.find(e => e.kind === "table" && e.name === name)) {
      entities.push({
        id: `te_${baseId++}`,
        name,
        kind: "table",
        sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Reference` }],
        confidence: "REFERENCED",
      });
    }
  }

  // Queues
  const queueMatches = allText.matchAll(/\b(\w+_QUE(?:UE)?)\b/gi);
  for (const m of queueMatches) {
    const name = m[1].toUpperCase();
    if (!entities.find(e => e.kind === "queue" && e.name === name)) {
      entities.push({
        id: `te_${baseId++}`,
        name,
        kind: "queue",
        sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Queue` }],
        confidence: "REFERENCED",
      });
    }
  }

  // Shell commands
  const shellCmdMatches = allText.matchAll(/\b(?:sh|bash|ksh)\s+(\S+\.\w+)/g);
  for (const m of shellCmdMatches) {
    entities.push({
      id: `te_${baseId++}`,
      name: m[1],
      kind: "shell_command",
      sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Shell Script` }],
      confidence: "CONFIRMED",
    });
  }

  // Configuration values
  const configMatches = allText.matchAll(/\b(\w+(?:\.\w+)*)\s*=\s*["']([^"']+)["']/g);
  for (const m of configMatches) {
    if (m[1].length > 3) {
      entities.push({
        id: `te_${baseId++}`,
        name: m[1],
        kind: "configuration",
        sourceEvidence: [{ ...evidence, excerpt: m[0], sectionRef: `${doc.name} → Config` }],
        confidence: "CONFIRMED",
        details: `= ${m[2]}`,
      });
    }
  }

  return entities;
}

function markReferencedEntities(entities: TechnicalEntity[]): void {
  const confirmedNames = new Set(entities.filter(e => e.confidence === "CONFIRMED").map(e => e.name.toUpperCase()));

  for (const entity of entities) {
    if (entity.confidence === "REFERENCED" && confirmedNames.has(entity.name.toUpperCase())) {
      // This entity is referenced in some places but defined in others — mark as confirmed
      entity.confidence = "CONFIRMED";
    }
  }
}

// ============================================================
// STAGE 7: KNOWLEDGE EXTRACTION (with source traceability)
// ============================================================

function extractAllKnowledge(documents: TcgDocument[], entities: TechnicalEntity[]): ExtractedKnowledge[] {
  const knowledge: ExtractedKnowledge[] = [];
  let idCounter = 0;

  for (const doc of documents) {
    if (!doc.parsedContent) continue;

    if (doc.parsedContent.kind === "text") {
      knowledge.push(...extractTextKnowledge(doc, doc.parsedContent as TextParsedContent, entities, idCounter));
      idCounter += 500;
    } else if (doc.parsedContent.kind === "sql") {
      knowledge.push(...extractSqlKnowledge(doc, doc.parsedContent as SqlParsedContent, entities, idCounter));
      idCounter += 500;
    } else if (doc.parsedContent.kind === "image") {
      knowledge.push(...extractImageKnowledge(doc, doc.parsedContent as ImageParsedContent, idCounter));
      idCounter += 100;
    }
  }

  return knowledge;
}

function extractTextKnowledge(
  doc: TcgDocument, content: TextParsedContent, entities: TechnicalEntity[], baseId: number
): ExtractedKnowledge[] {
  const items: ExtractedKnowledge[] = [];
  const evidence = buildSourceEvidence(doc);

  // Extract from paragraphs
  for (let i = 0; i < content.paragraphs.length; i++) {
    const para = content.paragraphs[i];
    if (para.length < 15) continue;

    const kind = classifyKnowledgeText(para);
    const relatedTables = findRelatedTables(para, entities);
    const relatedFields = findRelatedFields(para, entities);
    const relatedEntities = findRelatedEntities(para, entities);
    const confidence = assessSourceConfidence(doc.category);

    items.push({
      id: `ek_${baseId++}`,
      documentId: doc.id,
      sourceRef: `${doc.name} → Para ${i + 1}`,
      sourceEvidence: [{ ...evidence, excerpt: para.slice(0, 300), sectionRef: `${doc.name} → Paragraph ${i + 1}` }],
      kind,
      text: para,
      confidence,
      relatedTables,
      relatedFields,
      relatedEntities,
    });
  }

  // Extract from lists
  for (let i = 0; i < content.lists.length; i++) {
    const item = content.lists[i];
    if (item.length < 10) continue;

    const kind = classifyKnowledgeText(item);
    const relatedTables = findRelatedTables(item, entities);
    const relatedEntities = findRelatedEntities(item, entities);

    items.push({
      id: `ek_${baseId++}`,
      documentId: doc.id,
      sourceRef: `${doc.name} → List ${i + 1}`,
      sourceEvidence: [{ ...evidence, excerpt: item.slice(0, 300), sectionRef: `${doc.name} → List Item ${i + 1}` }],
      kind,
      text: item,
      confidence: assessSourceConfidence(doc.category),
      relatedTables,
      relatedFields: findRelatedFields(item, entities),
      relatedEntities,
    });
  }

  // Extract from headings as section context
  for (let i = 0; i < content.headings.length; i++) {
    const heading = content.headings[i];
    items.push({
      id: `ek_${baseId++}`,
      documentId: doc.id,
      sourceRef: `${doc.name} → Heading ${i + 1}`,
      sourceEvidence: [{ ...evidence, excerpt: heading, sectionRef: `${doc.name} → ${heading}` }],
      kind: "flow_step",
      text: `Section: ${heading}`,
      confidence: "CONFIRMED",
      relatedTables: findRelatedTables(heading, entities),
      relatedFields: [],
      relatedEntities: findRelatedEntities(heading, entities),
      sectionRef: heading,
    });
  }

  return items;
}

function extractSqlKnowledge(
  doc: TcgDocument, sql: SqlParsedContent, entities: TechnicalEntity[], baseId: number
): ExtractedKnowledge[] {
  const items: ExtractedKnowledge[] = [];
  const evidence = buildSourceEvidence(doc);

  for (const table of sql.tables) {
    items.push({
      id: `ek_${baseId++}`,
      documentId: doc.id,
      sourceRef: `${doc.name} → ${table.name}`,
      sourceEvidence: [{ ...evidence, excerpt: `CREATE TABLE ${table.name}`, sectionRef: `${doc.name} → Schema: ${table.name}` }],
      kind: "schema_info",
      text: `Table ${table.name} with columns: ${table.columns.map(c => `${c.name} (${c.dataType})`).join(", ")}`,
      confidence: "CONFIRMED",
      relatedTables: [table.name.toUpperCase()],
      relatedFields: table.columns.map(c => c.name.toUpperCase()),
      relatedEntities: [],
    });
  }

  for (const stmt of sql.statements) {
    if (stmt.type === "SELECT" || stmt.type === "INSERT" || stmt.type === "UPDATE" || stmt.type === "MERGE") {
      items.push({
        id: `ek_${baseId++}`,
        documentId: doc.id,
        sourceRef: `${doc.name} → ${stmt.type} Statement`,
        sourceEvidence: [{ ...evidence, excerpt: stmt.raw.slice(0, 300), sectionRef: `${doc.name} → ${stmt.type}` }],
        kind: "database_interaction",
        text: `${stmt.type} on ${stmt.tables.join(", ")}: ${stmt.raw.slice(0, 200)}`,
        confidence: "CONFIRMED",
        relatedTables: stmt.tables.map(t => t.toUpperCase()),
        relatedFields: stmt.columns.map(c => c.toUpperCase()),
        relatedEntities: [],
      });
    }
  }

  return items;
}

function extractImageKnowledge(
  doc: TcgDocument, image: ImageParsedContent, baseId: number
): ExtractedKnowledge[] {
  const evidence = buildSourceEvidence(doc);
  return [{
    id: `ek_${baseId}`,
    documentId: doc.id,
    sourceRef: `${doc.name} → Image`,
    sourceEvidence: [{ ...evidence, excerpt: image.description, sectionRef: `${doc.name} → Architecture Diagram` }],
    kind: "architecture_flow",
    text: `Architecture diagram uploaded: ${image.description}. Visual content could not be fully extracted by client-side parser. Manual review recommended.`,
    confidence: "REFERENCED",
    relatedTables: [],
    relatedFields: [],
    relatedEntities: [],
  }];
}

// ============================================================
// CLASSIFICATION HELPERS
// ============================================================

function classifyKnowledgeText(text: string): ExtractedKnowledge["kind"] {
  const lower = text.toLowerCase();
  if (/shall|must|should|required|mandatory|specif/i.test(lower)) return "requirement_statement";
  if (/if\s+.*then|when\s+.*(?:shall|must|should|will)|rule|condition|provided that/i.test(lower)) return "business_rule";
  if (/valid|check|verify|ensure|reject|accept|error|invalid/i.test(lower)) return "validation_rule";
  if (/step\s+\d|process|flow|sequence|first|then|next|finally|after|before/i.test(lower)) return "flow_step";
  if (/input|output|request|response|parameter|return/i.test(lower)) return "input_output";
  if (/exception|error|catch|throw|fail|retry|recovery|restart/i.test(lower)) return "error_handling";
  if (/select|insert|update|delete|table|column|database|query|join/i.test(lower)) return "database_interaction";
  if (/api|service|queue|message|publish|subscribe|call|endpoint/i.test(lower)) return "system_interaction";
  if (/max|min|limit|threshold|cap|boundary|exceed|greater|less/i.test(lower)) return "boundary_condition";
  if (/job|batch|schedule|control-m|cron|trigger|run/i.test(lower)) return "job_definition";
  if (/class|method|function|interface|dto|enum|implements|extends/i.test(lower)) return "code_logic";
  return "requirement_statement";
}

function findRelatedTables(text: string, entities: TechnicalEntity[]): string[] {
  const upper = text.toUpperCase();
  return entities
    .filter(e => e.kind === "table" && upper.includes(e.name))
    .map(e => e.name);
}

function findRelatedFields(text: string, entities: TechnicalEntity[]): string[] {
  const upper = text.toUpperCase();
  return entities
    .filter(e => (e.kind === "column" || e.kind === "field") && upper.includes(e.name))
    .map(e => e.name);
}

function findRelatedEntities(text: string, entities: TechnicalEntity[]): string[] {
  const upper = text.toUpperCase();
  return entities
    .filter(e => upper.includes(e.name) && e.kind !== "table" && e.kind !== "column")
    .map(e => e.id);
}

function assessSourceConfidence(category: string): SourceConfidence {
  if (category === "requirement") return "CONFIRMED";
  if (category === "design") return "CONFIRMED";
  if (category === "database") return "CONFIRMED";
  if (category === "source_code") return "CONFIRMED";
  if (category === "architecture_image") return "REFERENCED";
  return "REFERENCED";
}

// ============================================================
// STAGE 8: REQUIREMENT EXTRACTION
// ============================================================

function extractRequirements(knowledge: ExtractedKnowledge[]): ExtractedRequirement[] {
  const requirements: ExtractedRequirement[] = [];
  let reqCounter = 1;

  for (const k of knowledge) {
    if (["requirement_statement", "business_rule", "validation_rule", "boundary_condition", "error_handling"].includes(k.kind)) {
      requirements.push({
        id: `REQ-${String(reqCounter++).padStart(3, "0")}`,
        text: k.text,
        flowId: null,
        sourceRef: k.sourceRef,
        sourceEvidence: k.sourceEvidence,
        kind: mapKnowledgeToReqKind(k.kind),
        sourceKnowledgeId: k.id,
        relatedTables: k.relatedTables,
        relatedFields: k.relatedFields,
        relatedEntities: k.relatedEntities,
        coverageStatus: "NOT_COVERED",
      });
    }
  }

  return requirements;
}

function mapKnowledgeToReqKind(kind: string): ExtractedRequirement["kind"] {
  switch (kind) {
    case "requirement_statement": return "functional";
    case "business_rule": return "business_rule";
    case "validation_rule": return "validation";
    case "boundary_condition": return "boundary";
    case "error_handling": return "error_handling";
    default: return "functional";
  }
}

// ============================================================
// STAGE 9: CONFLICT DETECTION
// ============================================================

function detectConflicts(
  entities: TechnicalEntity[],
  knowledge: ExtractedKnowledge[],
  documents: TcgDocument[]
): SourceConflict[] {
  const conflicts: SourceConflict[] = [];
  let conflictId = 1;

  // Group entities by name
  const byName = new Map<string, TechnicalEntity[]>();
  for (const e of entities) {
    const key = e.name.toUpperCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(e);
  }

  // Check for entities with conflicting definitions
  for (const [name, group] of byName) {
    if (group.length < 2) continue;

    const differentDocs = new Set(group.map(e => e.sourceEvidence[0]?.documentName));
    if (differentDocs.size < 2) continue;

    // Different documents reference the same entity with potentially different details
    const details = group.map(e => e.details || e.kind).filter(Boolean);
    const uniqueDetails = new Set(details);

    if (uniqueDetails.size > 1) {
      conflicts.push({
        id: `conflict_${conflictId++}`,
        entityName: name,
        sources: group.flatMap(e => e.sourceEvidence),
        conflictingValues: Array.from(uniqueDetails),
        description: `Entity "${name}" is defined differently across sources: ${Array.from(differentDocs).join(", ")}`,
      });
    }
  }

  return conflicts;
}

// ============================================================
// STAGE 10: BUSINESS FLOW IDENTIFICATION
// ============================================================

function identifyBusinessFlows(
  knowledge: ExtractedKnowledge[],
  requirements: ExtractedRequirement[],
  entities: TechnicalEntity[]
): BusinessFlow[] {
  const flows: BusinessFlow[] = [];
  let flowId = 1;

  // Group knowledge by co-occurring entities (tables, services, jobs)
  const entityToKnowledge = new Map<string, string[]>();
  for (const k of knowledge) {
    for (const table of k.relatedTables) {
      const key = `table:${table}`;
      if (!entityToKnowledge.has(key)) entityToKnowledge.set(key, []);
      entityToKnowledge.get(key)!.push(k.id);
    }
    for (const entity of k.relatedEntities) {
      const key = `entity:${entity}`;
      if (!entityToKnowledge.has(key)) entityToKnowledge.set(key, []);
      entityToKnowledge.get(key)!.push(k.id);
    }
  }

  // Cluster knowledge items by shared entities
  const clusters = clusterKnowledgeByEntities(knowledge, entityToKnowledge);

  // Create flows from clusters
  for (const cluster of clusters) {
    if (cluster.knowledgeIds.length < 2) continue;

    const clusterKnowledge = knowledge.filter(k => cluster.knowledgeIds.includes(k.id));
    const flowName = deriveFlowName(clusterKnowledge, entities);
    const tables = [...new Set(clusterKnowledge.flatMap(k => k.relatedTables))];
    const jobs = entities.filter(e => e.kind === "job" && cluster.knowledgeIds.some(kid => {
      const k = knowledge.find(kk => kk.id === kid);
      return k?.relatedEntities.includes(e.id);
    })).map(e => e.name);

    flows.push({
      id: `flow_${flowId++}`,
      name: flowName,
      description: `Business flow involving: ${tables.slice(0, 5).join(", ")}`,
      steps: clusterKnowledge.filter(k => k.kind === "flow_step").map(k => k.text).slice(0, 10),
      knowledgeIds: cluster.knowledgeIds,
      upstreamSystems: [],
      downstreamSystems: [],
      databases: tables,
      jobs,
      classes: entities.filter(e => e.kind === "class" && cluster.knowledgeIds.some(kid => {
        const k = knowledge.find(kk => kk.id === kid);
        return k?.relatedEntities.includes(e.id);
      })).map(e => e.name),
      services: entities.filter(e => e.kind === "service" && cluster.knowledgeIds.some(kid => {
        const k = knowledge.find(kk => kk.id === kid);
        return k?.relatedEntities.includes(e.id);
      })).map(e => e.name),
    });
  }

  // Fallback: if no flows identified, create a single flow from all knowledge
  if (flows.length === 0 && knowledge.length > 0) {
    flows.push({
      id: "flow_1",
      name: "General Business Logic",
      description: "General business logic extracted from uploaded documents",
      steps: [],
      knowledgeIds: knowledge.map(k => k.id),
      upstreamSystems: [],
      downstreamSystems: [],
      databases: [...new Set(knowledge.flatMap(k => k.relatedTables))],
      jobs: entities.filter(e => e.kind === "job").map(e => e.name),
      classes: entities.filter(e => e.kind === "class").map(e => e.name),
      services: entities.filter(e => e.kind === "service").map(e => e.name),
    });
  }

  return flows;
}

function clusterKnowledgeByEntities(
  knowledge: ExtractedKnowledge[],
  entityToKnowledge: Map<string, string[]>
): { knowledgeIds: string[]; dominantEntity: string }[] {
  const clusters: { knowledgeIds: string[]; dominantEntity: string }[] = [];
  const assigned = new Set<string>();

  // Sort entities by how many knowledge items they connect
  const sortedEntries = [...entityToKnowledge.entries()]
    .sort((a, b) => b[1].length - a[1].length);

  for (const [entityKey, kIds] of sortedEntries) {
    const unassigned = kIds.filter(id => !assigned.has(id));
    if (unassigned.length < 2) continue;

    clusters.push({
      knowledgeIds: unassigned,
      dominantEntity: entityKey,
    });

    for (const id of unassigned) assigned.add(id);
  }

  // Unassigned knowledge goes to a general cluster
  const unassignedKnowledge = knowledge.filter(k => !assigned.has(k.id));
  if (unassignedKnowledge.length > 0) {
    clusters.push({
      knowledgeIds: unassignedKnowledge.map(k => k.id),
      dominantEntity: "general",
    });
  }

  return clusters;
}

function deriveFlowName(clusterKnowledge: ExtractedKnowledge[], entities: TechnicalEntity[]): string {
  // Try to derive a meaningful name from the knowledge and entities
  const tables = [...new Set(clusterKnowledge.flatMap(k => k.relatedTables))];
  const jobs = entities.filter(e => e.kind === "job").map(e => e.name);
  const services = entities.filter(e => e.kind === "service").map(e => e.name);

  // Use job name if available
  if (jobs.length > 0) return jobs[0].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  // Use service name if available
  if (services.length > 0) return services[0].replace(/Service$/, "").replace(/_/g, " ");

  // Use primary table name
  if (tables.length > 0) return tables[0].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  // Fallback: use first meaningful heading/section
  const headings = clusterKnowledge
    .filter(k => k.sectionRef && k.sectionRef.length > 3)
    .map(k => k.sectionRef!);
  if (headings.length > 0) return headings[0];

  return "General Business Logic";
}

// ============================================================
// STAGE 11: MISSING INFORMATION ANALYSIS
// ============================================================

function analyzeMissingInformation(
  flows: BusinessFlow[],
  requirements: ExtractedRequirement[],
  entities: TechnicalEntity[],
  knownTables: Map<string, Set<string>>
): MissingInformation[] {
  const missing: MissingInformation[] = [];
  let missingId = 1;

  // Check each referenced table for schema availability
  const allReferencedTables = new Set<string>();
  for (const req of requirements) {
    for (const table of req.relatedTables) allReferencedTables.add(table);
  }
  for (const flow of flows) {
    for (const table of flow.databases) allReferencedTables.add(table);
  }

  for (const tableName of allReferencedTables) {
    if (!knownTables.has(tableName) || knownTables.get(tableName)!.size === 0) {
      // Table is referenced but schema is not available
      const referencedBy = requirements.filter(r => r.relatedTables.includes(tableName));
      const affectedFlows = flows.filter(f => f.databases.includes(tableName));

      missing.push({
        id: `mi_${missingId++}`,
        entityName: tableName,
        entityKind: "table",
        reason: `Table ${tableName} is referenced in source material but table schema/column information was not found in uploaded sources.`,
        sourceRef: referencedBy[0]?.sourceRef || affectedFlows[0]?.name || "Unknown",
        requiredFor: "Database validation queries and test data preparation",
        affectedFlows: affectedFlows.map(f => f.id),
        affectedRequirements: referencedBy.map(r => r.id),
      });
    }
  }

  // Check for referenced but undefined technical entities
  const confirmedEntities = new Set(entities.filter(e => e.confidence === "CONFIRMED").map(e => e.name.toUpperCase()));
  const referencedEntities = entities.filter(e => e.confidence === "REFERENCED");

  for (const ref of referencedEntities) {
    if (!confirmedEntities.has(ref.name.toUpperCase())) {
      // This entity is referenced but never defined
      missing.push({
        id: `mi_${missingId++}`,
        entityName: ref.name,
        entityKind: ref.kind,
        reason: `${ref.kind.charAt(0).toUpperCase() + ref.kind.slice(1)} "${ref.name}" is referenced in source material but detailed definition was not found.`,
        sourceRef: ref.sourceEvidence[0]?.sectionRef || "Unknown",
        requiredFor: getRequiredForReason(ref.kind),
        affectedFlows: [],
        affectedRequirements: [],
      });
    }
  }

  return missing;
}

function getRequiredForReason(kind: TechnicalEntityKind): string {
  switch (kind) {
    case "table": return "Database validation and test data preparation";
    case "class": return "Code-aware test step precision";
    case "dto": return "Request creation step precision";
    case "method": return "API/service call step precision";
    case "service": return "Service interaction validation";
    case "job": return "Batch job execution and verification";
    case "shell_command": return "Script execution step precision";
    case "stored_procedure": return "Database procedure call validation";
    case "queue": return "Queue/message validation";
    default: return "Technical step precision";
  }
}

// ============================================================
// STAGE 12: LINK REQUIREMENTS TO FLOWS
// ============================================================

function linkRequirementsToFlows(
  requirements: ExtractedRequirement[],
  flows: BusinessFlow[],
  knowledge: ExtractedKnowledge[]
): void {
  for (const req of requirements) {
    // Find the flow that contains this requirement's knowledge item
    const matchingFlow = flows.find(f => f.knowledgeIds.includes(req.sourceKnowledgeId));
    if (matchingFlow) {
      req.flowId = matchingFlow.id;
    }
  }
}
