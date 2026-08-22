const XLSX_LIB = require("xlsx");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "test-fixtures", "highmark-real");
fs.mkdirSync(OUT, { recursive: true });

const ACCOUNTS = [
  {
    num: "1000",
    clientNum: "016543",
    clientName: "Borough Of Ridgway",
    billAcctNum: "0165431006",
    billAcctName: "Borough Of Ridgway",
    invoiceNum: "260804584270",
    sortDesc: "Product/Sub Group-8 Digit",
    groupCode: "105745-44",
    groupTotal: "105745 Total",
    total: "$333.33",
    numInstallments: "3",
    billedToDate: "$0.00",
    totalInstallmentsBilled: "3",
    unpaidAdvance: "($333.33)",
    currentInstallment: "($111.11)",
    advanceDepositTotal: "$333.33",
    omitClientFields: false,
  },
  {
    num: "1001",
    clientNum: "016543",
    clientName: "Borough Of Ridgway",
    billAcctNum: "0165431006",
    billAcctName: "Borough Of Ridgway",
    invoiceNum: "260804584271",
    sortDesc: "Product/Sub Group-8 Digit",
    groupCode: "105745-44",
    groupTotal: "105745 Total",
    total: "$444.44",
    numInstallments: "4",
    billedToDate: "$111.11",
    totalInstallmentsBilled: "4",
    unpaidAdvance: "($333.33)",
    currentInstallment: "($111.11)",
    advanceDepositTotal: "$444.44",
    omitClientFields: true,
  },
  {
    num: "1002",
    clientNum: "016543",
    clientName: "Borough Of Ridgway",
    billAcctNum: "0165431006",
    billAcctName: "Borough Of Ridgway",
    invoiceNum: "260804584272",
    sortDesc: "Product/Sub Group-8 Digit",
    groupCode: "105745-44",
    groupTotal: "105745 Total",
    total: "$555.55",
    numInstallments: "5",
    billedToDate: "$222.22",
    totalInstallmentsBilled: "5",
    unpaidAdvance: "($333.33)",
    currentInstallment: "($111.11)",
    advanceDepositTotal: "$555.55",
    omitClientFields: false,
  },
  {
    num: "1003",
    clientNum: "016543",
    clientName: "Borough Of Ridgway",
    billAcctNum: "0165431006",
    billAcctName: "Borough Of Ridgway",
    invoiceNum: "260804584273",
    sortDesc: "Product/Sub Group-8 Digit",
    groupCode: "105745-44",
    groupTotal: "105745 Total",
    total: "$666.66",
    numInstallments: "6",
    billedToDate: "$333.33",
    totalInstallmentsBilled: "6",
    unpaidAdvance: "($333.33)",
    currentInstallment: "($111.11)",
    advanceDepositTotal: "$666.66",
    omitClientFields: false,
  },
];

