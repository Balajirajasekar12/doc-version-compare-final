// ============================================================
// Requirement → Test Case Generator — Types (v3)
// Source-truth-based, completeness-aware, E2E manual test design.
// ============================================================

// --- Input Document Categories ---
export type DocumentCategory =
  | "requirement"
  | "design"
  | "database"
  | "architecture_image"
  | "source_code"
  | "other";

// --- Supported file types ---
export type SupportedExtension =
  | ".docx" | ".pdf" | ".md" | ".txt"
  | ".sql" | ".jpg" | ".jpeg" | ".png"
  | ".java" | ".xml" | ".sh" | ".json" | ".yaml" | ".yml" | ".plsql";

// --- Uploaded Document ---
export interface TcgDocument {
  id: string;
  name: string;
  size: number;
  extension: string;
  category: DocumentCategory;
  rawFile: File;
  parsedContent: ParsedContent | null;
  parseError?: string;
  status: "pending" | "parsing" | "parsed" | "error";
}

// --- Parsed Content (union of all parser outputs) ---
export type ParsedContent =
  | TextParsedContent
  | SqlParsedContent
  | ImageParsedContent;

export interface TextParsedContent {
  kind: "text";
  fullText: string;
  headings: string[];
  paragraphs: string[];
  tables: ExtractedTable[];
  lists: string[];
  sectionHeaders: string[];
}

export interface SqlParsedContent {
  kind: "sql";
  fullText: string;
  tables: SqlTableDef[];
  statements: SqlStatement[];
  constraints: SqlConstraint[];
}

export interface ImageParsedContent {
  kind: "image";
  dataUrl: string;
  width: number;
  height: number;
  description: string;
}

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
}

// --- SQL Analysis ---
export interface SqlTableDef {
  name: string;
  columns: SqlColumnDef[];
  constraints: string[];
}

export interface SqlColumnDef {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: string;
}

export interface SqlStatement {
  type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE" | "ALTER" | "MERGE" | "OTHER";
  raw: string;
  tables: string[];
  columns: string[];
  conditions: string[];
  line?: number;
}

export interface SqlConstraint {
  type: string;
  table: string;
  columns: string[];
  definition: string;
}

// ============================================================
// SOURCE EVIDENCE & CONFIDENCE
// ============================================================

export type SourceConfidence =
  | "CONFIRMED"   // Explicitly found in source
  | "REFERENCED"  // Mentioned but not fully defined
  | "MISSING"     // Required but unavailable
  | "CONFLICT";   // Different sources disagree

export interface SourceEvidence {
  documentId: string;
  documentName: string;
  sectionRef: string;
  kind: "requirement" | "design" | "database" | "architecture" | "source_code" | "other";
  excerpt?: string;  // Exact text from source
  lineRef?: string;  // e.g., "BillingService.java:348"
}

// ============================================================
// TECHNICAL ENTITY EXTRACTION
// ============================================================

export type TechnicalEntityKind =
  | "table"
  | "column"
  | "class"
  | "dto"
  | "method"
  | "service"
  | "api"
  | "enum"
  | "exception"
  | "error_code"
  | "stored_procedure"
  | "function"
  | "trigger"
  | "job"
  | "shell_command"
  | "queue"
  | "configuration"
  | "field"
  | "constraint";

export interface TechnicalEntity {
  id: string;
  name: string;
  kind: TechnicalEntityKind;
  sourceEvidence: SourceEvidence[];
  confidence: SourceConfidence;
  details?: string;  // e.g., column definition, method signature
  referencedBy?: string[];  // IDs of other entities that reference this one
}

// ============================================================
// EXTRACTED KNOWLEDGE (enhanced with source traceability)
// ============================================================

export interface ExtractedKnowledge {
  id: string;
  documentId: string;
  sourceRef: string;
  sourceEvidence: SourceEvidence[];
  kind:
    | "requirement_statement"
    | "business_rule"
    | "validation_rule"
    | "flow_step"
    | "input_output"
    | "error_handling"
    | "database_interaction"
    | "system_interaction"
    | "constraint"
    | "schema_info"
    | "architecture_flow"
    | "field_definition"
    | "status_behavior"
    | "boundary_condition"
    | "code_logic"
    | "job_definition"
    | "api_definition";
  text: string;
  confidence: SourceConfidence;
  relatedTables: string[];
  relatedFields: string[];
  relatedEntities: string[];  // IDs of TechnicalEntity items
  sectionRef?: string;
}

// ============================================================
// BUSINESS FLOW
// ============================================================

export interface BusinessFlow {
  id: string;
  name: string;
  description: string;
  steps: string[];
  knowledgeIds: string[];
  upstreamSystems: string[];
  downstreamSystems: string[];
  databases: string[];
  jobs: string[];
  classes: string[];
  services: string[];
}

