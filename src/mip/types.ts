// ============================================================
// MIP (Modernization Intelligence Platform) Core Types
// ============================================================

// --- Project ---
export type ProjectStatus = "active" | "frozen" | "archived";

export interface MipProject {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  legacyLabel: string;
  modernLabel: string;
  freezeHistory: FreezeRecord[];
  settings: ProjectSettings;
}

export interface ProjectSettings {
  legacyExtensions: string[];
  modernExtensions: string[];
  analysisDepth: "basic" | "detailed" | "comprehensive";
}

// --- Source Files ---
export type FileSide = "legacy" | "modern";
export type FileStatus = "uploaded" | "analyzing" | "analyzed" | "error";

export interface SourceFile {
  id: string;
  projectId: string;
  side: FileSide;
  name: string;
  path: string;
  size: number;
  type: string;
  language: string;
  content: string;
  status: FileStatus;
  uploadedAt: number;
  analyzedAt?: number;
  // Analysis metadata
  package?: string;
  className?: string;
  methodCount?: number;
  functionCount?: number;
  procedureCount?: number;
  sqlCount?: number;
  tableReferences?: string[];
  schedulerReferences?: string[];
  dependencies?: string[];
  conditionsDetected?: number;
  businessRulesDetected?: number;
  validationsDetected?: number;
  errorHandlingDetected?: number;
}

// --- Analysis Results ---
export interface AnalysisResult {
  id: string;
  projectId: string;
  fileId: string;
  side: FileSide;
  language: string;
  // Structural elements
  imports: string[];
  classes: ClassInfo[];
  methods: MethodInfo[];
  functions: FunctionInfo[];
  procedures: ProcedureInfo[];
  sqlStatements: SqlInfo[];
  conditions: ConditionInfo[];
  businessRules: DetectedBusinessRule[];
  validations: ValidationInfo[];
  errorHandlers: ErrorHandlerInfo[];
  schedulerTriggers: SchedulerInfo[];
  dependencies: DependencyInfo[];
  tableReferences: TableReference[];
  fieldMappings: FieldMapping[];
  transformations: TransformationInfo[];
}

export interface ClassInfo {
  name: string;
  extends?: string;
  implements?: string[];
  methods: string[];
  fields: string[];
  annotations?: string[];
  startLine?: number;
  endLine?: number;
}

export interface MethodInfo {
  name: string;
  className: string;
  returnType?: string;
  parameters: string[];
  annotations?: string[];
  sqlCalls: string[];
  conditions: string[];
  startLine?: number;
  endLine?: number;
}

export interface FunctionInfo {
  name: string;
  returnType?: string;
  parameters: string[];
  isStoredProcedure: boolean;
  sqlCalls: string[];
  conditions: string[];
  startLine?: number;
  endLine?: number;
}

export interface ProcedureInfo {
  name: string;
  parameters: string[];
  sqlCalls: string[];
  conditions: string[];
  cursorOperations?: string[];
  exceptionHandlers?: string[];
  startLine?: number;
  endLine?: number;
}

export interface SqlInfo {
  type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "MERGE" | "CREATE" | "ALTER" | "DROP" | "OTHER";
  raw: string;
  tables: string[];
  conditions: string[];
  columns?: string[];
  line?: number;
}

export interface ConditionInfo {
  type: "if" | "else" | "case" | "when" | "loop" | "exception" | "null_check" | "range_check" | "format_check" | "status_check" | "date_check" | "amount_check";
  expression: string;
  context: string;
  line?: number;
}

export interface DetectedBusinessRule {
  id: string;
  description: string;
  condition: string;
  context: string;
  sourceFile: string;
  line?: number;
  confidence: "confirmed" | "inferred" | "observed";
}

export interface ValidationInfo {
  type: string;
  expression: string;
  context: string;
  line?: number;
}

export interface ErrorHandlerInfo {
  type: string;
  handling: string;
  context: string;
  line?: number;
}

