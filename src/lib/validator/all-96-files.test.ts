import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseFileBytes } from "./parsers";
import { toCanonical, compareCanonical } from "./canonical";

const BASE =
  "C:/Users/BALAJI/Downloads/sample_reports_4_formats/sample_reports_4_formats";

const ACCOUNTS = ["1000", "1001", "1002", "1003"];
const PACKAGES: Array<{ dir: string; suffix: string }> = [
  { dir: "Package 1/Non-Phi", suffix: "" },
  { dir: "Package 2/PHI", suffix: "_PHI" },
];
const REPORT_TYPES = ["customer_profile", "sales_summary", "transaction_detail"];
// Exclude PDF (needs browser worker)
const FORMATS = ["rtf", "docx", "xlsx"];

function loadFile(relPath: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(BASE, relPath));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function makeParsedDoc(fileName: string, ab: ArrayBuffer, content: any) {
  return {
    id: `${fileName}::${ab.byteLength}`,
    path: fileName, dir: "", fileName,
    ext: fileName.split(".").pop() as any,
    stem: fileName.replace(/\.\w+$/, ""),
    versionTag: "", size: ab.byteLength, content,
  };
}

function getFieldValueCount(canon: { items: Array<{ kind: string }> }) {
  return canon.items.filter(i => i.kind === "field_value").length;
}

