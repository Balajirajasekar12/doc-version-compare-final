/**
 * Client-Side Types for the Modernization Testing Platform
 * 
 * These types mirror the Convex schema types but are standalone.
 * No Convex, no server, no auth dependency.
 */

// ── Source Files ──────────────────────────────────────────────

export type SourceType = "LEGACY" | "MOD";
export type FileStatus = "UPLOADED" | "PARSING" | "PARSED" | "ANALYZED" | "ERROR" | "SUPERSEDED";
export type Language = "PLSQL" | "JAVA" | "SQL" | "SHELL" | "XML" | "UNKNOWN";

export interface SourceFile {
  id: string;
  projectId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  sourceType: SourceType;
  size: number;
  sha256: string;
  language: Language;
  content: string;
  lineCount: number;
  status: FileStatus;
  analysisResult?: string;
  uploadBatchId: string;
  version: number;
  previousVersionId?: string;
  superseded: boolean;
  uploadedAt: number;
}

export type UploadBatchStatus = "UPLOADING" | "EXTRACTING" | "PROCESSING" | "COMPLETED" | "ERROR";

export interface UploadBatch {
  id: string;
  projectId: string;
  sourceType: SourceType;
  batchNumber: number;
  originName: string;
  originType: "ZIP" | "FILES";
  fileCount: number;
  newFiles: number;
  duplicateSkipped: number;
  modifiedVersions: number;
  errors: number;
  status: UploadBatchStatus;
  createdAt: number;
  completedAt?: number;
}

export interface SourceSnapshot {
  id: string;
  projectId: string;
  snapshotNumber: number;
  legacyFileCount: number;
  modFileCount: number;
  legacyFileIds: string[];
  modFileIds: string[];
  label?: string;
  createdAt: number;
}

// ── Functionalities ───────────────────────────────────────────

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
  legacyComponentIds: string[];
  modComponentIds: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  clusteringReason: string;
  createdAt: number;
  updatedAt: number;
}

// ── Component Mappings ────────────────────────────────────────

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
  legacyComponentIds: string[];
  modComponentIds: string[];
  reason: string;
  evidence: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "AUTO" | "USER_CONFIRMED" | "USER_OVERRIDE";
  createdAt: number;
  updatedAt: number;
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

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type FindingStatus =
  | "OPEN"
  | "REVIEWED"
  | "ACCEPTED"
  | "INTENTIONAL"
  | "FALSE_POSITIVE"
  | "FIX_REQUIRED"
  | "NEEDS_INFO";

export type EvidenceLevel =
  | "PROVEN"
  | "STRONG_EVIDENCE"
  | "POSSIBLE"
  | "UNKNOWN"
  | "MISSING_INFORMATION";

export interface BusinessRule {
  id: string;
  ruleNumber: number;
  description: string;
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  condition?: string;
  positiveOutcome?: string;
  failureOutcome?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  legacyStatus: "IDENTIFIED" | "CONFIRMED" | "NOT_FOUND";
  modStatus: "NOT_FOUND" | "IMPLEMENTED" | "PARTIALLY_IMPLEMENTED" | "INTENTIONALLY_REMOVED" | "UNKNOWN";
}

export interface MissingInfoItem {
  id: string;
  whatIsNeeded: string;
  whyNeeded: string;
  suggestedAction: string;
  suggestedQuery?: string;
  category: "TABLE_SCHEMA" | "SAMPLE_DATA" | "STATUS_CODE_MEANING" | "CLOB_CONTENT" | "EXTERNAL_RULE" | "MOD_CLASS" | "MOD_VALIDATION" | "CLARIFICATION" | "HISTORY_DATA";
}

export interface ConfidenceExplanation {
  level: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  evidenceStrength: string;
}

export interface BusinessExplanation {
  legacyBehavior: string;
  modBehavior: string;
  difference: string;
  impact: string;
  possibleImpact: string;
  example?: string;
  summary: string;
  evidenceLevel: EvidenceLevel;
  confidenceExplanation: ConfidenceExplanation;
  businessRules: BusinessRule[];
  missingInformation: MissingInfoItem[];
}