export interface SchedulerInfo {
  type: string;
  name: string;
  expression: string;
  fileReferences?: string[];
  line?: number;
}

export interface DependencyInfo {
  type: "import" | "include" | "require" | "call" | "extends" | "table" | "file" | "job";
  target: string;
  line?: number;
}

export interface TableReference {
  name: string;
  operation: "read" | "write" | "both" | "ddl";
  columns?: string[];
  line?: number;
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation?: string;
  line?: number;
}

export interface TransformationInfo {
  type: string;
  input: string;
  output: string;
  expression: string;
  line?: number;
}

// --- Findings ---
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "open" | "valid_issue" | "intentionally_missed" | "deferred" | "accepted" | "resolved" | "needs_investigation";
export type FindingCategory = "logic_missing" | "logic_changed" | "condition_removed" | "condition_added" | "db_operation_changed" | "table_mapping_changed" | "field_mapping_changed" | "validation_removed" | "validation_changed" | "error_handling_removed" | "error_handling_changed" | "scheduler_changed" | "io_changed" | "transformation_changed" | "dependency_changed" | "missing_functionality" | "changed_behavior" | "added_behavior" | "removed_behavior" | "missing_validation" | "missing_error_handling" | "missing_database_interaction" | "changed_status_code" | "missing_status_code" | "changed_data_mapping" | "missing_data_mapping" | "changed_job_flow" | "missing_job_step" | "changed_rule" | "missing_rule" | "external_rule" | "unknown";

export type DifferenceCategory =
  | "MISSING_FUNCTIONALITY" | "CHANGED_BEHAVIOR" | "ADDED_BEHAVIOR" | "REMOVED_BEHAVIOR"
  | "CHANGED_CONDITION" | "MISSING_VALIDATION" | "CHANGED_VALIDATION"
  | "MISSING_ERROR_HANDLING" | "CHANGED_ERROR_HANDLING"
  | "CHANGED_DATABASE_INTERACTION" | "MISSING_DATABASE_INTERACTION"
  | "CHANGED_STATUS_CODE" | "MISSING_STATUS_CODE"
  | "CHANGED_DATA_MAPPING" | "MISSING_DATA_MAPPING"
  | "CHANGED_JOB_FLOW" | "MISSING_JOB_STEP"
  | "CHANGED_RULE" | "MISSING_RULE" | "EXTERNAL_RULE" | "UNKNOWN";

export interface ExtractedBusinessRule {
  id: string;
  ruleNumber: string;
  title: string;
  description: string;
  condition: string;
  action: string;
  otherwise: string;
  sourceRef: string;
  confidence: "high" | "medium" | "low";
  statusInLegacy: "identified" | "confirmed";
  statusInMod: "not_found" | "found" | "confirmed" | "intentionally_removed" | "unknown";
}

export interface MissingInformation {
  type: "table_schema" | "sample_data" | "clob_content" | "configuration" | "java_class" | "sql_query" | "status_code_meaning" | "other";
  description: string;
  whyNeeded: string;
  suggestedQuery?: string;
}

export interface BusinessExplanation {
  plainEnglishSummary: string;
  whatLegacyDoes: string;
  whatModDoes: string;
  whatIsDifferent: string;
  whyItMatters: string;
  possibleImpact: string;
  simpleExample?: string;
  missingInformation: MissingInformation[];
  suggestedQuestionForDev: string;
  extractedRules: ExtractedBusinessRule[];
  functionality?: string;
  legacyFlow?: string;
  modFlow?: string;
  confidenceExplanation: string;
}

// --- Information Requests ---
export type InfoRequestStatus = "waiting_for_user" | "waiting_for_analysis" | "resolved" | "still_unclear";

