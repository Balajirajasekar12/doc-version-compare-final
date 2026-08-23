import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ─── Queries ─────────────────────────────────────────────

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    sourceType: v.optional(v.union(v.literal("LEGACY"), v.literal("MOD"))),
  },
  handler: async (ctx, args) => {
    if (args.sourceType) {
      return await ctx.db
        .query("sourceFiles")
        .withIndex("by_projectId_sourceType", (q) =>
          q.eq("projectId", args.projectId).eq("sourceType", args.sourceType!),
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const listByFunctionalArea = query({
  args: { functionalAreaId: v.id("functionalAreas") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sourceFiles")
      .withIndex("by_functionalAreaId", (q) =>
        q.eq("functionalAreaId", args.functionalAreaId),
      )
      .collect();
  },
});

export const get = query({
  args: { id: v.id("sourceFiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const legacyFiles = files.filter((f) => f.sourceType === "LEGACY" && !f.superseded);
    const modFiles = files.filter((f) => f.sourceType === "MOD" && !f.superseded);
    const languages = new Set(files.filter((f) => !f.superseded).map((f) => f.language).filter(Boolean));
    const totalSize = files.filter((f) => !f.superseded).reduce((sum, f) => sum + f.size, 0);

    // Count batches
    const legacyBatchIds = new Set(legacyFiles.map((f) => f.uploadBatchId).filter(Boolean));
    const modBatchIds = new Set(modFiles.map((f) => f.uploadBatchId).filter(Boolean));

    return {
      total: legacyFiles.length + modFiles.length,
      legacy: legacyFiles.length,
      mod: modFiles.length,
      languages: Array.from(languages),
      totalSize,
      legacyBatches: legacyBatchIds.size,
      modBatches: modBatchIds.size,
      legacyLanguages: countByLanguage(legacyFiles),
      modLanguages: countByLanguage(modFiles),
    };
  },
});

function countByLanguage(files: Array<{ language?: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const lang = f.language || "Unknown";
    counts[lang] = (counts[lang] || 0) + 1;
  }
  return counts;
}

// ─── Upload Batches ──────────────────────────────────────

export const listBatches = query({
  args: {
    projectId: v.id("projects"),
    sourceType: v.optional(v.union(v.literal("LEGACY"), v.literal("MOD"))),
  },
  handler: async (ctx, args) => {
    if (args.sourceType) {
      return await ctx.db
        .query("uploadBatches")
        .withIndex("by_projectId_sourceType", (q) =>
          q.eq("projectId", args.projectId).eq("sourceType", args.sourceType!),
        )
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("uploadBatches")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

// ─── Snapshots ───────────────────────────────────────────

export const createSnapshot = mutation({
  args: {
    projectId: v.id("projects"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get existing snapshot count
    const existing = await ctx.db
      .query("sourceSnapshots")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const legacyFiles = await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId_sourceType", (q) =>
        q.eq("projectId", args.projectId).eq("sourceType", "LEGACY"),
      )
      .collect();

    const modFiles = await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId_sourceType", (q) =>
        q.eq("projectId", args.projectId).eq("sourceType", "MOD"),
      )
      .collect();

    const activeLegacy = legacyFiles.filter((f) => !f.superseded);
    const activeMod = modFiles.filter((f) => !f.superseded);

    return await ctx.db.insert("sourceSnapshots", {
      projectId: args.projectId,
      snapshotNumber: existing.length + 1,
      legacyFileCount: activeLegacy.length,
      modFileCount: activeMod.length,
      legacyFileIds: activeLegacy.map((f) => f._id),
      modFileIds: activeMod.map((f) => f._id),
      label: args.label,
      createdAt: now,
    });
  },
});

export const listSnapshots = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sourceSnapshots")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

// ─── Additive Upload with Versioning ─────────────────────

export const createBatch = mutation({
  args: {
    projectId: v.id("projects"),
    sourceType: v.union(v.literal("LEGACY"), v.literal("MOD")),
    originName: v.string(),
    originType: v.union(v.literal("ZIP"), v.literal("FILES")),
    uploadedBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Get next batch number
    const existing = await ctx.db
      .query("uploadBatches")
      .withIndex("by_projectId_sourceType", (q) =>
        q.eq("projectId", args.projectId).eq("sourceType", args.sourceType),
      )
      .collect();

    const now = Date.now();
    return await ctx.db.insert("uploadBatches", {
      projectId: args.projectId,
      sourceType: args.sourceType,
      batchNumber: existing.length + 1,
      originName: args.originName,
      originType: args.originType,
      fileCount: 0,
      newFiles: 0,
      duplicateSkipped: 0,
      modifiedVersions: 0,
      errors: 0,
      status: "UPLOADING",
      uploadedBy: args.uploadedBy,
      createdAt: now,
    });
  },
});

export const updateBatchStatus = mutation({
  args: {
    batchId: v.id("uploadBatches"),
    status: v.union(
      v.literal("UPLOADING"),
      v.literal("EXTRACTING"),
      v.literal("PROCESSING"),
      v.literal("COMPLETED"),
      v.literal("ERROR"),
    ),
    fileCount: v.optional(v.number()),
    newFiles: v.optional(v.number()),
    duplicateSkipped: v.optional(v.number()),
    modifiedVersions: v.optional(v.number()),
    errors: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.fileCount !== undefined) patch.fileCount = args.fileCount;
    if (args.newFiles !== undefined) patch.newFiles = args.newFiles;
    if (args.duplicateSkipped !== undefined) patch.duplicateSkipped = args.duplicateSkipped;
    if (args.modifiedVersions !== undefined) patch.modifiedVersions = args.modifiedVersions;
    if (args.errors !== undefined) patch.errors = args.errors;
    if (args.status === "COMPLETED" || args.status === "ERROR") {
      patch.completedAt = Date.now();
    }
    await ctx.db.patch(args.batchId, patch);
  },
});

/**
 * Additive file upload with deduplication and versioning.
 *
 * Identity = projectId + sourceType + filePath (relative path).
 * Content identity = sha256.
 *
 * - Same path + same hash → duplicate (skip)
 * - Same path + different hash → new version (supersede old, create new)
 * - New path → new file
 */
export const addFile = mutation({
  args: {
    projectId: v.id("projects"),
    functionalAreaId: v.optional(v.id("functionalAreas")),
    uploadBatchId: v.optional(v.id("uploadBatches")),
    fileName: v.string(),
    filePath: v.string(),
    fileType: v.string(),
    sourceType: v.union(v.literal("LEGACY"), v.literal("MOD")),
    size: v.number(),
    sha256: v.string(),
    language: v.optional(v.string()),
    content: v.string(),
    lineCount: v.number(),
    analysisResult: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find existing file with same identity (projectId + sourceType + filePath)
    const existingByPath = await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId_sourceType", (q) =>
        q.eq("projectId", args.projectId).eq("sourceType", args.sourceType),
      )
      .collect();

    const match = existingByPath.find(
      (f) => f.filePath === args.filePath && !f.superseded,
    );

    if (match) {
      if (match.sha256 === args.sha256) {
        // Exact duplicate — same path, same content. Skip.
        return { result: "duplicate" as const, fileId: match._id };
      }

      // Same path, different content — new version.
      // Supersede the old version.
      await ctx.db.patch(match._id, { superseded: true });

      const newVersion = match.version + 1;
      const newFileId = await ctx.db.insert("sourceFiles", {
        projectId: args.projectId,
        functionalAreaId: args.functionalAreaId,
        uploadBatchId: args.uploadBatchId,
        fileName: args.fileName,
        filePath: args.filePath,
        fileType: args.fileType,
        sourceType: args.sourceType,
        size: args.size,
        sha256: args.sha256,
        language: args.language,
        content: args.content,
        lineCount: args.lineCount,
        status: args.analysisResult ? "ANALYZED" : "UPLOADED",
        analysisResult: args.analysisResult,
        uploadedAt: now,
        version: newVersion,
        previousVersionId: match._id,
        superseded: false,
      });

      return { result: "new_version" as const, fileId: newFileId, previousVersionId: match._id };
    }

    // New file — no match by path. Insert as version 1.
    const newFileId = await ctx.db.insert("sourceFiles", {
      projectId: args.projectId,
      functionalAreaId: args.functionalAreaId,
      uploadBatchId: args.uploadBatchId,
      fileName: args.fileName,
      filePath: args.filePath,
      fileType: args.fileType,
      sourceType: args.sourceType,
      size: args.size,
      sha256: args.sha256,
      language: args.language,
      content: args.content,
      lineCount: args.lineCount,
      status: args.analysisResult ? "ANALYZED" : "UPLOADED",
      analysisResult: args.analysisResult,
      uploadedAt: now,
      version: 1,
      superseded: false,
    });

    return { result: "new" as const, fileId: newFileId };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("sourceFiles"),
    status: v.union(
      v.literal("UPLOADED"),
      v.literal("ANALYZING"),
      v.literal("ANALYZED"),
      v.literal("ERROR"),
    ),
    analysisResult: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      analysisResult: args.analysisResult,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("sourceFiles") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const removeBatch = mutation({
  args: { batchId: v.id("uploadBatches") },
  handler: async (ctx, args) => {
    // Mark all files in this batch as superseded rather than deleting them
    const files = await ctx.db
      .query("sourceFiles")
      .withIndex("by_uploadBatchId", (q) => q.eq("uploadBatchId", args.batchId))
      .collect();

    for (const file of files) {
      await ctx.db.patch(file._id, { superseded: true });
    }

    await ctx.db.delete(args.batchId);
  },
});

/**
 * Create a source snapshot for analysis reproducibility.
 */
export const takeSnapshot = mutation({
  args: {
    projectId: v.id("projects"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("sourceSnapshots")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const legacyFiles = await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId_sourceType", (q) =>
        q.eq("projectId", args.projectId).eq("sourceType", "LEGACY"),
      )
      .collect();

    const modFiles = await ctx.db
      .query("sourceFiles")
      .withIndex("by_projectId_sourceType", (q) =>
        q.eq("projectId", args.projectId).eq("sourceType", "MOD"),
      )
      .collect();

    const activeLegacy = legacyFiles.filter((f) => !f.superseded);
    const activeMod = modFiles.filter((f) => !f.superseded);

    return await ctx.db.insert("sourceSnapshots", {
      projectId: args.projectId,
      snapshotNumber: existing.length + 1,
      legacyFileCount: activeLegacy.length,
      modFileCount: activeMod.length,
      legacyFileIds: activeLegacy.map((f) => f._id),
      modFileIds: activeMod.map((f) => f._id),
      label: args.label || `Snapshot #${existing.length + 1}`,
      createdAt: now,
    });
  },
});
