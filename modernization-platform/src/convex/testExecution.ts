// ============================================================
// Test Execution Backend — cycles, executions, steps, evidence, defects
// ============================================================
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ─── Test Cycles ──────────────────────────────────────────

export const listCycles = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testCycles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const getCycle = query({
  args: { cycleId: v.id("testCycles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.cycleId);
  },
});

export const getCycleStats = query({
  args: { cycleId: v.id("testCycles") },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;

    const executions = await ctx.db
      .query("testExecutions")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const steps = await ctx.db
      .query("stepExecutions")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const evidence = await ctx.db
      .query("testEvidence")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const defects = await ctx.db
      .query("defects")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const automationResults = await ctx.db
      .query("automationResults")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const manualExecs = executions.filter((e) => e.executionType === "MANUAL");
    const autoExecs = executions.filter((e) => e.executionType === "AUTOMATION");

    return {
      cycle,
      totalManualTestCases: new Set(manualExecs.map((e) => e.testcaseId)).size,
      manualPassed: manualExecs.filter((e) => e.overallStatus === "PASS").length,
      manualFailed: manualExecs.filter((e) => e.overallStatus === "FAIL").length,
      manualBlocked: manualExecs.filter((e) => e.overallStatus === "BLOCKED").length,
      manualNotExecuted: manualExecs.filter((e) => e.overallStatus === "NOT_EXECUTED").length,
      totalAutomation: autoExecs.length,
      autoPassed: autoExecs.filter((e) => e.overallStatus === "PASS").length,
      autoFailed: autoExecs.filter((e) => e.overallStatus === "FAIL").length,
      autoSkipped: autoExecs.filter((e) => e.overallStatus === "SKIPPED").length,
      totalSteps: steps.length,
      stepsPassed: steps.filter((s) => s.status === "PASS").length,
      stepsFailed: steps.filter((s) => s.status === "FAIL").length,
      totalEvidence: evidence.length,
      totalDefects: defects.length,
      openDefects: defects.filter((d) => d.status === "OPEN" || d.status === "IN_PROGRESS").length,
      totalAutomationResults: automationResults.length,
    };
  },
});

export const createCycle = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    release: v.optional(v.string()),
    build: v.optional(v.string()),
    environment: v.optional(v.string()),
    tester: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("testCycles", {
      projectId: args.projectId,
      name: args.name,
      release: args.release,
      build: args.build,
      environment: args.environment,
      tester: args.tester,
      status: "PLANNED",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCycle = mutation({
  args: {
    cycleId: v.id("testCycles"),
    name: v.optional(v.string()),
    release: v.optional(v.string()),
    build: v.optional(v.string()),
    environment: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("PLANNED"),
      v.literal("IN_PROGRESS"),
      v.literal("COMPLETED"),
      v.literal("ABORTED"),
    )),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) patch.name = args.name;
    if (args.release !== undefined) patch.release = args.release;
    if (args.build !== undefined) patch.build = args.build;
    if (args.environment !== undefined) patch.environment = args.environment;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "IN_PROGRESS") patch.startedAt = now;
      if (args.status === "COMPLETED" || args.status === "ABORTED") patch.completedAt = now;
    }
    await ctx.db.patch(args.cycleId, patch);
  },
});

export const deleteCycle = mutation({
  args: { cycleId: v.id("testCycles") },
  handler: async (ctx, args) => {
    // Delete all child records
    const execs = await ctx.db
      .query("testExecutions")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();
    for (const e of execs) {
      const steps = await ctx.db
        .query("stepExecutions")
        .withIndex("by_executionId", (q) => q.eq("executionId", e._id))
        .collect();
      for (const s of steps) await ctx.db.delete(s._id);
      await ctx.db.delete(e._id);
    }

    const evidence = await ctx.db
      .query("testEvidence")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();
    for (const ev of evidence) await ctx.db.delete(ev._id);

    const defects = await ctx.db
      .query("defects")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();
    for (const d of defects) await ctx.db.delete(d._id);

    await ctx.db.delete(args.cycleId);
  },
});

// ─── Test Executions ──────────────────────────────────────

export const listExecutions = query({
  args: { testCycleId: v.id("testCycles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testExecutions")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.testCycleId))
      .collect();
  },
});

