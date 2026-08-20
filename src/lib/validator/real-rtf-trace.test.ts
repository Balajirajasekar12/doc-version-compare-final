import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseFileBytes } from "./parsers";
import { toCanonical, compareCanonical } from "./canonical";

const BASE =
  "C:/Users/BALAJI/Downloads/sample_reports_4_formats/sample_reports_4_formats";

// Real organization RTF files
const RTF_V1 = "1000/Package 1/Non-Phi/customer_profile_1000.rtf";
const RTF_V2 = "1000/Package 2/PHI/customer_profile_PHI_1000.rtf"; // Same data, different package
const RTF_DIFF = "1001/Package 1/Non-Phi/customer_profile_1001.rtf"; // Different account

// Cross-format counterparts
const PDF_V1 = "1000/Package 1/Non-Phi/customer_profile_1000.pdf";
const XLSX_V1 = "1000/Package 1/Non-Phi/customer_profile_1000.xlsx";
const DOCX_V1 = "1000/Package 1/Non-Phi/customer_profile_1000.docx";

function loadFile(relPath: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(BASE, relPath));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function makeParsedDoc(fileName: string, arrayBuffer: ArrayBuffer, content?: any) {
  const id = `${fileName}::${arrayBuffer.byteLength}`;
  return { id, path: fileName, dir: "", fileName, ext: fileName.split(".").pop() as any, stem: fileName.replace(/\.\w+$/, ""), versionTag: "", size: arrayBuffer.byteLength, content };
}

/**
 * Extracts just the field_value items from a canonical document.
 * These are the critical items that must match across formats.
 */
function getFieldValues(canonical: { items: Array<{ kind: string; key: string; value: string }> }) {
  return canonical.items.filter(i => i.kind === "field_value");
}

