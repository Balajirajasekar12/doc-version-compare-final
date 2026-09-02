/**
 * Messy Excel file optimization test.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MESSY_XLSX_PATH = "C:\\Users\\BALAJI\\Downloads\\doc-version-compare-final-main\\doc-version-compare-final-main\\Messy excel\\Messy_Excel_Pivot_10_Sheets_Overlap_Stress_Test_new.xlsx";
const OUTPUT_PATH = "C:\\Users\\BALAJI\\Downloads\\doc-version-compare-final-main\\doc-version-compare-final-main\\Messy excel\\Optimized_Messy_Test.xlsx";

function fileExists(p: string): boolean {
  try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; }
}

describe("Messy Excel Optimization", () => {
  it("optimizes without errors and produces valid output", async () => {
    if (!fileExists(MESSY_XLSX_PATH)) {
      console.log(`File not found: ${MESSY_XLSX_PATH}`);
      return;
    }

    const { createSession, runOptimization } = await import("../optimizer");
    const { DEFAULT_SETTINGS } = await import("../types");

    const bytes = fs.readFileSync(MESSY_XLSX_PATH);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    const file = new File([buffer], "Messy_Excel.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    console.log("Running optimization...");
    const session = await createSession(file);
    console.log(`Session: ${session.analysis.totalSheets} sheets, ${session.analysis.images} images`);

    const result = await runOptimization(session, DEFAULT_SETTINGS);

    expect(result.blob).toBeTruthy();
    expect(result.report.failedReason).toBeFalsy();

    if (result.blob) {
      const arrayBuf = await result.blob.arrayBuffer();
      fs.writeFileSync(OUTPUT_PATH, Buffer.from(new Uint8Array(arrayBuf)));
      console.log(`Saved to: ${OUTPUT_PATH}`);
      console.log(`Report: ${JSON.stringify(result.report, null, 2)}`);
    }
  });
});
