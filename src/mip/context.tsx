// ============================================================
// MIP Context Provider
// ============================================================

import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from "react";
import type {
  MipProject,
  SourceFile,
  AnalysisResult,
  Finding,
  BusinessRule,
  KnowledgeEntry,
  EvidenceRequest,
  TestScenario,
  TestCase,
  AutomationCase,
  TestDataRecord,
  DataProfile,
  TestCycle,
  TestExecution,
  Evidence,
  FindingStatus,
  CoverageMetrics,
} from "./types";
import * as db from "./db";

// --- State ---
interface MipState {
  projects: MipProject[];
  currentProjectId: string | null;
  sourceFiles: SourceFile[];
  analyses: AnalysisResult[];
  findings: Finding[];
  rules: BusinessRule[];
  knowledge: KnowledgeEntry[];
  evidenceRequests: EvidenceRequest[];
  scenarios: TestScenario[];
  testCases: TestCase[];
  automationCases: AutomationCase[];
  testData: TestDataRecord[];
  profiles: DataProfile[];
  cycles: TestCycle[];
  executions: TestExecution[];
  evidence: Evidence[];
  loading: boolean;
  saving: boolean;
  lastSaved: number | null;
}

type MipAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SAVING"; payload: boolean }
  | { type: "SET_LAST_SAVED"; payload: number }
  | { type: "LOAD_PROJECTS"; payload: MipProject[] }
  | { type: "SET_CURRENT_PROJECT"; payload: string | null }
  | { type: "ADD_PROJECT"; payload: MipProject }
  | { type: "UPDATE_PROJECT"; payload: MipProject }
  | { type: "REMOVE_PROJECT"; payload: string }
  | { type: "LOAD_SOURCE_FILES"; payload: SourceFile[] }
  | { type: "ADD_SOURCE_FILES"; payload: SourceFile[] }
  | { type: "UPDATE_SOURCE_FILE"; payload: SourceFile }
  | { type: "REMOVE_SOURCE_FILE"; payload: string }
  | { type: "LOAD_ANALYSES"; payload: AnalysisResult[] }
  | { type: "ADD_ANALYSES"; payload: AnalysisResult[] }
  | { type: "LOAD_FINDINGS"; payload: Finding[] }
  | { type: "ADD_FINDING"; payload: Finding }
  | { type: "UPDATE_FINDING"; payload: Finding }
  | { type: "REMOVE_FINDING"; payload: string }
  | { type: "LOAD_RULES"; payload: BusinessRule[] }
  | { type: "ADD_RULE"; payload: BusinessRule }
  | { type: "UPDATE_RULE"; payload: BusinessRule }
  | { type: "REMOVE_RULE"; payload: string }
  | { type: "LOAD_KNOWLEDGE"; payload: KnowledgeEntry[] }
  | { type: "ADD_KNOWLEDGE"; payload: KnowledgeEntry }
  | { type: "LOAD_EVIDENCE_REQUESTS"; payload: EvidenceRequest[] }
  | { type: "ADD_EVIDENCE_REQUEST"; payload: EvidenceRequest }
  | { type: "UPDATE_EVIDENCE_REQUEST"; payload: EvidenceRequest }
  | { type: "LOAD_SCENARIOS"; payload: TestScenario[] }
  | { type: "ADD_SCENARIO"; payload: TestScenario }
  | { type: "UPDATE_SCENARIO"; payload: TestScenario }
  | { type: "LOAD_TEST_CASES"; payload: TestCase[] }
  | { type: "ADD_TEST_CASES"; payload: TestCase[] }
  | { type: "UPDATE_TEST_CASE"; payload: TestCase }
  | { type: "LOAD_AUTOMATION"; payload: AutomationCase[] }
  | { type: "ADD_AUTOMATION_CASES"; payload: AutomationCase[] }
  | { type: "LOAD_TEST_DATA"; payload: TestDataRecord[] }
  | { type: "ADD_TEST_DATA"; payload: TestDataRecord }
  | { type: "LOAD_PROFILES"; payload: DataProfile[] }
  | { type: "LOAD_CYCLES"; payload: TestCycle[] }
  | { type: "ADD_CYCLE"; payload: TestCycle }
  | { type: "LOAD_EXECUTIONS"; payload: TestExecution[] }
  | { type: "ADD_EXECUTIONS"; payload: TestExecution[] }
  | { type: "UPDATE_EXECUTION"; payload: TestExecution }
  | { type: "LOAD_EVIDENCE"; payload: Evidence[] }
  | { type: "ADD_EVIDENCE"; payload: Evidence };

