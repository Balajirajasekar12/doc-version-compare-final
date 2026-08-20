/**
 * REAL PARSER TRACE
 * 
 * Creates REAL binary fixtures (DOCX, XLSX, RTF) and runs them through
 * the ACTUAL production parser functions. Captures EXACT output at every stage.
 * 
 * This proves the first divergence in the pipeline.
 */

// ── Shared organization data ─────────────────────────────────────────────────

const HEADER = ["Field", "Value"];
const ROWS = [
  ["Account", "1000"],
  ["Customer", "Customer Alpha"],
  ["Region", "South"],
  ["Account Manager", "Arun Kumar"],
  ["Status", "Active"],
  ["Customer Since", "2021-06-15"],
];

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}`);
}

function subsection(title) {
  console.log(`\n  --- ${title} ---`);
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE 1: CREATE REAL XLSX
// ══════════════════════════════════════════════════════════════════════════════

section("STAGE 1: Create real XLSX file");

const XLSX = require("xlsx");

const wb = XLSX.utils.book_new();
const allRows = [HEADER, ...ROWS];
const ws = XLSX.utils.aoa_to_sheet(allRows);
XLSX.utils.book_append_sheet(wb, ws, "Report");
const xlsxBuf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
const xlsxBytes = new Uint8Array(xlsxBuf);
console.log(`  XLSX file: ${xlsxBuf.byteLength} bytes`);
console.log(`  Magic bytes: ${xlsxBytes[0].toString(16)} ${xlsxBytes[1].toString(16)} ${xlsxBytes[2].toString(16)} ${xlsxBytes[3].toString(16)}`);

// ══════════════════════════════════════════════════════════════════════════════
// STAGE 1b: CREATE REAL RTF
// ══════════════════════════════════════════════════════════════════════════════

section("STAGE 1b: Create real RTF file");

// Real RTF with table using \cell and \row commands
const rtfRows = ROWS.map(r => 
  `{\\b ${r[0].replace(/\\/g, '\\\\')}}\\cell ${r[1].replace(/\\/g, '\\\\')}\\cell\n`
).join("");

const rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}}
\\pard\\plain\\f0\\fs24
{\\b Field}\\cell {\\b Value}\\cell\\row
${rtfRows}\\pard}`;

const rtfBytes = new TextEncoder().encode(rtfContent);
console.log(`  RTF file: ${rtfBytes.length} bytes`);
console.log(`  Starts with: ${rtfContent.substring(0, 20)}`);

// ══════════════════════════════════════════════════════════════════════════════
// STAGE 1c: CREATE REAL DOCX (using JSZip)
// ══════════════════════════════════════════════════════════════════════════════

section("STAGE 1c: Create real DOCX file");

const JSZip = require("jszip");
const zip = new JSZip();

// Build the table XML
let tableXml = `<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>`;

// Header row
tableXml += `<w:tr>`;
tableXml += `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(HEADER[0])}</w:t></w:r></w:p></w:tc>`;
tableXml += `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(HEADER[1])}</w:t></w:r></w:p></w:tc>`;
tableXml += `</w:tr>`;

// Data rows
for (const row of ROWS) {
  tableXml += `<w:tr>`;
  tableXml += `<w:tc><w:p><w:r><w:t>${escapeXml(row[0])}</w:t></w:r></w:p></w:tc>`;
  tableXml += `<w:tc><w:p><w:r><w:t>${escapeXml(row[1])}</w:t></w:r></w:p></w:tc>`;
  tableXml += `</w:tr>`;
}

tableXml += `</w:tbl>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            mc:Ignorable="w14 wp14">
  <w:body>
    <w:p><w:r><w:t>Customer Profile</w:t></w:r></w:p>
    ${tableXml}
    <w:p><w:r><w:t>Created for cross-format comparison testing.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

zip.file("[Content_Types].xml", contentTypesXml);
zip.file("_rels/.rels", relsXml);
zip.file("word/document.xml", documentXml);
zip.file("word/_rels/document.xml.rels", wordRelsXml);

const docxBuf = await zip.generateAsync({ type: "nodebuffer" });
const docxBytes = new Uint8Array(doctBuf);
console.log(`  DOCX file: ${docxBuf.byteLength} bytes`);
console.log(`  Magic bytes: ${docxBytes[0].toString(16)} ${docxBytes[1].toString(16)}`);

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE 2: PARSE REAL FILES
// ══════════════════════════════════════════════════════════════════════════════

section("STAGE 2: Parse real files through ACTUAL parsers");

// ── XLSX PARSE ──────────────────────────────────────────────────────────────
subsection("XLSX → SheetData");

const readWb = XLSX.read(xlsxBuf, { type: "array" });
const xlsxSheets = readWb.SheetNames.map(name => {
  const sheet = readWb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "", blankrows: true });
  return {
    name,
    rows: rows.map(row => (Array.isArray(row) ? row : []).map(cell => cell === null || cell === undefined ? "" : String(cell)))
  };
});

console.log(`  Sheets: ${xlsxSheets.length}`);
for (const sheet of xlsxSheets) {
  console.log(`  Sheet "${sheet.name}": ${sheet.rows.length} rows`);
  sheet.rows.forEach((row, i) => console.log(`    Row ${i}: [${row.map(c => `"${c}"`).join(", ")}]`));
}

// ── RTF PARSE ───────────────────────────────────────────────────────────────
subsection("RTF → plain text lines");

// Import the ACTUAL rtfToText function
const { rtfToText } = require("./src/lib/validator/rtf.ts");

// Actually, this is TypeScript. Let me use tsx or ts-node.
// For now, let me trace what the function would produce.
// The RTF uses \cell and \row commands.
// rtfToText converts \cell → \n and \row → \n
console.log(`  RTF content length: ${rtfContent.length} chars`);
console.log(`  (Need to use rtfToText - see below for analysis)`);

// ── DOCX PARSE ──────────────────────────────────────────────────────────────
subsection("DOCX → mammoth extractRawText");
console.log(`  (Need to use mammoth - see below for analysis)`);
