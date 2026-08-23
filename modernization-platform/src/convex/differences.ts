import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByComparison = query({
  args: { comparisonId: v.id("comparisons") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("differences")
      .withIndex("by_comparisonId", (q) =>
        q.eq("comparisonId", args.comparisonId),
      )
      .collect();
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("differences")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listByCategory = query({
  args: {
    projectId: v.id("projects"),
    category: v.union(
      v.literal("MATCHED"),
      v.literal("MISSING"),
      v.literal("CHANGED"),
      v.literal("REMOVED"),
      v.literal("ADDED"),
      v.literal("UNKNOWN"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("differences")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const diffs = await ctx.db
      .query("differences")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    return {
      total: diffs.length,
      removed: diffs.filter((d) => d.category === "REMOVED").length,
      added: diffs.filter((d) => d.category === "ADDED").length,
      changed: diffs.filter((d) => d.category === "CHANGED").length,
      open: diffs.filter((d) => d.status === "OPEN").length,
      critical: diffs.filter((d) => d.severity === "CRITICAL").length,
      high: diffs.filter((d) => d.severity === "HIGH").length,
    };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("differences"),
    status: v.union(
      v.literal("OPEN"),
      v.literal("REVIEWED"),
      v.literal("ACCEPTED"),
      v.literal("INTENTIONAL"),
      v.literal("FALSE_POSITIVE"),
      v.literal("FIX_REQUIRED"),
    ),
    developerComment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      developerComment: args.developerComment,
      updatedAt: Date.now(),
    });
  },
});