function reducer(state: MipState, action: MipAction): MipState {
  switch (action.type) {
    case "SET_LOADING": return { ...state, loading: action.payload };
    case "SET_SAVING": return { ...state, saving: action.payload };
    case "SET_LAST_SAVED": return { ...state, lastSaved: action.payload, saving: false };
    case "LOAD_PROJECTS": return { ...state, projects: action.payload };
    case "SET_CURRENT_PROJECT": return { ...state, currentProjectId: action.payload };
    case "ADD_PROJECT": return { ...state, projects: [...state.projects, action.payload] };
    case "UPDATE_PROJECT": return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
    case "REMOVE_PROJECT": return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };
    case "LOAD_SOURCE_FILES": return { ...state, sourceFiles: action.payload };
    case "ADD_SOURCE_FILES": return { ...state, sourceFiles: [...state.sourceFiles, ...action.payload] };
    case "UPDATE_SOURCE_FILE": return { ...state, sourceFiles: state.sourceFiles.map(f => f.id === action.payload.id ? action.payload : f) };
    case "REMOVE_SOURCE_FILE": return { ...state, sourceFiles: state.sourceFiles.filter(f => f.id !== action.payload) };
    case "LOAD_ANALYSES": return { ...state, analyses: action.payload };
    case "ADD_ANALYSES": return { ...state, analyses: [...state.analyses, ...action.payload] };
    case "LOAD_FINDINGS": return { ...state, findings: action.payload };
    case "ADD_FINDING": return { ...state, findings: [...state.findings, action.payload] };
    case "UPDATE_FINDING": return { ...state, findings: state.findings.map(f => f.id === action.payload.id ? action.payload : f) };
    case "REMOVE_FINDING": return { ...state, findings: state.findings.filter(f => f.id !== action.payload) };
    case "LOAD_RULES": return { ...state, rules: action.payload };
    case "ADD_RULE": return { ...state, rules: [...state.rules, action.payload] };
    case "UPDATE_RULE": return { ...state, rules: state.rules.map(r => r.id === action.payload.id ? action.payload : r) };
    case "REMOVE_RULE": return { ...state, rules: state.rules.filter(r => r.id !== action.payload) };
    case "LOAD_KNOWLEDGE": return { ...state, knowledge: action.payload };
    case "ADD_KNOWLEDGE": return { ...state, knowledge: [...state.knowledge, action.payload] };
    case "LOAD_EVIDENCE_REQUESTS": return { ...state, evidenceRequests: action.payload };
    case "ADD_EVIDENCE_REQUEST": return { ...state, evidenceRequests: [...state.evidenceRequests, action.payload] };
    case "UPDATE_EVIDENCE_REQUEST": return { ...state, evidenceRequests: state.evidenceRequests.map(e => e.id === action.payload.id ? action.payload : e) };
    case "LOAD_SCENARIOS": return { ...state, scenarios: action.payload };
    case "ADD_SCENARIO": return { ...state, scenarios: [...state.scenarios, action.payload] };
    case "UPDATE_SCENARIO": return { ...state, scenarios: state.scenarios.map(s => s.id === action.payload.id ? action.payload : s) };
    case "LOAD_TEST_CASES": return { ...state, testCases: action.payload };
    case "ADD_TEST_CASES": return { ...state, testCases: [...state.testCases, ...action.payload] };
    case "UPDATE_TEST_CASE": return { ...state, testCases: state.testCases.map(t => t.id === action.payload.id ? action.payload : t) };
    case "LOAD_AUTOMATION": return { ...state, automationCases: action.payload };
    case "ADD_AUTOMATION_CASES": return { ...state, automationCases: [...state.automationCases, ...action.payload] };
    case "LOAD_TEST_DATA": return { ...state, testData: action.payload };
    case "ADD_TEST_DATA": return { ...state, testData: [...state.testData, action.payload] };
    case "LOAD_PROFILES": return { ...state, profiles: action.payload };
    case "LOAD_CYCLES": return { ...state, cycles: action.payload };
    case "ADD_CYCLE": return { ...state, cycles: [...state.cycles, action.payload] };
    case "LOAD_EXECUTIONS": return { ...state, executions: action.payload };
    case "ADD_EXECUTIONS": return { ...state, executions: [...state.executions, ...action.payload] };
    case "UPDATE_EXECUTION": return { ...state, executions: state.executions.map(e => e.id === action.payload.id ? action.payload : e) };
    case "LOAD_EVIDENCE": return { ...state, evidence: action.payload };
    case "ADD_EVIDENCE": return { ...state, evidence: [...state.evidence, action.payload] };
    default: return state;
  }
}