export interface Finding {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: FindingCategory;
  severity: FindingSeverity;
  status: FindingStatus;
  legacySource?: LegacySourceRef;
  modernSource?: ModernSourceRef;
  legacyBehavior: string;
  modernBehavior: string;
  whatChanged: string;
  whatIsMissing: string;
  businessImpact: string;
  technicalImpact: string;
  affectedFile?: string;
  affectedPackage?: string;
  affectedTable?: string;
  affectedJob?: string;
  recommendation: string;
  userDecision?: string;
  comments?: string;
  createdAt: number;
  updatedAt: number;
  confidence: "confirmed" | "inferred" | "observed";
  linkedRuleId?: string;
  linkedScenarioId?: string;
  linkedTestCaseId?: string;
  // Business explanation layer
  businessExplanation?: BusinessExplanation;
  differenceCategory?: DifferenceCategory;
  functionality?: string;
}

export interface LegacySourceRef {
  fileId: string;
  fileName: string;
  line?: number;
  codeSnippet?: string;
}

export interface ModernSourceRef {
  fileId: string;
  fileName: string;
  line?: number;
  codeSnippet?: string;
}

// --- Business Rules ---
export type RuleStatus = "draft" | "approved" | "rejected" | "linked";

export interface BusinessRule {
  id: string;
  projectId: string;
  ruleNumber: string;
  title: string;
  description: string;
  condition: string;
  source: string;
  sourceFileId?: string;
  impact: string;
  status: RuleStatus;
  createdAt: number;
  updatedAt: number;
  linkedFindingIds: string[];
  linkedScenarioIds: string[];
  linkedTestCaseIds: string[];
}

// --- Knowledge Base ---
export interface KnowledgeEntry {
  id: string;
  projectId: string;
  category: "business_rule" | "legacy_behavior" | "database_observation" | "data_profile" | "scheduler_behavior" | "file_relationship" | "dependency" | "finding" | "accepted_difference" | "deferred_item";
  title: string;
  content: string;
  sourceFileIds: string[];
  tags: string[];
  createdAt: number;
}

// --- Evidence Requests ---
export type EvidenceRequestStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface EvidenceRequest {
  id: string;
  projectId: string;
  title: string;
  description: string;
  suggestedQuery?: string;
  status: EvidenceRequestStatus;
  findingId?: string;
  completedAt?: number;
  uploadedFileIds?: string[];
  createdAt: number;
}

// --- Test Scenarios ---
export interface TestScenario {
  id: string;
  projectId: string;
  scenarioNumber: string;
  title: string;
  description: string;
  objective: string;
  linkedRuleIds: string[];
  linkedFindingIds: string[];
  linkedSourceFileIds: string[];
  expectedOutcome: string;
  priority: "critical" | "high" | "medium" | "low";
  createdAt: number;
}

// --- Test Cases ---
export type TestCaseType = "manual" | "automation";
export type TestCasePriority = "critical" | "high" | "medium" | "low";

export interface TestCase {
  id: string;
  projectId: string;
  caseNumber: string;
  type: TestCaseType;
  title: string;
  objective: string;
  requirement: string;
  preconditions: string[];
  steps: TestCaseStep[];
  expectedResult: string;
  sqlValidation?: string;
  expectedDbResult?: string;
  jobScheduler?: string;
  expectedStatus?: string;
  evidenceRequired?: string;
  priority: TestCasePriority;
  risk?: string;
  sourceReference?: string;
  findingReference?: string;
  automationCandidate: boolean;
  status: "not_run" | "in_progress" | "pass" | "fail" | "blocked" | "deferred";
  linkedScenarioId?: string;
  linkedRuleIds: string[];
  createdAt: number;
  updatedAt: number;
  generatedAt?: number;
}

export interface TestCaseStep {
  stepNumber: number;
  action: string;
  expectedResult: string;
  sql?: string;
  expectedDbResult?: string;
}

// --- Automation Cases ---
export interface AutomationCase {
  id: string;
  projectId: string;
  automationId: string;
  manualTestCaseId?: string;
  scenario: string;
  preconditions: string[];
  inputData: string;
  jobTrigger?: string;
  expectedResult: string;
  databaseValidationSql?: string;
  assertions: string[];
  expectedStatus?: string;
  framework?: string;
  notes?: string;
  status: "not_run" | "pass" | "fail" | "error" | "skipped";
  createdAt: number;
}

