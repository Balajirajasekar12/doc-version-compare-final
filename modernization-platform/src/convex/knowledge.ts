import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeEntries")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const listByCategory = query({
  args: {
    projectId: v.id("projects"),
    category: v.union(
      v.literal("LIFECYCLE_CODE"),
      v.literal("STATUS_CODE"),
      v.literal("DATA_TYPE"),
      v.literal("TABLE_RELATIONSHIP"),
      v.literal("BUSINESS_RULE"),
      v.literal("FIELD_CONSTRAINT"),
      v.literal("ENUM_VALUE"),
      v.literal("OTHER"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeEntries")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("knowledgeEntries")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      total: entries.length,
      fact: entries.filter((e) => e.provenance === "FACT").length,
      observation: entries.filter((e) => e.provenance === "OBSERVATION").length,
      derived: entries.filter((e) => e.provenance === "DERIVED").length,
      userConfirmed: entries.filter((e) => e.provenance === "USER_CONFIRMED").length,
      unknown: entries.filter((e) => e.provenance === "UNKNOWN").length,
      categories: {
        lifecycleCode: entries.filter((e) => e.category === "LIFECYCLE_CODE").length,
        statusCode: entries.filter((e) => e.category === "STATUS_CODE").length,
        dataType: entries.filter((e) => e.category === "DATA_TYPE").length,
        tableRelationship: entries.filter((e) => e.category === "TABLE_RELATIONSHIP").length,
        businessRule: entries.filter((e) => e.category === "BUSINESS_RULE").length,
        fieldConstraint: entries.filter((e) => e.category === "FIELD_CONSTRAINT").length,
        enumValue: entries.filter((e) => e.category === "ENUM_VALUE").length,
      },
    };
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    category: v.union(
      v.literal("LIFECYCLE_CODE"),
      v.literal("STATUS_CODE"),
      v.literal("DATA_TYPE"),
      v.literal("TABLE_RELATIONSHIP"),
      v.literal("BUSINESS_RULE"),
      v.literal("FIELD_CONSTRAINT"),
      v.literal("ENUM_VALUE"),
      v.literal("OTHER"),
    ),
    fieldName: v.string(),
    value: v.string(),
    description: v.string(),
    provenance: v.union(
      v.literal("FACT"),
      v.literal("OBSERVATION"),
      v.literal("DERIVED"),
      v.literal("USER_CONFIRMED"),
      v.literal("UNKNOWN"),
    ),
    sourceDetail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    return await ctx.db.insert("knowledgeEntries", {
      ...args,
      answeredBy: identity?.name ?? identity?.subject,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("knowledgeEntries"),
    fieldName: v.optional(v.string()),
    value: v.optional(v.string()),
    description: v.optional(v.string()),
    provenance: v.optional(v.union(
      v.literal("FACT"),
      v.literal("OBSERVATION"),
      v.literal("DERIVED"),
      v.literal("USER_CONFIRMED"),
      v.literal("UNKNOWN"),
    )),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) filtered[k] = v;
    }
    await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("knowledgeEntries") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
