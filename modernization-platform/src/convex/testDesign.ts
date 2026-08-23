import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testScenarios")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const scenarios = await ctx.db
      .query("testScenarios")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      total: scenarios.length,
      positive: scenarios.filter((s) => s.category === "POSITIVE").length,
      negative: scenarios.filter((s) => s.category === "NEGATIVE").length,
      boundary: scenarios.filter((s) => s.category === "BOUNDARY").length,
      errorHandling: scenarios.filter((s) => s.category === "ERROR_HANDLING")
        .length,
      dataCombination: scenarios.filter(
        (s) => s.category === "DATA_COMBINATION",
      ).length,
      endToEnd: scenarios.filter((s) => s.category === "END_TO_END").length,
      approved: scenarios.filter((s) => s.status === "APPROVED").length,
      excluded: scenarios.filter((s) => s.status === "EXCLUDED").length,
    };
  },
});

// Deterministically generate test scenarios from existing differences
export const generateScenarios = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // Check freeze exists
    const freezes = await ctx.db
      .query("freezeRecords")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (freezes.length === 0) {
      throw new Error("Cannot generate test scenarios: MOD version not frozen yet.");
    }

    // Delete existing draft scenarios
    const existing = await ctx.db
      .query("testScenarios")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const s of existing) {
      await ctx.db.delete(s._id);
    }

    const diffs = await ctx.db
      .query("differences")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const rules = await ctx.db
      .query("businessRules")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const scenarios: string[] = [];
    let counter = 0;
    const now = Date.now();

    // Generate scenarios from removed code (MISSING functionality)
    const removedDiffs = diffs.filter((d) => d.category === "REMOVED");
    for (const diff of removedDiffs) {
      counter++;
      const id = `SCN-${String(counter).padStart(3, "0")}`;
      scenarios.push(id);
      await ctx.db.insert("testScenarios", {
        projectId: args.projectId,
        scenarioId: id,
        title: `Verify behavior for removed code: ${diff.description}`,
        description: `Legacy code at lines ${diff.legacyLineStart}-${diff.legacyLineEnd} was not found in MOD. Verify that the business behavior is either intentionally omitted or implemented differently.`,
        category: "NEGATIVE",
        ruleIds: [],
        differenceIds: [diff._id],
        preconditions: ["MOD version is frozen", "Legacy and MOD files uploaded"],
        steps: [
          "Identify the legacy business rule from the source code",
          "Determine if this behavior is still required",
          "Verify MOD implementation or document intentional removal",
        ],
        expectedBehavior: diff.severity === "CRITICAL" || diff.severity === "HIGH"
          ? `CRITICAL: Legacy behavior missing — verify if ${diff.description} is still required`
          : `Verify behavior from ${diff.description} is handled correctly in MOD`,
        priority: diff.severity === "CRITICAL" ? "HIGH" : diff.severity === "HIGH" ? "HIGH" : "MEDIUM",
        status: "DRAFT",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Generate scenarios from changed code
    const changedDiffs = diffs.filter((d) => d.category === "CHANGED");
    for (const diff of changedDiffs) {
      counter++;
      const id = `SCN-${String(counter).padStart(3, "0")}`;
      scenarios.push(id);
      await ctx.db.insert("testScenarios", {
        projectId: args.projectId,
        scenarioId: id,
        title: `Verify changed behavior: ${diff.description}`,
        description: `Code changed between legacy (lines ${diff.legacyLineStart}-${diff.legacyLineEnd}) and MOD (lines ${diff.modLineStart}-${diff.modLineEnd}). Verify the new behavior matches the expected business outcome.`,
        category: "REGRESSION",
        ruleIds: [],
        differenceIds: [diff._id],
        preconditions: ["MOD version is frozen"],
        steps: [
          "Compare legacy and MOD implementations",
          "Identify the business rule difference",
          "Verify MOD output matches expected behavior",
          "Test with valid and invalid inputs",
        ],
        expectedBehavior: `MOD implementation of ${diff.description} should produce the same business outcome as legacy`,
        priority: diff.severity === "HIGH" ? "HIGH" : "MEDIUM",
        status: "DRAFT",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Generate positive scenarios from rules
    for (const rule of rules) {
      if (rule.status === "CONFIRMED" || rule.status === "IN_MOD") {
        counter++;
        const id = `SCN-${String(counter).padStart(3, "0")}`;
        scenarios.push(id);
        await ctx.db.insert("testScenarios", {
          projectId: args.projectId,
          scenarioId: id,
          title: `Positive: ${rule.description}`,
          description: `Verify that rule ${rule.ruleId} works correctly: ${rule.description}`,
          category: "POSITIVE",
          ruleIds: [rule.ruleId],
          differenceIds: rule.differenceId ? [rule.differenceId] : [],
          preconditions: ["MOD version is frozen", "Test data available"],
          steps: [
            "Prepare input data that satisfies the rule condition",
            "Execute the functionality",
            "Verify the positive outcome",
          ],
          expectedBehavior: rule.positiveOutcome || `Rule ${rule.ruleId} should produce the expected positive result`,
          priority: "HIGH",
          status: "DRAFT",
          createdAt: now,
          updatedAt: now,
        });

        // Negative scenario for the same rule
        counter++;
        const negId = `SCN-${String(counter).padStart(3, "0")}`;
        scenarios.push(negId);
        await ctx.db.insert("testScenarios", {
          projectId: args.projectId,
          scenarioId: negId,
          title: `Negative: ${rule.description}`,
          description: `Verify that rule ${rule.ruleId} correctly rejects invalid input`,
          category: "NEGATIVE",
          ruleIds: [rule.ruleId],
          differenceIds: rule.differenceId ? [rule.differenceId] : [],
          preconditions: ["MOD version is frozen"],
          steps: [
            "Prepare input data that violates the rule condition",
            "Execute the functionality",
            "Verify the rejection/error behavior",
          ],
          expectedBehavior: rule.failureOutcome || `Rule ${rule.ruleId} should reject invalid input`,
          priority: "HIGH",
          status: "DRAFT",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return { generated: scenarios.length, scenarios };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("testScenarios"),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("REVIEWED"),
      v.literal("APPROVED"),
      v.literal("EXCLUDED"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("testScenarios") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
