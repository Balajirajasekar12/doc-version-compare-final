// ============================================================================
// MIPTE Code Analysis Engine — Barrel / Dispatcher
//
// Provides `getAnalyzer(language)` to pick the correct language-specific
// analyzer, and `analyzeFile(content, fileName)` as a convenience that
// auto-detects the language from the file extension.
// ============================================================================

import type { AnalyzerFn, AnalysisResult, Language } from "./types";
import { languageFromExtension } from "./types";
import { analyzeJava } from "./java-analyzer";
import { analyzePlSql } from "./plsql-analyzer";
import { analyzeSql } from "./sql-analyzer";
import { analyzeShell } from "./shell-analyzer";
import { analyzeXml } from "./xml-analyzer";

// Re-export everything consumers might need
export type { Entity, EntityType, TableReference, CodeDependency, DependencyType, AnalysisResult, AnalysisSummary, AnalyzerFn, Language } from "./types";
export { buildSummary, languageFromExtension } from "./types";
export { analyzeJava } from "./java-analyzer";
export { analyzePlSql } from "./plsql-analyzer";
export { analyzeSql } from "./sql-analyzer";
export { analyzeShell } from "./shell-analyzer";
export { analyzeXml } from "./xml-analyzer";

// ---------------------------------------------------------------------------
// Supported language → analyzer mapping
// ---------------------------------------------------------------------------

const analyzers: Record<string, AnalyzerFn> = {
  java: analyzeJava,
  plsql: analyzePlSql,
  sql: analyzeSql,
  shell: analyzeShell,
  xml: analyzeXml,
};

/**
 * Returns the analyzer function for the given language key, or `undefined`
 * if no analyzer is registered for that language.
 */
export function getAnalyzer(language: string): AnalyzerFn | undefined {
  return analyzers[language.toLowerCase()];
}

/**
 * Returns the list of languages that have dedicated analyzers.
 */
export function supportedLanguages(): string[] {
  return Object.keys(analyzers);
}

/**
 * Convenience: auto-detect the language from the file extension and run
 * the appropriate analyzer. Returns `null` if the language is unsupported.
 */
export function analyzeFile(
  content: string,
  fileName: string,
): AnalysisResult | null {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const language = languageFromExtension(ext);
  const analyzer = analyzers[language];
  if (!analyzer) return null;
  return analyzer(content, fileName);
}
