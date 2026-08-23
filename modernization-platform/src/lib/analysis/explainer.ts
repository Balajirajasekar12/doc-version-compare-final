/**
 * Business Explanation Engine
 *
 * Converts technical code-difference findings into plain-English
 * business explanations while preserving technical evidence.
 *
 * NEVER invents business rules — derives explanations ONLY from
 * available source code evidence.
 */

import type {
  Finding,
  FindingType,
  ExtractedComponent,
  BehaviorNode,
} from "./types";

// ── Business Rule ─────────────────────────────────────────────

export interface BusinessRule {
  id: string;
  ruleNumber: number;
  description: string;
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  condition?: string;
  positiveOutcome?: string;
  failureOutcome?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  legacyStatus: "IDENTIFIED" | "CONFIRMED" | "NOT_FOUND";
  modStatus:
    | "NOT_FOUND"
    | "IMPLEMENTED"
    | "PARTIALLY_IMPLEMENTED"
    | "INTENTIONALLY_REMOVED"
    | "UNKNOWN";
}

// ── Confidence Explanation ────────────────────────────────────

export interface ConfidenceExplanation {
  level: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  evidenceStrength: string;
}

// ── Enhanced Finding Explanation ──────────────────────────────

export interface BusinessExplanation {
  /** Plain-English: What did Legacy do? */
  legacyBehavior: string;
  /** Plain-English: What does MOD do? */
  modBehavior: string;
  /** Plain-English: What is different? */
  difference: string;
  /** Plain-English: Why does this matter? */
  impact: string;
  /** Plain-English: Possible impact with cautious language */
  possibleImpact: string;
  /** Concrete example if derivable from evidence */
  example?: string;
  /** Structured business rules extracted from the code */
  businessRules: BusinessRule[];
  /** Confidence explanation */
  confidenceExplanation: ConfidenceExplanation;
  /** What information is missing */
  missingInformation: MissingInformationItem[];
  /** Plain-English summary at top */
  summary: string;
  /** Language level markers */
  evidenceLevel:
    | "PROVEN"
    | "STRONG_EVIDENCE"
    | "POSSIBLE"
    | "UNKNOWN"
    | "MISSING_INFORMATION";
}

export interface MissingInformationItem {
  id: string;
  whatIsNeeded: string;
  whyNeeded: string;
  suggestedAction: string;
  suggestedQuery?: string;
  category:
    | "TABLE_SCHEMA"
    | "SAMPLE_DATA"
    | "STATUS_CODE_MEANING"
    | "CLOB_CONTENT"
    | "EXTERNAL_RULE"
    | "MOD_CLASS"
    | "MOD_VALIDATION"
    | "CLARIFICATION"
    | "HISTORY_DATA";
}

// ── Category → Plain English ──────────────────────────────────

const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  MISSING_FUNCTIONALITY: "Potential Missing Functionality",
  CHANGED_FUNCTIONALITY: "Changed Behavior",
  CHANGED_RULE: "Modified Business Rule",
  CHANGED_CONDITION: "Modified Validation Condition",
  CHANGED_STATUS_CODE: "Changed Status Code Behavior",
  CHANGED_ERROR_HANDLING: "Changed Error Handling",
  CHANGED_DATA_MAPPING: "Changed Data Mapping",
  MISSING_TABLE_MAPPING: "Missing Table Mapping",
  MISSING_COLUMN_MAPPING: "Missing Column Mapping",
  MISSING_EXTERNAL_RULE: "External Rule Dependency",
  MISSING_VALIDATION: "Missing Validation",
  MULTIPLE_CLAIM_REGRESSION: "Multiple Claim Processing Difference",
  DRIVER_SELECTION_DIFFERENCE: "Driver/Selection Difference",
  INTENTIONAL_ARCHITECTURAL_CHANGE: "Intentional Architecture Change",
  UNKNOWN_REQUIRES_USER_INPUT: "Requires User Input",
  MISSING_SCHEMA: "Missing Schema Definition",
  MISSING_HISTORY_DATA: "Missing Historical Data",
};

