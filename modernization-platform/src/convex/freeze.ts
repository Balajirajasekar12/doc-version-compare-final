import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("freezeRecords")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    version: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const diffs = await ctx.db
      .query("differences")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const unresolvedCritical = diffs.filter(
      (d) =>
        (d.severity === "CRITICAL" || d.severity === "HIGH") &&
        d.status === "OPEN",
    ).length;

    const resolvedDiffs = diffs.filter(
      (d) =>
        d.status === "ACCEPTED" ||
        d.status === "INTENTIONAL" ||
        d.status === "FALSE_POSITIVE",
    ).length;

    const freezeId = await ctx.db.insert("freezeRecords", {
      projectId: args.projectId,
      version: args.version,
      userId: identity?.subject ?? "unknown",
      userName: identity?.name ?? undefined,
      reason: args.reason,
      unresolvedCriticalDiffs: unresolvedCritical,
      totalDiffs: diffs.length,
      resolvedDiffs,
      frozenAt: Date.now(),
    });

    await ctx.db.patch(args.projectId, {
      status: "FROZEN",
      updatedAt: Date.now(),
    });

    return freezeId;
  },
});

export const remove = mutation({
  args: { id: v.id("freezeRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (record) {
      await ctx.db.patch(record.projectId, {
        status: "GAPS_FOUND",
        updatedAt: Date.now(),
      });
    }
    await ctx.db.delete(args.id);
  },
});
