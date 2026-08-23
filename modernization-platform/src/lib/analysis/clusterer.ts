/**
 * Functionality Clustering Engine
 *
 * Groups extracted components into logical functionality clusters
 * based on shared table references, call relationships, naming
 * patterns, and dependencies.
 */

import type {
  ExtractedComponent,
  DependencyEdge,
  Functionality,
  ComponentMapping,
  MappingType,
} from "./types";

// ── Clustering ────────────────────────────────────────────────

export function clusterFunctionalities(
  legacyComponents: ExtractedComponent[],
  modComponents: ExtractedComponent[],
  legacyEdges: DependencyEdge[],
  modEdges: DependencyEdge[],
): Functionality[] {
  const functionalities: Functionality[] = [];
  let funcIdx = 0;

  // ── Step 1: Build adjacency lists for call chains ──
  const legacyAdj = buildAdjacency(legacyComponents, legacyEdges);
  const modAdj = buildAdjacency(modComponents, modEdges);

  // ── Step 2: Find connected components (groups that call each other) ──
  const legacyGroups = findConnectedComponents(legacyComponents, legacyAdj);
  const modGroups = findConnectedComponents(modComponents, modAdj);

  // ── Step 3: Also group by shared table references ──
  const legacyByTable = groupByTableRefs(legacyComponents);
  const modByTable = groupByTableRefs(modComponents);

  // ── Step 4: Merge call-chain groups with table-reference groups ──
  const legacyClusters = mergeGroupsByOverlap(legacyGroups, legacyByTable);
  const modClusters = mergeGroupsByOverlap(modGroups, modByTable);

  // ── Step 5: Match legacy clusters to MOD clusters via table overlap ──
  const matchedPairs = matchClustersByTableOverlap(legacyClusters, modClusters);

  // Create functionalities for matched pairs
  for (const [legacyIds, modIds] of matchedPairs) {
    const sharedTables = findSharedTables(legacyIds, modIds, legacyComponents, modComponents);
    const name = deriveFunctionalityName(legacyIds, modIds, legacyComponents, modComponents);

    functionalities.push({
      id: `func-${++funcIdx}`,
      projectId: "",
      name,
      description: `Auto-discovered functionality: ${name}. Shared tables: ${sharedTables.join(", ") || "none detected"}.`,
      status: "DISCOVERED",
      legacyComponentIds: legacyIds,
      modComponentIds: modIds,
      confidence: sharedTables.length >= 2 ? "HIGH" : sharedTables.length === 1 ? "MEDIUM" : "LOW",
      clusteringReason: `Clustered by ${sharedTables.length} shared table references and call-chain analysis`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Unmatched legacy clusters
  for (const cluster of legacyClusters) {
    if (matchedPairs.some(([l]) => arrayOverlap(l, cluster))) continue;
    functionalities.push({
      id: `func-${++funcIdx}`,
      projectId: "",
      name: deriveLegacyName(cluster, legacyComponents),
      description: `Legacy-only functionality — no MOD counterpart detected`,
      status: "UNMAPPED_LEGACY",
      legacyComponentIds: cluster,
      modComponentIds: [],
      confidence: "MEDIUM",
      clusteringReason: "No matching MOD components found",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Unmatched MOD clusters
  for (const cluster of modClusters) {
    if (matchedPairs.some(([, m]) => arrayOverlap(m, cluster))) continue;
    functionalities.push({
      id: `func-${++funcIdx}`,
      projectId: "",
      name: deriveModName(cluster, modComponents),
      description: `MOD-only functionality — no legacy counterpart detected`,
      status: "UNMAPPED_MOD",
      legacyComponentIds: [],
      modComponentIds: cluster,
      confidence: "MEDIUM",
      clusteringReason: "No matching legacy components found",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // If no clusters found at all, create a single catch-all
  if (functionalities.length === 0) {
    functionalities.push({
      id: `func-${++funcIdx}`,
      projectId: "",
      name: "General Modernization",
      description: "All files grouped together — no clear separation detected",
      status: "DISCOVERED",
      legacyComponentIds: legacyComponents.map((c) => c.id),
      modComponentIds: modComponents.map((c) => c.id),
      confidence: "LOW",
      clusteringReason: "Catch-all: no distinct clusters discovered",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return functionalities;
}

// ── Semantic Mapping ──────────────────────────────────────────

export function buildSemanticMappings(
  functionalities: Functionality[],
  legacyComponents: ExtractedComponent[],
  modComponents: ExtractedComponent[],
  legacyEdges: DependencyEdge[],
  modEdges: DependencyEdge[],
): ComponentMapping[] {
  const mappings: ComponentMapping[] = [];
  let mapIdx = 0;

  for (const func of functionalities) {
    if (func.legacyComponentIds.length === 0 || func.modComponentIds.length === 0) continue;

    const legComps = legacyComponents.filter((c) => func.legacyComponentIds.includes(c.id));
    const modComps = modComponents.filter((c) => func.modComponentIds.includes(c.id));

    // Match by naming similarity
    const nameMatches = matchByNaming(legComps, modComps);

    // Match by shared table refs
    const tableMatches = matchByTableRefs(legComps, modComps);

    // Match by call-chain structure
    const structMatches = matchByStructure(legComps, modComps, legacyEdges, modEdges);

    // Merge all matches, prioritizing high-confidence ones
    const allMatches = mergeMappings(nameMatches, tableMatches, structMatches);

    for (const match of allMatches) {
      const mappingType = determineMappingType(
        match.legacyIds,
        match.modIds,
        legComps,
        modComps,
      );

      mappings.push({
        id: `map-${++mapIdx}`,
        projectId: "",
        functionalityId: func.id,
        mappingType,
        legacyComponentIds: match.legacyIds,
        modComponentIds: match.modIds,
        reason: match.reason,
        evidence: match.evidence,
        confidence: match.confidence,
        source: "AUTO",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  return mappings;
}

// ── Internal Helpers ──────────────────────────────────────────

function buildAdjacency(
  components: ExtractedComponent[],
  edges: DependencyEdge[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const c of components) {
    adj.set(c.id, []);
  }
  for (const edge of edges) {
    const existing = adj.get(edge.sourceId) || [];
    existing.push(edge.targetId);
    adj.set(edge.sourceId, existing);
  }
  return adj;
}

function findConnectedComponents(
  components: ExtractedComponent[],
  adj: Map<string, string[]>,
): string[][] {
  const visited = new Set<string>();
  const groups: string[][] = [];

  for (const comp of components) {
    if (visited.has(comp.id)) continue;
    const group: string[] = [];
    const queue = [comp.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      group.push(current);
      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    if (group.length > 0) groups.push(group);
  }

  return groups;
}

function groupByTableRefs(components: ExtractedComponent[]): string[][] {
  const tableToComps = new Map<string, Set<string>>();
  for (const comp of components) {
    for (const table of comp.tableRefs) {
      const existing = tableToComps.get(table) || new Set();
      existing.add(comp.id);
      tableToComps.set(table, existing);
    }
  }

  const groups: string[][] = [];
  const used = new Set<string>();

  for (const [table, compIds] of tableToComps) {
    const ids = Array.from(compIds).filter((id) => !used.has(id));
    if (ids.length >= 2) {
      groups.push(ids);
      ids.forEach((id) => used.add(id));
    }
  }

  return groups;
}

function mergeGroupsByOverlap(
  callGroups: string[][],
  tableGroups: string[][],
): string[][] {
  const allGroups = [...callGroups, ...tableGroups];
  if (allGroups.length === 0) return callGroups;

  // Merge overlapping groups
  const merged: string[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < allGroups.length; i++) {
    if (used.has(i)) continue;
    let combined = new Set(allGroups[i]);
    used.add(i);

    for (let j = i + 1; j < allGroups.length; j++) {
      if (used.has(j)) continue;
      const other = new Set(allGroups[j]);
      // Check if they share any elements
      for (const id of combined) {
        if (other.has(id)) {
          // Merge
          other.forEach((id) => combined.add(id));
          used.add(j);
          break;
        }
      }
    }

    merged.push(Array.from(combined));
  }

  return merged;
}

function matchClustersByTableOverlap(
  legacyClusters: string[][],
  modClusters: string[][],
): Array<[string[], string[]]> {
  const pairs: Array<[string[], string[]]> = [];
  const usedMod = new Set<number>();

  for (const legCluster of legacyClusters) {
    let bestMatch = -1;
    let bestOverlap = 0;

    for (let i = 0; i < modClusters.length; i++) {
      if (usedMod.has(i)) continue;
      const overlap = findSharedTableCount(legCluster, modClusters[i]);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = i;
      }
    }

    if (bestMatch >= 0) {
      pairs.push([legCluster, modClusters[bestMatch]]);
      usedMod.add(bestMatch);
    }
  }

  return pairs;
}

function findSharedTableCount(ids1: string[], ids2: string[]): number {
  // This is a simplified version - we compare table refs across both sets
  // In a full implementation, we'd look up actual component table refs
  return 0; // Will be enhanced by the outer function
}

function findSharedTables(
  legacyIds: string[],
  modIds: string[],
  legacyComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): string[] {
  const legTables = new Set<string>();
  const modTables = new Set<string>();

  for (const comp of legacyComps.filter((c) => legacyIds.includes(c.id))) {
    comp.tableRefs.forEach((t) => legTables.add(t.toUpperCase()));
  }
  for (const comp of modComps.filter((c) => modIds.includes(c.id))) {
    comp.tableRefs.forEach((t) => modTables.add(t.toUpperCase()));
  }

  return Array.from(legTables).filter((t) => modTables.has(t));
}

function deriveFunctionalityName(
  legacyIds: string[],
  modIds: string[],
  legacyComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): string {
  // Try to derive name from dominant component naming patterns
  const allNames = [
    ...legacyComps.filter((c) => legacyIds.includes(c.id)).map((c) => c.name),
    ...modComps.filter((c) => modIds.includes(c.id)).map((c) => c.name),
  ];

  // Find common words in names
  const words = new Map<string, number>();
  for (const name of allNames) {
    const parts = name.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").split(/\s+/);
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.length >= 3) {
        words.set(lower, (words.get(lower) || 0) + 1);
      }
    }
  }

  // Get most common words
  const sorted = Array.from(words.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length >= 2) {
    return sorted
      .slice(0, 3)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  if (sorted.length === 1) {
    return sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1);
  }

  return `Functionality ${legacyIds[0]}`;
}

function deriveLegacyName(ids: string[], comps: ExtractedComponent[]): string {
  const names = comps.filter((c) => ids.includes(c.id)).map((c) => c.name);
  if (names.length === 1) return names[0];
  if (names.length > 1) {
    // Find common prefix or keywords
    const first = names[0].replace(/_/g, " ").replace(/([A-Z])/g, " $1");
    return first.substring(0, 40);
  }
  return "Legacy Components";
}

function deriveModName(ids: string[], comps: ExtractedComponent[]): string {
  const names = comps.filter((c) => ids.includes(c.id)).map((c) => c.name);
  if (names.length === 1) return names[0];
  if (names.length > 1) {
    const first = names[0].replace(/([A-Z])/g, " $1");
    return first.substring(0, 40);
  }
  return "MOD Components";
}

function arrayOverlap(a: string[], b: string[]): boolean {
  return a.some((item) => b.includes(item));
}

// ── Mapping Helpers ───────────────────────────────────────────

interface MatchResult {
  legacyIds: string[];
  modIds: string[];
  reason: string;
  evidence: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

function matchByNaming(
  legComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const leg of legComps) {
    const legWords = new Set(
      leg.name
        .replace(/([A-Z])/g, " $1")
        .replace(/[_-]/g, " ")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    );

    for (const mod of modComps) {
      const modWords = new Set(
        mod.name
          .replace(/([A-Z])/g, " $1")
          .replace(/[_-]/g, " ")
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 3),
      );

      const intersection = Array.from(legWords).filter((w) => modWords.has(w));
      const totalWords = new Set([...legWords, ...modWords]).size;
      const similarity = intersection.length / totalWords;

      if (similarity >= 0.3) {
        matches.push({
          legacyIds: [leg.id],
          modIds: [mod.id],
          reason: `Name similarity: shared words [${intersection.join(", ")}]`,
          evidence: [
            `${leg.name} ↔ ${mod.name}`,
            `Shared keywords: ${intersection.join(", ")}`,
          ],
          confidence: similarity >= 0.5 ? "HIGH" : "MEDIUM",
        });
      }
    }
  }

  return matches;
}

function matchByTableRefs(
  legComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): MatchResult[] {
  const matches: MatchResult[] = [];

  // Group legacy components by their table refs
  const legByTable = new Map<string, string[]>();
  for (const comp of legComps) {
    for (const table of comp.tableRefs) {
      const existing = legByTable.get(table) || [];
      if (!existing.includes(comp.id)) existing.push(comp.id);
      legByTable.set(table, existing);
    }
  }

  // Group MOD components by their table refs
  const modByTable = new Map<string, string[]>();
  for (const comp of modComps) {
    for (const table of comp.tableRefs) {
      const existing = modByTable.get(table) || [];
      if (!existing.includes(comp.id)) existing.push(comp.id);
      modByTable.set(table, existing);
    }
  }

  // Find shared tables
  for (const [table, legIds] of legByTable) {
    const modIds = modByTable.get(table);
    if (modIds && modIds.length > 0) {
      matches.push({
        legacyIds: legIds,
        modIds: modIds,
        reason: `Shared table reference: ${table}`,
        evidence: [`Both reference table ${table}`],
        confidence: legIds.length >= 2 && modIds.length >= 2 ? "HIGH" : "MEDIUM",
      });
    }
  }

  return mergeMatchResults(matches);
}

function matchByStructure(
  legComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
  legEdges: DependencyEdge[],
  modEdges: DependencyEdge[],
): MatchResult[] {
  const matches: MatchResult[] = [];

  // Simple structural comparison: both have similar number of components
  // of similar types
  const legTypes = new Map<string, number>();
  const modTypes = new Map<string, number>();

  for (const c of legComps) {
    legTypes.set(c.componentType, (legTypes.get(c.componentType) || 0) + 1);
  }
  for (const c of modComps) {
    modTypes.set(c.componentType, (modTypes.get(c.componentType) || 0) + 1);
  }

  // Check if both sides have job + processor + writer patterns
  const legHasJob = legTypes.has("PACKAGE") || legTypes.has("JOB");
  const modHasJob = modTypes.has("JOB");

  if (legHasJob && modHasJob) {
    matches.push({
      legacyIds: legComps.map((c) => c.id),
      modIds: modComps.map((c) => c.id),
      reason: "Both sides have batch/job-style architecture",
      evidence: ["Similar architectural pattern detected"],
      confidence: "LOW",
    });
  }

  return matches;
}

function mergeMatchResults(matches: MatchResult[]): MatchResult[] {
  // Deduplicate by merging matches with overlapping IDs
  const merged: MatchResult[] = [];
  const used = new Set<number>();

  for (let i = 0; i < matches.length; i++) {
    if (used.has(i)) continue;
    let current = { ...matches[i] };

    for (let j = i + 1; j < matches.length; j++) {
      if (used.has(j)) continue;
      const other = matches[j];

      const legOverlap = current.legacyIds.some((id) => other.legacyIds.includes(id));
      const modOverlap = current.modIds.some((id) => other.modIds.includes(id));

      if (legOverlap || modOverlap) {
        current = {
          legacyIds: [...new Set([...current.legacyIds, ...other.legacyIds])],
          modIds: [...new Set([...current.modIds, ...other.modIds])],
          reason: current.reason + " + " + other.reason,
          evidence: [...current.evidence, ...other.evidence],
          confidence:
            current.confidence === "HIGH" || other.confidence === "HIGH"
              ? "HIGH"
              : "MEDIUM",
        };
        used.add(j);
      }
    }

    merged.push(current);
  }

  return merged;
}

function mergeMappings(
  nameMatches: MatchResult[],
  tableMatches: MatchResult[],
  structMatches: MatchResult[],
): MatchResult[] {
  // Priority: table matches > name matches > structural matches
  const all = [...tableMatches, ...nameMatches, ...structMatches];
  return mergeMatchResults(all);
}

function determineMappingType(
  legacyIds: string[],
  modIds: string[],
  legComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): MappingType {
  if (legacyIds.length === 1 && modIds.length === 1) return "ONE_TO_ONE";
  if (legacyIds.length === 1 && modIds.length > 1) return "ONE_TO_MANY";
  if (legacyIds.length > 1 && modIds.length === 1) return "MANY_TO_ONE";
  if (legacyIds.length > 1 && modIds.length > 1) return "MANY_TO_MANY";

  return "UNMAPPED";
}