// --- Context ---
interface MipContextValue {
  state: MipState;
  currentProject: MipProject | null;
  dispatch: React.Dispatch<MipAction>;
  // Convenience methods
  createProject: (name: string, description: string) => Promise<MipProject>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string) => Promise<void>;
  uploadFiles: (files: File[], side: "legacy" | "modern") => Promise<SourceFile[]>;
  analyzeProject: () => Promise<void>;
  addFinding: (finding: Omit<Finding, "id" | "createdAt" | "updatedAt">) => Promise<Finding>;
  updateFinding: (finding: Finding) => Promise<void>;
  addRule: (rule: Omit<BusinessRule, "id" | "createdAt" | "updatedAt" | "ruleNumber">) => Promise<BusinessRule>;
  updateRule: (rule: BusinessRule) => Promise<void>;
  addScenario: (scenario: Omit<TestScenario, "id" | "createdAt" | "scenarioNumber">) => Promise<TestScenario>;
  generateTestCases: (scenarioIds: string[]) => Promise<TestCase[]>;
  generateAutomationCases: (testCaseIds: string[]) => Promise<AutomationCase[]>;
  classifyFinding: (findingId: string, status: FindingStatus, comments?: string) => Promise<void>;
  computeCoverage: () => CoverageMetrics;
  freezeProject: (reason: string, note: string) => Promise<void>;
  exportProject: (projectId: string) => Promise<Blob>;
  importProject: (file: File) => Promise<string>;
}

const MipContext = createContext<MipContextValue | null>(null);

export function useMip(): MipContextValue {
  const ctx = useContext(MipContext);
  if (!ctx) throw new Error("useMip must be used within MipProvider");
  return ctx;
}

