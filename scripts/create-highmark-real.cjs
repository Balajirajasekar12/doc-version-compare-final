/**
 * Create HIGHMARK Advance Deposit report files matching the EXACT layout
 * from the user's screenshots (PDF = master reference).
 *
 * Layout from screenshots:
 * - PDF (master): Client Number, Client Name, Bill Account Number, 
 *   Bill Account Name, Invoice Number, Sort Description, Table
 * - DOCX/RTF: Missing Client Number and Client Name (genuine difference)
 * - Sort Description: Product/Sub Group-8 Digit (MUST match across formats)
 */

const XLSX_LIB = require("xlsx");
const JSZip = require("jszip");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "test-highmark-real");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const ACCOUNTS = {
  "1000": {
    clientNumber: "016543",
    clientName: "Borough of Ridgway",
    billAccountNumber: "0165431006",
    billAccountName: "Borough Of Ridgway",
    invoiceNumber: "260804584270",
    sortDesc: "Product/Sub Group-8 Digit",
    group: "HDHP PPO",
    groupCode: "105745-44",
    total: "($333.33)",
    numInstallments: "3",
    billedToDate: "$0.00",
    totalInstallments: "0",
    unpaidAdvance: "($333.33)",
    currentDue: "($111.11)",
    groupTotal: "($333.33)",
    hdhpPpoTotal: "($333.33)",
    advanceDepositTotal: "($111.11)",
    omitClientFields: false,
  },
  "1001": {
    clientNumber: "016543",
    clientName: "Borough of Ridgway",
    billAccountNumber: "0165431006",
    billAccountName: "Borough Of Ridgway",
    invoiceNumber: "260804584270",
    sortDesc: "Product/Sub Group-8 Digit",
    group: "HDHP PPO",
    groupCode: "105745-44",
    total: "($333.33)",
    numInstallments: "3",
    billedToDate: "$0.00",
    totalInstallments: "0",
    unpaidAdvance: "($333.33)",
    currentDue: "($111.11)",
    groupTotal: "($333.33)",
    hdhpPpoTotal: "($333.33)",
    advanceDepositTotal: "($111.11)",
    omitClientFields: true, // Genuine difference
  },
  "1002": {
    clientNumber: "027891",
    clientName: "City of Pittsburgh",
    billAccountNumber: "0278912005",
    billAccountName: "City Of Pittsburgh",
    invoiceNumber: "260804584310",
    sortDesc: "Product/Sub Group-8 Digit",
    group: "PPO",
    groupCode: "204567-12",
    total: "($500.00)",
    numInstallments: "6",
    billedToDate: "$250.00",
    totalInstallments: "3",
    unpaidAdvance: "($250.00)",
    currentDue: "($83.33)",
    groupTotal: "($500.00)",
    hdhpPpoTotal: "($500.00)",
    advanceDepositTotal: "($83.33)",
    omitClientFields: false,
  },
  "1003": {
    clientNumber: "034567",
    clientName: "Allegheny County",
    billAccountNumber: "0345673008",
    billAccountName: "Allegheny County",
    invoiceNumber: "260804584420",
    sortDesc: "Product/Sub Group-8 Digit",
    group: "HDHP PPO",
    groupCode: "305678-23",
    total: "($750.00)",
    numInstallments: "9",
    billedToDate: "$500.00",
    totalInstallments: "6",
    unpaidAdvance: "($250.00)",
    currentDue: "($83.33)",
    groupTotal: "($750.00)",
    hdhpPpoTotal: "($750.00)",
    advanceDepositTotal: "($83.33)",
    omitClientFields: false,
  },
};

// ── RTF ──
function createRtf(acct, acctNum) {
  const lines = [];
  lines.push("{\\rtf1\\ansi\\deff0");
  lines.push("{\\fonttbl{\\f0 Arial;}}");
  lines.push("\\f0\\fs20");
  lines.push("\\pard HIGHMARK\\tab\\tab\\tab PAGE: 1 of 1\\tab\\tab Paid Claims Month");
  lines.push("\\pard An Independent Licensee of the Blue Cross and Blue Shield Association");
  lines.push("\\tab\\tab\\tab\\tab\\tab August 2026");
  lines.push("\\tab\\tab\\tab\\tab\\tab (Prepared 08/04/2026)");
  lines.push("\\tab\\tab\\tab\\tab Claims Paid Thru");
  lines.push("\\tab\\tab\\tab\\tab 07/31/2026\\tab (Bill Cycle 5 of 5)");
  lines.push("\\pard\\par");
  lines.push("ADVANCE DEPOSIT");

  if (!acct.omitClientFields) {
    lines.push("Client Number\\tab\\tab\\tab Client Name\\tab\\tab\\tab Invoice Number");
    lines.push(`${acct.clientNumber}\\tab\\tab\\tab ${acct.clientName}\\tab ${acct.invoiceNumber}`);
    lines.push("Bill Account Number\\tab\\tab Bill Account Name");
    lines.push(`${acct.billAccountNumber}\\tab\\tab ${acct.billAccountName}`);
  } else {
    lines.push("Bill Account Number\\tab\\tab Bill Account Name\\tab\\tab Invoice Number");
    lines.push(`${acct.billAccountNumber}\\tab\\tab ${acct.billAccountName}\\tab ${acct.invoiceNumber}`);
  }
  lines.push("\\pard Sort Description: Product/Sub Group-8 Digit\\par");
  lines.push("\\par");
  lines.push(`${acct.group}\\tab ${acct.total}\\tab ${acct.numInstallments}\\tab ${acct.billedToDate}\\tab ${acct.totalInstallments}\\tab ${acct.unpaidAdvance}\\tab ${acct.currentDue}`);
  lines.push(`${acct.groupCode}\\tab ${acct.total}\\tab ${acct.numInstallments}\\tab ${acct.billedToDate}\\tab ${acct.totalInstallments}\\tab ${acct.unpaidAdvance}\\tab ${acct.currentDue}`);
  lines.push(`${acct.group} Total\\tab ${acct.groupTotal}\\tab\\tab $0.00`);
  lines.push("Advance Deposit Total\\tab\\tab\\tab\\tab\\tab\\tab\\tab\\tab " + acct.advanceDepositTotal);
  lines.push("\\par");
  lines.push("*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.");
  lines.push("}");

  const content = lines.join("\\line\r\n");
  const filePath = path.join(OUT, `${acctNum}_HIGHMARK_ADVANCE_DEPOSIT.rtf`);
  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`RTF: ${filePath}`);
}

