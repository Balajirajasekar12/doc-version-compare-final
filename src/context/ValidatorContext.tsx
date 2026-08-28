import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildIgnoreMatcher,
  computeFingerprint,
  fingerprintOf,
  type FingerprintParts,
  type IgnoreMatch,
} from "../lib/validator/ignore";
import {
  comparableDocs,
  defaultRefIndex,
  detectAccountLevel,
  groupDocs,
} from "../lib/validator/grouping";
import { compareTextVersions } from "../lib/validator/diff";
import { compareSheetVersions } from "../lib/validator/sheets";
import { compareFieldVersions } from "../lib/validator/fields";
import {
  buildComparisonChain,
  getDefaultBaseline,
  findDocForFormat,
} from "../lib/validator/chain";
import {
  extractElements,
  matchElements,
  generateSemanticDiffs,
} from "../lib/validator/semantic";
import {
  toCanonical,
  compareCanonical,
  generateCanonicalDiffs,
} from "../lib/validator/canonical";
import type {
  ComparisonMode,
  DiffRecord,
  DiffType,
  DocGroup,
  ParsedDoc,
  PersistedRule,
  PipelineProgress,
  PipelineStage,
  PerformanceMetrics,
  RuleScope,
  RunStats,
} from "../lib/validator/types";

export type ValidatorStage = "input" | "groups" | "diffs";

export interface ValidatorContextValue {
  stage: ValidatorStage;
  setStage: (stage: ValidatorStage) => void;
  docs: ParsedDoc[];
  groups: DocGroup[];
  accountLevel: number;
  changeAccountLevel: (level: number) => void;
  refIndexByGroup: Record<string, number>;
  setRefIndex: (groupId: string, index: number) => void;
  enabledGroups: Record<string, boolean>;
  toggleGroup: (groupId: string) => void;
  /** User-selected baseline format per group. */
  baselineFormatByGroup: Record<string, string>;
  setBaselineFormat: (groupId: string, format: string) => void;
  diffs: DiffRecord[];
  fingerprints: Record<string, FingerprintParts>;
  stats: RunStats;
  rules: PersistedRule[];
  rulesLoading: boolean;
  setParsedDocs: (docs: ParsedDoc[]) => void;
  addOccurrence: (fingerprint: string) => void;
  removeOccurrence: (fingerprint: string) => void;
  addPersistedRule: (
    scope: Exclude<RuleScope, "occurrence">,
    parts: FingerprintParts,
  ) => Promise<void>;
  removeRule: (ruleId: string) => Promise<void>;
  clearRules: () => Promise<void>;
  resetSession: () => void;
  getMatch: (diff: DiffRecord) => IgnoreMatch | null;
  comparisonMode: ComparisonMode;
  setComparisonMode: (mode: ComparisonMode) => void;
  pipelineProgress: PipelineProgress;
  performanceMetrics: PerformanceMetrics | null;
  /** Set during parsing phase. */
  setPipelineProgress: (progress: Partial<PipelineProgress>) => void;
}

const EMPTY_STATS: RunStats = {
  files: 0,
  parsed: 0,
  failed: 0,
  accounts: 0,
  groups: 0,
  comparableGroups: 0,
  comparisons: 0,
  differences: 0,
  matches: 0,
  ignored: 0,
  types: {},
  errors: [],
};

const RULES_KEY = "dv-validator-rules:v1";

function loadRules(): PersistedRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    return raw ? (JSON.parse(raw) as PersistedRule[]) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: PersistedRule[]): void {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    // Storage unavailable
  }
}

/**
 * Chain-based comparison pipeline.
 *
 * For each enabled group:
 * 1. Determine baseline format from user selection or priority rules
 * 2. Build the comparison chain
 * 3. For each pair in the chain, run format-appropriate comparison
 * 4. Collect all diff records
 *
 * All processing happens in-memory. No documents leave the browser.
 */
