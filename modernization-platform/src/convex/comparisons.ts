import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comparisons")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("comparisons") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.id);
    if (!comp) return null;
    const legacyFile = await ctx.db.get(comp.legacyFileId);
    const modFile = await ctx.db.get(comp.modFileId);
    return { ...comp, legacyFile, modFile };
  },
});

// Deterministic line-by-line diff
function computeDiff(
  legacyContent: string,
  modContent: string,
): {
  lines: Array<{
    type: "same" | "added" | "removed" | "changed";
    legacyLine: number | null;
    modLine: number | null;
    legacyText: string;
    modText: string;
  }>;
  matchCount: number;
  diffCount: number;
} {
  const legacyLines = legacyContent.split("\n");
  const modLines = modContent.split("\n");
  const lines: Array<{
    type: "same" | "added" | "removed" | "changed";
    legacyLine: number | null;
    modLine: number | null;
    legacyText: string;
    modText: string;
  }> = [];

  let li = 0;
  let mi = 0;
  let matchCount = 0;
  let diffCount = 0;

  while (li < legacyLines.length || mi < modLines.length) {
    if (li < legacyLines.length && mi < modLines.length) {
      const legacyTrim = legacyLines[li].trim();
      const modTrim = modLines[mi].trim();

      if (legacyTrim === modTrim) {
        lines.push({
          type: "same",
          legacyLine: li + 1,
          modLine: mi + 1,
          legacyText: legacyLines[li],
          modText: modLines[mi],
        });
        matchCount++;
        li++;
        mi++;
      } else {
        // Look ahead to find next match
        let foundInMod = -1;
        let foundInLegacy = -1;
        const lookAhead = Math.min(
          5,
          Math.max(modLines.length - mi, legacyLines.length - li),
        );

        for (let j = 1; j <= lookAhead; j++) {
          if (mi + j < modLines.length && modLines[mi + j].trim() === legacyLines[li].trim()) {
            foundInMod = j;
            break;
          }
        }
        for (let j = 1; j <= lookAhead; j++) {
          if (li + j < legacyLines.length && legacyLines[li + j].trim() === modLines[mi].trim()) {
            foundInLegacy = j;
            break;
          }
        }

        if (foundInMod > 0 && (foundInLegacy < 0 || foundInMod <= foundInLegacy)) {
          // Lines were added in MOD
          for (let j = 0; j < foundInMod; j++) {
            lines.push({
              type: "added",
              legacyLine: null,
              modLine: mi + 1,
              legacyText: "",
              modText: modLines[mi],
            });
            diffCount++;
            mi++;
          }
        } else if (foundInLegacy > 0) {
          // Lines were removed from legacy
          for (let j = 0; j < foundInLegacy; j++) {
            lines.push({
              type: "removed",
              legacyLine: li + 1,
              modLine: null,
              legacyText: legacyLines[li],
              modText: "",
            });
            diffCount++;
            li++;
          }
        } else {
          // Changed
          lines.push({
            type: "changed",
            legacyLine: li + 1,
            modLine: mi + 1,
            legacyText: legacyLines[li],
            modText: modLines[mi],
          });
          diffCount++;
          li++;
          mi++;
        }
      }
    } else if (li < legacyLines.length) {
      lines.push({
        type: "removed",
        legacyLine: li + 1,
        modLine: null,
        legacyText: legacyLines[li],
        modText: "",
      });
      diffCount++;
      li++;
    } else {
      lines.push({
        type: "added",
        legacyLine: null,
        modLine: mi + 1,
        legacyText: "",
        modText: modLines[mi],
      });
      diffCount++;
      mi++;
    }
  }

  return { lines, matchCount, diffCount };
}

type DiffEntry = {
  legacyLineStart: number;
  legacyLineEnd: number;
  modLineStart: number;
  modLineEnd: number;
  legacySnippet: string;
  modSnippet: string;
  category: "REMOVED" | "ADDED" | "CHANGED";
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN";
};