// --- Automation Results ---
export interface AutomationResult {
  id: string;
  projectId: string;
  automationCaseId: string;
  source: "junit_xml" | "json" | "xml" | "text" | "manual";
  status: "passed" | "failed" | "skipped" | "error";
  duration?: number;
  failureMessage?: string;
  executedAt: number;
  importedAt: number;
}

// --- Test Data ---
export type TestDataCategory = "positive" | "negative" | "boundary" | "null" | "duplicate" | "historical" | "special_char" | "invalid_format";

export interface TestDataRecord {
  id: string;
  projectId: string;
  field: string;
  value: string;
  dataType: string;
  source: string;
  sourceFileId?: string;
  historicalObservation?: string;
  expectedFormat?: string;
  minLength?: number;
  maxLength?: number;
  validValues?: string[];
  invalidValues?: string[];
  boundaryValues?: string[];
  nullBehavior?: string;
  notes?: string;
  category: TestDataCategory;
  linkedTestCaseId?: string;
  createdAt: number;
}

// --- Data Profiling ---
export interface DataProfile {
  id: string;
  projectId: string;
  tableName: string;
  columnName: string;
  minLength?: number;
  maxLength?: number;
  commonLengths?: { length: number; count: number; percentage: number }[];
  distinctCount: number;
  nullCount: number;
  duplicateCount: number;
  minValue?: string;
  maxValue?: string;
  patternDistribution?: { pattern: string; count: number; percentage: number }[];
  possibleFormats?: string[];
  frequencyDistribution?: { value: string; count: number; percentage: number }[];
  outliers?: string[];
  observation: string;
  uploadedAt: number;
}

// --- Traceability ---
export interface TraceabilityLink {
  id: string;
  projectId: string;
  sourceFileId?: string;
  detectedLogicId?: string;
  ruleId?: string;
  findingId?: string;
  scenarioId?: string;
  testCaseId?: string;
  automationCaseId?: string;
  executionId?: string;
  evidenceId?: string;
}

// --- Test Execution ---
export type ExecutionStatus = "not_run" | "in_progress" | "pass" | "fail" | "blocked" | "deferred";

export interface TestCycle {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: number;
  status: "active" | "completed";
}

export interface TestExecution {
  id: string;
  projectId: string;
  cycleId: string;
  testCaseId: string;
  status: ExecutionStatus;
  executedAt?: number;
  executedBy?: string;
  notes?: string;
  evidenceIds: string[];
}

// --- Evidence ---
export interface Evidence {
  id: string;
  projectId: string;
  executionId?: string;
  testCaseId: string;
  stepNumber?: number;
  imageDataUrl?: string;
  description?: string;
  timestamp: number;
  source: "paste" | "upload" | "dragdrop" | "capture";
}

// --- Freeze ---
export interface FreezeRecord {
  version: string;
  date: number;
  reason: string;
  note: string;
  changeSummary?: string;
  findingStatuses?: Record<string, FindingStatus>;
  highRiskWarnings?: string[];
}

// --- Coverage ---
export interface CoverageMetrics {
  legacyLogicAnalyzed: number;
  legacyConditions: number;
  conditionsMapped: number;
  conditionsMissing: number;
  businessRulesIdentified: number;
  rulesWithScenarios: number;
  rulesWithManualTests: number;
  rulesWithAutomation: number;
  findingsResolved: number;
  findingsDeferred: number;
  findingsAccepted: number;
  totalFindings: number;
  executionCoverage: number;
  passRate: number;
  failureRate: number;
}

// --- Report Types ---
export type ReportType = "executive_summary" | "technical_analysis" | "business_rule" | "difference" | "risk" | "coverage" | "traceability" | "test_case" | "automation" | "test_execution" | "data_profiling";
