/**
 * Behavior Comparison Engine
 *
 * Compares Legacy and MOD behavior graphs to produce findings.
 * Classifies differences as functional gaps, architectural changes,
 * or user-required information requests.
 */

import type {
  ExtractedComponent,
  DependencyEdge,
  BehaviorGraph,
  BehaviorNode,
  BehaviorEdge,
  Finding,
  FindingType,
  InformationRequest,
  Functionality,
  ComponentMapping,
} from "./types";

// ── Behavior Graph Builder ────────────────────────────────────

export function buildBehaviorGraph(
  components: ExtractedComponent[],
  depEdges: DependencyEdge[],
  side: "LEGACY" | "MOD",
): BehaviorGraph {
  const nodes: BehaviorNode[] = [];
  const behaviorEdges: BehaviorEdge[] = [];
  let nodeIdx = 0;

  for (const comp of components) {
    // Create a node for each significant component
    if (
      ["PACKAGE", "PROCEDURE", "FUNCTION", "JOB", "STEP", "SERVICE",
       "PROCESSOR", "WRITER", "READER", "SHELL_FUNCTION", "CLASS",
       "BEAN", "TRIGGER", "REPOSITORY"].includes(comp.componentType)
    ) {
      const nodeType = classifyBehaviorNodeType(comp, side);
      const evidence = [{
        fileId: comp.fileId,
        fileName: comp.fileName,
        lineStart: comp.lineStart,
        lineEnd: comp.lineEnd,
      }];

      nodes.push({
        id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
        side,
        type: nodeType,
        label: comp.name,
        detail: describeComponent(comp, side),
        evidence,
        componentIds: [comp.id],
      });

      // Add condition/rule nodes from extracted conditions
      for (const condition of comp.conditions.slice(0, 5)) {
        nodes.push({
          id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
          side,
          type: "CONDITION",
          label: condition.substring(0, 60),
          detail: condition,
          evidence,
          componentIds: [comp.id],
        });
      }

      // Add status code nodes
      for (const code of comp.statusCodes.slice(0, 5)) {
        nodes.push({
          id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
          side,
          type: "STATUS_CHANGE",
          label: `Status: ${code}`,
          detail: `Status/lifecycle code ${code} referenced in ${comp.name}`,
          evidence,
          componentIds: [comp.id],
        });
      }

      // Add external dependency nodes (rule tables, CLOBs)
      for (const dep of comp.externalDeps.slice(0, 3)) {
        nodes.push({
          id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
          side,
          type: "EXTERNAL_CALL",
          label: dep,
          detail: `External dependency ${dep} referenced in ${comp.name}`,
          evidence,
          componentIds: [comp.id],
        });
      }

      // Add database effect nodes from SQL snippets
      for (const sql of comp.sqlSnippets.slice(0, 3)) {
        nodes.push({
          id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
          side,
          type: "DATABASE_EFFECT",
          label: sql.substring(0, 60),
          detail: sql,
          evidence,
          componentIds: [comp.id],
        });
      }

      // Add input/output nodes
      for (const inp of comp.inputs.slice(0, 3)) {
        nodes.push({
          id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
          side,
          type: "INPUT",
          label: `Input: ${inp}`,
          detail: `Input parameter ${inp}`,
          evidence,
          componentIds: [comp.id],
        });
      }

      for (const out of comp.outputs.slice(0, 3)) {
        nodes.push({
          id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
          side,
          type: "OUTPUT",
          label: `Output: ${out}`,
          detail: `Output / target ${out}`,
          evidence,
          componentIds: [comp.id],
        });
      }

      // Add rule reference nodes
      for (const ref of comp.ruleRefs.slice(0, 3)) {
        nodes.push({
          id: `bnode-${side.toLowerCase()}-${++nodeIdx}`,
          side,
          type: "BUSINESS_RULE",
          label: `Rule: ${ref}`,
          detail: `External business rule reference ${ref} in ${comp.name}`,
          evidence,
          componentIds: [comp.id],
        });
      }
    }
  }

  // Build edges from dependency edges
  for (const depEdge of depEdges) {
    const sourceNode = nodes.find((n) => n.componentIds.includes(depEdge.sourceId));
    const targetComp = components.find((c) => c.id === depEdge.targetId);
    const targetNode = targetComp
      ? nodes.find((n) => n.componentIds.includes(depEdge.targetId))
      : undefined;

    if (sourceNode) {
      if (targetNode) {
        behaviorEdges.push({
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          label: `${depEdge.edgeType}: ${depEdge.evidence}`,
        });
      }
    }
  }

  return { side, nodes, edges: behaviorEdges };
}