export function getFindingTypeLabel(type: FindingType): string {
  return FINDING_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

// ── Main: Generate Business Explanation ───────────────────────

export function generateBusinessExplanation(
  finding: Finding,
  legacyComponents: ExtractedComponent[],
  modComponents: ExtractedComponent[],
  legacyBehaviorNodes: BehaviorNode[],
  modBehaviorNodes: BehaviorNode[],
): BusinessExplanation {
  const legacyEvFiles = finding.legacyEvidence.map((e) => e.fileName);
  const modEvFiles = finding.modEvidence.map((e) => e.fileName);

  const legacyComps = legacyComponents.filter(
    (c) => legacyEvFiles.includes(c.fileName),
  );
  const modComps = modComponents.filter((c) => modEvFiles.includes(c.fileName));

  // Gather all conditions, status codes, rule refs, table refs from evidence
  const legConditions = legacyComps.flatMap((c) => c.conditions);
  const legStatusCodes = legacyComps.flatMap((c) => c.statusCodes);
  const legRuleRefs = legacyComps.flatMap((c) => c.ruleRefs);
  const legTableRefs = legacyComps.flatMap((c) => c.tableRefs);
  const legExternalDeps = legacyComps.flatMap((c) => c.externalDeps);

  const modConditions = modComps.flatMap((c) => c.conditions);
  const modStatusCodes = modComps.flatMap((c) => c.statusCodes);
  const modRuleRefs = modComps.flatMap((c) => c.ruleRefs);
  const modTableRefs = modComps.flatMap((c) => c.tableRefs);

  // ── Build legacy behavior text ──
  const legacyBehavior = buildLegacyBehaviorText(
    finding,
    legacyComps,
    legConditions,
    legStatusCodes,
    legRuleRefs,
    legTableRefs,
    legExternalDeps,
  );

  // ── Build MOD behavior text ──
  const modBehavior = buildModBehaviorText(
    finding,
    modComps,
    modConditions,
    modStatusCodes,
    modRuleRefs,
    modTableRefs,
  );

  // ── Build difference text ──
  const difference = buildDifferenceText(finding, legacyComps, modComps);

  // ── Build impact text ──
  const impact = buildImpactText(finding, legConditions, legStatusCodes);

  // ── Build possible impact ──
  const possibleImpact = buildPossibleImpactText(finding, legConditions);

  // ── Build summary ──
  const summary = buildSummary(finding, legacyComps, modComps);

  // ── Extract business rules ──
  const businessRules = extractBusinessRules(
    finding,
    legacyComps,
    legConditions,
    legStatusCodes,
    legTableRefs,
  );

  // ── Confidence explanation ──
  const confidenceExplanation = buildConfidenceExplanation(
    finding,
    legacyComps,
    modComps,
  );

  // ── Missing information ──
  const missingInformation = buildMissingInformation(
    finding,
    legExternalDeps,
    legRuleRefs,
    legTableRefs,
    legStatusCodes,
    modTableRefs,
  );

  // ── Evidence level ──
  const evidenceLevel = determineEvidenceLevel(
    finding,
    legacyComps,
    modComps,
  );

  return {
    legacyBehavior,
    modBehavior,
    difference,
    impact,
    possibleImpact,
    businessRules,
    confidenceExplanation,
    missingInformation,
    summary,
    evidenceLevel,
  };
}

// ── Text Builders ─────────────────────────────────────────────

function buildLegacyBehaviorText(
  finding: Finding,
  comps: ExtractedComponent[],
  conditions: string[],
  statusCodes: string[],
  ruleRefs: string[],
  tableRefs: string[],
  externalDeps: string[],
): string {
  const parts: string[] = [];
  const compNames = comps.map((c) => c.name);
  const compTypes = [...new Set(comps.map((c) => c.componentType))];

  if (comps.length === 0) {
    return "Insufficient Legacy source evidence to determine the exact behavior.";
  }

  // Describe what components exist
  if (compTypes.length === 1) {
    parts.push(
      `The Legacy implementation uses ${compNames.map((n) => `"${n}"`).join(", ")}.`,
    );
  } else {
    parts.push(
      `The Legacy implementation involves ${compTypes.join(" and ")} components including ${compNames.slice(0, 5).map((n) => `"${n}"`).join(", ")}.`,
    );
  }

  // Describe validations/conditions
  if (conditions.length > 0) {
    const uniqueConds = [...new Set(conditions)].slice(0, 8);
    parts.push(
      `It performs ${uniqueConds.length} validation check${uniqueConds.length === 1 ? "" : "s"}, including: ${uniqueConds.map((c) => `"${truncate(c, 60)}"`).join("; ")}.`,
    );
  }

  // Describe status codes
  if (statusCodes.length > 0) {
    const uniqueCodes = [...new Set(statusCodes)].slice(0, 5);
    parts.push(
      `Status/lifecycle codes used: ${uniqueCodes.map((c) => `"${c}"`).join(", ")}.`,
    );
  }

  // Describe external dependencies
  if (externalDeps.length > 0) {
    parts.push(
      `The code depends on external resources: ${[...new Set(externalDeps)].map((d) => `"${d}"`).join(", ")}.`,
    );
  }

  // Describe rule references
  if (ruleRefs.length > 0) {
    parts.push(
      `Business rule references found: ${[...new Set(ruleRefs)].slice(0, 5).map((r) => `"${r}"`).join(", ")}.`,
    );
  }

  // Describe table interactions
  if (tableRefs.length > 0) {
    parts.push(
      `Interacts with database tables: ${[...new Set(tableRefs)].slice(0, 6).map((t) => `"${t}"`).join(", ")}.`,
    );
  }

  return parts.join(" ");
}

function buildModBehaviorText(
  finding: Finding,
  comps: ExtractedComponent[],
  conditions: string[],
  statusCodes: string[],
  ruleRefs: string[],
  tableRefs: string[],
): string {
  if (comps.length === 0) {
    return "We could not identify equivalent MOD components for this functionality in the source code reviewed so far. This may indicate the functionality is implemented elsewhere or has not yet been developed.";
  }

  const parts: string[] = [];
  const compNames = comps.map((c) => c.name);
  const compTypes = [...new Set(comps.map((c) => c.componentType))];

  parts.push(
    `The MOD implementation includes ${compTypes.join(" and ")} components such as ${compNames.slice(0, 5).map((n) => `"${n}"`).join(", ")}.`,
  );

  if (conditions.length > 0) {
    const uniqueConds = [...new Set(conditions)].slice(0, 8);
    parts.push(
      `It performs ${uniqueConds.length} validation check${uniqueConds.length === 1 ? "" : "s"}, including: ${uniqueConds.map((c) => `"${truncate(c, 60)}"`).join("; ")}.`,
    );
  } else {
    parts.push("No equivalent validation conditions were identified in the reviewed MOD source.");
  }

  if (statusCodes.length > 0) {
    parts.push(
      `Status codes used: ${[...new Set(statusCodes)].slice(0, 5).map((c) => `"${c}"`).join(", ")}.`,
    );
  }

  if (tableRefs.length > 0) {
    parts.push(
      `Interacts with tables: ${[...new Set(tableRefs)].slice(0, 6).map((t) => `"${t}"`).join(", ")}.`,
    );
  }

  if (ruleRefs.length > 0) {
    parts.push(
      `Business rule references: ${[...new Set(ruleRefs)].slice(0, 5).map((r) => `"${r}"`).join(", ")}.`,
    );
  } else if (finding.findingType.includes("RULE") || finding.findingType.includes("VALIDATION")) {
    parts.push("No corresponding business rule consumption was identified in the MOD source.");
  }

  return parts.join(" ");
}

function buildDifferenceText(
  finding: Finding,
  legacyComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): string {
  const type = finding.findingType;
  const parts: string[] = [];

  switch (type) {
    case "MISSING_VALIDATION":
      parts.push(
        "Legacy performs a validation check that was not identified in the MOD implementation reviewed so far.",
      );
      if (modComps.length > 0) {
        parts.push(
          "The MOD code contains related components, but the specific validation logic could not be located.",
        );
      }
      break;

    case "MISSING_EXTERNAL_RULE":
      parts.push(
        "Legacy depends on an external rule or data source that is not referenced in the MOD implementation.",
      );
      parts.push(
        "This may indicate a missing business rule, or the rule may be implemented through a different mechanism in MOD.",
      );
      break;

    case "CHANGED_STATUS_CODE":
      parts.push(
        "Legacy uses a specific status or lifecycle code that was not found in the MOD implementation.",
      );
      parts.push(
        "This could mean the status code mapping has changed, or the MOD system uses a different lifecycle model.",
      );
      break;

    case "CHANGED_FUNCTIONALITY":
      parts.push(
        "The MOD implementation contains behavior that has no apparent counterpart in Legacy.",
      );
      parts.push(
        "This may represent a new validation, an enhancement, or a difference in how the business logic is structured.",
      );
      break;

    case "MISSING_TABLE_MAPPING":
      parts.push(
        "Legacy references a database table that has no identified MOD equivalent.",
      );
      parts.push(
        "This may be an intentional architectural change (for example, Legacy CHARGE table mapping to MOD QUEUE/CORE tables) or may indicate missing data migration.",
      );
      break;

    case "INTENTIONAL_ARCHITECTURAL_CHANGE":
      parts.push(
        "The code has been restructured through file splitting or merging. This is a normal pattern in modernization where monolithic Legacy packages are decomposed into smaller, focused MOD services.",
      );
      parts.push(
        "This is classified as an intentional architectural change rather than missing functionality.",
      );
      break;

    case "MISSING_FUNCTIONALITY":
      parts.push(
        "The Legacy functionality has components in the source code but no corresponding MOD counterpart was identified.",
      );
      parts.push(
        "This may indicate missing functionality that needs to be implemented in MOD, or the MOD implementation may not yet have been uploaded.",
      );
      break;

    case "CHANGED_RULE":
      parts.push(
        "The business rule appears to be implemented differently between Legacy and MOD.",
      );
      parts.push(
        "The conditions, outcomes, or data references may differ.",
      );
      break;

    case "MULTIPLE_CLAIM_REGRESSION":
      parts.push(
        "Legacy processes multiple claims per driver record, but the MOD implementation may handle claim grouping differently.",
      );
      break;

    case "DRIVER_SELECTION_DIFFERENCE":
      parts.push(
        "Legacy and MOD appear to select driver records differently, which could affect which claims are processed.",
      );
      break;

    default:
      parts.push(finding.description);
  }

  return parts.join(" ");
}

function buildImpactText(
  finding: Finding,
  conditions: string[],
  statusCodes: string[],
): string {
  const type = finding.findingType;
  const parts: string[] = [];

  if (type === "INTENTIONAL_ARCHITECTURAL_CHANGE") {
    parts.push(
      "This is an intentional modernization change. The underlying business behavior appears to be preserved through a different code structure.",
    );
    return parts.join(" ");
  }

  if (finding.severity === "CRITICAL" || finding.severity === "HIGH") {
    parts.push(
      "If this difference represents genuinely missing or changed behavior, it could affect business outcomes.",
    );
  }

  if (type.includes("MISSING_VALIDATION") || type.includes("MISSING_EXTERNAL_RULE")) {
    parts.push(
      "A missing validation may allow data to be processed that should have been rejected.",
    );
  }

  if (type.includes("STATUS_CODE")) {
    parts.push(
      "Changed status code behavior could affect downstream processing, error handling, or reporting.",
    );
  }

  if (type.includes("TABLE_MAPPING")) {
    parts.push(
      "A missing table mapping could indicate incomplete data migration.",
    );
  }

  if (parts.length === 0) {
    parts.push("The impact depends on whether this difference is intentional or a regression.");
  }

  return parts.join(" ");
}

function buildPossibleImpactText(
  finding: Finding,
  conditions: string[],
): string {
  const type = finding.findingType;

  if (type === "INTENTIONAL_ARCHITECTURAL_CHANGE") {
    return "No business impact expected — this is a normal code restructuring pattern.";
  }

  if (type === "MISSING_VALIDATION") {
    return `If the validation is genuinely missing, records that should fail validation may be processed incorrectly. This could result in unexpected data in downstream tables.`;
  }

  if (type === "MISSING_EXTERNAL_RULE") {
    return `If the external rule is required but not consumed in MOD, business decisions that depend on this rule may not be applied correctly.`;
  }

  if (type === "CHANGED_STATUS_CODE") {
    return `Changed status code behavior may affect how records flow through the system, potentially impacting downstream processing and error recovery.`;
  }

  if (type === "MISSING_TABLE_MAPPING") {
    return `If the table mapping is missing, data may not be correctly migrated or accessible in the modernized system.`;
  }

  if (type === "MISSING_FUNCTIONALITY") {
    return `If this functionality is not implemented in MOD, it represents a gap in the modernized system that must be addressed before go-live.`;
  }

  return "The impact of this difference depends on additional context from the development team and business analysts.";
}

function buildSummary(
  finding: Finding,
  legacyComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): string {
  const parts: string[] = [];

  // Brief legacy summary
  if (legacyComps.length > 0) {
    const names = legacyComps.slice(0, 3).map((c) => c.name);
    parts.push(`Legacy: ${names.join(", ")}`);
  } else {
    parts.push("Legacy: Evidence not sufficient to describe behavior");
  }

  // Brief MOD summary
  if (modComps.length > 0) {
    const names = modComps.slice(0, 3).map((c) => c.name);
    parts.push(`MOD: ${names.join(", ")}`);
  } else {
    parts.push("MOD: No equivalent components identified");
  }

  // Key difference
  parts.push(`Issue: ${getFindingTypeLabel(finding.findingType)}`);

  return parts.join(" | ");
}

// ── Business Rule Extraction ──────────────────────────────────

function extractBusinessRules(
  finding: Finding,
  comps: ExtractedComponent[],
  conditions: string[],
  statusCodes: string[],
  tableRefs: string[],
): BusinessRule[] {
  const rules: BusinessRule[] = [];
  let ruleNum = 0;

  // Extract rules from conditions
  const uniqueConditions = [...new Set(conditions)];
  for (const condition of uniqueConditions.slice(0, 10)) {
    const sourceComp = comps.find((c) => c.conditions.includes(condition));
    ruleNum++;

    rules.push({
      id: `${finding.id}-BR-${String(ruleNum).padStart(3, "0")}`,
      ruleNumber: ruleNum,
      description: humanizeCondition(condition),
      sourceFile: sourceComp?.fileName || finding.legacyEvidence[0]?.fileName || "",
      lineStart: sourceComp?.lineStart || finding.legacyEvidence[0]?.lineStart || 0,
      lineEnd: sourceComp?.lineEnd || finding.legacyEvidence[0]?.lineEnd || 0,
      condition: condition,
      confidence: sourceComp?.extractionConfidence || "MEDIUM",
      legacyStatus: "IDENTIFIED",
      modStatus: finding.findingType === "MISSING_VALIDATION" ? "NOT_FOUND" : "UNKNOWN",
    });
  }

  // Extract rules from status codes
  const uniqueStatuses = [...new Set(statusCodes)];
  for (const code of uniqueStatuses.slice(0, 5)) {
    const sourceComp = comps.find((c) => c.statusCodes.includes(code));
    ruleNum++;

    rules.push({
      id: `${finding.id}-BR-${String(ruleNum).padStart(3, "0")}`,
      ruleNumber: ruleNum,
      description: `Uses status/lifecycle code "${code}" to control processing flow`,
      sourceFile: sourceComp?.fileName || finding.legacyEvidence[0]?.fileName || "",
      lineStart: sourceComp?.lineStart || finding.legacyEvidence[0]?.lineStart || 0,
      lineEnd: sourceComp?.lineEnd || finding.legacyEvidence[0]?.lineEnd || 0,
      confidence: sourceComp?.extractionConfidence || "MEDIUM",
      legacyStatus: "IDENTIFIED",
      modStatus: "UNKNOWN",
    });
  }

  // If we have table references, extract data interaction rules
  if (tableRefs.length > 0 && ruleNum < 8) {
    ruleNum++;
    rules.push({
      id: `${finding.id}-BR-${String(ruleNum).padStart(3, "0")}`,
      ruleNumber: ruleNum,
      description: `Interacts with data in table(s): ${[...new Set(tableRefs)].slice(0, 5).join(", ")}`,
      sourceFile: comps[0]?.fileName || finding.legacyEvidence[0]?.fileName || "",
      lineStart: comps[0]?.lineStart || 0,
      lineEnd: comps[0]?.lineEnd || 0,
      confidence: "HIGH",
      legacyStatus: "IDENTIFIED",
      modStatus: "UNKNOWN",
    });
  }

  return rules;
}

function humanizeCondition(condition: string): string {
  let text = condition.trim();

  // Remove code-like syntax
  text = text.replace(/^[IF|else if|else|AND|OR|NOT|WHERE]+\s*/i, "");
  text = text.replace(/\bTHEN\b/gi, "then");
  text = text.replace(/\bRETURN\b/gi, "return");

  // Replace comparison operators
  text = text.replace(/==|===/g, "equals");
  text = text.replace(/!=|!==/g, "does not equal");
  text = text.replace(/>=/g, "is at least");
  text = text.replace(/<=/g, "is at most");
  text = text.replace(/>/g, "is greater than");
  text = text.replace(/</g, "is less than");

  // Replace common patterns
  text = text.replace(/\.equals\(/g, " matches ");
  text = text.replace(/\(/g, " ");
  text = text.replace(/\)/g, "");
  text = text.replace(/&&/g, " and ");
  text = text.replace(/\|\|/g, " or ");
  text = text.replace(/null/gi, "null/empty");
  text = text.replace(/NULL/g, "null/empty");

  // Clean up
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > 120) {
    text = text.substring(0, 117) + "...";
  }

  return text || condition;
}

// ── Confidence Explanation ────────────────────────────────────

function buildConfidenceExplanation(
  finding: Finding,
  legacyComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): ConfidenceExplanation {
  const { confidence } = finding;
  let reason = "";
  let evidenceStrength = "";

  if (confidence === "HIGH") {
    if (legacyComps.length > 0 && modComps.length > 0) {
      reason =
        "Confidence is high because both Legacy and MOD source code provide explicit evidence of the behaviors being compared. The conditions, table references, and code structure are clearly identifiable in both codebases.";
      evidenceStrength = "Explicit code evidence from both Legacy and MOD sources";
    } else if (legacyComps.length > 0) {
      reason =
        "Confidence is high because the Legacy code explicitly contains the behavior pattern. The absence in MOD is based on a thorough review of the MOD source provided.";
      evidenceStrength = "Explicit Legacy code evidence; MOD absence confirmed through review";
    } else {
      reason = "Confidence is high based on the structural analysis of available code.";
      evidenceStrength = "Structural analysis of available source";
    }
  } else if (confidence === "MEDIUM") {
    reason =
      "Confidence is medium because the evidence suggests a difference but cannot definitively confirm it. The Legacy code references external resources or patterns that have not been fully analyzed, or the MOD code may implement the same behavior through a different mechanism.";
    evidenceStrength =
      "Partial code evidence; some external dependencies remain unverified";
  } else {
    reason =
      "Confidence is low because the available source code does not fully establish the complete behavior. Additional information is needed to confirm or refute this finding.";
    evidenceStrength =
      "Limited code evidence; significant gaps in available source";
  }

  return { level: confidence, reason, evidenceStrength };
}

// ── Missing Information ───────────────────────────────────────

function buildMissingInformation(
  finding: Finding,
  externalDeps: string[],
  ruleRefs: string[],
  tableRefs: string[],
  statusCodes: string[],
  modTableRefs: string[],
): MissingInformationItem[] {
  const items: MissingInformationItem[] = [];
  let idx = 0;

  // External dependencies
  const uniqueDeps = [...new Set(externalDeps)];
  for (const dep of uniqueDeps.slice(0, 5)) {
    idx++;
    items.push({
      id: `${finding.id}-MI-${idx}`,
      whatIsNeeded: `Definition and content of external resource "${dep}"`,
      whyNeeded: `The Legacy code references "${dep}" for business decisions, but the actual data or rule content is not available in the source code alone.`,
      suggestedAction: "Upload the table/view definition, a sample of its data, or a CLOB extraction",
      suggestedQuery: `SELECT * FROM ${dep} WHERE ROWNUM <= 100`,
      category: "EXTERNAL_RULE",
    });
  }

  // Rule references
  const uniqueRuleRefs = [...new Set(ruleRefs)];
  for (const ref of uniqueRuleRefs.slice(0, 5)) {
    idx++;
    items.push({
      id: `${finding.id}-MI-${idx}`,
      whatIsNeeded: `Business rule content for "${ref}"`,
      whyNeeded: `The code retrieves or references rule "${ref}" from an external source. The SQL/code alone is not sufficient to determine the actual rule values.`,
      suggestedAction: "Upload the rule configuration, Excel data, or CLOB content",
      category: "CLOB_CONTENT",
    });
  }

  // Status code meanings
  const uniqueStatuses = [...new Set(statusCodes)];
  for (const code of uniqueStatuses.slice(0, 3)) {
    idx++;
    items.push({
      id: `${finding.id}-MI-${idx}`,
      whatIsNeeded: `Description/meaning of status code "${code}"`,
      whyNeeded: `Status code "${code}" appears in the Legacy code but its business meaning has not been provided.`,
      suggestedAction: "Provide the description for this status code",
      category: "STATUS_CODE_MEANING",
    });
  }

  // Missing MOD tables for table mapping findings
  if (
    finding.findingType === "MISSING_TABLE_MAPPING" ||
    finding.findingType === "MISSING_COLUMN_MAPPING"
  ) {
    const uniqueLegTables = [...new Set(tableRefs)];
    for (const table of uniqueLegTables.slice(0, 3)) {
      if (!modTableRefs.some((mt) => mt.toUpperCase() === table.toUpperCase())) {
        idx++;
        items.push({
          id: `${finding.id}-MI-${idx}`,
          whatIsNeeded: `MOD table that replaces Legacy table "${table}"`,
          whyNeeded: `Legacy table "${table}" needs to be mapped to its MOD equivalent to ensure data migration completeness.`,
          suggestedAction: "Upload the MOD schema or provide the table mapping",
          category: "TABLE_SCHEMA",
        });
      }
    }
  }

  // Missing schema
  if (
    finding.findingType === "MISSING_SCHEMA" ||
    finding.findingType === "MISSING_HISTORY_DATA"
  ) {
    idx++;
    items.push({
      id: `${finding.id}-MI-${idx}`,
      whatIsNeeded: "Schema definition and/or representative data",
      whyNeeded:
        "The source code references database objects whose definitions are not available. This is needed to understand the data model.",
      suggestedAction: "Upload the DDL/schema file or a data sample",
      category: "TABLE_SCHEMA",
    });
  }

  // Generic clarification for remaining findings
  if (items.length === 0 && finding.informationNeeded) {
    idx++;
    items.push({
      id: `${finding.id}-MI-${idx}`,
      whatIsNeeded: finding.informationNeeded,
      whyNeeded: "This information is required to determine whether the difference is intentional, a regression, or an architectural change.",
      suggestedAction: "Upload a file, provide a SQL query result, or enter an explanation",
      category: "CLARIFICATION",
    });
  }

  return items;
}

// ── Evidence Level ────────────────────────────────────────────

function determineEvidenceLevel(
  finding: Finding,
  legacyComps: ExtractedComponent[],
  modComps: ExtractedComponent[],
): BusinessExplanation["evidenceLevel"] {
  if (finding.confidence === "HIGH" && legacyComps.length > 0 && modComps.length > 0) {
    return "PROVEN";
  }
  if (finding.confidence === "HIGH" && legacyComps.length > 0) {
    return "STRONG_EVIDENCE";
  }
  if (finding.confidence === "MEDIUM") {
    return "POSSIBLE";
  }
  if (finding.confidence === "LOW" || legacyComps.length === 0) {
    return "UNKNOWN";
  }
  return "POSSIBLE";
}

// ── Generate Development Question ─────────────────────────────

export function generateDevQuestion(
  finding: Finding,
  explanation: BusinessExplanation,
): string {
  const parts: string[] = [];

  parts.push(
    `Legacy performs the following for the "${finding.functionalityId}" functionality:`,
  );
  parts.push(explanation.legacyBehavior);
  parts.push("");
  parts.push("In the MOD source reviewed so far:");
  parts.push(explanation.modBehavior);
  parts.push("");
  parts.push(`The identified difference is: ${explanation.difference}`);
  parts.push("");

  if (explanation.missingInformation.length > 0) {
    parts.push(
      "Can you confirm:",
    );
    for (const mi of explanation.missingInformation.slice(0, 5)) {
      parts.push(`• ${mi.whatIsNeeded}`);
    }
    parts.push("");
  }

  parts.push(
    "If this behavior has been intentionally changed or removed, please confirm the business reason and expected behavior in MOD.",
  );

  return parts.join("\n");
}

// ── Utility ───────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 3) + "..." : str;
}