function useChainPipeline(
  docs: ParsedDoc[],
  groups: DocGroup[],
  accountLevel: number,
  refIndexByGroup: Record<string, number>,
  enabledGroups: Record<string, boolean>,
  baselineFormatByGroup: Record<string, string>,
  rules: PersistedRule[],
  occurrences: Set<string>,
  fingerprints: Record<string, FingerprintParts>,
  comparisonMode: ComparisonMode,
): {
  diffs: DiffRecord[];
  stats: RunStats;
  getMatch: (diff: DiffRecord) => IgnoreMatch | null;
  metrics: PerformanceMetrics | null;
} {
  const startTimeRef = useRef<number>(0);

  const diffs = useMemo(() => {
    startTimeRef.current = performance.now();
    const out: DiffRecord[] = [];

    for (const group of groups) {
      if (enabledGroups[group.id] === false) continue;
      const comparable = comparableDocs(group);
      if (comparable.length < 2) continue;

      // Determine baseline format
      const userBaseline = baselineFormatByGroup[group.id];
      const baselineFormat = userBaseline
        ? (userBaseline as import("../lib/validator/types").DocKind)
        : getDefaultBaseline(group);

      // Build comparison chain
      const chain = buildComparisonChain(group, baselineFormat);

      // Execute each pair in the chain
      for (const pair of chain.pairs) {
        const baselineDoc = findDocForFormat(group, pair.baselineFormat);
        const comparingDoc = findDocForFormat(group, pair.comparingFormat);
        if (!baselineDoc || !comparingDoc) continue;

        // Use canonical comparison engine (format-agnostic)
        const baselineCanonical = toCanonical(baselineDoc);
        const comparingCanonical = toCanonical(comparingDoc);

        // ═══ DVC DIAGNOSTIC: log raw parser lines + canonical items ═══
        if (baselineDoc.ext === 'pdf' || comparingDoc.ext === 'pdf' || comparingDoc.ext === 'rtf') {
          for (const [label, doc] of [['BASELINE', baselineDoc], ['COMPARING', comparingDoc]] as const) {
            if (doc.content?.type === 'text') {
              const rawLines = doc.content.lines;
              console.log(`[DVC-DIAG] ${label} (${doc.ext}) RAW LINES (${rawLines.length}):`);
              rawLines.forEach((l: string, i: number) => console.log(`  [${i}] "${l.substring(0, 120)}"`));
            }
          }
          const fmt = (d: typeof baselineDoc, canDoc: typeof baselineCanonical) => {
            return canDoc.items.map(i =>
              i.kind === 'field_value' ? `fv(${i.key}=${i.value})` : `${i.kind}(${(i.value || '').substring(0,60)})`
            ).join('\n');
          };
          console.log(`[DVC-DIAG] ${pair.baselineFormat} (${baselineDoc.ext}) CANONICAL:\n${fmt(baselineDoc, baselineCanonical)}`);
          console.log(`[DVC-DIAG] ${pair.comparingFormat} (${comparingDoc.ext}) CANONICAL:\n${fmt(comparingDoc, comparingCanonical)}`);
        }
        // ═══ END DIAGNOSTIC ═══

        const matchResult = compareCanonical(
          baselineCanonical,
          comparingCanonical,
          comparisonMode,
        );

        // ═══ DVC DIAGNOSTIC: log match results ═══
        if (baselineDoc.ext === 'pdf' || comparingDoc.ext === 'pdf') {
          const mismatches = matchResult.matched.filter(m => !m.identical);
          const missing = matchResult.missingInComparing;
          const added = matchResult.addedInComparing;
          console.log(`[DVC-DIAG] MATCH RESULT: matched=${matchResult.matched.length} identical=${matchResult.matched.filter(m=>m.identical).length} mismatches=${mismatches.length} missing=${missing.length} added=${added.length}`);
          for (const m of mismatches) {
            console.log(`[DVC-DIAG] MISMATCH: baseline=${JSON.stringify(m.baseline)} comparing=${JSON.stringify(m.comparing)}`);
          }
          for (const m of missing) {
            console.log(`[DVC-DIAG] MISSING: ${JSON.stringify(m)}`);
          }
          for (const m of added) {
            console.log(`[DVC-DIAG] ADDED: ${JSON.stringify(m)}`);
          }
        }
        // ═══ END DIAGNOSTIC ═══

        const pairDiffs = generateCanonicalDiffs(
          group.id,
          group.stem,
          group.account,
          baselineDoc,
          comparingDoc,
          matchResult,
          { baselineFormat: pair.baselineFormat, comparingFormat: pair.comparingFormat },
          comparisonMode,
        );

        out.push(...pairDiffs);

        // Also run format-specific structural comparison for spreadsheet pairs
        if (
          baselineDoc.content?.type === "sheet" &&
          comparingDoc.content?.type === "sheet"
        ) {
          const sheetDiffs = compareSheetVersions(group, baselineDoc, [comparingDoc]);
          // Tag sheet diffs with the comparison pair
          for (const d of sheetDiffs) {
            d.baselineFormat = pair.baselineFormat;
            d.comparingFormat = pair.comparingFormat;
            d.comparingFile = comparingDoc.fileName;
            d.comparisonPair = pair;
          }
          // Only add structural sheet diffs not already covered by semantic
          const semanticSigs = new Set(pairDiffs.map((d) => d.locationSignature));
          for (const d of sheetDiffs) {
            if (!semanticSigs.has(d.locationSignature)) {
              out.push(d);
            }
          }
        }
      }

      // For text-only groups where no chain pairs matched (edge case)
      if (
        chain.pairs.length === 0 &&
        comparable.length >= 2
      ) {
        // Fallback: use existing comparison with the default reference
        const refIdx = Math.min(
          refIndexByGroup[group.id] ?? defaultRefIndex(comparable),
          comparable.length - 1,
        );
        const reference = comparable[refIdx];
        const others = comparable.filter((d) => d.id !== reference.id);
        const isAllText = comparable.every((d) => d.content?.type === "text");
        const isAllSheet = comparable.every((d) => d.content?.type === "sheet");
        if (isAllText) {
          out.push(...compareTextVersions(group, reference, others));
        } else if (isAllSheet) {
          out.push(...compareSheetVersions(group, reference, others));
        } else {
          out.push(...compareFieldVersions(group, reference, others));
        }
      }
    }

    return out;
  }, [groups, refIndexByGroup, enabledGroups, baselineFormatByGroup, comparisonMode]);

  const matcher = useMemo(
    () => buildIgnoreMatcher(rules, occurrences),
    [rules, occurrences],
  );

  const getMatch = useCallback(
    (diff: DiffRecord): IgnoreMatch | null => {
      const parts = fingerprints[diff.id];
      return parts ? matcher.match(parts) : null;
    },
    [matcher, fingerprints],
  );

  const stats: RunStats = useMemo(() => {
    const enabledList = groups.filter((g) => enabledGroups[g.id] !== false);
    const comparableList = enabledList.filter((g) => comparableDocs(g).length >= 2);
    const accounts = new Set(enabledList.map((g) => g.account)).size;
    const types: Partial<Record<DiffType, number>> = {};
    for (const d of diffs) {
      types[d.differenceType] = (types[d.differenceType] ?? 0) + 1;
    }
    const ignored = diffs.filter((d) => {
      const parts = fingerprints[d.id];
      return parts ? matcher.match(parts) !== null : false;
    }).length;
    return {
      files: docs.length,
      parsed: docs.filter((d) => !d.error).length,
      failed: docs.filter((d) => d.error).length,
      accounts,
      groups: enabledList.length,
      comparableGroups: comparableList.length,
      comparisons: comparableList.length * 2, // Approximate
      differences: diffs.length,
      matches: Math.max(0, comparableList.length * 2 - diffs.length),
      ignored,
      types,
      errors: docs
        .filter((d) => d.error)
        .map((d) => ({
          account: groupAccount(d, groups) || "(root)",
          package: groupPackage(d, groups) || "(root)",
          category: groupCategory(d, groups) || "",
          report: d.stem,
          file: d.fileName,
          errorType: "ParseError",
          errorMessage: d.error || "Unknown error",
        })),
    };
  }, [docs, groups, enabledGroups, diffs, matcher, fingerprints]);

  const metrics: PerformanceMetrics | null = useMemo(() => {
    if (diffs.length === 0 && docs.length === 0) return null;
    const totalTime = performance.now() - startTimeRef.current;
    return {
      discoveryTimeMs: 0,
      groupingTimeMs: 0,
      parsingTimeMs: 0,
      comparisonTimeMs: totalTime,
      totalProcessingTimeMs: totalTime,
      peakMemoryBytes: typeof (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory !== "undefined"
        ? ((performance as unknown as { memory: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)
        : 0,
      filesPerSecond: docs.length / (totalTime / 1000),
      comparisonsPerSecond: diffs.length / (totalTime / 1000),
    };
  }, [diffs, docs]);

  return { diffs, stats, getMatch, metrics };
}

/** Look up the account for a parsed doc by finding its group. */
function groupAccount(doc: ParsedDoc, groups: DocGroup[]): string | undefined {
  for (const g of groups) {
    if (g.docs.some((d) => d.id === doc.id)) return g.account;
  }
  return undefined;
}

function groupPackage(doc: ParsedDoc, groups: DocGroup[]): string | undefined {
  for (const g of groups) {
    if (g.docs.some((d) => d.id === doc.id)) return g.packageName;
  }
  return undefined;
}

function groupCategory(doc: ParsedDoc, groups: DocGroup[]): string | undefined {
  for (const g of groups) {
    if (g.docs.some((d) => d.id === doc.id)) return g.category;
  }
  return undefined;
}

const ValidatorContext = createContext<ValidatorContextValue | undefined>(
  undefined,
);

export const ValidatorProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [stage, setStage] = useState<ValidatorStage>("input");
  const [docs, setDocs] = useState<ParsedDoc[]>([]);
  const [groups, setGroups] = useState<DocGroup[]>([]);
  const [accountLevel, setAccountLevel] = useState(1);
  const [refIndexByGroup, setRefIndexByGroup] = useState<Record<string, number>>({});
  const [enabledGroups, setEnabledGroups] = useState<Record<string, boolean>>({});
  const [baselineFormatByGroup, setBaselineFormatByGroup] = useState<Record<string, string>>({});
  const [fingerprints, setFingerprints] = useState<Record<string, FingerprintParts>>({});
  const [occurrences, setOccurrences] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<PersistedRule[]>(loadRules);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("intelligent");
  const [pipelineProgress, setPipelineProgressState] = useState<PipelineProgress>({
    stage: "idle",
    discovered: 0,
    totalFiles: 0,
    groupsFound: 0,
    processedFiles: 0,
  });
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    setRulesLoading(false);
  }, []);

  const setPipelineProgress = useCallback((partial: Partial<PipelineProgress>) => {
    setPipelineProgressState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setParsedDocs = useCallback((parsed: ParsedDoc[]) => {
    const level = detectAccountLevel(parsed);
    const grouped = groupDocs(parsed, level);
    const refs: Record<string, number> = {};
    for (const g of grouped) {
      const cmp = comparableDocs(g);
      refs[g.id] = cmp.length > 0 ? defaultRefIndex(cmp) : 0;
    }
    setDocs(parsed);
    setAccountLevel(level);
    setGroups(grouped);
    setRefIndexByGroup(refs);
    setEnabledGroups({});
    setFingerprints({});
    setOccurrences(new Set());
    setBaselineFormatByGroup({});
    setStage("groups");
  }, []);

  const changeAccountLevel = useCallback(
    (level: number) => {
      if (level === accountLevel) return;
      const grouped = groupDocs(docs, level);
      setAccountLevel(level);
      setGroups(grouped);
      setRefIndexByGroup((oldRefs) => {
        const refs: Record<string, number> = { ...oldRefs };
        for (const g of grouped) {
          const cmp = comparableDocs(g);
          if (refs[g.id] === undefined) {
            refs[g.id] = cmp.length > 0 ? defaultRefIndex(cmp) : 0;
          }
        }
        return refs;
      });
    },
    [accountLevel, docs],
  );

  const setRefIndex = useCallback((groupId: string, index: number) => {
    setRefIndexByGroup((prev) => ({ ...prev, [groupId]: index }));
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setEnabledGroups((prev) => {
      const next = { ...prev };
      if (next[groupId] === false) {
        delete next[groupId];
      } else {
        next[groupId] = false;
      }
      return next;
    });
  }, []);

  const setBaselineFormat = useCallback((groupId: string, format: string) => {
    setBaselineFormatByGroup((prev) => ({ ...prev, [groupId]: format }));
  }, []);

  const addOccurrence = useCallback((fingerprint: string) => {
    setOccurrences((prev) => new Set(prev).add(fingerprint));
  }, []);

  const removeOccurrence = useCallback((fingerprint: string) => {
    setOccurrences((prev) => {
      const next = new Set(prev);
      next.delete(fingerprint);
      return next;
    });
  }, []);

  const addPersistedRule = useCallback(
    async (scope: Exclude<RuleScope, "occurrence">, parts: FingerprintParts) => {
      const rule: PersistedRule = {
        _id: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        scope,
        fingerprint: fingerprintOf(parts),
        accountHash: parts.accountHash,
        reportHash: parts.reportHash,
        locationHash: parts.locationHash,
        docType: parts.docType,
        differenceType: parts.differenceType,
        comparisonMode: parts.comparisonMode,
        createdAt: Date.now(),
      };
      setRules((prev) => {
        const next = [...prev, rule];
        saveRules(next);
        return next;
      });
    },
    [],
  );

  const removeRule = useCallback(async (ruleId: string) => {
    setRules((prev) => {
      const next = prev.filter((r) => r._id !== ruleId);
      saveRules(next);
      return next;
    });
  }, []);

  const clearRules = useCallback(async () => {
    setRules([]);
    saveRules([]);
  }, []);

  const resetSession = useCallback(() => {
    setDocs([]);
    setGroups([]);
    setRefIndexByGroup({});
    setEnabledGroups({});
    setBaselineFormatByGroup({});
    setFingerprints({});
    setOccurrences(new Set());
    setPerformanceMetrics(null);
    setPipelineProgress({
      stage: "idle",
      discovered: 0,
      totalFiles: 0,
      groupsFound: 0,
      processedFiles: 0,
    });
    setStage("input");
  }, []);

  const { diffs, stats, getMatch, metrics } = useChainPipeline(
    docs,
    groups,
    accountLevel,
    refIndexByGroup,
    enabledGroups,
    baselineFormatByGroup,
    rules,
    occurrences,
    fingerprints,
    comparisonMode,
  );

  // Store performance metrics
  useEffect(() => {
    if (metrics) setPerformanceMetrics(metrics);
  }, [metrics]);

  // Compute fingerprints
  useEffect(() => {
    let cancelled = false;
    if (diffs.length === 0) {
      setFingerprints({});
      return;
    }
    (async () => {
      const out: Record<string, FingerprintParts> = {};
      for (const diff of diffs) {
        if (cancelled) return;
        out[diff.id] = await computeFingerprint(diff);
      }
      if (!cancelled) setFingerprints(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [diffs]);

  const value: ValidatorContextValue = {
    stage,
    setStage,
    docs,
    groups,
    accountLevel,
    changeAccountLevel,
    refIndexByGroup,
    setRefIndex,
    enabledGroups,
    toggleGroup,
    baselineFormatByGroup,
    setBaselineFormat,
    diffs,
    fingerprints,
    stats,
    rules,
    rulesLoading,
    setParsedDocs,
    addOccurrence,
    removeOccurrence,
    addPersistedRule,
    removeRule,
    clearRules,
    resetSession,
    getMatch,
    comparisonMode,
    setComparisonMode,
    pipelineProgress,
    performanceMetrics,
    setPipelineProgress,
  };

  return (
    <ValidatorContext.Provider value={value}>
      {children}
    </ValidatorContext.Provider>
  );
};

export const useValidator = () => {
  const context = useContext(ValidatorContext);
  if (!context) {
    throw new Error("useValidator must be used within a ValidatorProvider");
  }
  return context;
};