export interface Finding {
  id: string;
  projectId: string;
  functionalityId: string;
  findingType: FindingType;
  severity: FindingSeverity;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  legacyEvidence: Array<{
    fileId: string;
    fileName: string;
    lineStart: number;
    lineEnd: number;
    snippet: string;
  }>;
  modEvidence: Array<{
    fileId: string;
    fileName: string;
    lineStart: number;
    lineEnd: number;
    snippet: string;
  }>;
  status: FindingStatus;
  developerComment?: string;
  informationNeeded?: string;
  businessExplanation?: BusinessExplanation;
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

export type InfoRequestStatus = "PENDING" | "PROVIDED" | "DISMISSED" | "GENERATED_QUERY";

export interface InformationRequest {
  id: string;
  projectId: string;
  functionalityId?: string;
  findingId?: string;
  type: InfoRequestType;
  title: string;
  description: string;
  whatIsNeeded: string;
  reason: string;
  suggestedQuery?: string;
  answer?: string;
  answerDetail?: string;
  status: InfoRequestStatus;
  createdAt: number;
  updatedAt: number;
}

// ── Knowledge ─────────────────────────────────────────────────

export type KnowledgeCategory =
  | "LIFECYCLE_CODE"
  | "STATUS_CODE"
  | "DATA_TYPE"
  | "TABLE_RELATIONSHIP"
  | "BUSINESS_RULE"
  | "FIELD_CONSTRAINT"
  | "ENUM_VALUE"
  | "OTHER";

export type KnowledgeProvenance = "FACT" | "OBSERVATION" | "DERIVED" | "USER_CONFIRMED" | "UNKNOWN";

export interface KnowledgeEntry {
  id: string;
  projectId: string;
  category: KnowledgeCategory;
  fieldName: string;
  value: string;
  description: string;
  provenance: KnowledgeProvenance;
  sourceDetail?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Business Rules ────────────────────────────────────────────

export interface BusinessRuleEntry {
  id: string;
  projectId: string;
  ruleId: string;
  description: string;
  source: string;
  condition?: string;
  positiveOutcome?: string;
  failureOutcome?: string;
  legacyReference?: string;
  modReference?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  status: "IDENTIFIED" | "CONFIRMED" | "IN_MOD" | "MISSING_IN_MOD" | "INTENTIONAL_CHANGE" | "UNKNOWN";
  createdAt: number;
  updatedAt: number;
}

// ── Test Cases ────────────────────────────────────────────────

export interface TestCase {
  id: string;
  projectId: string;
  testcaseId: string;
  scenarioId: string;
  requirement: string;
  precondition: string;
  description: string;
  testData: string;
  steps: string;
  expectedResult: string;
  actualResult?: string;
  status: "NOT_EXECUTED" | "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
  ruleIds: string[];
  findingIds: string[];
  createdAt: number;
}

export interface AutomationTestCase {
  id: string;
  projectId: string;
  testcaseId: string;
  className: string;
  methodName: string;
  javaCode: string;
  requirement: string;
  status: "GENERATED" | "REVIEWED" | "APPROVED" | "EXECUTED";
  createdAt: number;
}

// ── Test Execution ────────────────────────────────────────────

export type TestCycleStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED";

export interface TestCycle {
  id: string;
  projectId: string;
  name: string;
  release?: string;
  build?: string;
  environment?: string;
  tester: string;
  status: TestCycleStatus;
  notes?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TestExecution {
  id: string;
  projectId: string;
  testCycleId: string;
  testcaseId: string;
  executionType: "MANUAL" | "AUTOMATION";
  executedBy: string;
  executedAt: number;
  environment?: string;
  build?: string;
  overallStatus: "NOT_EXECUTED" | "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
  executionNumber: number;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  notes?: string;
  createdAt: number;
}

export interface StepExecution {
  id: string;
  projectId: string;
  executionId: string;
  testCycleId: string;
  testcaseId: string;
  stepNumber: number;
  description: string;
  expectedResult: string;
  actualResult?: string;
  status: "NOT_EXECUTED" | "PASS" | "FAIL" | "BLOCKED" | "NOT_APPLICABLE";
  executedBy?: string;
  executedAt?: number;
  comments?: string;
  suggestedResult?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Evidence ──────────────────────────────────────────────────

export type CaptureType = "SNAGIT" | "PLAYWRIGHT" | "UPLOAD" | "BROWSER_CAPTURE";

export interface TestEvidence {
  id: string;
  projectId: string;
  testCycleId: string;
  executionId: string;
  testcaseId: string;
  stepNumber: number;
  captureType: CaptureType;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  dataUrl?: string; // stored as data URL in browser memory
  application?: string;
  description?: string;
  isRedacted: boolean;
  capturedBy: string;
  capturedAt: number;
  createdAt: number;
}

// ── Defects ───────────────────────────────────────────────────

export interface Defect {
  id: string;
  projectId: string;
  defectId: string;
  testCycleId: string;
  executionId: string;
  testcaseId: string;
  stepNumber: number;
  title: string;
  description: string;
  expectedResult: string;
  actualResult: string;
  environment?: string;
  build?: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "REJECTED";
  assignedTo?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ── Project ───────────────────────────────────────────────────

export type ProjectStatus = "CREATED" | "UPLOADING" | "ANALYZING" | "EVIDENCE_REQUIRED" | "COMPARING" | "GAPS_FOUND" | "FROZEN";

export interface ModernizationProject {
  id: string;
  name: string;
  description: string;
  domain?: string;
  status: ProjectStatus;
  modFrozen: boolean;
  frozenVersion?: string;
  frozenReason?: string;
  frozenAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ── Freeze History ───────────────────────────────────────────

export interface FreezeHistoryEntry {
  id: string;
  projectId: string;
  version: string;
  reason: string;
  resolvedDiffs: number;
  totalDiffs: number;
  unresolvedCriticalDiffs: number;
  frozenBy: string;
  frozenAt: number;
}

// ── Test Data ────────────────────────────────────────────────

export type TestDataSource = "HISTORICAL" | "SCHEMA" | "CODE" | "USER_CONFIRMED" | "GENERATED";

export interface TestDataEntry {
  id: string;
  projectId: string;
  testcaseId?: string;
  fieldName: string;
  value: string;
  source: TestDataSource;
  sourceDetail?: string;
  createdAt: number;
}

// ── Automation Results ────────────────────────────────────────

export type AutomationResultStatus = "PASSED" | "FAILED" | "SKIPPED" | "ERROR";

export interface AutomationResult {
  id: string;
  projectId: string;
  testCycleId: string;
  testcaseId: string;
  className: string;
  methodName?: string;
  result: AutomationResultStatus;
  duration?: number;
  errorMessage?: string;
  importedAt: number;
}

// ── Application State ─────────────────────────────────────────

export interface ModernizationState {
  projects: ModernizationProject[];
  currentProjectId: string | null;
  