// ── Behavior Comparison ───────────────────────────────────────

export function compareBehaviorGraphs(
  legacyGraph: BehaviorGraph,
  modGraph: BehaviorGraph,
  legacyComponents: ExtractedComponent[],
  modComponents: ExtractedComponent[],
  functionalities: Functionality[],
  projectId: string,
): { findings: Finding[]; infoRequests: InformationRequest[] } {
  const findings: Finding[] = [];
  const infoRequests: InformationRequest[] = [];
  let findIdx = 0;

  for (const func of functionalities) {
    const legNodes = legacyGraph.nodes.filter((n) =>
      n.componentIds.some((cid) => func.legacyComponentIds.includes(cid)),
    );
    const modNodes = modGraph.nodes.filter((n) =>
      n.componentIds.some((cid) => func.modComponentIds.includes(cid)),
    );

    // 1. Find conditions in Legacy but not in MOD
    const legConditions = legNodes.filter((n) => n.type === "CONDITION");
    const modConditions = modNodes.filter((n) => n.type === "CONDITION");

    for (const legCond of legConditions) {
      const similarMod = modConditions.find((mc) =>
        semanticSimilarity(legCond.detail, mc.detail) > 0.4,
      );

      if (!similarMod) {
        findings.push({
          id: `find-${projectId}-${++findIdx}`,
          projectId,
          functionalityId: func.id,
          findingType: "MISSING_VALIDATION",
          severity: "HIGH",
          confidence: "MEDIUM",
          title: `Validation condition missing in MOD`,
          description: `Legacy validates "${legCond.detail}" but this validation was not found in the MOD implementation.`,
          legacyEvidence: legCond.evidence.map((e) => ({
            ...e, snippet: legCond.detail,
          })),
          modEvidence: [],
          status: "OPEN",
          informationNeeded: "Verify if this validation was intentionally removed or is a regression.",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // 2. Find status codes in Legacy but not in MOD
    const legStatuses = legNodes.filter((n) => n.type === "STATUS_CHANGE");
    const modStatuses = modNodes.filter((n) => n.type === "STATUS_CHANGE");

    const legStatusLabels = new Set(legStatuses.map((n) => n.label));
    const modStatusLabels = new Set(modStatuses.map((n) => n.label));

    for (const legStatus of legStatusLabels) {
      if (!modStatusLabels.has(legStatus)) {
        const srcNode = legStatuses.find((n) => n.label === legStatus)!;
        findings.push({
          id: `find-${projectId}-${++findIdx}`,
          projectId,
          functionalityId: func.id,
          findingType: "CHANGED_STATUS_CODE",
          severity: "MEDIUM",
          confidence: "MEDIUM",
          title: `Status code ${legStatus.replace("Status: ", "")} not found in MOD`,
          description: `Legacy uses status code "${legStatus.replace("Status: ", "")}" but this code was not found in the MOD implementation.`,
          legacyEvidence: srcNode.evidence.map((e) => ({
            ...e, snippet: srcNode.detail,
          })),
          modEvidence: [],
          status: "OPEN",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // 3. Find external dependencies (rules/CLOBs) in Legacy
    const legExternal = legNodes.filter((n) => n.type === "EXTERNAL_CALL");
    const modExternal = modNodes.filter((n) => n.type === "EXTERNAL_CALL");

    for (const ext of legExternal) {
      const similarMod = modExternal.find((me) =>
        me.label.toLowerCase() === ext.label.toLowerCase(),
      );

      if (!similarMod) {
        findings.push({
          id: `find-${projectId}-${++findIdx}`,
          projectId,
          functionalityId: func.id,
          findingType: "MISSING_EXTERNAL_RULE",
          severity: "HIGH",
          confidence: "HIGH",
          title: `External dependency "${ext.label}" not referenced in MOD`,
          description: `Legacy depends on external resource "${ext.label}" but the MOD implementation does not reference it. This may indicate missing functionality or an architectural change.`,
          legacyEvidence: ext.evidence.map((e) => ({
            ...e, snippet: ext.detail,
          })),
          modEvidence: [],
          status: "OPEN",
          informationNeeded: `Verify what "${ext.label}" contains and how it should be handled in the modernized system.`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        // Create info request
        infoRequests.push({
          id: `ireq-${projectId}-${infoRequests.length + 1}`,
          projectId,
          functionalityId: func.id,
          findingId: findings[findings.length - 1].id,
          type: "MISSING_EXTERNAL_RULE",
          title: `External resource "${ext.label}" requires mapping`,
          description: `The Legacy code references "${ext.label}" but the MOD implementation does not. We need to understand what this resource contains.`,
          whatIsNeeded: `Definition and content of "${ext.label}"`,
          reason: `To determine if the MOD implementation is missing business logic that depends on this resource`,
          suggestedQuery: `SELECT * FROM ${ext.label} WHERE ROWNUM <= 100`,
          status: "PENDING",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // 4. Find business rules in Legacy but not in MOD
    const legRules = legNodes.filter((n) => n.type === "BUSINESS_RULE");
    const modRules = modNodes.filter((n) => n.type === "BUSINESS_RULE");

    const legRuleLabels = new Set(legRules.map((n) => n.label));
    const modRuleLabels = new Set(modRules.map((n) => n.label));

    for (const rule of legRuleLabels) {
      if (!modRuleLabels.has(rule)) {
        const srcNode = legRules.find((n) => n.label === rule)!;
        findings.push({
          id: `find-${projectId}-${++findIdx}`,
          projectId,
          functionalityId: func.id,
          findingType: "MISSING_EXTERNAL_RULE",
          severity: "HIGH",
          confidence: "MEDIUM",
          title: `Business rule ${rule} not consumed in MOD`,
          description: `Legacy references business rule ${rule} but the MOD implementation does not appear to consume it.`,
          legacyEvidence: srcNode.evidence.map((e) => ({
            ...e, snippet: srcNode.detail,
          })),
          modEvidence: [],
          status: "OPEN",
          informationNeeded: `Confirm whether ${rule} should be applied in the MOD implementation.`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // 5. Find MOD components with no Legacy counterpart
    if (func.modComponentIds.length > 0 && func.legacyComponentIds.length > 0) {
      const modNodesWithoutLegacy = modNodes.filter((n) =>
        n.type === "VALIDATION" || n.type === "BUSINESS_RULE" || n.type === "CONDITION",
      );

      for (const modNode of modNodesWithoutLegacy) {
        const similarLeg = legNodes.find((ln) =>
          semanticSimilarity(ln.detail, modNode.detail) > 0.3,
        );

        if (!similarLeg) {
          findings.push({
            id: `find-${projectId}-${++findIdx}`,
            projectId,
            functionalityId: func.id,
            findingType: "CHANGED_FUNCTIONALITY",
            severity: "MEDIUM",
            confidence: "LOW",
            title: `MOD has new validation: "${modNode.label.substring(0, 50)}"`,
            description: `The MOD implementation contains validation/condition "${modNode.label}" that has no apparent counterpart in the Legacy code. This may be a new business rule or an enhancement.`,
            legacyEvidence: [],
            modEvidence: modNode.evidence.map((e) => ({
              ...e, snippet: modNode.detail,
            })),
            status: "OPEN",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }

    // 6. Check for missing table mappings
    const legTables = new Set<string>();
    const modTables = new Set<string>();

    for (const cid of func.legacyComponentIds) {
      const comp = legacyComponents.find((c) => c.id === cid);
      if (comp) comp.tableRefs.forEach((t) => legTables.add(t));
    }
    for (const cid of func.modComponentIds) {
      const comp = modComponents.find((c) => c.id === cid);
      if (comp) comp.tableRefs.forEach((t) => modTables.add(t));
    }

    for (const legTable of legTables) {
      const matched = Array.from(modTables).some((mt) =>
        tablesLikelyRelated(legTable, mt),
      );

      if (!matched && legTables.size > 0 && modTables.size > 0) {
        findings.push({
          id: `find-${projectId}-${++findIdx}`,
          projectId,
          functionalityId: func.id,
          findingType: "MISSING_TABLE_MAPPING",
          severity: "MEDIUM",
          confidence: "LOW",
          title: `Legacy table "${legTable}" has no apparent MOD mapping`,
          description: `Legacy references table "${legTable}" but no corresponding MOD table was identified. This may be an architectural change (e.g., CHARGE → QUEUE/CORE mapping) or missing functionality.`,
          legacyEvidence: [{
            fileId: "", fileName: legTable, lineStart: 0, lineEnd: 0,
            snippet: `SELECT/INSERT/UPDATE on ${legTable}`,
          }],
          modEvidence: [],
          status: "OPEN",
          informationNeeded: `Confirm the mapping for Legacy table "${legTable}" in the modernized schema.`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        // Create info request for missing schema
        infoRequests.push({
          id: `ireq-${projectId}-${infoRequests.length + 1}`,
          projectId,
          functionalityId: func.id,
          findingId: findings[findings.length - 1].id,
          type: "MISSING_TABLE_MAPPING",
          title: `Table mapping needed: ${legTable}`,
          description: `Legacy table "${legTable}" needs to be mapped to its MOD equivalent.`,
          whatIsNeeded: `The MOD table that replaces "${legTable}" and any transformation rules`,
          reason: `To ensure data migration completeness and functional equivalence`,
          status: "PENDING",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // 7. Detect potential architectural changes (same semantic, different structure)
    if (func.legacyComponentIds.length > 2 && func.modComponentIds.length > 0) {
      // Check for file splitting pattern (1 Legacy → N MOD)
      const legCompTypes = func.legacyComponentIds.map((cid) => {
        const c = legacyComponents.find((cc) => cc.id === cid);
        return c?.componentType;
      }).filter(Boolean);

      const modCompTypes = func.modComponentIds.map((cid) => {
        const c = modComponents.find((cc) => cc.id === cid);
        return c?.componentType;
      }).filter(Boolean);

      const isSplit = legCompTypes.length >= 2 && modCompTypes.length >= 2;
      if (isSplit) {
        findings.push({
          id: `find-${projectId}-${++findIdx}`,
          projectId,
          functionalityId: func.id,
          findingType: "INTENTIONAL_ARCHITECTURAL_CHANGE",
          severity: "INFO",
          confidence: "MEDIUM",
          title: `File splitting/restructuring detected`,
          description: `Legacy has ${func.legacyComponentIds.length} components → MOD has ${func.modComponentIds.length} components. This appears to be intentional modernization restructuring (file splitting/merging), not missing functionality.`,
          legacyEvidence: func.legacyComponentIds.slice(0, 3).map((cid) => {
            const c = legacyComponents.find((cc) => cc.id === cid);
            return {
              fileId: c?.fileId || "", fileName: c?.fileName || "",
              lineStart: c?.lineStart || 0, lineEnd: c?.lineEnd || 0,
              snippet: c?.name || "",
            };
          }),
          modEvidence: func.modComponentIds.slice(0, 3).map((cid) => {
            const c = modComponents.find((cc) => cc.id === cid);
            return {
              fileId: c?.fileId || "", fileName: c?.fileName || "",
              lineStart: c?.lineStart || 0, lineEnd: c?.lineEnd || 0,
              snippet: c?.name || "",
            };
          }),
          status: "OPEN",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }

  // 8. Find completely unmapped Legacy functionalities
  for (const func of functionalities) {
    if (func.status === "UNMAPPED_LEGACY" && func.legacyComponentIds.length > 0) {
      findings.push({
        id: `find-${projectId}-${++findIdx}`,
        projectId,
        functionalityId: func.id,
        findingType: "MISSING_FUNCTIONALITY",
        severity: "CRITICAL",
        confidence: "HIGH",
        title: `Unmapped Legacy functionality: ${func.name}`,
        description: `Legacy functionality "${func.name}" has ${func.legacyComponentIds.length} components but no MOD counterpart was identified. This may represent missing functionality in the modernized system.`,
        legacyEvidence: func.legacyComponentIds.slice(0, 5).map((cid) => {
          const c = legacyComponents.find((cc) => cc.id === cid);
          return {
            fileId: c?.fileId || "", fileName: c?.fileName || "",
            lineStart: c?.lineStart || 0, lineEnd: c?.lineEnd || 0,
            snippet: c?.name || "",
          };
        }),
        modEvidence: [],
        status: "OPEN",
        informationNeeded: "Confirm whether this functionality is intentionally excluded from the MOD implementation or is a regression.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  return { findings, infoRequests };
}

// ── Helpers ───────────────────────────────────────────────────

function classifyBehaviorNodeType(
  comp: ExtractedComponent,
  _side: "LEGACY" | "MOD",
): BehaviorNode["type"] {
  const type = comp.componentType;

  if (type === "TRIGGER") return "VALIDATION";
  if (type === "JOB" || type === "SHELL_SCRIPT") return "DRIVER_SELECTION";
  if (type === "SERVICE" || type === "PROCESSOR") return "VALIDATION";
  if (type === "WRITER" || type === "REPOSITORY") return "DATABASE_EFFECT";
  if (type === "READER") return "INPUT";
  if (type === "PROCEDURE" || type === "FUNCTION") return "BUSINESS_RULE";
  if (type === "PACKAGE") return "BUSINESS_RULE";
  if (type === "TABLE" || type === "VIEW") return "DATABASE_EFFECT";

  return "BUSINESS_RULE";
}

function describeComponent(comp: ExtractedComponent, side: "LEGACY" | "MOD"): string {
  const parts: string[] = [];

  parts.push(`${side} ${comp.componentType.toLowerCase()} "${comp.name}"`);

  if (comp.tableRefs.length > 0) {
    parts.push(`touches tables: ${comp.tableRefs.slice(0, 5).join(", ")}`);
  }
  if (comp.conditions.length > 0) {
    parts.push(`has ${comp.conditions.length} conditions`);
  }
  if (comp.statusCodes.length > 0) {
    parts.push(`status codes: ${comp.statusCodes.slice(0, 5).join(", ")}`);
  }
  if (comp.externalDeps.length > 0) {
    parts.push(`external deps: ${comp.externalDeps.join(", ")}`);
  }
  if (comp.ruleRefs.length > 0) {
    parts.push(`rule refs: ${comp.ruleRefs.join(", ")}`);
  }

  return parts.join(" — ");
}

function semanticSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length >= 3),
  );
  const wordsB = new Set(
    b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length >= 3),
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

function tablesLikelyRelated(legTable: string, modTable: string): boolean {
  const a = legTable.toUpperCase();
  const b = modTable.toUpperCase();

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // Common mapping patterns
  const mappings: [RegExp, RegExp][] = [
    [/CHARGE/, /QUEUE|CORE/],
    [/CLAIM/, /CLAIM|INTAKE/],
    [/DRIVER/, /DRIVER|SELECTION/],
    [/INVOICE/, /INVOICE|BILLING/],
    [/PRODUCT/, /PRODUCT|OFFERING/],
    [/GROUP/, /GROUP|ORG/],
    [/PAYROLL/, /PAYROLL|EMPLOYEE/],
  ];

  for (const [leg, mod] of mappings) {
    if (leg.test(a) && mod.test(b)) return true;
  }

  return false;
}
