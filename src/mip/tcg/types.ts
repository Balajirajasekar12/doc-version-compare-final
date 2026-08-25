// ============================================================
// Requirement → Test Case Generator — Types
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

// --- Test Case Generation ---
export type TestCaseGenType = "Functional" | "Regression" | "Negative" | "Positive";

export interface GeneratedTestCase {
  id: string;
  caseNumber: string;
  description: string;
  steps: string;
  precondition: string;
  query: string;
  expectedResults: string;
  types: TestCaseGenType[];
  sources: TestCaseSource[];
  status: "kept" | "ignored" | "edited";
  originalData: Omit<GeneratedTestCase, "status" | "originalData">;
  editedFields?: Partial<Pick<GeneratedTestCase, "description" | "steps" | "precondition" | "query" | "expectedResults" | "types">>;
}

export interface TestCaseSource {
  documentName: string;
  sectionRef: string;
  kind: "requirement" | "design" | "database" | "architecture" | "other";
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
  sourceTraceability: string;
}