describe("All 96 org files: parse + cross-format comparison", () => {
  const allParsed = new Map<string, any>();
  let totalParsed = 0;
  let totalParseFailures = 0;

  // ── PHASE 1: Parse all RTF, DOCX, XLSX files (4 accounts × 2 packages × 3 reports × 3 formats = 72) ──
  for (const account of ACCOUNTS) {
    for (const pkg of PACKAGES) {
      for (const report of REPORT_TYPES) {
        for (const fmt of FORMATS) {
          const pfx = pkg.suffix ? pkg.suffix + "_" : "";
          const fileName = `${report}_${pfx}${account}.${fmt}`;
          const relPath = `${account}/${pkg.dir}/${fileName}`;

          it(`parse: ${account}/${pkg.dir}/${fileName}`, async () => {
            const ab = loadFile(relPath);
            const parsed = await parseFileBytes(fileName, ab);
            const doc = makeParsedDoc(fileName, ab, parsed.content);
            const canonical = toCanonical(doc);
            const fvCount = getFieldValueCount(canonical);

            allParsed.set(`${account}/${report}/${pkg.suffix || "base"}/${fmt}`, canonical);
            totalParsed++;

            expect(canonical.items.length).toBeGreaterThan(0);
            expect(fvCount).toBeGreaterThan(0);
          });
        }
      }
    }
  }

  // ── PHASE 2: Cross-format comparison (RTF↔DOCX, RTF↔XLSX, DOCX↔XLSX) ──
  // These should all be IDENTICAL within the same account/report/package
  let identicalCount = 0;
  let differentCount = 0;

  for (const account of ACCOUNTS) {
    for (const pkg of PACKAGES) {
      for (const report of REPORT_TYPES) {
        for (let i = 0; i < FORMATS.length; i++) {
          for (let j = i + 1; j < FORMATS.length; j++) {
            const fmtA = FORMATS[i];
            const fmtB = FORMATS[j];
            const keyA = `${account}/${report}/${pkg.suffix || "base"}/${fmtA}`;
            const keyB = `${account}/${report}/${pkg.suffix || "base"}/${fmtB}`;

            it(`compare: ${account}/${report} ${fmtA}↔${fmtB}`, () => {
              const cA = allParsed.get(keyA);
              const cB = allParsed.get(keyB);
              if (!cA || !cB) return;

              const result = compareCanonical(cA, cB, "intelligent");

              const missingFV = result.missingInComparing.filter((i: any) => i.kind === "field_value");
              const addedFV = result.addedInComparing.filter((i: any) => i.kind === "field_value");
              const mismatches = result.matched.filter((m: any) => !m.identical && m.baseline.kind === "field_value");

              if (missingFV.length === 0 && addedFV.length === 0 && mismatches.length === 0) {
                identicalCount++;
              } else {
                differentCount++;
                console.log(`\nDIFF: ${account}/${report} ${fmtA}↔${fmtB}`);
                console.log(`  Missing FV: ${missingFV.map((m: any) => `${m.key}=${m.value}`).join(", ") || "none"}`);
                console.log(`  Added FV: ${addedFV.map((m: any) => `${m.key}=${m.value}`).join(", ") || "none"}`);
                console.log(`  Mismatches: ${mismatches.length}`);
                console.log(`  ${fmtA} items: ${cA.items.map((i: any) => `${i.kind}:${i.key}=${i.value}`).join("; ")}`);
                console.log(`  ${fmtB} items: ${cB.items.map((i: any) => `${i.kind}:${i.key}=${i.value}`).join("; ")}`);
              }

              // All field_values must match across formats
              expect(missingFV.length).toBe(0);
              expect(addedFV.length).toBe(0);
              for (const m of result.matched) {
                if (m.baseline.kind === "field_value") {
                  expect(m.identical).toBe(true);
                }
              }
            });
          }
        }
      }
    }
  }

  // ── PHASE 3: Genuinely different accounts should have real differences ──
  it("cross-account: account 1000 vs 1001 RTF detects real changes", () => {
    const c1 = allParsed.get("1000/customer_profile/base/rtf");
    const c2 = allParsed.get("1001/customer_profile/base/rtf");
    if (!c1 || !c2) return;

    const result = compareCanonical(c1, c2, "intelligent");
    const mismatches = result.matched.filter(
      (m: any) => !m.identical && m.baseline.kind === "field_value"
    );

    console.log(`\n1000 vs 1001 mismatches: ${mismatches.length}`);
    for (const m of mismatches) {
      console.log(`  ${m.baseline.key}: "${m.baseline.value}" → "${m.comparing.value}"`);
    }

    // Accounts 1000 and 1001 differ in Account, Customer, Region, Account Manager
    expect(mismatches.length).toBeGreaterThanOrEqual(3);
  });

  it("cross-account: all 4 accounts detected as different for customer_profile", () => {
    const accounts = ["1000", "1001", "1002", "1003"];
    const canonicals = accounts.map(a => allParsed.get(`${a}/customer_profile/base/rtf`)).filter(Boolean);

    let totalDiffs = 0;
    for (let i = 0; i < canonicals.length; i++) {
      for (let j = i + 1; j < canonicals.length; j++) {
        const result = compareCanonical(canonicals[i], canonicals[j], "intelligent");
        const mismatches = result.matched.filter(
          (m: any) => !m.identical && m.baseline.kind === "field_value"
        );
        totalDiffs += mismatches.length;
      }
    }

    console.log(`\nAll 4 accounts pairwise: ${totalDiffs} total field_value differences`);
    // 4 choose 2 = 6 pairs, each with at least 3 different fields = at least 18
    expect(totalDiffs).toBeGreaterThanOrEqual(15);
  });

  // ── Summary ──
  it("FINAL SUMMARY", () => {
    const totalComparisons = identicalCount + differentCount;
    const totalParseTests = ACCOUNTS.length * PACKAGES.length * REPORT_TYPES.length * FORMATS.length;
    const totalCompareTests = ACCOUNTS.length * PACKAGES.length * REPORT_TYPES.length * (FORMATS.length * (FORMATS.length - 1)) / 2;

    console.log("\n" + "=".repeat(60));
    console.log("FINAL SUMMARY: All 96 Organization Files");
    console.log("=".repeat(60));
    console.log(`\nFiles parsed: ${totalParsed} / ${totalParseTests} (RTF+DOCX+XLSX)`);
    console.log(`PDF excluded (needs browser worker)`);
    console.log(`\nCross-format comparisons: ${totalComparisons}`);
    console.log(`  IDENTICAL (zero false diffs): ${identicalCount}`);
    console.log(`  DIFFERENT (unexpected diffs): ${differentCount}`);
    console.log(`\nGenuine cross-account differences:`);
    console.log(`  Accounts: ${ACCOUNTS.join(", ")}`);
    console.log(`  Reports: ${REPORT_TYPES.join(", ")}`);
    console.log(`  Packages: Non-Phi, PHI`);
    console.log("=".repeat(60));

    expect(totalParsed).toBe(totalParseTests);
    expect(identicalCount).toBe(totalCompareTests);
    expect(differentCount).toBe(0);
  });
});