  // Source files (indexed by id)
  sourceFiles: Record<string, SourceFile>;
  uploadBatches: Record<string, UploadBatch>;
  sourceSnapshots: Record<string, SourceSnapshot>;
  
  // Analysis
  functionalities: Record<string, Functionality>;
  componentMappings: Record<string, ComponentMapping>;
  findings: Record<string, Finding>;
  informationRequests: Record<string, InformationRequest>;
  
  // Knowledge
  knowledgeEntries: Record<string, KnowledgeEntry>;
  businessRuleEntries: Record<string, BusinessRuleEntry>;
  
  // Test Cases
  testCases: Record<string, TestCase>;
  automationTestCases: Record<string, AutomationTestCase>;
  
  // Test Execution
  testCycles: Record<string, TestCycle>;
  testExecutions: Record<string, TestExecution>;
  stepExecutions: Record<string, StepExecution>;
  testEvidence: Record<string, TestEvidence>;
  defects: Record<string, Defect>;
  
  // Freeze History
  freezeHistory: Record<string, FreezeHistoryEntry>;
  
  // Test Data
  testDataEntries: Record<string, TestDataEntry>;
  
  // Automation Results
  automationResults: Record<string, AutomationResult>;
}

// ── Action Types ──────────────────────────────────────────────

export type ModernizationAction =
  // Projects
  | { type: "CREATE_PROJECT"; project: ModernizationProject }
  | { type: "UPDATE_PROJECT"; projectId: string; updates: Partial<ModernizationProject> }
  | { type: "DELETE_PROJECT"; projectId: string }
  | { type: "SET_CURRENT_PROJECT"; projectId: string | null }
  