function genRtf(acct) {
  let rtf = "{\\rtf1\\ansi\\deff0\n";
  rtf += "{\\fonttbl{\\f0 Arial;}{\\f1 Arial Bold;}}\n";
  rtf += "{\\colortbl;\\red0\\green0\\blue0;}\n";
  rtf += "\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\n";
  rtf += "\\pard\\plain\\f0\\fs24\n";
  rtf += "HIGHMARK\\line\n";
  rtf += "PAGE: 1 of 1\\line\n";
  rtf += "Paid Claims Month: August 2026\\line\n";
  rtf += "Claims Paid Thru: 07/31/2026\\line\n";
  rtf += "\\line\n";
  rtf += "ADVANCE DEPOSIT\\line\n";
  rtf += "\\line\n";

  if (!acct.omitClientFields) {
    rtf += "Client Number\\line\n";
    rtf += acct.clientNum + "\\line\n";
    rtf += "Client Name\\line\n";
    rtf += acct.clientName + "\\line\n";
  }
  rtf += "Bill Account Number\\line\n";
  rtf += acct.billAcctNum + "\\line\n";
  rtf += "Bill Account Name\\line\n";
  rtf += acct.billAcctName + "\\line\n";
  rtf += "Invoice Number\\line\n";
  rtf += acct.invoiceNum + "\\line\n";
  rtf += "Sort Description: " + acct.sortDesc + "\\line\n";
  rtf += "\\line\n";

  // Table section with \tab between columns
  rtf += "Group\\tab Total\\tab Total Number of Installment\\tab Billed to Date\\tab Total Installments Billed to Date\\tab Unpaid Advance Balance\\tab Current Installment Due\\line\n";
  rtf += acct.groupCode + "\\tab " + acct.total + "\\tab " + acct.numInstallments + "\\tab " + acct.billedToDate + "\\tab " + acct.totalInstallmentsBilled + "\\tab " + acct.unpaidAdvance + "\\tab " + acct.currentInstallment + "\\line\n";
  rtf += acct.groupTotal + "\\tab " + acct.total + "\\tab " + acct.numInstallments + "\\tab " + acct.billedToDate + "\\tab " + acct.totalInstallmentsBilled + "\\tab " + acct.unpaidAdvance + "\\tab " + acct.currentInstallment + "\\line\n";
  rtf += "HDHP PPO Total\\tab " + acct.advanceDepositTotal + "\\tab " + acct.numInstallments + "\\tab " + acct.billedToDate + "\\tab " + acct.totalInstallmentsBilled + "\\tab " + acct.unpaidAdvance + "\\tab " + acct.currentInstallment + "\\line\n";
  rtf += "Advance Deposit Total\\tab " + acct.advanceDepositTotal + "\\tab " + acct.numInstallments + "\\tab " + acct.billedToDate + "\\tab " + acct.totalInstallmentsBilled + "\\tab " + acct.unpaidAdvance + "\\tab " + acct.currentInstallment + "\\line\n";
  rtf += "\\line\n";
  rtf += "Proof\\line\n";
  rtf += "Created for cross-format comparison testing.\\line\n";
  rtf += "}";

  const rtfPath = path.join(OUT, acct.num, acct.billAcctNum + "_ADVANCE_DEPOSIT_" + acct.invoiceNum + ".rtf");
  fs.mkdirSync(path.dirname(rtfPath), { recursive: true });
  fs.writeFileSync(rtfPath, rtf, "latin1");
  console.log("  RTF:", rtfPath, "(" + Buffer.byteLength(rtf, "latin1") + " bytes)");
}

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  const parts = [];
  let offset = 0;
  const centralEntries = [];

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf-8");
    const crc = crc32(entry.data);
    const localHdr = Buffer.alloc(30 + nameBuf.length);
    localHdr.writeUInt32LE(0x04034b50, 0);
    localHdr.writeUInt16LE(20, 4);
    localHdr.writeUInt16LE(0, 6);
    localHdr.writeUInt16LE(0, 8);
    localHdr.writeUInt16LE(0, 10);
    localHdr.writeUInt16LE(0, 12);
    localHdr.writeUInt32LE(crc, 14);
    localHdr.writeUInt32LE(entry.data.length, 18);
    localHdr.writeUInt32LE(entry.data.length, 22);
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(0, 28);
    nameBuf.copy(localHdr, 30);
    parts.push(localHdr);
    parts.push(entry.data);

    const centralHdr = Buffer.alloc(46 + nameBuf.length);
    centralHdr.writeUInt32LE(0x02014b50, 0);
    centralHdr.writeUInt16LE(20, 4);
    centralHdr.writeUInt16LE(20, 6);
    centralHdr.writeUInt16LE(0, 8);
    centralHdr.writeUInt16LE(0, 10);
    centralHdr.writeUInt16LE(0, 12);
    centralHdr.writeUInt16LE(0, 14);
    centralHdr.writeUInt32LE(crc, 16);
    centralHdr.writeUInt32LE(entry.data.length, 20);
    centralHdr.writeUInt32LE(entry.data.length, 24);
    centralHdr.writeUInt16LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(0, 30);
    centralHdr.writeUInt16LE(0, 32);
    centralHdr.writeUInt16LE(0, 34);
    centralHdr.writeUInt16LE(0, 36);
    centralHdr.writeUInt32LE(0, 38);
    centralHdr.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHdr, 46);
    centralEntries.push({ buf: centralHdr, size: centralHdr.length });
    offset += localHdr.length + entry.data.length;
  }

  let centralSize = 0;
  for (const ce of centralEntries) { parts.push(ce.buf); centralSize += ce.size; }

  const endRec = Buffer.alloc(22);
  endRec.writeUInt32LE(0x06054b50, 0);
  endRec.writeUInt16LE(entries.length, 8);
  endRec.writeUInt16LE(entries.length, 10);
  endRec.writeUInt32LE(centralSize, 12);
  endRec.writeUInt32LE(offset, 16);
  parts.push(endRec);

  return Buffer.concat(parts);
}

