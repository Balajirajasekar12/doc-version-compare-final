/**
 * System-Level Analysis Types
 *
 * These types represent the data model for the entire
 * legacy → MOD behavior comparison engine.
 */

// ── Component Extraction ──────────────────────────────────────

export type ComponentType =
  | "PACKAGE"
  | "PROCEDURE"
  | "FUNCTION"
  | "TRIGGER"
  | "CLASS"
  | "INTERFACE"
  | "ENUM"
  | "METHOD"
  | "TABLE"
  | "VIEW"
  | "SEQUENCE"
  | "INDEX"
  | "JOB"
  | "STEP"
  | "READER"
  | "PROCESSOR"
  | "WRITER"
  | "SHELL_FUNCTION"
  | "SHELL_SCRIPT"
  | "SQL_QUERY"
  | "BEAN"
  | "SERVICE"
  | "REPOSITORY"
  | "CONTROLLER"
  | "BATCH_CONFIG"
  | "UNKNOWN";

export interface ExtractedComponent {
  id: string;
  fileId: string;
  fileName: string;
  sourceType: "LEGACY" | "MOD";
  componentType: ComponentType;
  name: string;
  qualifiedName: string;
  lineStart: number;
  lineEnd: number;
  /** Tables/views referenced by this component */
  tableRefs: string[];
  /** Other components called/invoked by this component */
  callRefs: string[];
  /** SQL conditions, WHERE clauses, IF conditions */
  conditions: string[];
  /** Status codes, lifecycle codes, error codes */
  statusCodes: string[];
  /** External dependencies (CLOB, config tables, etc.) */
  externalDeps: string[];
  /** Input parameters / data inputs */
  inputs: string[];
  /** Output tables / data outputs */
  outputs: string[];
  /** Annotations (Spring, etc.) */
  annotations: string[];
  /** Import/dependency list */
  imports: string[];
  /** Raw extracted SQL snippets */
  sqlSnippets: string[];
  /** CLOB or rule-table references */
  ruleRefs: string[];
  /** Shell-specific: embedded SQL, Java invocations */
  embeddedRefs: string[];
  /** XML-specific: namespace declarations, property values */
  xmlRefs: string[];
  /** Confidence that this extraction is correct */
  extractionConfidence: "HIGH" | "MEDIUM" | "LOW";
}

// ── Dependency Graph ──────────────────────────────────────────

export type EdgeType =
  | "CALLS"
  | "READS"
  | "WRITES"
  | "VALIDATES"
  | "FILTERS"
  | "TRANSFORMS"
  | "TRIGGERS"
  | "DEPENDS_ON"
  | "INVOKES";

export interface DependencyEdge {
  sourceId: string;
  targetId: string;
  edgeType: EdgeType;
  evidence: string;
}

// ── Functionality Clustering ──────────────────────────────────

export type FunctionalityStatus =
  | "DISCOVERED"
  | "MAPPED"
  | "PARTIALLY_MAPPED"
  | "UNMAPPED_LEGACY"
  | "UNMAPPED_MOD"
  | "CONFIRMED"
  | "NEEDS_EVIDENCE";

export interface Functionality {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: FunctionalityStatus;
  /** Legacy component IDs in this cluster */
  legacyComponentIds: string[];
  /** MOD component IDs in this cluster */
  modComponentIds: string[];
  /** Cluster confidence */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  clusteringReason: string;
  createdAt: number;
  updatedAt: number;
}

// ── Component Mapping ─────────────────────────────────────────

export type MappingType =
  | "ONE_TO_ONE"
  | "ONE_TO_MANY"
  | "MANY_TO_ONE"
  | "MANY_TO_MANY"
  | "ARCHITECTURAL_CHANGE"
  | "SPLIT"
  | "MERGED"
  | "RENAMED"
  | "REFACTORED"
  | "REPLACED"
  | "UNMAPPED";

export interface ComponentMapping {
  id: string;
  projectId: string;
  functionalityId: string;
  mappingType: MappingType;
  /** Legacy component IDs involved */
  legacyComponentIds: string[];
  /** MOD component IDs involved */
  modComponentIds: string[];
  /** Semantic reason for this mapping */
  reason: string;
  /** Evidence for the mapping */
  evidence: string[];
  /** Confidence in this mapping */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** User-confirmed or auto-inferred */
  source: "AUTO" | "USER_CONFIRMED" | "USER_OVERRIDE";
  createdAt: number;
  updatedAt: number;
}

// ── Behavior Graph ────────────────────────────────────────────

export type BehaviorNodeType =
  | "INPUT"
  | "VALIDATION"
  | "BUSINESS_RULE"
  | "DRIVER_SELECTION"
  | "CONDITION"
  | "ERROR_HANDLING"
  | "STATUS_CHANGE"
  | "OUTPUT"
  | "DATABASE_EFFECT"
  | "EXTERNAL_CALL";

