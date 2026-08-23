import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("functionalAreas")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("functionalAreas") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    jobName: v.optional(v.string()),
    jobCommand: v.optional(v.string()),
    businessIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("functionalAreas", {
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      jobName: args.jobName,
      jobCommand: args.jobCommand,
      businessIdentifier: args.businessIdentifier,
      status: "NOT_STARTED",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("functionalAreas"),
    status: v.union(
      v.literal("NOT_STARTED"),
      v.literal("ANALYZING"),
      v.literal("WAITING_FOR_EVIDENCE"),
      v.literal("GAPS_FOUND"),
      v.literal("READY_TO_COMPARE"),
      v.literal("COMPARED"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("functionalAreas") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
