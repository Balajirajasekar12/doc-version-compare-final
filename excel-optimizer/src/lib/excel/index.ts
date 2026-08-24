/**
 * Excel Optimizer engine — public API.
 *
 * Everything runs in the browser: files never leave the device, no API keys,
 * no servers, zero cost. Processing is deterministic; AI is not used and not
 * required (per the product spec, the deterministic engine is the primary and
 * only engine in v1).
 */
export * from "./types";
export { createSession, runOptimization } from "./optimizer";
export type { WorkSession, ProgressUpdate, OnProgress } from "./optimizer";
export type { WorkbookSnapshot, LoadedWorkbook } from "./analyzer";
export type { ValidationResult } from "./validator";
export { MAX_FILE_SIZE } from "./security";

// Engine internals (used by tests).
export { loadWorkbook, extractSnapshot, parseSharedStrings } from "./analyzer";
export { parseSheet } from "./worksheet";
export { detectSheet, computeQuality, intensityFor } from "./detect";
export { formatSheet, emptyCounters } from "./format";
export type { FormatCounters } from "./format";
export { validateOutput, checkPartAttributes } from "./validator";
export { convertXls, snapshotFromSheetJS } from "./xls";
export { StyleLibrary } from "./styles";
