import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("projects")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", identity.subject))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    domain: v.optional(v.string()),
    owner: v.optional(v.string()),
    environmentNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      description: args.description,
      domain: args.domain,
      owner: args.owner,
      environmentNotes: args.environmentNotes,
      status: "CREATED",
      createdBy: identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    return projectId;
  },
});

export const updateStatus = mutation({
  args: {
    projectId: v.id("projects"),
    status: v.union(
      v.literal("CREATED"),
      v.literal("UPLOADING"),
      v.literal("ANALYZING"),
      v.literal("EVIDENCE_REQUIRED"),
      v.literal("COMPARING"),
      v.literal("GAPS_FOUND"),
      v.literal("FROZEN"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Delete source files
    const files = await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const file of files) {
      await ctx.db.delete(file._id);
    }
    // Delete functional areas
    const areas = await ctx.db
      .query("functionalAreas")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const area of areas) {
      await ctx.db.delete(area._id);
    }
    // Delete differences
    const diffs = await ctx.db
      .query("differences")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const diff of diffs) {
      await ctx.db.delete(diff._id);
    }
    // Delete comparisons
    const comps = await ctx.db
      .query("comparisons")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const comp of comps) {
      await ctx.db.delete(comp._id);
    }
    // Delete analysis jobs
    const jobs = await ctx.db
      .query("analysisJobs")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
    // Delete project
    await ctx.db.delete(args.projectId);
  },
});
