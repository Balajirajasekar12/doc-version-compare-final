/**
 * In-Browser File Processing
 * 
 * ZIP extraction, file reading, SHA-256 hashing, language detection.
 * Zero server dependency — everything runs in the browser.
 */

import JSZip from "jszip";
import type { SourceFile, Language } from "./types";

// ── Language Detection ────────────────────────────────────────

export function detectLanguage(fileName: string, content: string): Language {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "sql" || ext === "pls" || ext === "plb" || ext === "pks" || ext === "pkb") {
    // Check for PL/SQL indicators in content
    const plsqlIndicators = [
      /\bCREATE\s+(OR\s+REPLACE\s+)?(PACKAGE|PROCEDURE|FUNCTION|TRIGGER|TYPE)\b/i,
      /\bBEGIN\b[\s\S]*\bEND\b/i,
      /\bDECLARE\b/i,
      /\bCURSOR\b/i,
      /\bEXCEPTION\b/i,
    ];
    const plsqlScore = plsqlIndicators.filter((p) => p.test(content)).length;
    if (plsqlScore >= 1) return "PLSQL";
    return "SQL";
  }

  if (ext === "java") return "JAVA";
  if (ext === "sh" || ext === "bash" || ext === "ksh" || ext === "csh") return "SHELL";
  if (ext === "xml") return "XML";

  // Try content-based detection for files without standard extensions
  if (content.includes("package ") && (content.includes("import ") || content.includes("class "))) return "JAVA";
  if (content.includes("CREATE OR REPLACE") && (content.includes("PACKAGE") || content.includes("PROCEDURE"))) return "PLSQL";
  if (content.includes("#!/bin/sh") || content.includes("#!/bin/bash") || content.match(/\bfunction\s+\w+\s*\(\)/)) return "SHELL";
  if (content.includes("<?xml") || content.includes("<beans") || content.includes("<configuration")) return "XML";
  if (content.match(/\bSELECT\b.*\bFROM\b/i) || content.match(/\bCREATE\s+(TABLE|VIEW|INDEX)/i)) return "SQL";

  return "UNKNOWN";
}

// ── SHA-256 Hash ──────────────────────────────────────────────

export async function computeSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── File Reading ──────────────────────────────────────────────

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

// ── File Processing ───────────────────────────────────────────

export interface ProcessedFileResult {
  sourceFile: SourceFile;
  isNew: boolean;
  isDuplicate: boolean;
  isModified: boolean;
}

export interface UploadProgress {
  phase: "reading" | "extracting" | "processing" | "hashing" | "complete";
  message: string;
  processed: number;
  total: number;
}

/**
 * Process a single file into a SourceFile record.
 */