function identifyDifferences(
  diffResult: ReturnType<typeof computeDiff>,
): DiffEntry[] {
  const differences: DiffEntry[] = [];
  let current: DiffEntry | null = null;

  for (const line of diffResult.lines) {
    if (line.type === "same") {
      if (current) {
        differences.push(current);
        current = null;
      }
      continue;
    }

    if (!current) {
      const category: DiffEntry["category"] =
        line.type === "added"
          ? "ADDED"
          : line.type === "removed"
            ? "REMOVED"
            : "CHANGED";
      current = {
        legacyLineStart: line.legacyLine ?? 0,
        legacyLineEnd: line.legacyLine ?? 0,
        modLineStart: line.modLine ?? 0,
        modLineEnd: line.modLine ?? 0,
        legacySnippet: line.legacyText,
        modSnippet: line.modText,
        category,
        severity: "MEDIUM",
        description: "",
        confidence: "HIGH",
        status: "OPEN",
      };
    } else {
      if (line.legacyLine) current.legacyLineEnd = line.legacyLine;
      if (line.modLine) current.modLineEnd = line.modLine;
      current.legacySnippet += "\n" + line.legacyText;
      current.modSnippet += "\n" + line.modText;
    }
  }

  if (current) {
    differences.push(current);
  }

  return differences.map((d) => {
    const severity: "HIGH" | "MEDIUM" | "LOW" =
      d.category === "REMOVED"
        ? "HIGH"
        : d.category === "ADDED"
          ? "LOW"
          : "MEDIUM";
    return {
      ...d,
      severity,
      description:
        d.category === "REMOVED"
          ? `Code present in legacy (lines ${d.legacyLineStart}-${d.legacyLineEnd}) but missing in MOD`
          : d.category === "ADDED"
            ? `New code in MOD (lines ${d.modLineStart}-${d.modLineEnd}) not present in legacy`
            : `Code changed between legacy (lines ${d.legacyLineStart}-${d.legacyLineEnd}) and MOD (lines ${d.modLineStart}-${d.modLineEnd})`,
    };
  });
}

export const runComparison = mutation({
  args: {
    projectId: v.id("projects"),
    legacyFileId: v.id("sourceFiles"),
    modFileId: v.id("sourceFiles"),
  },
  handler: async (ctx, args) => {
    const legacyFile = await ctx.db.get(args.legacyFileId);
    const modFile = await ctx.db.get(args.modFileId);
    if (!legacyFile || !modFile) throw new Error("Files not found");

    const diffResult = computeDiff(legacyFile.content, modFile.content);
    const total = diffResult.matchCount + diffResult.diffCount;
    const similarity = total > 0 ? diffResult.matchCount / total : 0;

    const comparisonId = await ctx.db.insert("comparisons", {
      projectId: args.projectId,
      legacyFileId: args.legacyFileId,
      modFileId: args.modFileId,
      status: "COMPLETED",
      summary: `${diffResult.matchCount} matching lines, ${diffResult.diffCount} differences`,
      matchCount: diffResult.matchCount,
      diffCount: diffResult.diffCount,
      similarity: Math.round(similarity * 100) / 100,
      createdAt: Date.now(),
    });

    // Identify individual differences
    const diffs = identifyDifferences(diffResult);

    for (const diff of diffs) {
      await ctx.db.insert("differences", {
        comparisonId,
        projectId: args.projectId,
        legacyFileId: args.legacyFileId,
        modFileId: args.modFileId,
        legacyLineStart: diff.legacyLineStart,
        legacyLineEnd: diff.legacyLineEnd,
        modLineStart: diff.modLineStart,
        modLineEnd: diff.modLineEnd,
        legacySnippet: diff.legacySnippet,
        modSnippet: diff.modSnippet,
        category: diff.category,
        severity: diff.severity,
        description: diff.description,
        confidence: diff.confidence,
        status: diff.status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return { comparisonId, diffCount: diffs.length };
  },
});

export const remove = mutation({
  args: { id: v.id("comparisons") },
  handler: async (ctx, args) => {
    // Delete associated differences
    const diffs = await ctx.db
      .query("differences")
      .withIndex("by_comparisonId", (q) => q.eq("comparisonId", args.id))
      .collect();
    for (const diff of diffs) {
      await ctx.db.delete(diff._id);
    }
    await ctx.db.delete(args.id);
  },
});
