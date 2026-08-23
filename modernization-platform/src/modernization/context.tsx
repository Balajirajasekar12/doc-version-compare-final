/**
 * Modernization Platform State Management
 * 
 * React Context + useReducer — zero Convex dependency.
 * All state lives in browser memory.
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
  ModernizationState,
  ModernizationAction,
  ModernizationProject,
  SourceFile,
  Finding,
  InformationRequest,
  Functionality,
  ComponentMapping,
  TestCase,
  AutomationTestCase,
  TestCycle,
} from "./lib/types";

// ── Helpers ───────────────────────────────────────────────────

let _nextId = Date.now();
function genId(): string {
  _nextId += 1;
  return `mod_${_nextId.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Initial State ─────────────────────────────────────────────

const initialState: ModernizationState = {
  projects: [],
  currentProjectId: null,
  sourceFiles: {},
  uploadBatches: {},
  sourceSnapshots: {},
  functionalities: {},
  componentMappings: {},
  findings: {},
  informationRequests: {},
  knowledgeEntries: {},
  businessRuleEntries: {},
  testCases: {},
  automationTestCases: {},
  testCycles: {},
  testExecutions: {},
  stepExecutions: {},
  testEvidence: {},
  defects: {},
};

// ── Reducer ───────────────────────────────────────────────────

function reducer(state: ModernizationState, action: ModernizationAction): ModernizationState {
  switch (action.type) {
    // Projects
    case "CREATE_PROJECT":
      return { ...state, projects: [...state.projects, action.project] };
    case "UPDATE_PROJECT":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId ? { ...p, ...action.updates, updatedAt: Date.now() } : p,
        ),
      };
    case "DELETE_PROJECT": {
      const pid = action.projectId;
      const newSourceFiles = { ...state.sourceFiles };
      const newBatches = { ...state.uploadBatches };
      const newSnapshots = { ...state.sourceSnapshots };
      const newFuncs = { ...state.functionalities };
      const newMappings = { ...state.componentMappings };
      const newFindings = { ...state.findings };
      const newInfoReqs = { ...state.informationRequests };
      const newKnowledge = { ...state.knowledgeEntries };
      const newBizRules = { ...state.businessRuleEntries };
      const newTestCases = { ...state.testCases };
      const newAutoCases = { ...state.automationTestCases };
      const newCycles = { ...state.testCycles };
      const newExecs = { ...state.testExecutions };
      const newSteps = { ...state.stepExecutions };
      const newEvidence = { ...state.testEvidence };
      const newDefects = { ...state.defects };

      for (const key of Object.keys(newSourceFiles)) {
        if (newSourceFiles[key].projectId === pid) delete newSourceFiles[key];
      }
      for (const key of Object.keys(newBatches)) {
        if (newBatches[key].projectId === pid) delete newBatches[key];
      }
      for (const key of Object.keys(newSnapshots)) {
        if (newSnapshots[key].projectId === pid) delete newSnapshots[key];
      }
      for (const key of Object.keys(newFuncs)) {
        if (newFuncs[key].projectId === pid) delete newFuncs[key];
      }
      for (const key of Object.keys(newMappings)) {
        if (newMappings[key].projectId === pid) delete newMappings[key];
      }
      for (const key of Object.keys(newFindings)) {
        if (newFindings[key].projectId === pid) delete newFindings[key];
      }
      for (const key of Object.keys(newInfoReqs)) {
        if (newInfoReqs[key].projectId === pid) delete newInfoReqs[key];
      }
      for (const key of Object.keys(newKnowledge)) {
        if (newKnowledge[key].projectId === pid) delete newKnowledge[key];
      }
      for (const key of Object.keys(newBizRules)) {
        if (newBizRules[key].projectId === pid) delete newBizRules[key];
      }
      for (const key of Object.keys(newTestCases)) {
        if (newTestCases[key].projectId === pid) delete newTestCases[key];
      }
      for (const key of Object.keys(newAutoCases)) {
        if (newAutoCases[key].projectId === pid) delete newAutoCases[key];
      }
      for (const key of Object.keys(newCycles)) {
        if (newCycles[key].projectId === pid) delete newCycles[key];
      }
      for (const key of Object.keys(newExecs)) {
        if (newExecs[key].projectId === pid) delete newExecs[key];
      }
      for (const key of Object.keys(newSteps)) {
        if (newSteps[key].projectId === pid) delete newSteps[key];
      }
      for (const key of Object.keys(newEvidence)) {
        if (newEvidence[key].projectId === pid) delete newEvidence[key];
      }
      for (const key of Object.keys(newDefects)) {
        if (newDefects[key].projectId === pid) delete newDefects[key];
      }

      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== pid),
        currentProjectId: state.currentProjectId === pid ? null : state.currentProjectId,
        sourceFiles: newSourceFiles,
        uploadBatches: newBatches,
        sourceSnapshots: newSnapshots,
        functionalities: newFuncs,
        componentMappings: newMappings,
        findings: newFindings,
        informationRequests: newInfoReqs,
        knowledgeEntries: newKnowledge,
        businessRuleEntries: newBizRules,
        testCases: newTestCases,
        automationTestCases: newAutoCases,
        testCycles: newCycles,
        testExecutions: newExecs,
        stepExecutions: newSteps,
        testEvidence: newEvidence,
        defects: newDefects,
      };
    }
    case "SET_CURRENT_PROJECT":
      return { ...state, currentProjectId: action.projectId };

    // Source Files
    case "ADD_SOURCE_FILES": {
      const newFiles = { ...state.sourceFiles };
      for (const f of action.files) {
        newFiles[f.id] = f;
      }
      return { ...state, sourceFiles: newFiles };
    }
    case "UPDATE_SOURCE_FILE":
      if (!state.sourceFiles[action.fileId]) return state;
      return {
        ...state,
        sourceFiles: {
          ...state.sourceFiles,
          [action.fileId]: { ...state.sourceFiles[action.fileId], ...action.updates },
        },
      };
    case "REMOVE_SOURCE_FILE": {
      const newFiles = { ...state.sourceFiles };
      delete newFiles[action.fileId];
      return { ...state, sourceFiles: newFiles };
    }

    // Upload Batches
    case "ADD_UPLOAD_BATCH":
      return {
        ...state,
        uploadBatches: { ...state.uploadBatches, [action.batch.id]: action.batch },
      };
    case "UPDATE_UPLOAD_BATCH":
      if (!state.uploadBatches[action.batchId]) return state;
      return {
        ...state,
        uploadBatches: {
          ...state.uploadBatches,
          [action.batchId]: { ...state.uploadBatches[action.batchId], ...action.updates },
        },
      };

    // Snapshots
    case "ADD_SNAPSHOT":
      return {
        ...state,
        sourceSnapshots: { ...state.sourceSnapshots, [action.snapshot.id]: action.snapshot },
      };

    // Functionalities
    case "SET_FUNCTIONALITIES": {
      const newFuncs: Record<string, Functionality> = {};
      for (const f of action.functionalities) {
        newFuncs[f.id] = f;
      }
      return { ...state, functionalities: newFuncs };
    }
    case "UPDATE_FUNCTIONALITY":
      if (!state.functionalities[action.id]) return state;
      return {
        ...state,
        functionalities: {
          ...state.functionalities,
          [action.id]: { ...state.functionalities[action.id], ...action.updates },
        },
      };

    // Mappings
    case "SET_COMPONENT_MAPPINGS": {
      const newMappings: Record<string, ComponentMapping> = {};
      for (const m of action.mappings) {
        newMappings[m.id] = m;
      }
      return { ...state, componentMappings: newMappings };
    }

    // Findings
    case "SET_FINDINGS": {
      const newFindings: Record<string, Finding> = {};
      for (const f of action.findings) {
        newFindings[f.id] = f;
      }
      return { ...state, findings: newFindings };
    }
    case "UPDATE_FINDING":
      if (!state.findings[action.id]) return state;
      return {
        ...state,
        findings: {
          ...state.findings,
          [action.id]: { ...state.findings[action.id], ...action.updates, updatedAt: Date.now() },
        },
      };

    // Information Requests
    case "SET_INFORMATION_REQUESTS": {
      const newReqs: Record<string, InformationRequest> = {};
      for (const r of action.requests) {
        newReqs[r.id] = r;
      }
      return { ...state, informationRequests: newReqs };
    }
    case "UPDATE_INFORMATION_REQUEST":
      if (!state.informationRequests[action.id]) return state;
      return {
        ...state,
        informationRequests: {
          ...state.informationRequests,
          [action.id]: { ...state.informationRequests[action.id], ...action.updates, updatedAt: Date.now() },
        },
      };

    // Knowledge
    case "ADD_KNOWLEDGE":
      return {
        ...state,
        knowledgeEntries: { ...state.knowledgeEntries, [action.entry.id]: action.entry },
      };
    case "UPDATE_KNOWLEDGE":
      if (!state.knowledgeEntries[action.id]) return state;
      return {
        ...state,
        knowledgeEntries: {
          ...state.knowledgeEntries,
          [action.id]: { ...state.knowledgeEntries[action.id], ...action.updates, updatedAt: Date.now() },
        },
      };
    case "REMOVE_KNOWLEDGE": {
      const newK = { ...state.knowledgeEntries };
      delete newK[action.id];
      return { ...state, knowledgeEntries: newK };
    }

    // Business Rules
    case "ADD_BUSINESS_RULE":
      return {
        ...state,
        businessRuleEntries: { ...state.businessRuleEntries, [action.entry.id]: action.entry },
      };
    case "UPDATE_BUSINESS_RULE":
      if (!state.businessRuleEntries[action.id]) return state;
      return {
        ...state,
        businessRuleEntries: {
          ...state.businessRuleEntries,
          [action.id]: { ...state.businessRuleEntries[action.id], ...action.updates, updatedAt: Date.now() },
        },
      };
    case "REMOVE_BUSINESS_RULE": {
      const newR = { ...state.businessRuleEntries };
      delete newR[action.id];
      return { ...state, businessRuleEntries: newR };
    }

    // Test Cases
    case "SET_TEST_CASES": {
      const newTC: Record<string, TestCase> = {};
      for (const tc of action.testCases) {
        newTC[tc.id] = tc;
      }
      return { ...state, testCases: newTC };
    }
    case "UPDATE_TEST_CASE":
      if (!state.testCases[action.id]) return state;
      return {
        ...state,
        testCases: {
          ...state.testCases,
          [action.id]: { ...state.testCases[action.id], ...action.updates },
        },
      };
    case "SET_AUTOMATION_TEST_CASES": {
      const newAC: Record<string, AutomationTestCase> = {};
      for (const ac of action.cases) {
        newAC[ac.id] = ac;
      }
      return { ...state, automationTestCases: newAC };
    }

    // Test Cycles
    case "ADD_TEST_CYCLE":
      return {
        ...state,
        testCycles: { ...state.testCycles, [action.cycle.id]: action.cycle },
      };
    case "UPDATE_TEST_CYCLE":
      if (!state.testCycles[action.id]) return state;
      return {
        ...state,
        testCycles: {
          ...state.testCycles,
          [action.id]: { ...state.testCycles[action.id], ...action.updates, updatedAt: Date.now() },
        },
      };
    case "DELETE_TEST_CYCLE": {
      const newCycles = { ...state.testCycles };
      delete newCycles[action.id];
      return { ...state, testCycles: newCycles };
    }

    // Test Executions
    case "ADD_TEST_EXECUTION":
      return {
        ...state,
        testExecutions: { ...state.testExecutions, [action.execution.id]: action.execution },
      };
    case "UPDATE_TEST_EXECUTION":
      if (!state.testExecutions[action.id]) return state;
      return {
        ...state,
        testExecutions: {
          ...state.testExecutions,
          [action.id]: { ...state.testExecutions[action.id], ...action.updates },
        },
      };

    // Step Executions
    case "UPSERT_STEP_EXECUTION":
      return {
        ...state,
        stepExecutions: { ...state.stepExecutions, [action.step.id]: action.step },
      };

    // Evidence
    case "ADD_TEST_EVIDENCE":
      return {
        ...state,
        testEvidence: { ...state.testEvidence, [action.evidence.id]: action.evidence },
      };
    case "REMOVE_TEST_EVIDENCE": {
      const newEv = { ...state.testEvidence };
      delete newEv[action.id];
      return { ...state, testEvidence: newEv };
    }

    // Defects
    case "ADD_DEFECT":
      return {
        ...state,
        defects: { ...state.defects, [action.defect.id]: action.defect },
      };
    case "UPDATE_DEFECT":
      if (!state.defects[action.id]) return state;
      return {
        ...state,
        defects: {
          ...state.defects,
          [action.id]: { ...state.defects[action.id], ...action.updates, updatedAt: Date.now() },
        },
      };

    // Import
    case "IMPORT_PROJECT_DATA": {
      const imported = action.data;
      const newState = { ...state };
      if (imported.projects) newState.projects = [...state.projects, ...imported.projects];
      if (imported.sourceFiles) newState.sourceFiles = { ...state.sourceFiles, ...imported.sourceFiles };
      if (imported.uploadBatches) newState.uploadBatches = { ...state.uploadBatches, ...imported.uploadBatches };
      if (imported.sourceSnapshots) newState.sourceSnapshots = { ...state.sourceSnapshots, ...imported.sourceSnapshots };
      if (imported.functionalities) newState.functionalities = { ...state.functionalities, ...imported.functionalities };
      if (imported.componentMappings) newState.componentMappings = { ...state.componentMappings, ...imported.componentMappings };
      if (imported.findings) newState.findings = { ...state.findings, ...imported.findings };
      if (imported.informationRequests) newState.informationRequests = { ...state.informationRequests, ...imported.informationRequests };
      if (imported.knowledgeEntries) newState.knowledgeEntries = { ...state.knowledgeEntries, ...imported.knowledgeEntries };
      if (imported.businessRuleEntries) newState.businessRuleEntries = { ...state.businessRuleEntries, ...imported.businessRuleEntries };
      if (imported.testCases) newState.testCases = { ...state.testCases, ...imported.testCases };
      if (imported.automationTestCases) newState.automationTestCases = { ...state.automationTestCases, ...imported.automationTestCases };
      if (imported.testCycles) newState.testCycles = { ...state.testCycles, ...imported.testCycles };
      if (imported.testExecutions) newState.testExecutions = { ...state.testExecutions, ...imported.testExecutions };
      if (imported.stepExecutions) newState.stepExecutions = { ...state.stepExecutions, ...imported.stepExecutions };
      if (imported.testEvidence) newState.testEvidence = { ...state.testEvidence, ...imported.testEvidence };
      if (imported.defects) newState.defects = { ...state.defects, ...imported.defects };
      return newState;
    }

    // Reset
    case "RESET_PROJECT": {
      const pid = action.projectId;
      const filterByProject = <T extends { projectId: string }>(record: Record<string, T>) => {
        const result: Record<string, T> = {};
        for (const [k, v] of Object.entries(record)) {
          if (v.projectId !== pid) result[k] = v;
        }
        return result;
      };
      return {
        ...state,
        sourceFiles: filterByProject(state.sourceFiles),
        uploadBatches: filterByProject(state.uploadBatches),
        sourceSnapshots: filterByProject(state.sourceSnapshots),
        functionalities: filterByProject(state.functionalities),
        componentMappings: filterByProject(state.componentMappings),
        findings: filterByProject(state.findings),
        informationRequests: filterByProject(state.informationRequests),
        knowledgeEntries: filterByProject(state.knowledgeEntries),
        businessRuleEntries: filterByProject(state.businessRuleEntries),
        testCases: filterByProject(state.testCases),
        automationTestCases: filterByProject(state.automationTestCases),
        testCycles: filterByProject(state.testCycles),
        testExecutions: filterByProject(state.testExecutions),
        stepExecutions: filterByProject(state.stepExecutions),
        testEvidence: filterByProject(state.testEvidence),
        defects: filterByProject(state.defects),
      };
    }

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────

export interface ModernizationContextValue {
  state: ModernizationState;
  dispatch: React.Dispatch<ModernizationAction>;
  
  // Convenience helpers
  genId: () => string;
  currentProject: ModernizationProject | null;
  getProjectFiles: (projectId: string, sourceType?: "LEGACY" | "MOD") => SourceFile[];
  getProjectFindings: (projectId: string) => Finding[];
  getProjectTestCases: (projectId: string) => TestCase[];
  getProjectTestCycles: (projectId: string) => TestCycle[];
}

const ModernizationContext = createContext<ModernizationContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function ModernizationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const genIdFn = useCallback(() => genId(), []);

  const currentProject = useMemo(
    () => state.projects.find((p) => p.id === state.currentProjectId) ?? null,
    [state.projects, state.currentProjectId],
  );

  const getProjectFiles = useCallback(
    (projectId: string, sourceType?: "LEGACY" | "MOD") => {
      return Object.values(state.sourceFiles).filter(
        (f) => f.projectId === projectId && !f.superseded && (sourceType ? f.sourceType === sourceType : true),
      );
    },
    [state.sourceFiles],
  );

  const getProjectFindings = useCallback(
    (projectId: string) => {
      return Object.values(state.findings).filter((f) => f.projectId === projectId);
    },
    [state.findings],
  );

  const getProjectTestCases = useCallback(
    (projectId: string) => {
      return Object.values(state.testCases).filter((tc) => tc.projectId === projectId);
    },
    [state.testCases],
  );

  const getProjectTestCycles = useCallback(
    (projectId: string) => {
      return Object.values(state.testCycles).filter((c) => c.projectId === projectId);
    },
    [state.testCycles],
  );

  const value = useMemo(
    () => ({
      state,
      dispatch,
      genId: genIdFn,
      currentProject,
      getProjectFiles,
      getProjectFindings,
      getProjectTestCases,
      getProjectTestCycles,
    }),
    [state, genIdFn, currentProject, getProjectFiles, getProjectFindings, getProjectTestCases, getProjectTestCycles],
  );

  return (
    <ModernizationContext.Provider value={value}>
      {children}
    </ModernizationContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useModStore(): ModernizationContextValue {
  const ctx = useContext(ModernizationContext);
  if (!ctx) {
    throw new Error("useModStore must be used within ModernizationProvider");
  }
  return ctx;
}

export { genId };
