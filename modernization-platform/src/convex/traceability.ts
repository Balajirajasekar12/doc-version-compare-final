import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("traceabilityLinks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const generateLinks = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Clear existing links
    const existing = await ctx.db
      .query("traceabilityLinks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const link of existing) {
      await ctx.db.delete(link._id);
    }

    const rules = await ctx.db
      .query("businessRules")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const testCases = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const now = Date.now();

    for (const rule of rules) {
      const linkedCases = testCases.filter((tc) =>
        tc.ruleIds.includes(rule.ruleId),
      );
      const linkedDiffs = rule.differenceId ? [rule.differenceId] : [];

      await ctx.db.insert("traceabilityLinks", {
        projectId: args.projectId,
        requirement: `${rule.ruleId}: ${rule.description}`,
        requirementSource: rule.source,
        ruleId: rule.ruleId,
        differenceId: rule.differenceId,
        testcaseId: linkedCases.length > 0 ? linkedCases[0].testcaseId : undefined,
        status:
          linkedCases.length > 0
            ? "COVERED"
            : linkedDiffs.length > 0
              ? "PARTIAL"
              : "NOT_COVERED",
        createdAt: now,
      });
    }

    return { generated: rules.length };
  },
});

// Coverage stats
export const getCoverage = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("businessRules")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const testCases = await ctx.db
      .query("testCases")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const scenarios = await ctx.db
      .query("testScenarios")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const diffs = await ctx.db
      .query("differences")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const ruleIds = rules.map((r) => r.ruleId);
    const coveredRuleIds = new Set(
      testCases.flatMap((tc) => tc.ruleIds),
    );

    return {
      rules: {
        total: rules.length,
        covered: ruleIds.filter((id) => coveredRuleIds.has(id)).length,
      },
      scenarios: {
        total: scenarios.length,
        approved: scenarios.filter((s) => s.status === "APPROVED").length,
        excluded: scenarios.filter((s) => s.status === "EXCLUDED").length,
      },
      testCases: {
        total: testCases.length,
        executed: testCases.filter((c) => c.status !== "NOT_EXECUTED").length,
        passed: testCases.filter((c) => c.status === "PASS").length,
        failed: testCases.filter((c) => c.status === "FAIL").length,
      },
      differences: {
        total: diffs.length,
        resolved: diffs.filter(
          (d) =>
            d.status === "ACCEPTED" ||
            d.status === "INTENTIONAL" ||
            d.status === "FALSE_POSITIVE",
        ).length,
        open: diffs.filter((d) => d.status === "OPEN").length,
      },
    };
  },
});
