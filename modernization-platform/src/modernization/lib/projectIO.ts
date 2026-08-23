/**
 * Project Export / Import
 * 
 * Download and upload .mip files entirely in the browser.
 * No server communication.
 */

import type { ModernizationState } from "./types";

const MIP_MAGIC = "MIPTE";
const MIP_VERSION = 1;

interface MipFile {
  magic: string;
  version: number;
  exportedAt: number;
  projectName: string;
  data: {
    projects: ModernizationState["projects"];
    sourceFiles: ModernizationState["sourceFiles"];
    uploadBatches: ModernizationState["uploadBatches"];
    functionalities: ModernizationState["functionalities"];
    componentMappings: ModernizationState["componentMappings"];
    findings: ModernizationState["findings"];
    informationRequests: ModernizationState["informationRequests"];
    knowledgeEntries: ModernizationState["knowledgeEntries"];
    businessRuleEntries: ModernizationState["businessRuleEntries"];
    testCases: ModernizationState["testCases"];
    automationTestCases: ModernizationState["automationTestCases"];
    testCycles: ModernizationState["testCycles"];
    testExecutions: ModernizationState["testExecutions"];
    stepExecutions: ModernizationState["stepExecutions"];
    testEvidence: ModernizationState["testEvidence"];
    defects: ModernizationState["defects"];
  };
}

/**
 * Export a project as a .mip file and trigger browser download.
 */
export function exportProject(
  state: ModernizationState,
  projectName: string,
): void {
  const mipData: MipFile = {
    magic: MIP_MAGIC,
    version: MIP_VERSION,
    exportedAt: Date.now(),
    projectName,
    data: {
      projects: state.projects,
      sourceFiles: state.sourceFiles,
      uploadBatches: state.uploadBatches,
      functionalities: state.functionalities,
      componentMappings: state.componentMappings,
      findings: state.findings,
      informationRequests: state.informationRequests,
      knowledgeEntries: state.knowledgeEntries,
      businessRuleEntries: state.businessRuleEntries,
      testCases: state.testCases,
      automationTestCases: state.automationTestCases,
      testCycles: state.testCycles,
      testExecutions: state.testExecutions,
      stepExecutions: state.stepExecutions,
      testEvidence: state.testEvidence,
      defects: state.defects,
    },
  };

  const json = JSON.stringify(mipData);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `Modernization_${safeName}_${date}.mip`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a .mip file from disk. Returns the parsed data or throws.
 */
export function importProject(file: File): Promise<MipFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);

        if (!json || json.magic !== MIP_MAGIC) {
          reject(new Error("Invalid .mip file: missing MIPTE magic header"));
          return;
        }

        if (json.version > MIP_VERSION) {
          reject(new Error(`Unsupported .mip version: ${json.version}. This application supports version ${MIP_VERSION}.`));
          return;
        }

        resolve(json as MipFile);
      } catch (err) {
        reject(new Error(`Failed to parse .mip file: ${err instanceof Error ? err.message : "Unknown error"}`));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read .mip file"));
    reader.readAsText(file);
  });
}