describe("Real Organization RTF - Production Pipeline", () => {
  it("RTF parses correctly through production parseFileBytes", async () => {
    const ab = loadFile(RTF_V1);
    const result = await parseFileBytes("customer_profile_1000.rtf", ab);

    expect(result.ext).toBe("rtf");
    expect(result.content.type).toBe("text");

    if (result.content.type === "text") {
      console.log("RTF parsed lines:");
      for (const line of result.content.lines) {
        console.log(`  ${JSON.stringify(line)}`);
      }

      // Must have meaningful content
      expect(result.content.lines.length).toBeGreaterThan(3);

      // Must NOT contain RTF control syntax
      for (const line of result.content.lines) {
        expect(line).not.toMatch(/^\{\\rtf/);
        expect(line).not.toMatch(/^\\ansi/);
        expect(line).not.toMatch(/^\\deff/);
        expect(line).not.toMatch(/^\\fonttbl/);
      }

      // Must contain actual content
      const allText = result.content.lines.join(" ");
      expect(allText).toContain("Account");
      expect(allText).toContain("1000");
    }
  });

  it("RTF toCanonical produces correct field_value items", async () => {
    const ab = loadFile(RTF_V1);
    const parsed = await parseFileBytes("customer_profile_1000.rtf", ab);
    const doc = makeParsedDoc("customer_profile_1000.rtf", ab, parsed.content);
    const canonical = toCanonical(doc);

    console.log("\nRTF canonical items:");
    for (const item of canonical.items) {
      console.log(`  ${item.kind}: key=${JSON.stringify(item.key)}, value=${JSON.stringify(item.value)}`);
    }

    expect(canonical.items.length).toBeGreaterThan(0);
    const fieldValues = getFieldValues(canonical);
    console.log(`\nField/value items: ${fieldValues.length}`);

    // Check all 6 expected field/value pairs
    const accountItem = fieldValues.find(i => i.key.includes("account") && !i.key.includes("manager"));
    expect(accountItem).toBeDefined();
    expect(accountItem!.value).toBe("1000");

    const customerItem = fieldValues.find(i => i.key === "customer");
    expect(customerItem).toBeDefined();
    expect(customerItem!.value).toBe("Customer Alpha");

    const regionItem = fieldValues.find(i => i.key === "region");
    expect(regionItem).toBeDefined();
    expect(regionItem!.value).toBe("South");

    const statusItem = fieldValues.find(i => i.key === "status");
    expect(statusItem).toBeDefined();
    expect(statusItem!.value).toBe("Active");

    const sinceItem = fieldValues.find(i => i.key.includes("customer") && i.key.includes("since"));
    expect(sinceItem).toBeDefined();
    expect(sinceItem!.value).toBe("2021-06-15");

    const managerItem = fieldValues.find(i => i.key.includes("account") && i.key.includes("manager"));
    expect(managerItem).toBeDefined();
    expect(managerItem!.value).toBe("Arun Kumar");

    // No field_value should contain RTF artifacts
    for (const fv of fieldValues) {
      expect(fv.value).not.toMatch(/^\{\\rtf/);
      expect(fv.value).not.toMatch(/^\\(ansi|deff|fonttbl)/);
      expect(fv.key).not.toMatch(/^\{\\rtf/);
    }
  });

  it("RTF same-data comparison produces ZERO field_value differences", async () => {
    const ab1 = loadFile(RTF_V1);
    const ab2 = loadFile(RTF_V2);
    const parsed1 = await parseFileBytes("customer_profile_1000.rtf", ab1);
    const parsed2 = await parseFileBytes("customer_profile_PHI_1000.rtf", ab2);

    const doc1 = makeParsedDoc("customer_profile_1000.rtf", ab1, parsed1.content);
    const doc2 = makeParsedDoc("customer_profile_PHI_1000.rtf", ab2, parsed2.content);

    const c1 = toCanonical(doc1);
    const c2 = toCanonical(doc2);

    console.log("\n=== V1 field_values ===");
    for (const fv of getFieldValues(c1)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);
    console.log("\n=== V2 field_values ===");
    for (const fv of getFieldValues(c2)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);

    const result = compareCanonical(c1, c2, "intelligent");

    // Same data → ALL field_values must match identically
    const fv1 = getFieldValues(c1);
    const fv2 = getFieldValues(c2);
    expect(fv1.length).toBe(fv2.length);

    for (const m of result.matched) {
      if (m.baseline.kind === "field_value") {
        expect(m.identical).toBe(true);
      }
    }

    // Zero missing/added field_values
    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");
    const addedFV = result.addedInComparing.filter(i => i.kind === "field_value");
    expect(missingFV.length).toBe(0);
    expect(addedFV.length).toBe(0);
  });

  it("RTF different-data comparison detects genuine changes", async () => {
    const ab1 = loadFile(RTF_V1); // Account 1000, Region South
    const ab2 = loadFile(RTF_DIFF); // Account 1001, Region West, etc.
    const parsed1 = await parseFileBytes("customer_profile_1000.rtf", ab1);
    const parsed2 = await parseFileBytes("customer_profile_1001.rtf", ab2);

    const doc1 = makeParsedDoc("customer_profile_1000.rtf", ab1, parsed1.content);
    const doc2 = makeParsedDoc("customer_profile_1001.rtf", ab2, parsed2.content);

    const c1 = toCanonical(doc1);
    const c2 = toCanonical(doc2);

    console.log("\n=== RTF 1000 field_values ===");
    for (const fv of getFieldValues(c1)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);
    console.log("\n=== RTF 1001 field_values ===");
    for (const fv of getFieldValues(c2)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);

    const result = compareCanonical(c1, c2, "intelligent");

    const mismatches = result.matched.filter(m => !m.identical && m.baseline.kind === "field_value");
    console.log(`\nValue mismatches: ${mismatches.length}`);
    for (const m of mismatches) {
      console.log(`  ${m.baseline.key}: ${JSON.stringify(m.baseline.value)} → ${JSON.stringify(m.comparing.value)}`);
    }

    // Different data → should detect Account, Customer, Region, Account Manager changes
    expect(mismatches.length).toBeGreaterThanOrEqual(3);
  });

  it("RTF vs XLSX: all field_value pairs match across formats", async () => {
    const abRtf = loadFile(RTF_V1);
    const abXlsx = loadFile(XLSX_V1);
    const parsedRtf = await parseFileBytes("customer_profile_1000.rtf", abRtf);
    const parsedXlsx = await parseFileBytes("customer_profile_1000.xlsx", abXlsx);

    const docRtf = makeParsedDoc("customer_profile_1000.rtf", abRtf, parsedRtf.content);
    const docXlsx = makeParsedDoc("customer_profile_1000.xlsx", abXlsx, parsedXlsx.content);

    const cRtf = toCanonical(docRtf);
    const cXlsx = toCanonical(docXlsx);

    console.log("\n=== RTF field_values ===");
    for (const fv of getFieldValues(cRtf)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);
    console.log("\n=== XLSX field_values ===");
    for (const fv of getFieldValues(cXlsx)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);

    const result = compareCanonical(cRtf, cXlsx, "intelligent");

    // ALL field_value items must match identically
    const fvRtf = getFieldValues(cRtf);
    const fvXlsx = getFieldValues(cXlsx);

    // Every RTF field_value must be in the comparison matches (not missing)
    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");

    console.log(`\nMissing field_values: ${missingFV.length}`);
    for (const m of missingFV) console.log(`  MISSING: ${m.key} = ${JSON.stringify(m.value)}`);

    // No RTF field_values should be MISSING — all 6 core fields must match
    expect(missingFV.length).toBe(0);

    // All matched field_values from RTF baseline must be identical
    for (const m of result.matched) {
      if (m.baseline.kind === "field_value") {
        expect(m.identical).toBe(true);
      }
    }

    // Note: XLSX may have extra sheets (e.g., Validation Notes) producing additional
    // field_value items. These are legitimate content differences, NOT false positives.
  });

  it("RTF vs DOCX: all field_value pairs match across formats", async () => {
    const abRtf = loadFile(RTF_V1);
    const abDocx = loadFile(DOCX_V1);
    const parsedRtf = await parseFileBytes("customer_profile_1000.rtf", abRtf);
    const parsedDocx = await parseFileBytes("customer_profile_1000.docx", abDocx);

    const docRtf = makeParsedDoc("customer_profile_1000.rtf", abRtf, parsedRtf.content);
    const docDocx = makeParsedDoc("customer_profile_1000.docx", abDocx, parsedDocx.content);

    const cRtf = toCanonical(docRtf);
    const cDocx = toCanonical(docDocx);

    console.log("\n=== RTF field_values ===");
    for (const fv of getFieldValues(cRtf)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);
    console.log("\n=== DOCX field_values ===");
    for (const fv of getFieldValues(cDocx)) console.log(`  ${fv.key} = ${JSON.stringify(fv.value)}`);

    const result = compareCanonical(cRtf, cDocx, "intelligent");

    const missingFV = result.missingInComparing.filter(i => i.kind === "field_value");
    const addedFV = result.addedInComparing.filter(i => i.kind === "field_value");

    console.log(`\nMissing field_values: ${missingFV.length}`);
    for (const m of missingFV) console.log(`  MISSING: ${m.key} = ${JSON.stringify(m.value)}`);
    console.log(`Added field_values: ${addedFV.length}`);
    for (const m of addedFV) console.log(`  ADDED: ${m.key} = ${JSON.stringify(m.value)}`);

    expect(missingFV.length).toBe(0);
    expect(addedFV.length).toBe(0);

    for (const m of result.matched) {
      if (m.baseline.kind === "field_value") {
        expect(m.identical).toBe(true);
      }
    }
  });

  it("All 3 RTF report types parse and produce valid canonical output", async () => {
    const files = [
      "1000/Package 1/Non-Phi/customer_profile_1000.rtf",
      "1000/Package 1/Non-Phi/sales_summary_1000.rtf",
      "1000/Package 1/Non-Phi/transaction_detail_1000.rtf",
    ];

    for (const file of files) {
      const ab = loadFile(file);
      const parsed = await parseFileBytes(path.basename(file), ab);
      const doc = makeParsedDoc(path.basename(file), ab, parsed.content);
      const canonical = toCanonical(doc);

      console.log(`\n=== ${path.basename(file)} ===`);
      console.log(`Lines: ${parsed.content.type === "text" ? parsed.content.lines.length : "N/A"}`);
      for (const item of canonical.items) {
        console.log(`  ${item.kind}: ${item.key} = ${JSON.stringify(item.value)}`);
      }

      // Must have meaningful content
      expect(canonical.items.length).toBeGreaterThan(0);

      // No raw RTF artifacts in any item
      for (const item of canonical.items) {
        expect(item.value).not.toMatch(/^\{\\rtf/);
        expect(item.value).not.toMatch(/^\\ansi/);
        expect(item.label).not.toMatch(/^\{\\rtf/);
      }
    }
  });
});