// ============================================================
// REQUIREMENT
// ============================================================

export interface ExtractedRequirement {
  id: string;
  text: string;
  flowId: string | null;
  sourceRef: string;
  sourceEvidence: SourceEvidence[];
  kind: "functional" | "validation" | "business_rule" | "boundary" | "error_handling" | "database" | "integration" | "ui";
  sourceKnowledgeId: string;
  relatedTables: string[];
  relatedFields: string[];
  relatedEntities: string[];
  coverageStatus: "COVERED" | "PARTIALLY_COVERED" | "NOT_COVERED";
}

// ============================================================
// MISSING INFORMATION
// ============================================================

export interface MissingInformation {
  id: string;
  entityName: string;
  entityKind: TechnicalEntityKind;
  reason: string;       // Why it's needed
  sourceRef: string;    // Where it was referenced
  requiredFor: string;  // e.g., "DB validation step", "Request creation"
  affectedFlows: string[];
  affectedRequirements: string[];
}

// ============================================================
// SOURCE CONFLICT
// ============================================================

export interface SourceConflict {
  id: string;
  entityName: string;
  sources: SourceEvidence[];
  conflictingValues: string[];
  description: string;
}

// ============================================================
// TEST CASE TYPES
// ============================================================

export type TestCaseGenType = "Functional" | "Regression" | "Negative" | "Positive";
export type TestPriority = "P0" | "P1" | "P2" | "P3";
export type TestCaseStatus = "COMPLETE" | "INCOMPLETE" | "IGNORED";

// ============================================================
// GENERATED TEST CASE (redesigned with completeness)
// ============================================================

export interface GeneratedTestCase {
  id: string;
  caseNumber: string;
  description: string;
  steps: string;
  precondition: string;
  query: string;
  queryStatus: "COMPLETE" | "INCOMPLETE" | "NOT_REQUIRED";
  queryIncompleteReason?: string;
  expectedResults: string;
  types: TestCaseGenType[];
  priority: TestPriority;
  businessFlow: string;
  requirementIds: string[];
  sources: TestCaseSource[];
  riskRationale: string;
  status: "kept" | "ignored" | "edited";
  completeness: TestCaseStatus;
  incompleteReasons: string[];  // List of what's missing
  missingEntities: string[];    // Technical entities that couldn't be resolved
  originalData: Omit<GeneratedTestCase, "status" | "originalData">;
  editedFields?: Partial<Pick<GeneratedTestCase,
    "description" | "steps" | "precondition" | "query" | "expectedResults" | "types" | "priority" | "businessFlow"
  >>;
}

export interface TestCaseSource {
  documentId: string;
  documentName: string;
  sectionRef: string;
  kind: "requirement" | "design" | "database" | "architecture" | "source_code" | "other";
  excerpt?: string;
}

// ============================================================
// GENERATION SUMMARY (enhanced)
// ============================================================

export interface TcgGenerationSummary {
  businessFlows: number;
  requirementsAnalyzed: number;
  candidateScenarios: number;
  duplicatesRemoved: number;
  optimizedScenarios: number;
  finalTestCases: number;
  completeTestCases: number;
  incompleteTestCases: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  requirementCoverage: number;
  totalRequirements: number;
  coveredRequirements: number;
  partiallyCoveredRequirements: number;
  uncoveredRequirements: string[];
  uncoveredRequirementDetails: { id: string; text: string; reason: string }[];
  dbValidationCases: number;
  dbValidationIncomplete: number;
  e2eFlows: number;
  flowNames: string[];
  missingInformation: MissingInformation[];
  sourceConflicts: SourceConflict[];
  technicalEntitiesFound: number;
  technicalEntitiesReferenced: number;
  technicalEntitiesMissing: number;
}

// ============================================================
// GENERATION PROGRESS
// ============================================================

export type TcgPhase =
  | "upload"
  | "parsing"
  | "analyzing"
  | "generating"
  | "review"
  | "finalized";

export interface TcgProgress {
  phase: TcgPhase;
  currentStep: string;
  progress: number;
  totalFiles: number;
  processedFiles: number;
}

// ============================================================
// GENAI PROVIDER
// ============================================================

export interface GenAIProvider {
  name: string;
  isAvailable(): boolean;
  generateTestCases(knowledge: ExtractedKnowledge[]): Promise<Partial<GeneratedTestCase>[]>;
}

// ============================================================
// EXPORT TYPES
// ============================================================

export interface TcgExportRow {
  testCaseId: string;
  description: string;
  steps: string;
  precondition: string;
  query: string;
  expectedResults: string;
  testCaseType: string;
  priority: string;
  businessFlow: string;
  requirementTraceability: string;
  sourceTraceability: string;
  riskRationale: string;
  status: string;
  incompleteReasons: string;
}