  // Source Files
  | { type: "ADD_SOURCE_FILES"; files: SourceFile[] }
  | { type: "UPDATE_SOURCE_FILE"; fileId: string; updates: Partial<SourceFile> }
  | { type: "REMOVE_SOURCE_FILE"; fileId: string }
  
  // Upload Batches
  | { type: "ADD_UPLOAD_BATCH"; batch: UploadBatch }
  | { type: "UPDATE_UPLOAD_BATCH"; batchId: string; updates: Partial<UploadBatch> }
  
  // Snapshots
  | { type: "ADD_SNAPSHOT"; snapshot: SourceSnapshot }
  
  // Functionalities
  | { type: "SET_FUNCTIONALITIES"; functionalities: Functionality[] }
  | { type: "UPDATE_FUNCTIONALITY"; id: string; updates: Partial<Functionality> }
  
  // Mappings
  | { type: "SET_COMPONENT_MAPPINGS"; mappings: ComponentMapping[] }
  
  // Findings
  | { type: "SET_FINDINGS"; findings: Finding[] }
  | { type: "UPDATE_FINDING"; id: string; updates: Partial<Finding> }
  
  // Information Requests
  | { type: "SET_INFORMATION_REQUESTS"; requests: InformationRequest[] }
  | { type: "UPDATE_INFORMATION_REQUEST"; id: string; updates: Partial<InformationRequest> }
  
  // Knowledge
  | { type: "ADD_KNOWLEDGE"; entry: KnowledgeEntry }
  | { type: "UPDATE_KNOWLEDGE"; id: string; updates: Partial<KnowledgeEntry> }
  | { type: "REMOVE_KNOWLEDGE"; id: string }
  
  // Business Rules
  | { type: "ADD_BUSINESS_RULE"; entry: BusinessRuleEntry }
  | { type: "UPDATE_BUSINESS_RULE"; id: string; updates: Partial<BusinessRuleEntry> }
  | { type: "REMOVE_BUSINESS_RULE"; id: string }
  
  // Test Cases
  | { type: "SET_TEST_CASES"; testCases: TestCase[] }
  | { type: "UPDATE_TEST_CASE"; id: string; updates: Partial<TestCase> }
  | { type: "SET_AUTOMATION_TEST_CASES"; cases: AutomationTestCase[] }
  
  // Test Cycles
  | { type: "ADD_TEST_CYCLE"; cycle: TestCycle }
  | { type: "UPDATE_TEST_CYCLE"; id: string; updates: Partial<TestCycle> }
  | { type: "DELETE_TEST_CYCLE"; id: string }
  
  // Test Executions
  | { type: "ADD_TEST_EXECUTION"; execution: TestExecution }
  | { type: "UPDATE_TEST_EXECUTION"; id: string; updates: Partial<TestExecution> }
  
  // Step Executions
  | { type: "UPSERT_STEP_EXECUTION"; step: StepExecution }
  
  // Evidence
  | { type: "ADD_TEST_EVIDENCE"; evidence: TestEvidence }
  | { type: "REMOVE_TEST_EVIDENCE"; id: string }
  
  // Defects
  | { type: "ADD_DEFECT"; defect: Defect }
  | { type: "UPDATE_DEFECT"; id: string; updates: Partial<Defect> }
  
  // Freeze History
  | { type: "ADD_FREEZE_ENTRY"; entry: FreezeHistoryEntry }
  | { type: "FREEZE_PROJECT"; projectId: string; version: string; reason: string; resolvedDiffs: number; totalDiffs: number; unresolvedCriticalDiffs: number; frozenBy: string }
  
  // Test Data
  | { type: "ADD_TEST_DATA_ENTRY"; entry: TestDataEntry }
  | { type: "REMOVE_TEST_DATA_ENTRY"; id: string }
  
  // Automation Results
  | { type: "ADD_AUTOMATION_RESULTS"; results: AutomationResult[] }
  
  // Bulk import (for project import)
  | { type: "IMPORT_PROJECT_DATA"; data: Partial<ModernizationState> }
  
  // Reset
  | { type: "RESET_PROJECT"; projectId: string };
