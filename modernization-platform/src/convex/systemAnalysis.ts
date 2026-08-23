/**
 * System-Level Analysis Backend
 *
 * Convex functions for running and querying the
 * system-level modernization analysis.
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ───────────────────────────────────────────────────

/** Get all functionalities for a project */
export const getFunctionalities = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("functionalities")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

/** Get all findings for a project, optionally filtered */
export const getFindings = query({
  args: {
    projectId: v.id("projects"),
    severity: v.optional(v.string()),
    status: v.optional(v.string()),
    functionalityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("findings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId));

    let results = await q.collect();

    if (args.severity) {
      results = results.filter((r) => r.severity === args.severity);
    }
    if (args.status) {
      results = results.filter((r) => r.status === args.status);
    }
    if (args.functionalityId) {
      results = results.filter((r) => r.functionalityId === args.functionalityId);
    }

    // Sort by severity priority
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    results.sort((a, b) =>
      (severityOrder[a.severity as keyof typeof severityOrder] ?? 5) -
      (severityOrder[b.severity as keyof typeof severityOrder] ?? 5),
    );

    return results;
  },
});

/** Get finding summary stats for a project */
export const getFindingStats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const findings = await ctx.db
      .query("findings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const stats = {
      total: findings.length,
      bySeverity: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        INFO: 0,
      },
      byStatus: {
        OPEN: 0,
        REVIEWED: 0,
        ACCEPTED: 0,
        INTENTIONAL: 0,
        FALSE_POSITIVE: 0,
        FIX_REQUIRED: 0,
        NEEDS_INFO: 0,
      },
      byType: {} as Record<string, number>,
      architecturalChanges: 0,
    };

    for (const f of findings) {
      stats.bySeverity[f.severity as keyof typeof stats.bySeverity]++;
      stats.byStatus[f.status as keyof typeof stats.byStatus]++;
      stats.byType[f.findingType] = (stats.byType[f.findingType] || 0) + 1;
      if (f.findingType === "INTENTIONAL_ARCHITECTURAL_CHANGE") {
        stats.architecturalChanges++;
      }
    }

    return stats;
  },
});

/** Get component mappings for a project */
export const getComponentMappings = query({
  args: {
    projectId: v.id("projects"),
    functionalityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("componentMappings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId));

    let results = await q.collect();

    if (args.functionalityId) {
      results = results.filter((r) => r.functionalityId === args.functionalityId);
    }

    return results;
  },
});

/** Get information requests for a project */
export const getInformationRequests = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("informationRequests")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId));

    let results = await q.collect();

    if (args.status) {
      results = results.filter((r) => r.status === args.status);
    }

    return results;
  },
});

/** Get pending information requests count */
export const getPendingInfoCount = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("informationRequests")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    return requests.filter((r) => r.status === "PENDING").length;
  },
});

// ── Mutations ─────────────────────────────────────────────────

