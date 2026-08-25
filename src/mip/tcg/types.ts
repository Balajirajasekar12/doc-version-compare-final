// ============================================================
// Requirement → Test Case Generator — Types (Redesigned)
// Business-flow-first, risk-based, E2E test design engine.
// ============================================================

// --- Input Document Categories ---
export type DocumentCategory =
  | "requirement"
  | "design"
  | "database"
  | "architecture_image"
  | "other";

// --- Supported file types ---
export type SupportedExtension =
  | ".docx" | ".pdf" | ".md" | ".txt"
  | ".sql" | ".jpg" | ".jpeg" | ".png";

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

// --- Extracted Knowledge (normalized from all documents) ---
export interface ExtractedKnowledge {
  id: string;
  documentId: string;
  sourceRef: string;
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
    | "boundary_condition";
  text: string;
  confidence: "high" | "medium" | "low";
  relatedTables: string[];
  relatedFields: string[];
  sectionRef?: string;
}

// --- Business Flow (NEW) ---
export interface BusinessFlow {
  id: string;
  name: string;
  description: string;
  steps: string[];
  knowledgeIds: string[]; // knowledge items belonging to this flow
  upstreamSystems: string[];
  downstreamSystems: string[];
  databases: string[];
  jobs: string[];
}

// --- Requirement (NEW) ---
export interface ExtractedRequirement {
  id: string;
  text: string;
  flowId: string | null;
  sourceRef: string;
  kind: "functional" | "validation" | "business_rule" | "boundary" | "error_handling" | "database" | "integration" | "ui";
  sourceKnowledgeId: string; // explicit link to the originating knowledge item
  relatedTables: string[];   // carried from knowledge for flow grouping
  relatedFields: string[];   // carried from knowledge for flow grouping
}

// --- Test Case Generation ---
export type TestCaseGenType = "Functional" | "Regression" | "Negative" | "Positive";
export type TestPriority = "P0" | "P1" | "P2" | "P3";

// --- Generated TestCase (redesigned) ---
export interface GeneratedTestCase {
  id: string;
  caseNumber: string;
  description: string;
  steps: string;
  precondition: string;
  query: string;
  expectedResults: string;
  types: TestCaseGenType[];
  priority: TestPriority;
  businessFlow: string;
  requirementIds: string[];
  sources: TestCaseSource[];
  riskRationale: string;
  status: "kept" | "ignored" | "edited";
  originalData: Omit<GeneratedTestCase, "status" | "originalData">;
  editedFields?: Partial<Pick<GeneratedTestCase,
    "description" | "steps" | "precondition" | "query" | "expectedResults" | "types" | "priority" | "businessFlow"
  >>;
}

export interface TestCaseSource {
  documentId: string;
  documentName: string;
  sectionRef: string;
  kind: "requirement" | "design" | "database" | "architecture" | "other";
}

// --- Generation Summary (NEW) ---
export interface TcgGenerationSummary {
  businessFlows: number;
  requirementsAnalyzed: number;
  candidateScenarios: number;
  duplicatesRemoved: number;
  optimizedScenarios: number;
  finalTestCases: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  requirementCoverage: number; // percentage
  totalRequirements: number;
  coveredRequirements: number;
  uncoveredRequirements: string[];
  dbValidationCases: number;
  e2eFlows: number;
  flowNames: string[];
}

// --- Generation Progress ---
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
  progress: number; // 0-100
  totalFiles: number;
  processedFiles: number;
}

// --- GenAI Provider Interface ---
export interface GenAIProvider {
  name: string;
  isAvailable(): boolean;
  generateTestCases(knowledge: ExtractedKnowledge[]): Promise<Partial<GeneratedTestCase>[]>;
}

// --- Export Types ---
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
}
