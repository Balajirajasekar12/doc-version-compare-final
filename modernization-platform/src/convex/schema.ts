import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    ...authTables,

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    projects: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      domain: v.optional(v.string()),
      owner: v.optional(v.string()),
      environmentNotes: v.optional(v.string()),
      status: v.union(
        v.literal("CREATED"),
        v.literal("UPLOADING"),
        v.literal("ANALYZING"),
        v.literal("EVIDENCE_REQUIRED"),
        v.literal("COMPARING"),
        v.literal("GAPS_FOUND"),
        v.literal("FROZEN"),
      ),
      createdBy: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_createdBy", ["createdBy"])
      .index("by_status", ["status"]),

    functionalAreas: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      description: v.optional(v.string()),
      jobName: v.optional(v.string()),
      jobCommand: v.optional(v.string()),
      businessIdentifier: v.optional(v.string()),
      status: v.union(
        v.literal("NOT_STARTED"),
        v.literal("ANALYZING"),
        v.literal("WAITING_FOR_EVIDENCE"),
        v.literal("GAPS_FOUND"),
        v.literal("READY_TO_COMPARE"),
        v.literal("COMPARED"),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"]),

    sourceFiles: defineTable({
      projectId: v.id("projects"),
      functionalAreaId: v.optional(v.id("functionalAreas")),
      fileName: v.string(),
      filePath: v.string(),
      fileType: v.string(),
      sourceType: v.union(v.literal("LEGACY"), v.literal("MOD")),
      size: v.number(),
      sha256: v.string(),
      language: v.optional(v.string()),
      content: v.string(),
      lineCount: v.number(),
      status: v.union(
        v.literal("UPLOADED"),
        v.literal("ANALYZING"),
        v.literal("ANALYZED"),
        v.literal("ERROR"),
      ),
      analysisResult: v.optional(v.string()),
      uploadedAt: v.number(),
      uploadBatchId: v.optional(v.id("uploadBatches")),
      version: v.number(),
      previousVersionId: v.optional(v.id("sourceFiles")),
      superseded: v.boolean(),
    }).index("by_projectId", ["projectId"])
      .index("by_functionalAreaId", ["functionalAreaId"])
      .index("by_sha256", ["sha256"])
      .index("by_sourceType", ["sourceType"])
      .index("by_projectId_sourceType", ["projectId", "sourceType"])
      .index("by_uploadBatchId", ["uploadBatchId"]),

    uploadBatches: defineTable({
      projectId: v.id("projects"),
      sourceType: v.union(v.literal("LEGACY"), v.literal("MOD")),
      batchNumber: v.number(),
      originName: v.string(),
      originType: v.union(v.literal("ZIP"), v.literal("FILES")),
      fileCount: v.number(),
      newFiles: v.number(),
      duplicateSkipped: v.number(),
      modifiedVersions: v.number(),
      errors: v.number(),
      status: v.union(
        v.literal("UPLOADING"),
        v.literal("EXTRACTING"),
        v.literal("PROCESSING"),
        v.literal("COMPLETED"),
        v.literal("ERROR"),
      ),
      uploadedBy: v.string(),
      createdAt: v.number(),
      completedAt: v.optional(v.number()),
    }).index("by_projectId", ["projectId"])
      .index("by_projectId_sourceType", ["projectId", "sourceType"]),

    sourceSnapshots: defineTable({
      projectId: v.id("projects"),
      snapshotNumber: v.number(),
      legacyFileCount: v.number(),
      modFileCount: v.number(),
      legacyFileIds: v.array(v.id("sourceFiles")),
      modFileIds: v.array(v.id("sourceFiles")),
      createdAt: v.number(),
      label: v.optional(v.string()),
    }).index("by_projectId", ["projectId"]),

    comparisons: defineTable({
      projectId: v.id("projects"),
      functionalAreaId: v.optional(v.id("functionalAreas")),
      legacyFileId: v.id("sourceFiles"),
      modFileId: v.id("sourceFiles"),
      status: v.union(
        v.literal("PENDING"),
        v.literal("RUNNING"),
        v.literal("COMPLETED"),
        v.literal("ERROR"),
      ),
      summary: v.optional(v.string()),
      matchCount: v.number(),
      diffCount: v.number(),
      similarity: v.number(),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_functionalAreaId", ["functionalAreaId"]),

    differences: defineTable({
      comparisonId: v.id("comparisons"),
      projectId: v.id("projects"),
      legacyFileId: v.id("sourceFiles"),
      modFileId: v.id("sourceFiles"),
      legacyLineStart: v.number(),
      legacyLineEnd: v.number(),
      modLineStart: v.number(),
      modLineEnd: v.number(),
      legacySnippet: v.string(),
      modSnippet: v.string(),
      category: v.union(
        v.literal("MATCHED"),
        v.literal("MISSING"),
        v.literal("CHANGED"),
        v.literal("REMOVED"),
        v.literal("ADDED"),
        v.literal("UNKNOWN"),
      ),
      severity: v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
        v.literal("INFO"),
      ),
      description: v.string(),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      status: v.union(
        v.literal("OPEN"),
        v.literal("REVIEWED"),
        v.literal("ACCEPTED"),
        v.literal("INTENTIONAL"),
        v.literal("FALSE_POSITIVE"),
        v.literal("FIX_REQUIRED"),
      ),
      developerComment: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_comparisonId", ["comparisonId"])
      .index("by_projectId", ["projectId"])
      .index("by_status", ["status"])
      .index("by_category", ["category"]),

    comments: defineTable({
      differenceId: v.id("differences"),
      projectId: v.id("projects"),
      author: v.string(),
      content: v.string(),
      createdAt: v.number(),
    }).index("by_differenceId", ["differenceId"])
      .index("by_projectId", ["projectId"]),

    analysisJobs: defineTable({
      projectId: v.id("projects"),
      type: v.string(),
      status: v.union(
        v.literal("QUEUED"),
        v.literal("RUNNING"),
        v.literal("COMPLETED"),
        v.literal("FAILED"),
        v.literal("CANCELLED"),
      ),
      progress: v.number(),
      totalItems: v.number(),
      completedItems: v.number(),
      result: v.optional(v.string()),
      error: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_status", ["status"]),

    businessRules: defineTable({
      projectId: v.id("projects"),
      functionalAreaId: v.optional(v.id("functionalAreas")),
      ruleId: v.string(),
      description: v.string(),
      source: v.string(),
      condition: v.optional(v.string()),
      positiveOutcome: v.optional(v.string()),
      failureOutcome: v.optional(v.string()),
      legacyReference: v.optional(v.string()),
      modReference: v.optional(v.string()),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
        v.literal("UNKNOWN"),
      ),
      status: v.union(
        v.literal("IDENTIFIED"),
        v.literal("CONFIRMED"),
        v.literal("IN_MOD"),
        v.literal("MISSING_IN_MOD"),
        v.literal("INTENTIONAL_CHANGE"),
        v.literal("UNKNOWN"),
      ),
      differenceId: v.optional(v.id("differences")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_functionalAreaId", ["functionalAreaId"])
      .index("by_status", ["status"]),

    freezeRecords: defineTable({
      projectId: v.id("projects"),
      version: v.string(),
      userId: v.string(),
      userName: v.optional(v.string()),
      reason: v.string(),
      unresolvedCriticalDiffs: v.number(),
      totalDiffs: v.number(),
      resolvedDiffs: v.number(),
      frozenAt: v.number(),
    }).index("by_projectId", ["projectId"]),

    testScenarios: defineTable({
      projectId: v.id("projects"),
      functionalAreaId: v.optional(v.id("functionalAreas")),
      scenarioId: v.string(),
      title: v.string(),
      description: v.string(),
      category: v.union(
        v.literal("POSITIVE"),
        v.literal("NEGATIVE"),
        v.literal("BOUNDARY"),
        v.literal("NULL"),
        v.literal("ERROR_HANDLING"),
        v.literal("DATA_COMBINATION"),
        v.literal("END_TO_END"),
        v.literal("REGRESSION"),
      ),
      ruleIds: v.array(v.string()),
      differenceIds: v.array(v.id("differences")),
      preconditions: v.array(v.string()),
      steps: v.array(v.string()),
      expectedBehavior: v.string(),
      priority: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      status: v.union(
        v.literal("DRAFT"),
        v.literal("REVIEWED"),
        v.literal("APPROVED"),
        v.literal("EXCLUDED"),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_functionalAreaId", ["functionalAreaId"])
      .index("by_category", ["category"])
      .index("by_status", ["status"]),

    testCases: defineTable({
      projectId: v.id("projects"),
      scenarioId: v.string(),
      testcaseId: v.string(),
      requirement: v.string(),
      precondition: v.string(),
      description: v.string(),
      testData: v.string(),
      steps: v.string(),
      expectedResult: v.string(),
      actualResult: v.optional(v.string()),
      status: v.union(
        v.literal("NOT_EXECUTED"),
        v.literal("PASS"),
        v.literal("FAIL"),
        v.literal("BLOCKED"),
        v.literal("SKIPPED"),
      ),
      ruleIds: v.array(v.string()),
      differenceIds: v.array(v.id("differences")),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_scenarioId", ["scenarioId"])
      .index("by_status", ["status"]),

    testData: defineTable({
      projectId: v.id("projects"),
      testcaseId: v.optional(v.string()),
      fieldName: v.string(),
      value: v.string(),
      source: v.union(
        v.literal("HISTORICAL"),
        v.literal("SCHEMA"),
        v.literal("CODE"),
        v.literal("USER_CONFIRMED"),
        v.literal("GENERATED"),
      ),
      sourceDetail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_testcaseId", ["testcaseId"]),

    traceabilityLinks: defineTable({
      projectId: v.id("projects"),
      requirement: v.string(),
      requirementSource: v.optional(v.string()),
      ruleId: v.optional(v.string()),
      differenceId: v.optional(v.id("differences")),
      testcaseId: v.optional(v.string()),
      automationClass: v.optional(v.string()),
      status: v.union(
        v.literal("COVERED"),
        v.literal("PARTIAL"),
        v.literal("NOT_COVERED"),
      ),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_requirement", ["requirement"]),

    coverageItems: defineTable({
      projectId: v.id("projects"),
      category: v.string(),
      label: v.string(),
      total: v.number(),
      covered: v.number(),
      uncovered: v.number(),
      details: v.optional(v.string()),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"]),

    knowledgeEntries: defineTable({
      projectId: v.id("projects"),
      category: v.union(
        v.literal("LIFECYCLE_CODE"),
        v.literal("STATUS_CODE"),
        v.literal("DATA_TYPE"),
        v.literal("TABLE_RELATIONSHIP"),
        v.literal("BUSINESS_RULE"),
        v.literal("FIELD_CONSTRAINT"),
        v.literal("ENUM_VALUE"),
        v.literal("OTHER"),
      ),
      fieldName: v.string(),
      value: v.string(),
      description: v.string(),
      provenance: v.union(
        v.literal("FACT"),
        v.literal("OBSERVATION"),
        v.literal("DERIVED"),
        v.literal("USER_CONFIRMED"),
        v.literal("UNKNOWN"),
      ),
      sourceDetail: v.optional(v.string()),
      askedBy: v.optional(v.string()),
      answeredBy: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_category", ["category"]),

    evidenceRequests: defineTable({
      projectId: v.id("projects"),
      functionalAreaId: v.optional(v.id("functionalAreas")),
      question: v.string(),
      context: v.optional(v.string()),
      category: v.union(
        v.literal("MISSING_BUSINESS_RULE"),
        v.literal("MISSING_STATUS_CODE"),
        v.literal("MISSING_TABLE_INFO"),
        v.literal("MISSING_DATA_TYPE"),
        v.literal("MISSING_RELATIONSHIP"),
        v.literal("CLARIFICATION_NEEDED"),
      ),
      status: v.union(
        v.literal("OPEN"),
        v.literal("ANSWERED"),
        v.literal("DISMISSED"),
      ),
      answer: v.optional(v.string()),
      answeredBy: v.optional(v.string()),
      linkedRuleId: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_status", ["status"]),

    functionalities: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      description: v.string(),
      status: v.union(
        v.literal("DISCOVERED"),
        v.literal("MAPPED"),
        v.literal("PARTIALLY_MAPPED"),
        v.literal("UNMAPPED_LEGACY"),
        v.literal("UNMAPPED_MOD"),
        v.literal("CONFIRMED"),
        v.literal("NEEDS_EVIDENCE"),
      ),
      legacyComponentIds: v.array(v.string()),
      modComponentIds: v.array(v.string()),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      clusteringReason: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_status", ["status"]),

    findings: defineTable({
      projectId: v.id("projects"),
      functionalityId: v.string(),
      findingType: v.union(
        v.literal("MISSING_FUNCTIONALITY"),
        v.literal("CHANGED_FUNCTIONALITY"),
        v.literal("CHANGED_RULE"),
        v.literal("CHANGED_CONDITION"),
        v.literal("CHANGED_STATUS_CODE"),
        v.literal("CHANGED_ERROR_HANDLING"),
        v.literal("CHANGED_DATA_MAPPING"),
        v.literal("MISSING_TABLE_MAPPING"),
        v.literal("MISSING_COLUMN_MAPPING"),
        v.literal("MISSING_EXTERNAL_RULE"),
        v.literal("MISSING_VALIDATION"),
        v.literal("MULTIPLE_CLAIM_REGRESSION"),
        v.literal("DRIVER_SELECTION_DIFFERENCE"),
        v.literal("INTENTIONAL_ARCHITECTURAL_CHANGE"),
        v.literal("UNKNOWN_REQUIRES_USER_INPUT"),
        v.literal("MISSING_SCHEMA"),
        v.literal("MISSING_HISTORY_DATA"),
      ),
      severity: v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
        v.literal("INFO"),
      ),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      title: v.string(),
      description: v.string(),
      legacyEvidence: v.array(v.object({
        fileId: v.string(),
        fileName: v.string(),
        lineStart: v.number(),
        lineEnd: v.number(),
        snippet: v.string(),
      })),
      modEvidence: v.array(v.object({
        fileId: v.string(),
        fileName: v.string(),
        lineStart: v.number(),
        lineEnd: v.number(),
        snippet: v.string(),
      })),
      status: v.union(
        v.literal("OPEN"),
        v.literal("REVIEWED"),
        v.literal("ACCEPTED"),
        v.literal("INTENTIONAL"),
        v.literal("FALSE_POSITIVE"),
        v.literal("FIX_REQUIRED"),
        v.literal("NEEDS_INFO"),
      ),
      developerComment: v.optional(v.string()),
      informationNeeded: v.optional(v.string()),
      // Enhanced business explanation fields
      businessExplanation: v.optional(v.object({
        legacyBehavior: v.string(),
        modBehavior: v.string(),
        difference: v.string(),
        impact: v.string(),
        possibleImpact: v.string(),
        example: v.optional(v.string()),
        summary: v.string(),
        evidenceLevel: v.union(
          v.literal("PROVEN"),
          v.literal("STRONG_EVIDENCE"),
          v.literal("POSSIBLE"),
          v.literal("UNKNOWN"),
          v.literal("MISSING_INFORMATION"),
        ),
        confidenceExplanation: v.object({
          level: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
          reason: v.string(),
          evidenceStrength: v.string(),
        }),
        businessRules: v.array(v.object({
          id: v.string(),
          ruleNumber: v.number(),
          description: v.string(),
          sourceFile: v.string(),
          lineStart: v.number(),
          lineEnd: v.number(),
          condition: v.optional(v.string()),
          positiveOutcome: v.optional(v.string()),
          failureOutcome: v.optional(v.string()),
          confidence: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
          legacyStatus: v.union(v.literal("IDENTIFIED"), v.literal("CONFIRMED"), v.literal("NOT_FOUND")),
          modStatus: v.union(
            v.literal("NOT_FOUND"),
            v.literal("IMPLEMENTED"),
            v.literal("PARTIALLY_IMPLEMENTED"),
            v.literal("INTENTIONALLY_REMOVED"),
            v.literal("UNKNOWN"),
          ),
        })),
        missingInformation: v.array(v.object({
          id: v.string(),
          whatIsNeeded: v.string(),
          whyNeeded: v.string(),
          suggestedAction: v.string(),
          suggestedQuery: v.optional(v.string()),
          category: v.union(
            v.literal("TABLE_SCHEMA"),
            v.literal("SAMPLE_DATA"),
            v.literal("STATUS_CODE_MEANING"),
            v.literal("CLOB_CONTENT"),
            v.literal("EXTERNAL_RULE"),
            v.literal("MOD_CLASS"),
            v.literal("MOD_VALIDATION"),
            v.literal("CLARIFICATION"),
            v.literal("HISTORY_DATA"),
          ),
        })),
      })),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_functionalityId", ["functionalityId"])
      .index("by_severity", ["severity"])
      .index("by_status", ["status"])
      .index("by_findingType", ["findingType"]),

    componentMappings: defineTable({
      projectId: v.id("projects"),
      functionalityId: v.string(),
      mappingType: v.union(
        v.literal("ONE_TO_ONE"),
        v.literal("ONE_TO_MANY"),
        v.literal("MANY_TO_ONE"),
        v.literal("MANY_TO_MANY"),
        v.literal("ARCHITECTURAL_CHANGE"),
        v.literal("SPLIT"),
        v.literal("MERGED"),
        v.literal("RENAMED"),
        v.literal("REFACTORED"),
        v.literal("REPLACED"),
        v.literal("UNMAPPED"),
      ),
      legacyComponentIds: v.array(v.string()),
      modComponentIds: v.array(v.string()),
      reason: v.string(),
      evidence: v.array(v.string()),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      source: v.union(
        v.literal("AUTO"),
        v.literal("USER_CONFIRMED"),
        v.literal("USER_OVERRIDE"),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_functionalityId", ["functionalityId"]),

    informationRequests: defineTable({
      projectId: v.id("projects"),
      functionalityId: v.optional(v.string()),
      findingId: v.optional(v.string()),
      type: v.union(
        v.literal("MISSING_SCHEMA"),
        v.literal("MISSING_HISTORY_DATA"),
        v.literal("MISSING_EXTERNAL_RULE"),
        v.literal("MISSING_TABLE_DEFINITION"),
        v.literal("MISSING_VIEW_DEFINITION"),
        v.literal("MISSING_CLOB_DATA"),
        v.literal("MISSING_STATUS_CODES"),
        v.literal("MISSING_TABLE_MAPPING"),
        v.literal("CLARIFICATION_NEEDED"),
      ),
      title: v.string(),
      description: v.string(),
      whatIsNeeded: v.string(),
      reason: v.string(),
      suggestedQuery: v.optional(v.string()),
      answer: v.optional(v.string()),
      answerDetail: v.optional(v.string()),
      status: v.union(
        v.literal("PENDING"),
        v.literal("PROVIDED"),
        v.literal("DISMISSED"),
        v.literal("GENERATED_QUERY"),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_status", ["status"]),

    // ======================== PHASE 8: Test Execution ========================

    testCycles: defineTable({
      projectId: v.id("projects"),
      name: v.string(),
      release: v.optional(v.string()),
      build: v.optional(v.string()),
      environment: v.optional(v.string()),
      tester: v.string(),
      status: v.union(
        v.literal("PLANNED"),
        v.literal("IN_PROGRESS"),
        v.literal("COMPLETED"),
        v.literal("ABORTED"),
      ),
      notes: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_status", ["status"]),

    testExecutions: defineTable({
      projectId: v.id("projects"),
      testCycleId: v.id("testCycles"),
      testcaseId: v.string(),
      executionType: v.union(
        v.literal("MANUAL"),
        v.literal("AUTOMATION"),
      ),
      executedBy: v.string(),
      executedAt: v.number(),
      environment: v.optional(v.string()),
      build: v.optional(v.string()),
      overallStatus: v.union(
        v.literal("NOT_EXECUTED"),
        v.literal("PASS"),
        v.literal("FAIL"),
        v.literal("BLOCKED"),
        v.literal("SKIPPED"),
      ),
      executionNumber: v.number(),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      duration: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_testCycleId", ["testCycleId"])
      .index("by_testcaseId", ["testcaseId"])
      .index("by_overallStatus", ["overallStatus"]),

    stepExecutions: defineTable({
      projectId: v.id("projects"),
      executionId: v.id("testExecutions"),
      testCycleId: v.id("testCycles"),
      testcaseId: v.string(),
      stepNumber: v.number(),
      description: v.string(),
      expectedResult: v.string(),
      actualResult: v.optional(v.string()),
      status: v.union(
        v.literal("NOT_EXECUTED"),
        v.literal("PASS"),
        v.literal("FAIL"),
        v.literal("BLOCKED"),
        v.literal("NOT_APPLICABLE"),
      ),
      executedBy: v.optional(v.string()),
      executedAt: v.optional(v.number()),
      comments: v.optional(v.string()),
      suggestedResult: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_executionId", ["executionId"])
      .index("by_testCycleId", ["testCycleId"])
      .index("by_testcaseId", ["testcaseId"]),

    testEvidence: defineTable({
      projectId: v.id("projects"),
      testCycleId: v.id("testCycles"),
      executionId: v.id("testExecutions"),
      testcaseId: v.string(),
      stepNumber: v.number(),
      captureType: v.union(
        v.literal("SNAGIT"),
        v.literal("PLAYWRIGHT"),
        v.literal("UPLOAD"),
        v.literal("BROWSER_CAPTURE"),
      ),
      fileName: v.string(),
      originalName: v.string(),
      mimeType: v.string(),
      size: v.number(),
      storageId: v.optional(v.string()),
      thumbnailStorageId: v.optional(v.string()),
      application: v.optional(v.string()),
      description: v.optional(v.string()),
      annotationData: v.optional(v.string()),
      redactedStorageId: v.optional(v.string()),
      isRedacted: v.boolean(),
      capturedBy: v.string(),
      capturedAt: v.number(),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_testCycleId", ["testCycleId"])
      .index("by_executionId", ["executionId"])
      .index("by_testcaseId", ["testcaseId"]),

    defects: defineTable({
      projectId: v.id("projects"),
      defectId: v.string(),
      testCycleId: v.id("testCycles"),
      executionId: v.id("testExecutions"),
      testcaseId: v.string(),
      stepNumber: v.number(),
      title: v.string(),
      description: v.string(),
      expectedResult: v.string(),
      actualResult: v.string(),
      environment: v.optional(v.string()),
      build: v.optional(v.string()),
      severity: v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      status: v.union(
        v.literal("OPEN"),
        v.literal("IN_PROGRESS"),
        v.literal("RESOLVED"),
        v.literal("CLOSED"),
        v.literal("REJECTED"),
      ),
      assignedTo: v.optional(v.string()),
      externalId: v.optional(v.string()),
      createdBy: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_testCycleId", ["testCycleId"])
      .index("by_testcaseId", ["testcaseId"])
      .index("by_status", ["status"]),

    automationResults: defineTable({
      projectId: v.id("projects"),
      testCycleId: v.optional(v.id("testCycles")),
      testcaseId: v.string(),
      className: v.string(),
      methodName: v.optional(v.string()),
      result: v.union(
        v.literal("PASSED"),
        v.literal("FAILED"),
        v.literal("SKIPPED"),
        v.literal("ERROR"),
      ),
      duration: v.optional(v.number()),
      errorMessage: v.optional(v.string()),
      stackTrace: v.optional(v.string()),
      screenshotStorageId: v.optional(v.string()),
      logContent: v.optional(v.string()),
      browser: v.optional(v.string()),
      browserVersion: v.optional(v.string()),
      os: v.optional(v.string()),
      environment: v.optional(v.string()),
      executedAt: v.number(),
      importedAt: v.number(),
    }).index("by_projectId", ["projectId"])
      .index("by_testCycleId", ["testCycleId"])
      .index("by_testcaseId", ["testcaseId"])
      .index("by_result", ["result"]),

    auditLog: defineTable({
      projectId: v.id("projects"),
      userId: v.string(),
      userName: v.optional(v.string()),
      action: v.string(),
      targetType: v.string(),
      targetId: v.string(),
      detail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_projectId", ["projectId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
