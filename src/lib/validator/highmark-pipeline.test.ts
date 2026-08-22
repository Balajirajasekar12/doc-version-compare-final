import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { rtfToText } from "./rtf";
import { toCanonical, compareCanonical, normalizeText, type ContentItem } from "./canonical";
import { parseFileBytes } from "./parsers";

// Resolve from project root
const FIXTURES = path.resolve("test-fixtures", "highmark-real");
console.log("[DEBUG] FIXTURES:", FIXTURES);
console.log("[DEBUG] exists:", fs.existsSync(FIXTURES));

function readFile(subdir: string, ext: string): ArrayBuffer {
  const dir = path.join(FIXTURES, subdir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith(ext));
  if (files.length === 0) throw new Error(`No ${ext} file in ${dir}`);
  const buf = fs.readFileSync(path.join(dir, files[0]));
  // Copy from pool buffer to avoid shared ArrayBuffer issues
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

async function parseAndTrace(subdir: string, ext: string) {
  const buf = readFile(subdir, ext);
  const fileName = fs.readdirSync(path.join(FIXTURES, subdir)).find(f => f.endsWith(ext))!;
  const parsed = await parseFileBytes(fileName, buf);
  const canonical = toCanonical({ 
    id: "test", path: fileName, dir: subdir, fileName, ext: ext as any, 
    stem: fileName, versionTag: "1.0", size: buf.byteLength, content: parsed.content 
  });
  return { parsed, canonical };
}

describe("HIGHMARK pipeline trace", () => {
  it("RTF Account 1000 canonical items", async () => {
    const { parsed, canonical } = await parseAndTrace("1000", ".rtf");
    console.log("\n=== RTF 1000 RAW LINES ===");
    if (parsed.content.type === "text") {
      parsed.content.lines.forEach((l, i) => console.log(`  ${i}: "${l}"`));
    }
    console.log("\n=== RTF 1000 CANONICAL ITEMS ===");
    canonical.items.forEach((it, i) => console.log(`  ${i}: [${it.kind}] key="${it.key}" label="${it.label}" value="${it.value}"`));
    
    // Check key items exist
    const fieldValues = canonical.items.filter(i => i.kind === "field_value");
    console.log(`\n  field_value count: ${fieldValues.length}`);
    expect(fieldValues.length).toBeGreaterThan(0);
  });

  it("DOCX Account 1000 canonical items", async () => {
    const { parsed, canonical } = await parseAndTrace("1000", ".docx");
    console.log("\n=== DOCX 1000 RAW LINES ===");
    if (parsed.content.type === "text") {
      parsed.content.lines.forEach((l, i) => console.log(`  ${i}: "${l}"`));
    }
    console.log("\n=== DOCX 1000 CANONICAL ITEMS ===");
    canonical.items.forEach((it, i) => console.log(`  ${i}: [${it.kind}] key="${it.key}" label="${it.label}" value="${it.value}"`));
    
    const fieldValues = canonical.items.filter(i => i.kind === "field_value");
    console.log(`\n  field_value count: ${fieldValues.length}`);
    expect(fieldValues.length).toBeGreaterThan(0);
  });

  it("XLSX Account 1000 canonical items", async () => {
    const { parsed, canonical } = await parseAndTrace("1000", ".xlsx");
    console.log("\n=== XLSX 1000 SHEETS ===");
    if (parsed.content.type === "sheet") {
      for (const sheet of parsed.content.sheets) {
        console.log(`  Sheet: ${sheet.name}`);
        sheet.rows.forEach((r, i) => console.log(`    ${i}: [${r.join(" | ")}]`));
      }
    }
    console.log("\n=== XLSX 1000 CANONICAL ITEMS ===");
    canonical.items.forEach((it, i) => console.log(`  ${i}: [${it.kind}] key="${it.key}" label="${it.label}" value="${it.value}"`));
    
    const fieldValues = canonical.items.filter(i => i.kind === "field_value");
    console.log(`\n  field_value count: ${fieldValues.length}`);
    expect(fieldValues.length).toBeGreaterThan(0);
  });

  it("RTF vs XLSX Account 1000 — zero differences", async () => {
    const rtf = await parseAndTrace("1000", ".rtf");
    const xlsx = await parseAndTrace("1000", ".xlsx");
    const result = compareCanonical(rtf.canonical, xlsx.canonical, "intelligent");
    console.log("\n=== RTF vs XLSX Account 1000 ===");
    console.log(`  Matched: ${result.matched.length}`);
    console.log(`  Missing in comparing: ${result.missingInComparing.length}`);
    console.log(`  Added in comparing: ${result.addedInComparing.length}`);
    for (const m of result.missingInComparing) console.log(`    MISSING: [${m.kind}] key="${m.key}" value="${m.value}"`);
    for (const a of result.addedInComparing) console.log(`    ADDED: [${a.kind}] key="${a.key}" value="${a.value}"`);
    
    expect(result.missingInComparing.length).toBe(0);
    expect(result.addedInComparing.length).toBe(0);
  });

  it("RTF vs DOCX Account 1000 — zero differences", async () => {
    const rtf = await parseAndTrace("1000", ".rtf");
    const docx = await parseAndTrace("1000", ".docx");
    const result = compareCanonical(rtf.canonical, docx.canonical, "intelligent");
    console.log("\n=== RTF vs DOCX Account 1000 ===");
    console.log(`  Matched: ${result.matched.length}`);
    console.log(`  Missing in comparing: ${result.missingInComparing.length}`);
    console.log(`  Added in comparing: ${result.addedInComparing.length}`);
    for (const m of result.missingInComparing) console.log(`    MISSING: [${m.kind}] key="${m.key}" value="${m.value}"`);
    for (const a of result.addedInComparing) console.log(`    ADDED: [${a.kind}] key="${a.key}" value="${a.value}"`);
    
    expect(result.missingInComparing.length).toBe(0);
    expect(result.addedInComparing.length).toBe(0);
  });

  it("RTF vs XLSX Account 1001 — Client Number and Client Name missing", async () => {
    const rtf = await parseAndTrace("1001", ".rtf");
    const xlsx = await parseAndTrace("1001", ".xlsx");
    const result = compareCanonical(rtf.canonical, xlsx.canonical, "intelligent");
    console.log("\n=== RTF vs XLSX Account 1001 ===");
    console.log(`  Matched: ${result.matched.length}`);
    console.log(`  Missing in comparing: ${result.missingInComparing.length}`);
    console.log(`  Added in comparing: ${result.addedInComparing.length}`);
    for (const m of result.missingInComparing) console.log(`    MISSING: [${m.kind}] key="${m.key}" value="${m.value}"`);
    for (const a of result.addedInComparing) console.log(`    ADDED: [${a.kind}] key="${a.key}" value="${a.value}"`);
    
    // RTF doesn't have Client Number/Name, XLSX does
    // So from RTF baseline perspective: Client Number/Name are missing from RTF
    // From XLSX comparing perspective: Client Number/Name are added in comparing
    const added = result.addedInComparing.filter(i => 
      i.key === "client number" || i.key === "client name"
    );
    expect(added.length).toBe(2);
  });

  it("Sort Description must NOT be a false difference — RTF vs XLSX Account 1000", async () => {
    const rtf = await parseAndTrace("1000", ".rtf");
    const xlsx = await parseAndTrace("1000", ".xlsx");
    const result = compareCanonical(rtf.canonical, xlsx.canonical, "intelligent");
    
    // Sort Description must NOT appear in missing or added
    const sortDescMissing = result.missingInComparing.filter(i => 
      i.key.includes("sort") || i.label.toLowerCase().includes("sort description")
    );
    const sortDescAdded = result.addedInComparing.filter(i => 
      i.key.includes("sort") || i.label.toLowerCase().includes("sort description")
    );
    console.log("\n=== Sort Description check (RTF vs XLSX 1000) ===");
    console.log(`  Sort Description missing: ${sortDescMissing.length}`);
    console.log(`  Sort Description added: ${sortDescAdded.length}`);
    expect(sortDescMissing.length).toBe(0);
    expect(sortDescAdded.length).toBe(0);
  });

  it("Bill Account Number/Name NOT mis-paired — RTF vs XLSX Account 1000", async () => {
    const rtf = await parseAndTrace("1000", ".rtf");
    const xlsx = await parseAndTrace("1000", ".xlsx");
    const result = compareCanonical(rtf.canonical, xlsx.canonical, "intelligent");
    
    // Check that Bill Account Number value is 0165431006, not "Bill Account Name"
    const billAcctNum = [...result.matched.map(m => m.baseline), ...result.missingInComparing]
      .find(i => i.key === "bill account number");
    console.log("\n=== Bill Account Number check ===");
    if (billAcctNum) {
      console.log(`  Bill Account Number value: "${billAcctNum.value}"`);
      expect(billAcctNum.value).not.toBe("Bill Account Name");
      expect(billAcctNum.value).toBe("0165431006");
    }
  });
});
