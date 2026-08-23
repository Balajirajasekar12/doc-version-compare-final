import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("businessRules")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("businessRules")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      total: rules.length,
      identified: rules.filter((r) => r.status === "IDENTIFIED").length,
      confirmed: rules.filter((r) => r.status === "CONFIRMED").length,
      inMod: rules.filter((r) => r.status === "IN_MOD").length,
      missingInMod: rules.filter((r) => r.status === "MISSING_IN_MOD").length,
      unknown: rules.filter((r) => r.status === "UNKNOWN").length,
    };
  },
});

export const create = mutation({
  args: {
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
    differenceId: v.optional(v.id("differences")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("businessRules", {
      ...args,
      status: "IDENTIFIED",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("businessRules"),
    status: v.union(
      v.literal("IDENTIFIED"),
      v.literal("CONFIRMED"),
      v.literal("IN_MOD"),
      v.literal("MISSING_IN_MOD"),
      v.literal("INTENTIONAL_CHANGE"),
      v.literal("UNKNOWN"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("businessRules") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
