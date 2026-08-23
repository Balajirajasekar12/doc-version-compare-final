import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByDifference = query({
  args: { differenceId: v.id("differences") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_differenceId", (q) =>
        q.eq("differenceId", args.differenceId),
      )
      .order("asc")
      .collect();
    return comments;
  },
});

export const create = mutation({
  args: {
    differenceId: v.id("differences"),
    projectId: v.id("projects"),
    author: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("comments", {
      differenceId: args.differenceId,
      projectId: args.projectId,
      author: args.author,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});
