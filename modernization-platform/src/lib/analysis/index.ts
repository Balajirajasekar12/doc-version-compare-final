/**
 * System-Level Analysis Engine
 *
 * Public API for the entire analysis pipeline.
 */

export { extractComponents, buildDependencyEdges, resetExtractionCounter } from "./extractor";
export { clusterFunctionalities, buildSemanticMappings } from "./clusterer";
export { buildBehaviorGraph, compareBehaviorGraphs } from "./comparator";
export {
  generateBusinessExplanation,
  generateDevQuestion,
  getFindingTypeLabel,
  type BusinessExplanation,
  type BusinessRule,
  type MissingInformationItem,
  type ConfidenceExplanation,
} from "./explainer";
export type {
  ExtractedComponent,
  DependencyEdge,
  Functionality,
  ComponentMapping,
  BehaviorGraph,
  BehaviorNode,
  BehaviorEdge,
  Finding,
  InformationRequest,
  AnalysisProgress,
  SystemAnalysisResult,
  ComponentType,
  EdgeType,
  MappingType,
  FindingType,
  FindingSeverity,
  FindingStatus,
  InfoRequestType,
  InfoRequestStatus,
  FunctionalityStatus,
  PipelineStep,
  BehaviorNodeType,
} from "./types";

import type {
  ExtractedComponent,
  DependencyEdge,
  Functionality,
  ComponentMapping,
  BehaviorGraph,
  Finding,
  InformationRequest,
  AnalysisProgress,
  SystemAnalysisResult,
  PipelineStep,
} from "./types";
import { extractComponents, buildDependencyEdges, resetExtractionCounter } from "./extractor";
import { clusterFunctionalities, buildSemanticMappings } from "./clusterer";
import { buildBehaviorGraph, compareBehaviorGraphs } from "./comparator";

export type AnalysisStepCallback = (progress: AnalysisProgress) => void;

/**
 * Run the full system-level analysis pipeline on uploaded source files.
 *
 * @param legacyFiles - Array of { fileId, fileName, content, language }
 * @param modFiles - Array of { fileId, fileName, content, language }
 * @param projectId - Convex project ID
 * @param onProgress - Optional callback for progress updates
 */
export async function runFullAnalysis(
  legacyFiles: Array<{ fileId: string; fileName: string; content: string; language: string }>,
  modFiles: Array<{ fileId: string; fileName: string; content: string; language: string }>,
  projectId: string,
  onProgress?: AnalysisStepCallback,
): Promise<SystemAnalysisResult> {
  resetExtractionCounter();

  const allSteps: PipelineStep[] = [];
  const totalFiles = legacyFiles.length + modFiles.length;

  const progress = (
    step: PipelineStep,
    processedFiles: number,
    processedFuncs: number,
    totalFuncs: number,
  ) => {
    allSteps.push(step);
    onProgress?.({
      currentStep: step,
      stepsCompleted: [...allSteps],
      totalFiles,
      processedFiles,
      totalFunctionalities: totalFuncs,
      processedFunctionalities: processedFuncs,
    });
  };

  // Step 1: File discovery (already done — files are passed in)
  progress("FILE_DISCOVERY", 0, 0, 0);

  // Step 2: Component extraction
  progress("COMPONENT_EXTRACTION", 0, 0, 0);

  const legacyComponents: ExtractedComponent[] = [];
  const modComponents: ExtractedComponent[] = [];

  for (const file of legacyFiles) {
    const comps = extractComponents(
      file.fileId, file.fileName, file.content, "LEGACY", file.language,
    );
    legacyComponents.push(...comps);
  }

  for (const file of modFiles) {
    const comps = extractComponents(
      file.fileId, file.fileName, file.content, "MOD", file.language,
    );
    modComponents.push(...comps);
  }

  progress("COMPONENT_EXTRACTION", totalFiles, 0, 0);

  // Step 3: Dependency graph building
  progress("DEPENDENCY_BUILDING", totalFiles, 0, 0);

  const legacyEdges = buildDependencyEdges(legacyComponents);
  const modEdges = buildDependencyEdges(modComponents);

  progress("DEPENDENCY_BUILDING", totalFiles, 0, 0);

  // Step 4: Functionality clustering
  progress("FUNCTIONALITY_CLUSTERING", totalFiles, 0, 0);

  const functionalities = clusterFunctionalities(
    legacyComponents, modComponents, legacyEdges, modEdges,
  );

  progress("FUNCTIONALITY_CLUSTERING", totalFiles, functionalities.length, functionalities.length);

  // Step 5: Semantic mapping
  progress("SEMANTIC_MAPPING", totalFiles, 0, functionalities.length);

  const mappings = buildSemanticMappings(
    functionalities, legacyComponents, modComponents, legacyEdges, modEdges,
  );

  progress("SEMANTIC_MAPPING", totalFiles, functionalities.length, functionalities.length);

  // Step 6: Behavior graph construction
  progress("BEHAVIOR_GRAPH", totalFiles, 0, functionalities.length);

  const legacyBehavior = buildBehaviorGraph(legacyComponents, legacyEdges, "LEGACY");
  const modBehavior = buildBehaviorGraph(modComponents, modEdges, "MOD");

  progress("BEHAVIOR_GRAPH", totalFiles, functionalities.length, functionalities.length);

  // Step 7: Behavior comparison and finding generation
  progress("BEHAVIOR_COMPARISON", totalFiles, 0, functionalities.length);

  const { findings, infoRequests } = compareBehaviorGraphs(
    legacyBehavior, modBehavior, legacyComponents, modComponents, functionalities, projectId,
  );

  progress("BEHAVIOR_COMPARISON", totalFiles, functionalities.length, functionalities.length);

  // Step 8: Final
  progress("COMPLETED", totalFiles, functionalities.length, functionalities.length);

  return {
    components: [...legacyComponents, ...modComponents],
    legacyEdges,
    modEdges,
    functionalities,
    mappings,
    legacyBehavior,
    modBehavior,
    findings,
    informationRequests: infoRequests,
    progress: {
      currentStep: "COMPLETED",
      stepsCompleted: allSteps,
      totalFiles,
      processedFiles: totalFiles,
      totalFunctionalities: functionalities.length,
      processedFunctionalities: functionalities.length,
    },
  };
}
