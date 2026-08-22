import * as XLSX_LIB from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { rtfToText } from "./rtf";
import { toCanonical, compareCanonical, normalizeText } from "./canonical";
import type { ParsedDoc, SheetData } from "./types";

const BASE = "C:/Users/BALAJI/Downloads/sample_reports_4_formats/sample_reports_4_formats";

function readDoc(path_: string, ext: string, name: string): ParsedDoc {
  const buf = fs.readFileSync(path_);
  const size = buf.length;

  if (ext === "rtf") {
    const text = buf.toString("utf-8");
    const lines = rtfToText(text).split("\n").filter(l => l.trim() !== "");
    return {
      id: `${name}::${size}`, path: path_, dir: "", fileName: name,
      ext: "rtf", stem: name, versionTag: null, size,
      content: { type: "text", lines },
    };
  }

  if (ext === "xlsx") {
    const wb = XLSX_LIB.read(buf, { type: "array" });
    const sheets: SheetData[] = wb.SheetNames.map(sn => {
      const sheet = wb.Sheets[sn];
      const rows = XLSX_LIB.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
      return { name: sn, rows: rows.map(r => (Array.isArray(r) ? r : []).map(c => c === null || c === undefined ? "" : String(c))) };
    });
    return {
      id: `${name}::${size}`, path: path_, dir: "", fileName: name,
      ext: "xlsx", stem: name, versionTag: null, size,
      content: { type: "sheet", sheets },
    };
  }

  throw new Error(`Unsupported ext: ${ext}`);
}

// Test RTF vs XLSX for customer_profile
const rtfPath = path.join(BASE, "1000/Package 1/Non-Phi/customer_profile_1000.rtf");
const xlsxPath = path.join(BASE, "1000/Package 1/Non-Phi/customer_profile_1000.xlsx");

const rtfDoc = readDoc(rtfPath, "rtf", "customer_profile_1000.rtf");
const xlsxDoc = readDoc(xlsxPath, "xlsx", "customer_profile_1000.xlsx");

const rtfCanon = toCanonical(rtfDoc);
const xlsxCanon = toCanonical(xlsxDoc);

console.log("\n=== RTF CANONICAL ITEMS ===");
for (const item of rtfCanon.items) {
  console.log(`  [${item.kind}] key="${item.key}" label="${item.label}" value="${item.value}"`);
}

console.log("\n=== XLSX CANONICAL ITEMS ===");
for (const item of xlsxCanon.items) {
  console.log(`  [${item.kind}] key="${item.key}" label="${item.label}" value="${item.value}"`);
}

console.log("\n=== COMPARISON ===");
const result = compareCanonical(rtfCanon, xlsxCanon, "intelligent");
console.log(`Matched: ${result.matched.length}`);
for (const m of result.matched) {
  console.log(`  ${m.baseline.kind} "${m.baseline.label}"=${m.baseline.value} ↔ ${m.comparing.kind} "${m.comparing.label}"=${m.comparing.value} ${m.identical ? "IDENTICAL" : "DIFFERENT"}`);
}
console.log(`Missing in comparing: ${result.missingInComparing.length}`);
for (const item of result.missingInComparing) {
  console.log(`  [${item.kind}] key="${item.key}" label="${item.label}" value="${item.value}"`);
}
console.log(`Added in comparing: ${result.addedInComparing.length}`);
for (const item of result.addedInComparing) {
  console.log(`  [${item.kind}] key="${item.key}" label="${item.label}" value="${item.value}"`);
}
