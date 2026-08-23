import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("evidenceRequests")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const listOpen = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("evidenceRequests")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return all.filter((r) => r.status === "OPEN");
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("evidenceRequests")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      total: requests.length,
      open: requests.filter((r) => r.status === "OPEN").length,
      answered: requests.filter((r) => r.status === "ANSWERED").length,
      dismissed: requests.filter((r) => r.status === "DISMISSED").length,
    };
  },
});

export const create = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("evidenceRequests", {
      ...args,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const answer = mutation({
  args: {
    id: v.id("evidenceRequests"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.patch(args.id, {
      status: "ANSWERED",
      answer: args.answer,
      answeredBy: identity?.name ?? identity?.subject,
      updatedAt: Date.now(),
    });
  },
});

export const dismiss = mutation({
  args: { id: v.id("evidenceRequests") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "DISMISSED",
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("evidenceRequests") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