export const getExecution = query({
  args: { executionId: v.id("testExecutions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.executionId);
  },
});

export const getExecutionSteps = query({
  args: { executionId: v.id("testExecutions") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("stepExecutions")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .collect();
    return steps.sort((a, b) => a.stepNumber - b.stepNumber);
  },
});

export const getExecutionEvidence = query({
  args: { executionId: v.id("testExecutions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testEvidence")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .collect();
  },
});

export const createExecution = mutation({
  args: {
    projectId: v.id("projects"),
    testCycleId: v.id("testCycles"),
    testcaseId: v.string(),
    executionType: v.union(v.literal("MANUAL"), v.literal("AUTOMATION")),
    executedBy: v.string(),
    environment: v.optional(v.string()),
    build: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Count existing executions for this test case in this cycle to determine execution number
    const existing = await ctx.db
      .query("testExecutions")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.testCycleId))
      .collect();
    const sameCaseExecs = existing.filter((e) => e.testcaseId === args.testcaseId);
    const executionNumber = sameCaseExecs.length + 1;

    // Get the test case to parse steps
    const testCase = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const tc = testCase.find((t) => t.testcaseId === args.testcaseId);

    const executionId = await ctx.db.insert("testExecutions", {
      projectId: args.projectId,
      testCycleId: args.testCycleId,
      testcaseId: args.testcaseId,
      executionType: args.executionType,
      executedBy: args.executedBy,
      executedAt: now,
      environment: args.environment,
      build: args.build,
      overallStatus: "NOT_EXECUTED",
      executionNumber,
      startedAt: now,
      notes: undefined,
      createdAt: now,
    });

    // Create step execution records from the test case steps
    if (tc) {
      const stepLines = tc.steps.split("\n").filter((s) => s.trim().length > 0);
      for (let i = 0; i < stepLines.length; i++) {
        const expectedLines = tc.expectedResult.split("\n");
        const expected = expectedLines[i] || tc.expectedResult;
        await ctx.db.insert("stepExecutions", {
          projectId: args.projectId,
          executionId,
          testCycleId: args.testCycleId,
          testcaseId: args.testcaseId,
          stepNumber: i + 1,
          description: stepLines[i].trim(),
          expectedResult: expected.trim(),
          status: "NOT_EXECUTED",
          createdAt: now,
          updatedAt: now,
        });
      }

      // If no parseable steps, create one default step
      if (stepLines.length === 0) {
        await ctx.db.insert("stepExecutions", {
          projectId: args.projectId,
          executionId,
          testCycleId: args.testCycleId,
          testcaseId: args.testcaseId,
          stepNumber: 1,
          description: tc.description || "Execute test case",
          expectedResult: tc.expectedResult,
          status: "NOT_EXECUTED",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return executionId;
  },
});

export const updateStepExecution = mutation({
  args: {
    stepId: v.id("stepExecutions"),
    actualResult: v.optional(v.string()),
    status: v.union(
      v.literal("NOT_EXECUTED"),
      v.literal("PASS"),
      v.literal("FAIL"),
      v.literal("BLOCKED"),
      v.literal("NOT_APPLICABLE"),
    ),
    comments: v.optional(v.string()),
    executedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };
    if (args.actualResult !== undefined) patch.actualResult = args.actualResult;
    if (args.comments !== undefined) patch.comments = args.comments;
    if (args.executedBy !== undefined) patch.executedBy = args.executedBy;
    if (args.status !== "NOT_EXECUTED") patch.executedAt = now;

    await ctx.db.patch(args.stepId, patch);

    // Recalculate overall execution status
    const step = await ctx.db.get(args.stepId);
    if (step) {
      const allSteps = await ctx.db
        .query("stepExecutions")
        .withIndex("by_executionId", (q) => q.eq("executionId", step.executionId))
        .collect();

      const statuses = allSteps.map((s) => (s._id === args.stepId ? args.status : s.status));
      const hasFail = statuses.includes("FAIL");
      const hasBlocked = statuses.includes("BLOCKED");
      const allPass = statuses.every((s) => s === "PASS" || s === "NOT_APPLICABLE");
      const anyExecuted = statuses.some((s) => s !== "NOT_EXECUTED");

      let overall: "NOT_EXECUTED" | "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" = "NOT_EXECUTED";
      if (hasFail) overall = "FAIL";
      else if (hasBlocked) overall = "BLOCKED";
      else if (allPass && anyExecuted) overall = "PASS";

      // Fetch execution to compute duration
      const exec = await ctx.db.get(step.executionId);
      await ctx.db.patch(step.executionId, {
        overallStatus: overall,
        completedAt: anyExecuted ? now : undefined,
        duration: anyExecuted && exec ? now - exec.startedAt : undefined,
      });
    }
  },
});

export const completeExecution = mutation({
  args: {
    executionId: v.id("testExecutions"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const exec = await ctx.db.get(args.executionId);
    if (!exec) throw new Error("Execution not found");

    const steps = await ctx.db
      .query("stepExecutions")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .collect();

    const statuses = steps.map((s) => s.status);
    const hasFail = statuses.includes("FAIL");
    const hasBlocked = statuses.includes("BLOCKED");
    const allPass = statuses.every((s) => s === "PASS" || s === "NOT_APPLICABLE");
    const anyExecuted = statuses.some((s) => s !== "NOT_EXECUTED");

    let overall: "NOT_EXECUTED" | "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" = "NOT_EXECUTED";
    if (hasFail) overall = "FAIL";
    else if (hasBlocked) overall = "BLOCKED";
    else if (allPass && anyExecuted) overall = "PASS";

    await ctx.db.patch(args.executionId, {
      overallStatus: overall,
      completedAt: now,
      duration: now - exec.startedAt,
      notes: args.notes ?? exec.notes,
    });
  },
});

// ─── Evidence ─────────────────────────────────────────────

export const listEvidence = query({
  args: { testCycleId: v.id("testCycles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testEvidence")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.testCycleId))
      .order("desc")
      .collect();
  },
});

export const getEvidenceForStep = query({
  args: {
    executionId: v.id("testExecutions"),
    stepNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("testEvidence")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .collect();
    return all.filter((e) => e.stepNumber === args.stepNumber);
  },
});

export const addEvidence = mutation({
  args: {
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
    application: v.optional(v.string()),
    description: v.optional(v.string()),
    capturedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("testEvidence", {
      projectId: args.projectId,
      testCycleId: args.testCycleId,
      executionId: args.executionId,
      testcaseId: args.testcaseId,
      stepNumber: args.stepNumber,
      captureType: args.captureType,
      fileName: args.fileName,
      originalName: args.originalName,
      mimeType: args.mimeType,
      size: args.size,
      storageId: args.storageId,
      application: args.application,
      description: args.description,
      capturedBy: args.capturedBy,
      capturedAt: now,
      isRedacted: false,
      createdAt: now,
    });
  },
});

export const updateEvidence = mutation({
  args: {
    evidenceId: v.id("testEvidence"),
    description: v.optional(v.string()),
    application: v.optional(v.string()),
    annotationData: v.optional(v.string()),
    redactedStorageId: v.optional(v.string()),
    isRedacted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.description !== undefined) patch.description = args.description;
    if (args.application !== undefined) patch.application = args.application;
    if (args.annotationData !== undefined) patch.annotationData = args.annotationData;
    if (args.redactedStorageId !== undefined) patch.redactedStorageId = args.redactedStorageId;
    if (args.isRedacted !== undefined) patch.isRedacted = args.isRedacted;
    await ctx.db.patch(args.evidenceId, patch);
  },
});