// --- Provider ---
let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function MipProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    projects: [],
    currentProjectId: null,
    sourceFiles: [],
    analyses: [],
    findings: [],
    rules: [],
    knowledge: [],
    evidenceRequests: [],
    scenarios: [],
    testCases: [],
    automationCases: [],
    testData: [],
    profiles: [],
    cycles: [],
    executions: [],
    evidence: [],
    loading: true,
    saving: false,
    lastSaved: null,
  });

  const currentProject = state.projects.find(p => p.id === state.currentProjectId) ?? null;

  // Load projects on mount
  useEffect(() => {
    (async () => {
      try {
        const projects = await db.projectDB.getAll();
        dispatch({ type: "LOAD_PROJECTS", payload: projects });
      } catch (err) {
        console.error("[MIP] Failed to load projects:", err);
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    })();
  }, []);

  // Load project data when currentProjectId changes
  const selectProject = useCallback(async (id: string) => {
    dispatch({ type: "SET_CURRENT_PROJECT", payload: id });
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const [files, analyses, findings, rules, knowledge, evReqs, scenarios, testCases, autoCases, testData, profiles, cycles, executions, evidence] = await Promise.all([
        db.sourceFileDB.getByProject(id),
        db.analysisDB.getByProject(id),
        db.findingDB.getByProject(id),
        db.ruleDB.getByProject(id),
        db.knowledgeDB.getByProject(id),
        db.evidenceRequestDB.getByProject(id),
        db.scenarioDB.getByProject(id),
        db.testCaseDB.getByProject(id),
        db.automationDB.getByProject(id),
        db.testDataDB.getByProject(id),
        db.profileDB.getByProject(id),
        db.cycleDB.getByProject(id),
        db.executionDB.getByProject(id),
        db.evidenceDB.getByProject(id),
      ]);
      dispatch({ type: "LOAD_SOURCE_FILES", payload: files });
      dispatch({ type: "LOAD_ANALYSES", payload: analyses });
      dispatch({ type: "LOAD_FINDINGS", payload: findings });
      dispatch({ type: "LOAD_RULES", payload: rules });
      dispatch({ type: "LOAD_KNOWLEDGE", payload: knowledge });
      dispatch({ type: "LOAD_EVIDENCE_REQUESTS", payload: evReqs });
      dispatch({ type: "LOAD_SCENARIOS", payload: scenarios });
      dispatch({ type: "LOAD_TEST_CASES", payload: testCases });
      dispatch({ type: "LOAD_AUTOMATION", payload: autoCases });
      dispatch({ type: "LOAD_TEST_DATA", payload: testData });
      dispatch({ type: "LOAD_PROFILES", payload: profiles });
      dispatch({ type: "LOAD_CYCLES", payload: cycles });
      dispatch({ type: "LOAD_EXECUTIONS", payload: executions });
      dispatch({ type: "LOAD_EVIDENCE", payload: evidence });
    } catch (err) {
      console.error("[MIP] Failed to load project data:", err);
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, []);

  const createProject = useCallback(async (name: string, description: string): Promise<MipProject> => {
    const project: MipProject = {
      id: genId("proj"),
      name,
      description,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      legacyLabel: "Legacy",
      modernLabel: "Modern",
      freezeHistory: [],
      settings: {
        legacyExtensions: [".java", ".sql", ".pls", ".pkb", ".pks", ".json", ".xml", ".sh", ".ejb"],
        modernExtensions: [".java", ".json", ".xml", ".sh"],
        analysisDepth: "detailed",
      },
    };
    await db.projectDB.save(project);
    dispatch({ type: "ADD_PROJECT", payload: project });
    return project;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await db.projectDB.remove(id);
    dispatch({ type: "REMOVE_PROJECT", payload: id });
    if (state.currentProjectId === id) {
      dispatch({ type: "SET_CURRENT_PROJECT", payload: null });
    }
  }, [state.currentProjectId]);

  // --- File upload with ZIP extraction ---
  const uploadFiles = useCallback(async (files: File[], side: "legacy" | "modern"): Promise<SourceFile[]> => {
    const projectId = state.currentProjectId;
    if (!projectId) throw new Error("No project selected");

    const extracted: SourceFile[] = [];

    for (const file of files) {
      if (file.name.endsWith(".zip")) {
        // Extract ZIP in browser
        const JSZip = (await import("jszip")).default;
        const zipData = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(zipData);

        for (const [path, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue;
          // Only process supported text files
          const ext = path.split(".").pop()?.toLowerCase() || "";
          const supportedExts = ["java", "sql", "pls", "pkb", "pks", "json", "xml", "sh", "ejb", "txt", "py", "ts", "js", "properties", "yml", "yaml", "cfg", "conf", "ini"];
          if (!supportedExts.includes(ext)) continue;

          try {
            const content = await zipEntry.async("string");
            const sf: SourceFile = {
              id: genId("file"),
              projectId,
              side,
              name: path.split("/").pop() || path,
              path,
              size: content.length,
              type: `.${ext}`,
              language: detectLanguage(path),
              content,
              status: "uploaded",
              uploadedAt: Date.now(),
            };
            extracted.push(sf);
          } catch {
            // Skip binary files that can't be decoded as text
          }
        }
      } else {
        const content = await readFileAsText(file);
        const sf: SourceFile = {
          id: genId("file"),
          projectId,
          side,
          name: file.name,
          path: file.name,
          size: file.size,
          type: getFileExt(file.name),
          language: detectLanguage(file.name),
          content,
          status: "uploaded",
          uploadedAt: Date.now(),
        };
        extracted.push(sf);
      }
    }

    // Persist all files
    await db.sourceFileDB.saveAll(extracted);
    dispatch({ type: "ADD_SOURCE_FILES", payload: extracted });
    return extracted;
  }, [state.currentProjectId]);

  // --- Analysis ---
  const analyzeProject = useCallback(async () => {
    const projectId = state.currentProjectId;
    if (!projectId) return;

    const { analyzeSourceFile } = await import("./analyzer");
    const files = state.sourceFiles;
    const results: AnalysisResult[] = [];

    for (const file of files) {
      if (file.status === "analyzed") continue;
      dispatch({ type: "UPDATE_SOURCE_FILE", payload: { ...file, status: "analyzing" } });

      try {
        const result = analyzeSourceFile(file);
        results.push(result);
        dispatch({ type: "UPDATE_SOURCE_FILE", payload: { ...file, status: "analyzed", analyzedAt: Date.now() } });
      } catch (err) {
        console.error(`[MIP] Analysis failed for ${file.name}:`, err);
        dispatch({ type: "UPDATE_SOURCE_FILE", payload: { ...file, status: "error" } });
      }
    }

    await db.analysisDB.saveAll(results);
    dispatch({ type: "ADD_ANALYSES", payload: results });
  }, [state.currentProjectId, state.sourceFiles]);

  // --- Findings ---
  const addFinding = useCallback(async (finding: Omit<Finding, "id" | "createdAt" | "updatedAt">): Promise<Finding> => {
    const full: Finding = {
      ...finding,
      id: genId("finding"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.findingDB.save(full);
    dispatch({ type: "ADD_FINDING", payload: full });
    return full;
  }, []);

  const updateFinding = useCallback(async (finding: Finding) => {
    const updated = { ...finding, updatedAt: Date.now() };
    await db.findingDB.save(updated);
    dispatch({ type: "UPDATE_FINDING", payload: updated });
  }, []);

  const classifyFinding = useCallback(async (findingId: string, status: FindingStatus, comments?: string) => {
    const finding = state.findings.find(f => f.id === findingId);
    if (!finding) return;
    const updated: Finding = { ...finding, status, comments: comments ?? finding.comments, updatedAt: Date.now() };
    await db.findingDB.save(updated);
    dispatch({ type: "UPDATE_FINDING", payload: updated });
  }, [state.findings]);

  // --- Rules ---
  const addRule = useCallback(async (rule: Omit<BusinessRule, "id" | "createdAt" | "updatedAt" | "ruleNumber">): Promise<BusinessRule> => {
    const projectId = state.currentProjectId || "";
    const existingRules = state.rules.filter(r => r.projectId === projectId);
    const ruleNumber = `BR-${String(existingRules.length + 1).padStart(3, "0")}`;
    const full: BusinessRule = {
      ...rule,
      id: genId("rule"),
      ruleNumber,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.ruleDB.save(full);
    dispatch({ type: "ADD_RULE", payload: full });
    return full;
  }, [state.currentProjectId, state.rules]);

  const updateRule = useCallback(async (rule: BusinessRule) => {
    const updated = { ...rule, updatedAt: Date.now() };
    await db.ruleDB.save(updated);
    dispatch({ type: "UPDATE_RULE", payload: updated });
  }, []);

  // --- Scenarios ---
  const addScenario = useCallback(async (scenario: Omit<TestScenario, "id" | "createdAt" | "scenarioNumber">): Promise<TestScenario> => {
    const projectId = state.currentProjectId || "";
    const existing = state.scenarios.filter(s => s.projectId === projectId);
    const scenarioNumber = `TS-${String(existing.length + 1).padStart(3, "0")}`;
    const full: TestScenario = {
      ...scenario,
      id: genId("scenario"),
      scenarioNumber,
      createdAt: Date.now(),
    };
    await db.scenarioDB.save(full);
    dispatch({ type: "ADD_SCENARIO", payload: full });
    return full;
  }, [state.currentProjectId, state.scenarios]);

  // --- Test Case Generation ---
  const generateTestCases = useCallback(async (scenarioIds: string[]): Promise<TestCase[]> => {
    const projectId = state.currentProjectId;
    if (!projectId) return [];

    const { generateCasesFromScenarios } = await import("./analyzer");
    const scenarios = state.scenarios.filter(s => scenarioIds.includes(s.id));
    const findings = state.findings;
    const rules = state.rules;
    const files = state.sourceFiles;

    const cases = generateCasesFromScenarios(scenarios, findings, rules, files, projectId);

    await db.testCaseDB.saveAll(cases);
    dispatch({ type: "ADD_TEST_CASES", payload: cases });
    return cases;
  }, [state.currentProjectId, state.scenarios, state.findings, state.rules, state.sourceFiles]);

  // --- Automation Case Generation ---
  const generateAutomationCases = useCallback(async (testCaseIds: string[]): Promise<AutomationCase[]> => {
    const projectId = state.currentProjectId;
    if (!projectId) return [];

    const cases: AutomationCase[] = testCaseIds.map(tcId => {
      const tc = state.testCases.find(t => t.id === tcId);
      return {
        id: genId("auto"),
        projectId,
        automationId: `AT-${String(state.automationCases.length + 1).padStart(3, "0")}`,
        manualTestCaseId: tcId,
        scenario: tc?.title || "",
        preconditions: tc?.preconditions || [],
        inputData: tc?.steps.map(s => s.action).join("; ") || "",
        expectedResult: tc?.expectedResult || "",
        assertions: [`Verify: ${tc?.expectedResult || "expected result"}`],
        status: "not_run",
        createdAt: Date.now(),
      };
    });

    await db.automationDB.saveAll(cases);
    dispatch({ type: "ADD_AUTOMATION_CASES", payload: cases });
    return cases;
  }, [state.currentProjectId, state.testCases, state.automationCases.length]);

  // --- Coverage ---
  const computeCoverage = useCallback((): CoverageMetrics => {
    const legacyFiles = state.sourceFiles.filter(f => f.side === "legacy");
    const totalConditions = state.analyses.reduce((sum, a) => sum + a.conditions.length, 0);
    const totalBusinessRules = state.rules.length;
    const totalFindings = state.findings.length;

    return {
      legacyLogicAnalyzed: legacyFiles.filter(f => f.status === "analyzed").length,
      legacyConditions: totalConditions,
      conditionsMapped: state.findings.length,
      conditionsMissing: 0,
      businessRulesIdentified: totalBusinessRules,
      rulesWithScenarios: state.rules.filter(r => r.linkedScenarioIds.length > 0).length,
      rulesWithManualTests: state.rules.filter(r => r.linkedTestCaseIds.length > 0).length,
      rulesWithAutomation: 0,
      findingsResolved: state.findings.filter(f => f.status === "resolved").length,
      findingsDeferred: state.findings.filter(f => f.status === "deferred").length,
      findingsAccepted: state.findings.filter(f => f.status === "accepted").length,
      totalFindings,
      executionCoverage: state.testCases.length > 0 ? (state.testCases.filter(t => t.status !== "not_run").length / state.testCases.length) * 100 : 0,
      passRate: state.testCases.filter(t => t.status === "pass").length / Math.max(state.testCases.filter(t => t.status !== "not_run").length, 1) * 100,
      failureRate: state.testCases.filter(t => t.status === "fail").length / Math.max(state.testCases.filter(t => t.status !== "not_run").length, 1) * 100,
    };
  }, [state]);

  // --- Freeze ---
  const freezeProject = useCallback(async (reason: string, note: string) => {
    if (!currentProject) return;
    const updated: MipProject = {
      ...currentProject,
      status: "frozen",
      updatedAt: Date.now(),
      freezeHistory: [
        ...currentProject.freezeHistory,
        {
          version: `v${currentProject.freezeHistory.length + 1}`,
          date: Date.now(),
          reason,
          note,
        },
      ],
    };
    await db.projectDB.save(updated);
    dispatch({ type: "UPDATE_PROJECT", payload: updated });
  }, [currentProject]);

  // --- Export/Import ---
  const exportProjectFn = useCallback(async (projectId: string) => {
    return db.exportProject(projectId);
  }, []);

  const importProjectFn = useCallback(async (file: File) => {
    const projectId = await db.importProject(file);
    // Reload all projects
    const projects = await db.projectDB.getAll();
    dispatch({ type: "LOAD_PROJECTS", payload: projects });
    return projectId;
  }, []);

  const value: MipContextValue = {
    state,
    currentProject,
    dispatch,
    createProject,
    deleteProject,
    selectProject,
    uploadFiles,
    analyzeProject,
    addFinding,
    updateFinding,
    addRule,
    updateRule,
    addScenario,
    generateTestCases,
    generateAutomationCases,
    classifyFinding,
    computeCoverage,
    freezeProject,
    exportProject: exportProjectFn,
    importProject: importProjectFn,
  };

  return <MipContext.Provider value={value}>{children}</MipContext.Provider>;
}

// --- Helpers ---
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx) : "";
}

function detectLanguage(filename: string): string {
  const ext = getFileExt(filename).toLowerCase();
  const map: Record<string, string> = {
    ".java": "Java",
    ".sql": "SQL",
    ".pls": "PL/SQL",
    ".plsql": "PL/SQL",
    ".pkb": "PL/SQL",
    ".pks": "PL/SQL",
    ".json": "JSON",
    ".xml": "XML",
    ".sh": "Shell",
    ".bash": "Shell",
    ".ejb": "Java",
    ".py": "Python",
    ".ts": "TypeScript",
    ".js": "JavaScript",
    ".properties": "Properties",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".cfg": "Config",
    ".conf": "Config",
    ".ini": "Config",
    ".txt": "Text",
    ".csv": "CSV",
  };
  return map[ext] || "Unknown";
}