function genDocx(acct) {
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n<Default Extension="xml" ContentType="application/xml"/>\n<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n</Types>';

  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n</Relationships>';

  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>';

  let body = '';
  body += '<w:p><w:r><w:t>HIGHMARK</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>PAGE: 1 of 1</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Paid Claims Month: August 2026</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Claims Paid Thru: 07/31/2026</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t></w:t></w:r></w:p>';
  body += '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ADVANCE DEPOSIT</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t></w:t></w:r></w:p>';

  if (!acct.omitClientFields) {
    body += '<w:p><w:r><w:t>Client Number: ' + acct.clientNum + '</w:t></w:r></w:p>';
    body += '<w:p><w:r><w:t>Client Name: ' + acct.clientName + '</w:t></w:r></w:p>';
  }
  body += '<w:p><w:r><w:t>Bill Account Number: ' + acct.billAcctNum + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Bill Account Name: ' + acct.billAcctName + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Invoice Number: ' + acct.invoiceNum + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Sort Description: ' + acct.sortDesc + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t></w:t></w:r></w:p>';

  body += '<w:p><w:r><w:t>Group | Total | Total Number of Installment | Billed to Date | Total Installments Billed to Date | Unpaid Advance Balance | Current Installment Due</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>' + acct.groupCode + ' | ' + acct.total + ' | ' + acct.numInstallments + ' | ' + acct.billedToDate + ' | ' + acct.totalInstallmentsBilled + ' | ' + acct.unpaidAdvance + ' | ' + acct.currentInstallment + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>' + acct.groupTotal + ' | ' + acct.total + ' | ' + acct.numInstallments + ' | ' + acct.billedToDate + ' | ' + acct.totalInstallmentsBilled + ' | ' + acct.unpaidAdvance + ' | ' + acct.currentInstallment + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>HDHP PPO Total | ' + acct.advanceDepositTotal + ' | ' + acct.numInstallments + ' | ' + acct.billedToDate + ' | ' + acct.totalInstallmentsBilled + ' | ' + acct.unpaidAdvance + ' | ' + acct.currentInstallment + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Advance Deposit Total | ' + acct.advanceDepositTotal + ' | ' + acct.numInstallments + ' | ' + acct.billedToDate + ' | ' + acct.totalInstallmentsBilled + ' | ' + acct.unpaidAdvance + ' | ' + acct.currentInstallment + '</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t></w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Proof</w:t></w:r></w:p>';
  body += '<w:p><w:r><w:t>Created for cross-format comparison testing.</w:t></w:r></w:p>';

  const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n<w:body>\n' + body + '\n<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:left="1440" w:right="1440" w:top="1440" w:bottom="1440"/></w:sectPr>\n</w:body>\n</w:document>';

  const zipData = buildZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf-8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf-8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(docRels, "utf-8") },
    { name: "word/document.xml", data: Buffer.from(docXml, "utf-8") },
  ]);

  const docxPath = path.join(OUT, acct.num, acct.billAcctNum + "_ADVANCE_DEPOSIT_" + acct.invoiceNum + ".docx");
  fs.mkdirSync(path.dirname(docxPath), { recursive: true });
  fs.writeFileSync(docxPath, zipData);
  console.log("  DOCX:", docxPath, "(" + zipData.length + " bytes)");
}

function genXlsx(acct) {
  const wb = XLSX_LIB.utils.book_new();
  const fvData = [["Field", "Value"]];
  if (!acct.omitClientFields) {
    fvData.push(["Client Number", acct.clientNum]);
    fvData.push(["Client Name", acct.clientName]);
  }
  fvData.push(["Bill Account Number", acct.billAcctNum]);
  fvData.push(["Bill Account Name", acct.billAcctName]);
  fvData.push(["Invoice Number", acct.invoiceNum]);
  fvData.push(["Sort Description", acct.sortDesc]);
  fvData.push(["Group", acct.groupCode]);
  fvData.push(["Total", acct.total]);
  fvData.push(["Total Number of Installment", acct.numInstallments]);
  fvData.push(["Billed to Date", acct.billedToDate]);
  fvData.push(["Total Installments Billed to Date", acct.totalInstallmentsBilled]);
  fvData.push(["Unpaid Advance Balance", acct.unpaidAdvance]);
  fvData.push(["Current Installment Due", acct.currentInstallment]);
  fvData.push(["Advance Deposit Total", acct.advanceDepositTotal]);
  fvData.push(["Proof", "Created for cross-format comparison testing."]);

  const fvSheet = XLSX_LIB.utils.aoa_to_sheet(fvData);
  XLSX_LIB.utils.book_append_sheet(wb, fvSheet, "Report");

  const xlsxPath = path.join(OUT, acct.num, acct.billAcctNum + "_ADVANCE_DEPOSIT_" + acct.invoiceNum + ".xlsx");
  fs.mkdirSync(path.dirname(xlsxPath), { recursive: true });
  XLSX_LIB.writeFile(wb, xlsxPath);
  console.log("  XLSX:", xlsxPath);
}

for (const acct of ACCOUNTS) {
  const dir = path.join(OUT, acct.num);
  fs.mkdirSync(dir, { recursive: true });
  console.log("Account " + acct.num + ":");
  genRtf(acct);
  genDocx(acct);
  genXlsx(acct);
}
console.log("\nDone! Generated files in:", OUT);
