/**
 * Upload safety. Nothing uploaded is ever executed or written to disk — all
 * processing happens in memory in the user's browser.
 */
import { InputFormat, OptimizerError } from "./types";

export const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB
export const MAX_CELLS = 1_000_000; // soft guard, warn only

export interface UploadInfo {
  format: InputFormat;
  fileName: string;
}

export function validateUpload(fileName: string, size: number): void {
  if (size <= 0) throw new OptimizerError("The file appears to be empty.");
  if (size > MAX_FILE_SIZE) {
    throw new OptimizerError(
      "The file is larger than the 30 MB limit.",
      "Please split the workbook or remove embedded media and try again.",
    );
  }
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (!["xlsx", "xlsm", "xls"].includes(ext)) {
    throw new OptimizerError(
      "Unsupported file type.",
      `Only .xlsx, .xlsm and .xls workbooks are supported. You uploaded a .${ext || "unknown"} file.`,
    );
  }
}