/** Save functionality clusters from analysis */
export const saveFunctionalities = mutation({
  args: {
    projectId: v.id("projects"),
    functionalities: v.array(v.object({
      name: v.string(),
      description: v.string(),
      status: v.union(
        v.literal("DISCOVERED"),
        v.literal("MAPPED"),
        v.literal("PARTIALLY_MAPPED"),
        v.literal("UNMAPPED_LEGACY"),
        v.literal("UNMAPPED_MOD"),
        v.literal("CONFIRMED"),
        v.literal("NEEDS_EVIDENCE"),
      ),
      legacyComponentIds: v.array(v.string()),
      modComponentIds: v.array(v.string()),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      clusteringReason: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Delete existing functionalities for this project
    const existing = await ctx.db
      .query("functionalities")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    // Insert new functionalities
    const now = Date.now();
    for (const func of args.functionalities) {
      await ctx.db.insert("functionalities", {
        ...func,
        projectId: args.projectId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { saved: args.functionalities.length };
  },
});

/** Save findings from analysis */
export const saveFindings = mutation({
  args: {
    projectId: v.id("projects"),
    findings: v.array(v.object({
      functionalityId: v.string(),
      findingType: v.string(),
      severity: v.string(),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      title: v.string(),
      description: v.string(),
      legacyEvidence: v.array(v.object({
        fileId: v.string(),
        fileName: v.string(),
        lineStart: v.number(),
        lineEnd: v.number(),
        snippet: v.string(),
      })),
      modEvidence: v.array(v.object({
        fileId: v.string(),
        fileName: v.string(),
        lineStart: v.number(),
        lineEnd: v.number(),
        snippet: v.string(),
      })),
      informationNeeded: v.optional(v.string()),
      businessExplanation: v.optional(v.object({
        legacyBehavior: v.string(),
        modBehavior: v.string(),
        difference: v.string(),
        impact: v.string(),
        possibleImpact: v.string(),
        example: v.optional(v.string()),
        summary: v.string(),
        evidenceLevel: v.union(
          v.literal("PROVEN"), v.literal("STRONG_EVIDENCE"), v.literal("POSSIBLE"),
          v.literal("UNKNOWN"), v.literal("MISSING_INFORMATION"),
        ),
        confidenceExplanation: v.object({
          level: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
          reason: v.string(),
          evidenceStrength: v.string(),
        }),
        businessRules: v.array(v.object({
          id: v.string(),
          ruleNumber: v.number(),
          description: v.string(),
          sourceFile: v.string(),
          lineStart: v.number(),
          lineEnd: v.number(),
          condition: v.optional(v.string()),
          positiveOutcome: v.optional(v.string()),
          failureOutcome: v.optional(v.string()),
          confidence: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
          legacyStatus: v.union(v.literal("IDENTIFIED"), v.literal("CONFIRMED"), v.literal("NOT_FOUND")),
          modStatus: v.union(
            v.literal("NOT_FOUND"), v.literal("IMPLEMENTED"), v.literal("PARTIALLY_IMPLEMENTED"),
            v.literal("INTENTIONALLY_REMOVED"), v.literal("UNKNOWN"),
          ),
        })),
        missingInformation: v.array(v.object({
          id: v.string(),
          whatIsNeeded: v.string(),
          whyNeeded: v.string(),
          suggestedAction: v.string(),
          suggestedQuery: v.optional(v.string()),
          category: v.union(
            v.literal("TABLE_SCHEMA"), v.literal("SAMPLE_DATA"), v.literal("STATUS_CODE_MEANING"),
            v.literal("CLOB_CONTENT"), v.literal("EXTERNAL_RULE"), v.literal("MOD_CLASS"),
            v.literal("MOD_VALIDATION"), v.literal("CLARIFICATION"), v.literal("HISTORY_DATA"),
          ),
        })),
      })),
    })),
  },
  handler: async (ctx, args) => {
    // Delete existing findings for this project
    const existing = await ctx.db
      .query("findings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    const now = Date.now();
    for (const finding of args.findings) {
      await ctx.db.insert("findings", {
        functionalityId: finding.functionalityId,
        findingType: finding.findingType as any,
        severity: finding.severity as any,
        confidence: finding.confidence,
        title: finding.title,
        description: finding.description,
        legacyEvidence: finding.legacyEvidence,
        modEvidence: finding.modEvidence,
        informationNeeded: finding.informationNeeded,
        businessExplanation: finding.businessExplanation as any,
        status: "OPEN" as any,
        projectId: args.projectId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { saved: args.findings.length };
  },
});

/** Save component mappings from analysis */
export const saveComponentMappings = mutation({
  args: {
    projectId: v.id("projects"),
    mappings: v.array(v.object({
      functionalityId: v.string(),
      mappingType: v.string(),
      legacyComponentIds: v.array(v.string()),
      modComponentIds: v.array(v.string()),
      reason: v.string(),
      evidence: v.array(v.string()),
      confidence: v.union(
        v.literal("HIGH"),
        v.literal("MEDIUM"),
        v.literal("LOW"),
      ),
      source: v.union(
        v.literal("AUTO"),
        v.literal("USER_CONFIRMED"),
        v.literal("USER_OVERRIDE"),
      ),
    })),
  },
  handler: async (ctx, args) => {
    // Delete existing mappings
    const existing = await ctx.db
      .query("componentMappings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    const now = Date.now();
    for (const mapping of args.mappings) {
      await ctx.db.insert("componentMappings", {
        ...mapping,
        mappingType: mapping.mappingType as any,
        projectId: args.projectId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { saved: args.mappings.length };
  },
});

/** Save information requests from analysis */
export const saveInformationRequests = mutation({
  args: {
    projectId: v.id("projects"),
    requests: v.array(v.object({
      functionalityId: v.optional(v.string()),
      findingId: v.optional(v.string()),
      type: v.string(),
      title: v.string(),
      description: v.string(),
      whatIsNeeded: v.string(),
      reason: v.string(),
      suggestedQuery: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // Delete existing pending requests
    const existing = await ctx.db
      .query("informationRequests")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const doc of existing) {
      if (doc.status === "PENDING" || doc.status === "GENERATED_QUERY") {
        await ctx.db.delete(doc._id);
      }
    }

    const now = Date.now();
    for (const req of args.requests) {
      await ctx.db.insert("informationRequests", {
        ...req,
        type: req.type as any,
        status: "PENDING" as any,
        projectId: args.projectId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { saved: args.requests.length };
  },
});

/** Update a finding's status */
export const updateFindingStatus = mutation({
  args: {
    findingId: v.id("findings"),
    status: v.union(
      v.literal("OPEN"),
      v.literal("REVIEWED"),
      v.literal("ACCEPTED"),
      v.literal("INTENTIONAL"),
      v.literal("FALSE_POSITIVE"),
      v.literal("FIX_REQUIRED"),
      v.literal("NEEDS_INFO"),
    ),
    developerComment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.findingId, {
      status: args.status,
      developerComment: args.developerComment,
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/** Update an information request with an answer */
export const answerInfoRequest = mutation({
  args: {
    requestId: v.id("informationRequests"),
    answer: v.string(),
    answerDetail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      answer: args.answer,
      answerDetail: args.answerDetail,
      status: "PROVIDED",
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/** Dismiss an information request */
export const dismissInfoRequest = mutation({
  args: {
    requestId: v.id("informationRequests"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: "DISMISSED",
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/** Confirm a component mapping */
export const confirmMapping = mutation({
  args: {
    mappingId: v.id("componentMappings"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mappingId, {
      source: "USER_CONFIRMED",
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});