export interface BehaviorNode {
  id: string;
  side: "LEGACY" | "MOD";
  type: BehaviorNodeType;
  label: string;
  detail: string;
  /** Evidence: file + line numbers */
  evidence: Array<{ fileId: string; fileName: string; lineStart: number; lineEnd: number }>;
  /** Associated component IDs */
  componentIds: string[];
}

export interface BehaviorEdge {
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
}

export interface BehaviorGraph {
  side: "LEGACY" | "MOD";
  nodes: BehaviorNode[];
  edges: BehaviorEdge[];
}

// ── Findings ──────────────────────────────────────────────────

export type FindingType =
  | "MISSING_FUNCTIONALITY"
  | "CHANGED_FUNCTIONALITY"
  | "CHANGED_RULE"
  | "CHANGED_CONDITION"
  | "CHANGED_STATUS_CODE"
  | "CHANGED_ERROR_HANDLING"
  | "CHANGED_DATA_MAPPING"
  | "MISSING_TABLE_MAPPING"
  | "MISSING_COLUMN_MAPPING"
  | "MISSING_EXTERNAL_RULE"
  | "MISSING_VALIDATION"
  | "MULTIPLE_CLAIM_REGRESSION"
  | "DRIVER_SELECTION_DIFFERENCE"
  | "INTENTIONAL_ARCHITECTURAL_CHANGE"
  | "UNKNOWN_REQUIRES_USER_INPUT"
  | "MISSING_SCHEMA"
  | "MISSING_HISTORY_DATA";

export type FindingSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFO";

export type FindingStatus =
  | "OPEN"
  | "REVIEWED"
  | "ACCEPTED"
  | "INTENTIONAL"
  | "FALSE_POSITIVE"
  | "FIX_REQUIRED"
  | "NEEDS_INFO";

export interface Finding {
  id: string;
  projectId: string;
  functionalityId: string;
  findingType: FindingType;
  severity: FindingSeverity;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  /** Legacy evidence with file/line references */
  legacyEvidence: Array<{
    fileId: string;
    fileName: string;
    lineStart: number;
    lineEnd: number;
    snippet: string;
  }>;
  /** MOD evidence with file/line references */
  modEvidence: Array<{
    fileId: string;
    fileName: string;
    lineStart: number;
    lineEnd: number;
    snippet: string;
  }>;
  status: FindingStatus;
  developerComment?: string;
  /** If this finding is an info request */
  informationNeeded?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Information Requests ──────────────────────────────────────

export type InfoRequestType =
  | "MISSING_SCHEMA"
  | "MISSING_HISTORY_DATA"
  | "MISSING_EXTERNAL_RULE"
  | "MISSING_TABLE_DEFINITION"
  | "MISSING_VIEW_DEFINITION"
  | "MISSING_CLOB_DATA"
  | "MISSING_STATUS_CODES"
  | "MISSING_TABLE_MAPPING"
  | "CLARIFICATION_NEEDED";

export type InfoRequestStatus =
  | "PENDING"
  | "PROVIDED"
  | "DISMISSED"
  | "GENERATED_QUERY";

export interface InformationRequest {
  id: string;
  projectId: string;
  functionalityId?: string;
  findingId?: string;
  type: InfoRequestType;
  title: string;
  description: string;
  /** What specific information is needed */
  whatIsNeeded: string;
  /** Why it is needed */
  reason: string;
  /** SQL query to help user generate the data */
  suggestedQuery?: string;
  /** User-provided answer */
  answer?: string;
  answerDetail?: string;
  status: InfoRequestStatus;
  createdAt: number;
  updatedAt: number;
}

// ── Analysis Pipeline ─────────────────────────────────────────

export type PipelineStep =
  | "FILE_DISCOVERY"
  | "COMPONENT_EXTRACTION"
  | "DEPENDENCY_BUILDING"
  | "FUNCTIONALITY_CLUSTERING"
  | "SEMANTIC_MAPPING"
  | "BEHAVIOR_GRAPH"
  | "BEHAVIOR_COMPARISON"
  | "FINDING_GENERATION"
  | "INFORMATION_REQUESTS"
  | "COMPLETED";

export interface AnalysisProgress {
  currentStep: PipelineStep;
  stepsCompleted: PipelineStep[];
  totalFiles: number;
  processedFiles: number;
  totalFunctionalities: number;
  processedFunctionalities: number;
}

// ── Analysis Result (aggregated for storage) ──────────────────

export interface SystemAnalysisResult {
  components: ExtractedComponent[];
  legacyEdges: DependencyEdge[];
  modEdges: DependencyEdge[];
  functionalities: Functionality[];
  mappings: ComponentMapping[];
  legacyBehavior: BehaviorGraph;
  modBehavior: BehaviorGraph;
  findings: Finding[];
  informationRequests: InformationRequest[];
  progress: AnalysisProgress;
}