export async function processSingleFile(
  file: File,
  projectId: string,
  sourceType: "LEGACY" | "MOD",
  batchId: string,
  existingFiles: SourceFile[],
): Promise<ProcessedFileResult> {
  const content = await readFileAsText(file);
  const sha256 = await computeSHA256(content);
  const language = detectLanguage(file.name, content);
  const lineCount = content.split("\n").length;

  const filePath = file.name;

  // Check for duplicates by projectId + sourceType + filePath
  const existing = existingFiles.find(
    (f) => f.projectId === projectId && f.sourceType === sourceType && f.filePath === filePath && !f.superseded,
  );

  if (existing) {
    if (existing.sha256 === sha256) {
      // Exact duplicate
      return {
        sourceFile: existing,
        isNew: false,
        isDuplicate: true,
        isModified: false,
      };
    }
    // Same path, different content → new version
    const newFile: SourceFile = {
      id: `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      fileName: file.name,
      filePath,
      fileType: file.type || "application/octet-stream",
      sourceType,
      size: file.size,
      sha256,
      language,
      content,
      lineCount,
      status: "UPLOADED",
      uploadBatchId: batchId,
      version: existing.version + 1,
      previousVersionId: existing.id,
      superseded: false,
      uploadedAt: Date.now(),
    };

    return {
      sourceFile: newFile,
      isNew: true,
      isDuplicate: false,
      isModified: true,
    };
  }

  // New file
  const newFile: SourceFile = {
    id: `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    fileName: file.name,
    filePath,
    fileType: file.type || "application/octet-stream",
    sourceType,
    size: file.size,
    sha256,
    language,
    content,
    lineCount,
    status: "UPLOADED",
    uploadBatchId: batchId,
    version: 1,
    superseded: false,
    uploadedAt: Date.now(),
  };

  return {
    sourceFile: newFile,
    isNew: true,
    isDuplicate: false,
    isModified: false,
  };
}

/**
 * Process a ZIP file into multiple SourceFile records.
 * Preserves directory structure as relative paths.
 */
export async function processZipFile(
  zipFile: File,
  projectId: string,
  sourceType: "LEGACY" | "MOD",
  batchId: string,
  existingFiles: SourceFile[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ files: ProcessedFileResult[]; totalInZip: number }> {
  onProgress?.({ phase: "extracting", message: "Reading ZIP archive...", processed: 0, total: 0 });

  const zip = await JSZip.loadAsync(zipFile);

  // Collect all entries (skip directories)
  const entries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) {
      entries.push({ path: relativePath, file: entry });
    }
  });

  onProgress?.({ phase: "extracting", message: `Found ${entries.length} files in ZIP`, processed: 0, total: entries.length });

  const results: ProcessedFileResult[] = [];

  for (let i = 0; i < entries.length; i++) {
    const { path: entryPath, file } = entries[i];

    onProgress?.({
      phase: "processing",
      message: `Processing ${entryPath.split("/").pop()}`,
      processed: i,
      total: entries.length,
    });

    try {
      const content = await file.async("text");
      const sha256 = await computeSHA256(content);
      const language = detectLanguage(entryPath, content);
      const lineCount = content.split("\n").length;
      const fileName = entryPath.split("/").pop() ?? entryPath;

      // Check for duplicates
      const existing = existingFiles.find(
        (f) => f.projectId === projectId && f.sourceType === sourceType && f.filePath === entryPath && !f.superseded,
      );

      if (existing) {
        if (existing.sha256 === sha256) {
          results.push({ sourceFile: existing, isNew: false, isDuplicate: true, isModified: false });
          continue;
        }
        // Modified version
        const newFile: SourceFile = {
          id: `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}${i}`,
          projectId,
          fileName,
          filePath: entryPath,
          fileType: "application/octet-stream",
          sourceType,
          size: content.length,
          sha256,
          language,
          content,
          lineCount,
          status: "UPLOADED",
          uploadBatchId: batchId,
          version: existing.version + 1,
          previousVersionId: existing.id,
          superseded: false,
          uploadedAt: Date.now(),
        };
        results.push({ sourceFile: newFile, isNew: true, isDuplicate: false, isModified: true });
      } else {
        const newFile: SourceFile = {
          id: `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}${i}`,
          projectId,
          fileName,
          filePath: entryPath,
          fileType: "application/octet-stream",
          sourceType,
          size: content.length,
          sha256,
          language,
          content,
          lineCount,
          status: "UPLOADED",
          uploadBatchId: batchId,
          version: 1,
          superseded: false,
          uploadedAt: Date.now(),
        };
        results.push({ sourceFile: newFile, isNew: true, isDuplicate: false, isModified: false });
      }
    } catch {
      // Skip binary or unreadable files
      results.push({
        sourceFile: {
          id: `sf_err_${Date.now().toString(36)}_${i}`,
          projectId,
          fileName: entryPath.split("/").pop() ?? entryPath,
          filePath: entryPath,
          fileType: "application/octet-stream",
          sourceType,
          size: 0,
          sha256: "",
          language: "UNKNOWN",
          content: "",
          lineCount: 0,
          status: "ERROR",
          uploadBatchId: batchId,
          version: 1,
          superseded: false,
          uploadedAt: Date.now(),
        },
        isNew: false,
        isDuplicate: false,
        isModified: false,
      });
    }
  }

  onProgress?.({ phase: "complete", message: "Upload complete", processed: entries.length, total: entries.length });

  return { files: results, totalInZip: entries.length };
}

/**
 * Process multiple individual files.
 */
export async function processMultipleFiles(
  files: File[],
  projectId: string,
  sourceType: "LEGACY" | "MOD",
  batchId: string,
  existingFiles: SourceFile[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<ProcessedFileResult[]> {
  const results: ProcessedFileResult[] = [];

  for (let i = 0; i < files.length; i++) {
    onProgress?.({
      phase: "processing",
      message: `Processing ${files[i].name}`,
      processed: i,
      total: files.length,
    });

    const result = await processSingleFile(files[i], projectId, sourceType, batchId, existingFiles);
    results.push(result);
  }

  onProgress?.({ phase: "complete", message: "Upload complete", processed: files.length, total: files.length });

  return results;
}
