import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const cases = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      total: cases.length,
      notExecuted: cases.filter((c) => c.status === "NOT_EXECUTED").length,
      pass: cases.filter((c) => c.status === "PASS").length,
      fail: cases.filter((c) => c.status === "FAIL").length,
      blocked: cases.filter((c) => c.status === "BLOCKED").length,
    };
  },
});

// Generate test cases from approved test scenarios
export const generateFromScenarios = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const scenarios = await ctx.db
      .query("testScenarios")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const approved = scenarios.filter((s) => s.status === "APPROVED");
    if (approved.length === 0) {
      throw new Error("No approved test scenarios. Approve scenarios before generating test cases.");
    }

    // Delete existing test cases
    const existing = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const tc of existing) {
      await ctx.db.delete(tc._id);
    }

    const now = Date.now();
    let counter = 0;

    for (const scenario of approved) {
      counter++;
      const testcaseId = `TC-${String(counter).padStart(3, "0")}`;

      await ctx.db.insert("testCases", {
        projectId: args.projectId,
        scenarioId: scenario.scenarioId,
        testcaseId,
        requirement: scenario.title,
        precondition: scenario.preconditions.join("; "),
        description: scenario.description,
        testData: `See test data for ${testcaseId}`,
        steps: scenario.steps.join("\n"),
        expectedResult: scenario.expectedBehavior,
        status: "NOT_EXECUTED",
        ruleIds: scenario.ruleIds,
        differenceIds: scenario.differenceIds,
        createdAt: now,
      });
    }

    return { generated: counter };
  },
});

export const updateResult = mutation({
  args: {
    id: v.id("testCases"),
    status: v.union(
      v.literal("NOT_EXECUTED"),
      v.literal("PASS"),
      v.literal("FAIL"),
      v.literal("BLOCKED"),
      v.literal("SKIPPED"),
    ),
    actualResult: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      actualResult: args.actualResult,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("testCases") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
