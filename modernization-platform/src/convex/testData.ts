import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("testData")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listByTestCase = query({
  args: { projectId: v.id("projects"), testcaseId: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("testData")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return all.filter((e) => e.testcaseId === args.testcaseId);
  },
});

export const create = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("testData", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("testData") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("testData")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    return {
      total: entries.length,
      linked: entries.filter((e) => e.testcaseId).length,
      unlinked: entries.filter((e) => !e.testcaseId).length,
      bySource: {
        HISTORICAL: entries.filter((e) => e.source === "HISTORICAL").length,
        SCHEMA: entries.filter((e) => e.source === "SCHEMA").length,
        CODE: entries.filter((e) => e.source === "CODE").length,
        USER_CONFIRMED: entries.filter((e) => e.source === "USER_CONFIRMED")
          .length,
        GENERATED: entries.filter((e) => e.source === "GENERATED").length,
      },
    };
  },
});