// ── DOCX ──
async function createDocx(acct, acctNum) {
  let body = '';
  body += '<w:p><w:r><w:t>HIGHMARK - Advance Deposit Report</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>PAGE: 1 of 1</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Paid Claims Month: August 2026</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Claims Paid Thru: 07/31/2026 (Bill Cycle 5 of 5)</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>ADVANCE DEPOSIT</w:t></w:r></w:p>';

  // DOCX is the reference - always has all fields
  body += `<w:p><w:r><w:t>Client Number: ${acct.clientNumber}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>Client Name: ${acct.clientName}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>Bill Account Number: ${acct.billAccountNumber}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>Bill Account Name: ${acct.billAccountName}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>Invoice Number: ${acct.invoiceNumber}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>Sort Description: ${acct.sortDesc}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>${acct.group} ${acct.total} ${acct.numInstallments} ${acct.billedToDate} ${acct.totalInstallments} ${acct.unpaidAdvance} ${acct.currentDue}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>${acct.groupCode} ${acct.total} ${acct.numInstallments} ${acct.billedToDate} ${acct.totalInstallments} ${acct.unpaidAdvance} ${acct.currentDue}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>${acct.group} Total ${acct.groupTotal} $0.00</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>Advance Deposit Total ${acct.advanceDepositTotal}</w:t></w:r></w:p>`;
  body += `<w:p><w:r><w:t>*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.</w:t></w:r></w:p>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}</w:body></w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);
  zip.file("word/document.xml", documentXml);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const filePath = path.join(OUT, `${acctNum}_HIGHMARK_ADVANCE_DEPOSIT.docx`);
  fs.writeFileSync(filePath, buf);
  console.log(`DOCX: ${filePath}`);
}

// ── XLSX ──
function createXlsx(acct, acctNum) {
  const wb = XLSX_LIB.utils.book_new();

  const fvData = [["Field", "Value"]];
  // XLSX is the reference - always has all fields
  fvData.push(["Client Number", acct.clientNumber]);
  fvData.push(["Client Name", acct.clientName]);
  fvData.push(["Bill Account Number", acct.billAccountNumber]);
  fvData.push(["Bill Account Name", acct.billAccountName]);
  fvData.push(["Invoice Number", acct.invoiceNumber]);
  fvData.push(["Sort Description", acct.sortDesc]);
  fvData.push(["Paid Claims Month", "August 2026"]);
  fvData.push(["Claims Paid Thru", "07/31/2026"]);
  fvData.push(["Group", acct.group]);
  fvData.push(["Total", acct.total]);
  fvData.push(["Total Number of Installment", acct.numInstallments]);
  fvData.push(["Billed to Date", acct.billedToDate]);
  fvData.push(["Total Installments Billed to Date", acct.totalInstallments]);
  fvData.push(["Unpaid Advance Balance", acct.unpaidAdvance]);
  fvData.push(["Current Installment Due", acct.currentDue]);

  const ws = XLSX_LIB.utils.aoa_to_sheet(fvData);
  XLSX_LIB.utils.book_append_sheet(wb, ws, "Advance Deposit");

  const filePath = path.join(OUT, `${acctNum}_HIGHMARK_ADVANCE_DEPOSIT.xlsx`);
  XLSX_LIB.writeFile(wb, filePath);
  console.log(`XLSX: ${filePath}`);
}

(async () => {
  for (const [acctNum, acct] of Object.entries(ACCOUNTS)) {
    await createDocx(acct, acctNum);
    createXlsx(acct, acctNum);
    createRtf(acct, acctNum);
  }
  console.log(`\nAll files in ${OUT}`);
})();
