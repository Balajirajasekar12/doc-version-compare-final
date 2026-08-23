// ============================================================
// MIP IndexedDB Storage Layer
// ============================================================

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
  AutomationResult,
  TestDataRecord,
  DataProfile,
  TraceabilityLink,
  TestCycle,
  TestExecution,
  Evidence,
  CoverageMetrics,
} from "./types";

const DB_NAME = "mip_db";
const DB_VERSION = 1;

const STORES = {
  projects: "projects",
  sourceFiles: "sourceFiles",
  analyses: "analyses",
  findings: "findings",
  rules: "rules",
  knowledge: "knowledge",
  evidenceRequests: "evidenceRequests",
  scenarios: "scenarios",
  testCases: "testCases",
  automationCases: "automationCases",
  automationResults: "automationResults",
  testData: "testData",
  profiles: "profiles",
  traceLinks: "traceLinks",
  cycles: "cycles",
  executions: "executions",
  evidence: "evidence",
} as const;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const storeName of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "id" });
          if (storeName === "sourceFiles") {
            store.createIndex("projectId", "projectId", { unique: false });
            store.createIndex("side", "side", { unique: false });
          } else if (storeName === "findings" || storeName === "rules" || storeName === "testCases") {
            store.createIndex("projectId", "projectId", { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function getAllByIndex<T>(storeName: string, indexName: string, value: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function put<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function putAll<T>(storeName: string, items: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// Public API
// ============================================================

// --- Projects ---
export const projectDB = {
  getAll: () => getAll<MipProject>(STORES.projects),
  getById: (id: string) => getById<MipProject>(STORES.projects, id),
  save: (project: MipProject) => put(STORES.projects, project),
  remove: (id: string) => remove(STORES.projects, id),
};

// --- Source Files ---
export const sourceFileDB = {
  getAll: () => getAll<SourceFile>(STORES.sourceFiles),
  getByProject: (projectId: string) => getAllByIndex<SourceFile>(STORES.sourceFiles, "projectId", projectId),
  getById: (id: string) => getById<SourceFile>(STORES.sourceFiles, id),
  save: (file: SourceFile) => put(STORES.sourceFiles, file),
  saveAll: (files: SourceFile[]) => putAll(STORES.sourceFiles, files),
  remove: (id: string) => remove(STORES.sourceFiles, id),
};

// --- Analysis ---
export const analysisDB = {
  getAll: () => getAll<AnalysisResult>(STORES.analyses),
  getByProject: (projectId: string) => getAllByIndex<AnalysisResult>(STORES.analyses, "projectId", projectId),
  getById: (id: string) => getById<AnalysisResult>(STORES.analyses, id),
  save: (result: AnalysisResult) => put(STORES.analyses, result),
  saveAll: (results: AnalysisResult[]) => putAll(STORES.analyses, results),
};

// --- Findings ---
export const findingDB = {
  getAll: () => getAll<Finding>(STORES.findings),
  getByProject: (projectId: string) => getAllByIndex<Finding>(STORES.findings, "projectId", projectId),
  getById: (id: string) => getById<Finding>(STORES.findings, id),
  save: (finding: Finding) => put(STORES.findings, finding),
  remove: (id: string) => remove(STORES.findings, id),
};

// --- Rules ---
export const ruleDB = {
  getAll: () => getAll<BusinessRule>(STORES.rules),
  getByProject: (projectId: string) => getAllByIndex<BusinessRule>(STORES.rules, "projectId", projectId),
  getById: (id: string) => getById<BusinessRule>(STORES.rules, id),
  save: (rule: BusinessRule) => put(STORES.rules, rule),
  remove: (id: string) => remove(STORES.rules, id),
};

// --- Knowledge ---
export const knowledgeDB = {
  getAll: () => getAll<KnowledgeEntry>(STORES.knowledge),
  getByProject: (projectId: string) => getAllByIndex<KnowledgeEntry>(STORES.knowledge, "projectId", projectId),
  save: (entry: KnowledgeEntry) => put(STORES.knowledge, entry),
  remove: (id: string) => remove(STORES.knowledge, id),
};

// --- Evidence Requests ---
export const evidenceRequestDB = {
  getAll: () => getAll<EvidenceRequest>(STORES.evidenceRequests),
  getByProject: (projectId: string) => getAllByIndex<EvidenceRequest>(STORES.evidenceRequests, "projectId", projectId),
  save: (req: EvidenceRequest) => put(STORES.evidenceRequests, req),
  remove: (id: string) => remove(STORES.evidenceRequests, id),
};

// --- Test Scenarios ---
export const scenarioDB = {
  getAll: () => getAll<TestScenario>(STORES.scenarios),
  getByProject: (projectId: string) => getAllByIndex<TestScenario>(STORES.scenarios, "projectId", projectId),
  getById: (id: string) => getById<TestScenario>(STORES.scenarios, id),
  save: (scenario: TestScenario) => put(STORES.scenarios, scenario),
  remove: (id: string) => remove(STORES.scenarios, id),
};

// --- Test Cases ---
export const testCaseDB = {
  getAll: () => getAll<TestCase>(STORES.testCases),
  getByProject: (projectId: string) => getAllByIndex<TestCase>(STORES.testCases, "projectId", projectId),
  getById: (id: string) => getById<TestCase>(STORES.testCases, id),
  save: (tc: TestCase) => put(STORES.testCases, tc),
  saveAll: (tcs: TestCase[]) => putAll(STORES.testCases, tcs),
  remove: (id: string) => remove(STORES.testCases, id),
};

// --- Automation Cases ---
export const automationDB = {
  getAll: () => getAll<AutomationCase>(STORES.automationCases),
  getByProject: (projectId: string) => getAllByIndex<AutomationCase>(STORES.automationCases, "projectId", projectId),
  save: (ac: AutomationCase) => put(STORES.automationCases, ac),
  saveAll: (acs: AutomationCase[]) => putAll(STORES.automationCases, acs),
};

// --- Automation Results ---
export const automationResultDB = {
  getAll: () => getAll<AutomationResult>(STORES.automationResults),
  getByProject: (projectId: string) => getAllByIndex<AutomationResult>(STORES.automationResults, "projectId", projectId),
  save: (ar: AutomationResult) => put(STORES.automationResults, ar),
  saveAll: (ars: AutomationResult[]) => putAll(STORES.automationResults, ars),
};

// --- Test Data ---
export const testDataDB = {
  getAll: () => getAll<TestDataRecord>(STORES.testData),
  getByProject: (projectId: string) => getAllByIndex<TestDataRecord>(STORES.testData, "projectId", projectId),
  save: (td: TestDataRecord) => put(STORES.testData, td),
  remove: (id: string) => remove(STORES.testData, id),
};

// --- Data Profiles ---
export const profileDB = {
  getAll: () => getAll<DataProfile>(STORES.profiles),
  getByProject: (projectId: string) => getAllByIndex<DataProfile>(STORES.profiles, "projectId", projectId),
  save: (p: DataProfile) => put(STORES.profiles, p),
};

// --- Traceability ---
export const traceDB = {
  getAll: () => getAll<TraceabilityLink>(STORES.traceLinks),
  getByProject: (projectId: string) => getAllByIndex<TraceabilityLink>(STORES.traceLinks, "projectId", projectId),
  save: (link: TraceabilityLink) => put(STORES.traceLinks, link),
};

// --- Test Cycles ---
export const cycleDB = {
  getAll: () => getAll<TestCycle>(STORES.cycles),
  getByProject: (projectId: string) => getAllByIndex<TestCycle>(STORES.cycles, "projectId", projectId),
  save: (cycle: TestCycle) => put(STORES.cycles, cycle),
};

// --- Test Executions ---
export const executionDB = {
  getAll: () => getAll<TestExecution>(STORES.executions),
  getByProject: (projectId: string) => getAllByIndex<TestExecution>(STORES.executions, "projectId", projectId),
  save: (exec: TestExecution) => put(STORES.executions, exec),
  saveAll: (execs: TestExecution[]) => putAll(STORES.executions, execs),
};

// --- Evidence ---
export const evidenceDB = {
  getAll: () => getAll<Evidence>(STORES.evidence),
  getByProject: (projectId: string) => getAllByIndex<Evidence>(STORES.evidence, "projectId", projectId),
  save: (ev: Evidence) => put(STORES.evidence, ev),
};

// ============================================================
// Export/Import (.mip format)
// ============================================================

export interface MipExportData {
  version: string;
  exportedAt: number;
  projects: MipProject[];
  sourceFiles: SourceFile[];
  analyses: AnalysisResult[];
  findings: Finding[];
  rules: BusinessRule[];
  knowledge: KnowledgeEntry[];
  evidenceRequests: EvidenceRequest[];
  scenarios: TestScenario[];
  testCases: TestCase[];
  automationCases: AutomationCase[];
  automationResults: AutomationResult[];
  testData: TestDataRecord[];
  profiles: DataProfile[];
  traceLinks: TraceabilityLink[];
  cycles: TestCycle[];
  executions: TestExecution[];
  evidence: Evidence[];
}

export async function exportProject(projectId: string): Promise<Blob> {
  const [projects, sourceFiles, analyses, findings, rules, knowledge, evidenceRequests, scenarios, testCases, automationCases, automationResults, testData, profiles, traceLinks, cycles, executions, evidence] = await Promise.all([
    projectDB.getAll(),
    sourceFileDB.getByProject(projectId),
    analysisDB.getByProject(projectId),
    findingDB.getByProject(projectId),
    ruleDB.getByProject(projectId),
    knowledgeDB.getByProject(projectId),
    evidenceRequestDB.getByProject(projectId),
    scenarioDB.getByProject(projectId),
    testCaseDB.getByProject(projectId),
    automationDB.getByProject(projectId),
    automationResultDB.getByProject(projectId),
    testDataDB.getByProject(projectId),
    profileDB.getByProject(projectId),
    traceDB.getByProject(projectId),
    cycleDB.getByProject(projectId),
    executionDB.getByProject(projectId),
    evidenceDB.getByProject(projectId),
  ]);

  const data: MipExportData = {
    version: "1.0.0",
    exportedAt: Date.now(),
    projects: projects.filter(p => p.id === projectId),
    sourceFiles, analyses, findings, rules, knowledge, evidenceRequests,
    scenarios, testCases, automationCases, automationResults,
    testData, profiles, traceLinks, cycles, executions, evidence,
  };

  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

export async function importProject(file: File): Promise<string> {
  const text = await file.text();
  const data: MipExportData = JSON.parse(text);

  if (!data.version || !data.projects?.length) {
    throw new Error("Invalid .mip file format");
  }

  const projectId = data.projects[0].id;

  // Save all data
  await Promise.all([
    putAll(STORES.projects, data.projects),
    sourceFileDB.saveAll(data.sourceFiles),
    analysisDB.saveAll(data.analyses),
    ...data.findings.map(f => findingDB.save(f)),
    ...data.rules.map(r => ruleDB.save(r)),
    ...data.knowledge.map(k => knowledgeDB.save(k)),
    ...data.evidenceRequests.map(e => evidenceRequestDB.save(e)),
    ...data.scenarios.map(s => scenarioDB.save(s)),
    testCaseDB.saveAll(data.testCases),
    automationDB.saveAll(data.automationCases),
    automationResultDB.saveAll(data.automationResults),
    ...data.testData.map(t => testDataDB.save(t)),
    ...data.profiles.map(p => profileDB.save(p)),
    ...data.traceLinks.map(t => traceDB.save(t)),
    ...data.cycles.map(c => cycleDB.save(c)),
    executionDB.saveAll(data.executions),
    ...data.evidence.map(e => evidenceDB.save(e)),
  ]);

  return projectId;
}

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(Object.values(STORES), "readwrite");
  for (const storeName of Object.values(STORES)) {
    tx.objectStore(storeName).clear();
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
