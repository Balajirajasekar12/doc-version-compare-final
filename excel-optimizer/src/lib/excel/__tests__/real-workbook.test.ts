/**
 * Real-Organization-Workbook Regression Test
 *
 * This test processes the actual organization Excel workbook through the
 * full EO pipeline and validates the output at ZIP/XML level.
 *
 * USAGE:
 *   Place the real workbook at: test-fixtures/real-workbook.xlsx
 *   Then run: npx vitest run excel-optimizer/src/lib/excel/__tests__/real-workbook.test.ts
 *
 * If the file is not present, the test is skipped with a clear message.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { extractInventory, compareXlsxFiles, formatComparisonReport } from "./xlsx-forensics";

const REAL_WORKBOOK_PATH = path.resolve(
  __dirname,
  "../../../../../../test-fixtures/real-workbook.xlsx",
);

const OPTIMIZED_OUTPUT_PATH = path.resolve(
  __dirname,
  "/tmp/eo-optimized-output.xlsx",
);

function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

describe("Real Organization Workbook", () => {
  let originalBuffer: ArrayBuffer | null = null;
  let optimizedBuffer: ArrayBuffer | null = null;

  beforeAll(async () => {
    if (!fileExists(REAL_WORKBOOK_PATH)) {
      console.log(
        `\n╔══════════════════════════════════════════════════════════════╗\n║  REAL WORKBOOK NOT FOUND                                      ║\n║  Place the file at: test-fixtures/real-workbook.xlsx           ║\n║  Test will be skipped.                                        ║\n╚══════════════════════════════════════════════════════════════╝\n`,
      );
      return;
    }

    const bytes = fs.readFileSync(REAL_WORKBOOK_PATH);
    originalBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );

    // Run the full EO optimization pipeline
    // Import the EO engine
    const { createSession, runOptimization } = await import("../optimizer");
    const { DEFAULT_SETTINGS } = await import("../types");

    // Create a File object from the buffer
    const file = new File([originalBuffer], "real-workbook.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    console.log("\nRunning EO optimization on real workbook...");

    const session = await createSession(file);
    console.log(
      `Session created: ${session.analysis.totalSheets} sheets, ${session.analysis.images} images`,
    );

    const result = await runOptimization(session, DEFAULT_SETTINGS);

    if (result.blob) {
      const arrayBuf = await result.blob.arrayBuffer();
      optimizedBuffer = arrayBuf;

      // Save for inspection
      const uint8 = new Uint8Array(arrayBuf);
      fs.writeFileSync(OPTIMIZED_OUTPUT_PATH, uint8);
      console.log(`Optimized workbook saved to: ${OPTIMIZED_OUTPUT_PATH}`);
      console.log(`Report: ${JSON.stringify(result.report, null, 2)}`);
    } else {
      console.log(
        `Optimization FAILED: ${result.report.failedReason ?? "unknown"}`,
      );
    }
  });

  it("Real workbook file exists", () => {
    expect(fileExists(REAL_WORKBOOK_PATH)).toBe(true);
  });

  it("Original workbook is valid ZIP", async () => {
    if (!originalBuffer) return;
    const zip = await JSZip.loadAsync(originalBuffer);
    expect(zip).toBeTruthy();
    const entries = Object.keys(zip.files).filter(
      (n) => !zip.files[n].dir,
    );
    expect(entries.length).toBeGreaterThan(50);
  });

  it("Original workbook has images/drawings", async () => {
    if (!originalBuffer) return;
    const inventory = await extractInventory(originalBuffer, "real-workbook.xlsx");
    console.log(`\nOriginal inventory:`);
    console.log(`  Media files: ${inventory.mediaFiles.length}`);
    console.log(`  Drawing files: ${inventory.drawingFiles.length}`);
    console.log(`  Total anchors: ${inventory.totalAnchors}`);

    for (const sd of inventory.sheetDrawings) {
      if (sd.anchors.length > 0) {
        const acCount = sd.anchors.filter(
          (a) => a.insideAlternateContent,
        ).length;
        console.log(
          `  ${sd.sheetName}: ${sd.anchors.length} anchors (${acCount} inside mc:AlternateContent)`,
        );
        // Log first few anchors for debugging
        for (const a of sd.anchors.slice(0, 3)) {
          console.log(
            `    #${a.index}: ${a.anchorType} from(${a.fromCol},${a.fromRow}) to(${a.toCol},${a.toRow}) rId=${a.rId} name="${a.cNvPrName}" mc=${a.insideAlternateContent}`,
          );
        }
      }
    }

    expect(inventory.mediaFiles.length).toBeGreaterThan(0);
    expect(inventory.totalAnchors).toBeGreaterThan(0);
  });

  it("Optimization produces valid output", async () => {
    if (!originalBuffer) return;

    const { createSession, runOptimization } = await import("../optimizer");
    const { DEFAULT_SETTINGS } = await import("../types");

    const file = new File([originalBuffer], "real-workbook.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const session = await createSession(file);
    const result = await runOptimization(session, DEFAULT_SETTINGS);

    expect(result.report.ok).toBe(true);
    expect(result.blob).not.toBeNull();
  });

  it("ZIP-level comparison: no media files lost", async () => {
    if (!originalBuffer || !optimizedBuffer) return;

    const comparison = await compareXlsxFiles(
      originalBuffer,
      optimizedBuffer,
      "real-workbook-original.xlsx",
      "real-workbook-optimized.xlsx",
    );

    console.log("\n" + formatComparisonReport(comparison));

    // Critical checks
    expect(comparison.mediaMissing).toBe(0);
    expect(comparison.mediaChanged).toBe(0);
    expect(comparison.relationshipsBroken).toBe(0);
    expect(comparison.xmlWellFormed).toBe(true);
  });

  it("ZIP-level comparison: all image bytes preserved (SHA-256)", async () => {
    if (!originalBuffer || !optimizedBuffer) return;

    const origInventory = await extractInventory(originalBuffer, "original");
    const optInventory = await extractInventory(optimizedBuffer, "optimized");

    const origHashMap = new Map(
      origInventory.mediaFiles.map((m) => [m.path, m.sha256]),
    );
    const optHashMap = new Map(
      optInventory.mediaFiles.map((m) => [m.path, m.sha256]),
    );

    // Every original image must exist with the same hash
    for (const [path, origHash] of origHashMap) {
      const optHash = optHashMap.get(path);
      expect(optHash, `Image ${path} missing in optimized`).toBeDefined();
      expect(
        optHash,
        `Image ${path} hash changed: ${origHash} → ${optHash}`,
      ).toBe(origHash);
    }
  });

  it("ZIP-level comparison: drawing XML preserved", async () => {
    if (!originalBuffer || !optimizedBuffer) return;

    const origInventory = await extractInventory(originalBuffer, "original");
    const optInventory = await extractInventory(optimizedBuffer, "optimized");

    // Same number of drawing files
    expect(optInventory.drawingFiles.length).toBe(
      origInventory.drawingFiles.length,
    );

    // Same number of anchors
    expect(optInventory.totalAnchors).toBe(origInventory.totalAnchors);
  });

  it("ZIP-level comparison: all relationships intact", async () => {
    if (!originalBuffer || !optimizedBuffer) return;

    const comparison = await compareXlsxFiles(
      originalBuffer,
      optimizedBuffer,
    );

    expect(comparison.relationshipsBroken).toBe(0);
    expect(comparison.brokenRelationships).toHaveLength(0);
  });

  it("Anchor identity preserved: every image keeps its rId and cNvPr", async () => {
    if (!originalBuffer || !optimizedBuffer) return;

    const origInventory = await extractInventory(originalBuffer, "original");
    const optInventory = await extractInventory(optimizedBuffer, "optimized");

    // Build a map of cNvPrId → rId for both
    const origIdMap = new Map<string, string>();
    const optIdMap = new Map<string, string>();

    for (const sd of origInventory.sheetDrawings) {
      for (const a of sd.anchors) {
        if (a.cNvPrId) origIdMap.set(a.cNvPrId, a.rId);
      }
    }
    for (const sd of optInventory.sheetDrawings) {
      for (const a of sd.anchors) {
        if (a.cNvPrId) optIdMap.set(a.cNvPrId, a.rId);
      }
    }

    // Every original anchor must exist with the same relationship
    for (const [id, origRId] of origIdMap) {
      const optRId = optIdMap.get(id);
      expect(optRId, `Anchor cNvPrId="${id}" missing in optimized`).toBeDefined();
      expect(
        optRId,
        `Anchor cNvPrId="${id}" relationship changed: ${origRId} → ${optRId}`,
      ).toBe(origRId);
    }
  });
});
