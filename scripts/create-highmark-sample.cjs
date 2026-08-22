/**
 * Create sample files matching the exact HIGHMARK report layout from screenshots.
 * This reproduces the "Sort Description: Product/Sub Group-8 Digit" issue.
 */
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle } = require('docx');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'test-fixtures', 'highmark');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Content matching the HIGHMARK report from screenshots
const HEADER = {
  company: 'HIGHMARK',
  page: 'PAGE: 1 of 1',
  paidMonth: 'Paid Claims Month\nAugust 2026',
  prepared: '(Prepared 08/04/2026)',
  claimsThru: 'Claims Paid Thru\n07/31/2026 (Bill Cycle 5 of 5)',
};

const FIELDS = [
  ['Client Number', '016543'],
  ['Client Name', 'Borough of Ridgway'],
  ['Bill Account Number', '0165431006'],
  ['Bill Account Name', 'Borough Of Ridgway'],
  ['Invoice Number', '260804584270'],
];

const SORT_DESCRIPTION = 'Sort Description: Product/Sub Group-8 Digit';

const TABLE_HEADERS = ['Group', 'Total', 'Total Number of Installment', 'Billed to Date', 'Total Installments Billed to Date', 'Unpaid Advance Balance', 'Current Installment Due'];
const TABLE_ROWS = [
  ['HDHP PPO', '($333.33)', '3', '$0.00', '0', '($333.33)', '($111.11)'],
  ['105745-44', '($333.33)', '', '$0.00', '', '($333.33)', '($111.11)'],
  ['105745 Total', '($333.33)', '', '$0.00', '', '($333.33)', '($111.11)'],
  ['HDHP PPO Total', '($333.33)', '', '$0.00', '', '($333.33)', '($111.11)'],
];
const TABLE_FOOTER = ['Advance Deposit Total', '', '', '', '', '', '($111.11)'];

const FOOTER_TEXT = '*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.';

// ── PDF ─────────────────────────────────────────────────────────────────────
function createPDF() {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50 });
    const filePath = path.join(OUTPUT_DIR, '0165431006_ADVANCE_DEPOSIT_260804584270.pdf');
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('HIGHMARK', 50, 50);
    doc.fontSize(8).font('Helvetica').text('An Independent Licensee of the Blue Cross and Blue Shield Association', 50, 72);
    doc.fontSize(10).text('PAGE: 1 of 1', 400, 50);

    // Right side metadata
    doc.fontSize(9).text('Paid Claims Month', 350, 80);
    doc.fontSize(10).font('Helvetica-Bold').text('August 2026', 350, 92);
    doc.fontSize(8).font('Helvetica').text('(Prepared 08/04/2026)', 350, 105);
    doc.fontSize(9).text('Claims Paid Thru', 350, 120);
    doc.fontSize(10).font('Helvetica-Bold').text('07/31/2026 (Bill Cycle 5 of 5)', 350, 132);

    // ADVANCE DEPOSIT box
    const boxY = 170;
    doc.rect(50, boxY, 500, 120).stroke();
    doc.fontSize(12).font('Helvetica-Bold').text('ADVANCE DEPOSIT', 60, boxY + 10);

    // Field/value pairs - these are at specific X positions matching the HIGHMARK layout
    // "Client Number" is at X~60, "016543" is at X~120
    // "Client Name" is at X~250, "Borough of Ridgway" is at X~310
    let fieldY = boxY + 30;
    doc.fontSize(9).font('Helvetica');
    
    // Row 1: Client Number | Client Name
    doc.text('Client Number', 60, fieldY);
    doc.text('016543', 140, fieldY);
    doc.text('Client Name', 250, fieldY);
    doc.text('Borough of Ridgway', 330, fieldY);
    doc.text('Invoice Number', 420, fieldY);
    doc.text('260804584270', 500, fieldY);

    fieldY += 20;
    // Row 2: Bill Account Number | Bill Account Name
    doc.text('Bill Account Number', 60, fieldY);
    doc.text('0165431006', 170, fieldY);
    doc.text('Bill Account Name', 250, fieldY);
    doc.text('Borough Of Ridgway', 360, fieldY);

    // Sort Description line - KEY LINE
    // This is at Y~310, with "Sort Description:" at X~50 and "Product/Sub Group-8 Digit" at X~160
    // The gap between them should cause the PDF parser to split them
    fieldY = boxY + 130;
    doc.fontSize(8).font('Helvetica');
    doc.text('Sort Description:', 50, fieldY);
    doc.text('Product/Sub Group-8 Digit', 150, fieldY);

    // Table
    const tableY = fieldY + 30;
    const colX = [50, 130, 200, 290, 370, 440, 520];
    
    // Table header
    doc.fontSize(7).font('Helvetica-Bold');
    let y = tableY;
    for (let c = 0; c < TABLE_HEADERS.length; c++) {
      doc.text(TABLE_HEADERS[c], colX[c], y, { width: 70 });
    }

    // Table rows
    doc.font('Helvetica').fontSize(8);
    y += 20;
    for (const row of TABLE_ROWS) {
      for (let c = 0; c < row.length; c++) {
        if (row[c]) doc.text(row[c], colX[c], y);
      }
      y += 15;
    }

    // Footer
    doc.fontSize(7).font('Helvetica').text(FOOTER_TEXT, 50, 650);

    doc.end();
    stream.on('finish', () => {
      console.log(`PDF created: ${filePath}`);
      resolve(filePath);
    });
  });
}