export const deleteEvidence = mutation({
  args: { evidenceId: v.id("testEvidence") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.evidenceId);
  },
});

// ─── Defects ──────────────────────────────────────────────

export const listDefects = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("defects")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const createDefect = mutation({
  args: {
    projectId: v.id("projects"),
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
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Count existing defects for this project
    const existing = await ctx.db
      .query("defects")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const defectId = `DEF-${String(existing.length + 1).padStart(4, "0")}`;

    return await ctx.db.insert("defects", {
      projectId: args.projectId,
      defectId,
      testCycleId: args.testCycleId,
      executionId: args.executionId,
      testcaseId: args.testcaseId,
      stepNumber: args.stepNumber,
      title: args.title,
      description: args.description,
      expectedResult: args.expectedResult,
      actualResult: args.actualResult,
      environment: args.environment,
      build: args.build,
      severity: args.severity,
      status: "OPEN",
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDefect = mutation({
  args: {
    defectId: v.id("defects"),
    status: v.optional(v.union(
      v.literal("OPEN"),
      v.literal("IN_PROGRESS"),
      v.literal("RESOLVED"),
      v.literal("CLOSED"),
      v.literal("REJECTED"),
    )),
    severity: v.optional(v.union(
      v.literal("CRITICAL"),
      v.literal("HIGH"),
      v.literal("MEDIUM"),
      v.literal("LOW"),
    )),
    assignedTo: v.optional(v.string()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.severity !== undefined) patch.severity = args.severity;
    if (args.assignedTo !== undefined) patch.assignedTo = args.assignedTo;
    if (args.externalId !== undefined) patch.externalId = args.externalId;
    await ctx.db.patch(args.defectId, patch);
  },
});

// ─── Automation Results Import ────────────────────────────

export const importAutomationResults = mutation({
  args: {
    projectId: v.id("projects"),
    testCycleId: v.optional(v.id("testCycles")),
    results: v.array(v.object({
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
      logContent: v.optional(v.string()),
      browser: v.optional(v.string()),
      browserVersion: v.optional(v.string()),
      os: v.optional(v.string()),
      environment: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let imported = 0;

    for (const r of args.results) {
      await ctx.db.insert("automationResults", {
        projectId: args.projectId,
        testCycleId: args.testCycleId,
        testcaseId: r.testcaseId,
        className: r.className,
        methodName: r.methodName,
        result: r.result,
        duration: r.duration,
        errorMessage: r.errorMessage,
        stackTrace: r.stackTrace,
        logContent: r.logContent,
        browser: r.browser,
        browserVersion: r.browserVersion,
        os: r.os,
        environment: r.environment,
        executedAt: now,
        importedAt: now,
      });
      imported++;

      // If linked to a cycle, also create/update execution record
      if (args.testCycleId) {
        const overallStatus = r.result === "PASSED" ? "PASS"
          : r.result === "FAILED" ? "FAIL"
          : r.result === "SKIPPED" ? "SKIPPED"
          : "FAIL";

        // Check if execution already exists for this testcase in this cycle
        const existing = await ctx.db
          .query("testExecutions")
          .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.testCycleId!))
          .collect();
        const existingExec = existing.find(
          (e) => e.testcaseId === r.testcaseId && e.executionType === "AUTOMATION",
        );

        if (existingExec) {
          // Update if worse result
          if (overallStatus === "FAIL") {
            await ctx.db.patch(existingExec._id, { overallStatus });
          }
        } else {
          await ctx.db.insert("testExecutions", {
            projectId: args.projectId,
            testCycleId: args.testCycleId,
            testcaseId: r.testcaseId,
            executionType: "AUTOMATION",
            executedBy: "Automation",
            executedAt: now,
            overallStatus,
            executionNumber: 1,
            startedAt: now,
            completedAt: now,
            duration: r.duration,
            createdAt: now,
          });
        }
      }
    }

    return { imported };
  },
});

export const listAutomationResults = query({
  args: { projectId: v.id("projects"), testCycleId: v.optional(v.id("testCycles")) },
  handler: async (ctx, args) => {
    if (args.testCycleId) {
      return await ctx.db
        .query("automationResults")
        .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.testCycleId!))
        .collect();
    }
    return await ctx.db
      .query("automationResults")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// ─── Reports ──────────────────────────────────────────────

export const generateReportData = query({
  args: { cycleId: v.id("testCycles") },
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;

    const executions = await ctx.db
      .query("testExecutions")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const steps = await ctx.db
      .query("stepExecutions")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const evidence = await ctx.db
      .query("testEvidence")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    const defects = await ctx.db
      .query("defects")
      .withIndex("by_testCycleId", (q) => q.eq("testCycleId", args.cycleId))
      .collect();

    // Get test case details
    const testCaseIds = [...new Set(executions.map((e) => e.testcaseId))];
    const allTestCases = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", cycle.projectId))
      .collect();
    const relevantTCs = allTestCases.filter((tc) => testCaseIds.includes(tc.testcaseId));

    // Build detailed results
    const detailedResults = executions.map((exec) => {
      const execSteps = steps
        .filter((s) => s.executionId === exec._id)
        .sort((a, b) => a.stepNumber - b.stepNumber);
      const execEvidence = evidence.filter((e) => e.executionId === exec._id);
      const tc = relevantTCs.find((t) => t.testcaseId === exec.testcaseId);

      return {
        ...exec,
        testCase: tc,
        steps: execSteps,
        evidence: execEvidence,
      };
    });

    const total = executions.length;
    const passed = executions.filter((e) => e.overallStatus === "PASS").length;
    const failed = executions.filter((e) => e.overallStatus === "FAIL").length;
    const blocked = executions.filter((e) => e.overallStatus === "BLOCKED").length;
    const skipped = executions.filter((e) => e.overallStatus === "SKIPPED").length;
    const notExecuted = executions.filter((e) => e.overallStatus === "NOT_EXECUTED").length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0";

    return {
      cycle,
      summary: { total, passed, failed, blocked, skipped, notExecuted, passRate },
      detailedResults,
      totalEvidence: evidence.length,
      totalDefects: defects.length,
      openDefects: defects.filter((d) => d.status === "OPEN" || d.status === "IN_PROGRESS").length,
    };
  },
});
