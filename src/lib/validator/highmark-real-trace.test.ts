import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseFileBytes } from "./parsers";
import { toCanonical, compareCanonical, type ContentItem } from "./canonical";

const BASE = path.resolve(__dirname, "..", "..", "..", "test-highmark-real");

function printItems(label: string, items: ContentItem[]) {
  console.log(`\n=== ${label} (${items.length} items) ===`);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    console.log(`  [${i}] kind=${it.kind} key="${it.key}" label="${it.label}" value="${it.value}"`);
  }
}

async function parseFile(name: string) {
  const buf = fs.readFileSync(path.join(BASE, name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseFileBytes(name, ab);
}

describe("HIGHMARK Real Pipeline", () => {
  it("1000: RTF canonical", async () => {
    const parsed = await parseFile("1000_HIGHMARK_ADVANCE_DEPOSIT.rtf");
    if (parsed.content.type === "text") {
      console.log("\n=== RTF RAW LINES ===");
      for (let i = 0; i < parsed.content.lines.length; i++) {
        console.log(`  [${i}] "${parsed.content.lines[i]}"`);
      }
    }
    const canon = toCanonical(parsed as any);
    printItems("RTF 1000", canon.items);
    
    // Must have Client Number, Client Name, Sort Description
    const keys = canon.items.map(i => i.key);
    expect(keys).toContain("client number");
    expect(keys).toContain("client name");
    expect(keys).toContain("sort description");
  });

  it("1000: DOCX canonical", async () => {
    const parsed = await parseFile("1000_HIGHMARK_ADVANCE_DEPOSIT.docx");
    if (parsed.content.type === "text") {
      console.log("\n=== DOCX RAW LINES ===");
      for (let i = 0; i < parsed.content.lines.length; i++) {
        console.log(`  [${i}] "${parsed.content.lines[i]}"`);
      }
    }
    const canon = toCanonical(parsed as any);
    printItems("DOCX 1000", canon.items);
    
    const keys = canon.items.map(i => i.key);
    expect(keys).toContain("client number");
    expect(keys).toContain("client name");
    expect(keys).toContain("sort description");
  });

  it("1000: XLSX canonical", async () => {
    const parsed = await parseFile("1000_HIGHMARK_ADVANCE_DEPOSIT.xlsx");
    const canon = toCanonical(parsed as any);
    printItems("XLSX 1000", canon.items);
    
    const keys = canon.items.map(i => i.key);
    expect(keys).toContain("client number");
    expect(keys).toContain("client name");
    expect(keys).toContain("sort description");
  });

  it("1000: RTF vs DOCX = 0 genuine differences", async () => {
    const rtf = toCanonical(await parseFile("1000_HIGHMARK_ADVANCE_DEPOSIT.rtf") as any);
    const docx = toCanonical(await parseFile("1000_HIGHMARK_ADVANCE_DEPOSIT.docx") as any);
    
    printItems("RTF 1000", rtf.items);
    printItems("DOCX 1000", docx.items);
    
    const result = compareCanonical(rtf, docx, "intelligent");
    console.log(`\nMatched: ${result.matched.length}`);
    console.log(`Missing: ${result.missingInComparing.length}`);
    for (const m of result.missingInComparing) console.log(`  MISSING: key="${m.key}" value="${m.value}"`);
    console.log(`Added: ${result.addedInComparing.length}`);
    for (const a of result.addedInComparing) console.log(`  ADDED: key="${a.key}" value="${a.value}"`);
    
    // Sort Description must NOT be a difference
    const sortDiff = [...result.missingInComparing, ...result.addedInComparing].find(
      m => m.key.includes("sort") || m.key.includes("description")
    );
    expect(sortDiff).toBeUndefined();
  });

  it("1000: RTF vs XLSX = 0 genuine differences", async () => {
    const rtf = toCanonical(await parseFile("1000_HIGHMARK_ADVANCE_DEPOSIT.rtf") as any);
    const xlsx = toCanonical(await parseFile("1000_HIGHMARK_ADVANCE_DEPOSIT.xlsx") as any);
    
    const result = compareCanonical(rtf, xlsx, "intelligent");
    console.log(`\nRTF vs XLSX - Matched: ${result.matched.length}, Missing: ${result.missingInComparing.length}, Added: ${result.addedInComparing.length}`);
    for (const m of result.missingInComparing) console.log(`  MISSING: key="${m.key}" value="${m.value}"`);
    for (const a of result.addedInComparing) console.log(`  ADDED: key="${a.key}" value="${a.value}"`);
    
    // Sort Description must NOT be a difference
    const sortDiff = [...result.missingInComparing, ...result.addedInComparing].find(
      m => m.key.includes("sort") || m.key.includes("description")
    );
    expect(sortDiff).toBeUndefined();
  });

  it("1001: RTF vs XLSX detects Client Number/Name missing", async () => {
    const rtf = toCanonical(await parseFile("1001_HIGHMARK_ADVANCE_DEPOSIT.rtf") as any);
    const xlsx = toCanonical(await parseFile("1001_HIGHMARK_ADVANCE_DEPOSIT.xlsx") as any);
    
    printItems("RTF 1001 (no Client)", rtf.items);
    printItems("XLSX 1001 (has Client)", xlsx.items);
    
    const result = compareCanonical(rtf, xlsx, "intelligent");
    console.log(`\nRTF vs XLSX - Matched: ${result.matched.length}, Missing: ${result.missingInComparing.length}, Added: ${result.addedInComparing.length}`);
    for (const m of result.missingInComparing) console.log(`  MISSING: key="${m.key}" value="${m.value}"`);
    for (const a of result.addedInComparing) console.log(`  ADDED: key="${a.key}" value="${a.value}"`);
    
    // Sort Description must NOT be a difference
    const sortDiff = [...result.missingInComparing, ...result.addedInComparing].find(
      m => m.key.includes("sort") || m.key.includes("description")
    );
    expect(sortDiff).toBeUndefined();
    
    // Client Number MUST be detected as difference
    const allUnmatched = [...result.missingInComparing, ...result.addedInComparing];
    const clientNum = allUnmatched.find(m => m.key.includes("client") && m.key.includes("number"));
    const clientName = allUnmatched.find(m => m.key.includes("client") && m.key.includes("name"));
    
    console.log("\nClient Number found?", clientNum ? "YES" : "NO");
    console.log("Client Name found?", clientName ? "YES" : "NO");
    
    expect(clientNum).toBeDefined();
    expect(clientName).toBeDefined();
  });
});