// ── DOCX ────────────────────────────────────────────────────────────────────
async function createDOCX() {
  const filePath = path.join(OUTPUT_DIR, '0165431006_ADVANCE_DEPOSIT_260804584270.docx');
  
  const children = [];

  // Header
  children.push(new Paragraph({
    children: [new TextRun({ text: 'HIGHMARK', bold: true, size: 36 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'An Independent Licensee of the Blue Cross and Blue Shield Association', size: 16 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'PAGE: 1 of 1', size: 20 })],
    alignment: AlignmentType.RIGHT,
  }));

  // Metadata
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Paid Claims Month', size: 18 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'August 2026', bold: true, size: 20 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '(Prepared 08/04/2026)', size: 16 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Claims Paid Thru', size: 18 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '07/31/2026 (Bill Cycle 5 of 5)', bold: true, size: 20 })],
  }));

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: 'ADVANCE DEPOSIT', bold: true, size: 24 })],
  }));

  // Field/value pairs
  for (const [field, value] of FIELDS) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${field}: `, bold: true, size: 18 }),
        new TextRun({ text: value, size: 18 }),
      ],
    }));
  }

  // Sort Description - CRITICAL LINE
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'Sort Description: ', bold: true, size: 16 }),
      new TextRun({ text: 'Product/Sub Group-8 Digit', size: 16 }),
    ],
  }));

  // Table
  const tableRows = [];
  // Header row
  tableRows.push(new TableRow({
    children: TABLE_HEADERS.map(h => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 14 })] })],
      width: { size: 14, type: WidthType.PERCENTAGE },
    })),
  }));
  // Data rows
  for (const row of TABLE_ROWS) {
    tableRows.push(new TableRow({
      children: row.map(cell => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: cell, size: 16 })] })],
        width: { size: 14, type: WidthType.PERCENTAGE },
      })),
    }));
  }
  // Footer row
  tableRows.push(new TableRow({
    children: TABLE_FOOTER.map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: cell, size: 16 })] })],
      width: { size: 14, type: WidthType.PERCENTAGE },
    })),
  }));

  children.push(new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  }));

  // Footer text
  children.push(new Paragraph({
    children: [new TextRun({ text: FOOTER_TEXT, size: 14, italics: true })],
  }));

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  console.log(`DOCX created: ${filePath}`);
  return filePath;
}

// ── RTF ─────────────────────────────────────────────────────────────────────
function createRTF() {
  const filePath = path.join(OUTPUT_DIR, '0165431006_ADVANCE_DEPOSIT_260804584270.rtf');
  
  // Build RTF content matching the HIGHMARK layout
  // The RTF has "Sort Description: Product/Sub Group-8 Digit" as a single line
  const rtf = `{\\rtf1\\ansi
\\b HIGHMARK\\b0\\par
An Independent Licensee of the Blue Cross and Blue Shield Association\\par
PAGE: 1 of 1\\par
\\par
Paid Claims Month\\par
\\b August 2026\\b0\\par
(Prepared 08/04/2026)\\par
Claims Paid Thru\\par
\\b 07/31/2026 (Bill Cycle 5 of 5)\\b0\\par
\\par
\\b ADVANCE DEPOSIT\\b0\\par
\\par
Client Number: 016543\\par
Client Name: Borough of Ridgway\\par
Bill Account Number: 0165431006\\par
Bill Account Name: Borough Of Ridgway\\par
Invoice Number: 260804584270\\par
\\par
Sort Description: Product/Sub Group-8 Digit\\par
\\par
Group\\tab Total\\tab Total Number of Installment\\tab Billed to Date\\tab Total Installments Billed to Date\\tab Unpaid Advance Balance\\tab Current Installment Due\\par
HDHP PPO\\tab ($333.33)\\tab 3\\tab $0.00\\tab 0\\tab ($333.33)\\tab ($111.11)\\par
105745-44\\tab ($333.33)\\tab\\tab $0.00\\tab\\tab ($333.33)\\tab ($111.11)\\par
105745 Total\\tab ($333.33)\\tab\\tab $0.00\\tab\\tab ($333.33)\\tab ($111.11)\\par
HDHP PPO Total\\tab ($333.33)\\tab\\tab $0.00\\tab\\tab ($333.33)\\tab ($111.11)\\par
\\par
Advance Deposit Total\\tab\\tab\\tab\\tab\\tab\\tab ($111.11)\\par
\\par
*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.\\par
}`;
  
  fs.writeFileSync(filePath, rtf, 'utf-8');
  console.log(`RTF created: ${filePath}`);
  return filePath;
}

// ── XLSX ────────────────────────────────────────────────────────────────────
function createXLSX() {
  const filePath = path.join(OUTPUT_DIR, '0165431006_ADVANCE_DEPOSIT_260804584270.xlsx');
  
  const wb = XLSX.utils.book_new();
  
  // Main sheet with field/value pairs
  const wsData = [
    ['Field', 'Value'],
    ['Client Number', '016543'],
    ['Client Name', 'Borough of Ridgway'],
    ['Bill Account Number', '0165431006'],
    ['Bill Account Name', 'Borough Of Ridgway'],
    ['Invoice Number', '260804584270'],
    ['Sort Description', 'Product/Sub Group-8 Digit'],
    ['Advance Deposit Total', '($111.11)'],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  
  // Transaction detail sheet
  const txData = [
    TABLE_HEADERS,
    ...TABLE_ROWS,
    TABLE_FOOTER,
  ];
  const txWs = XLSX.utils.aoa_to_sheet(txData);
  XLSX.utils.book_append_sheet(wb, txWs, 'Detail');
  
  XLSX.writeFile(wb, filePath);
  console.log(`XLSX created: ${filePath}`);
  return filePath;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Creating HIGHMARK sample files...\n');
  
  await createPDF();
  await createDOCX();
  createRTF();
  createXLSX();
  
  console.log('\nAll files created in:', OUTPUT_DIR);
  console.log('Files:');
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    const stats = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} (${stats.size} bytes)`);
  }
}

main().catch(console.error);
