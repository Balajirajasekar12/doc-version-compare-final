/**
 * Trace the exact canonical items produced by each format parser.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DIR = path.join(__dirname, '..', 'test-fixtures', 'highmark');
const PREFIX = '0165431006_ADVANCE_DEPOSIT_260804584270';

// Simple RTF parser
function parseRtf(buf) {
  let text = buf.toString('utf-8');
  text = text.replace(/\\rtf1\\ansi\n?/, '');
  text = text.replace(/\\b\s?/g, '');
  text = text.replace(/\\b0\s?/g, '');
  text = text.replace(/\\par\n?/g, '\n');
  text = text.replace(/\\tab/g, ' | ');
  text = text.replace(/\\'[0-9a-fA-F]{2}/g, '');
  text = text.replace(/\\\\/g, '\\');
  text = text.replace(/\{[^}]*\}/g, '');
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

// Show what textToCanonical would produce (simplified)
function showCanonical(lines, label) {
  console.log(`\n=== ${label} (${lines.length} lines) ===`);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const hasPipe = l.includes('|');
    const hasColon = /^[A-Za-z][A-Za-z ]*:\s*$/.test(l.trim());
    const colonInLine = /^([A-Za-z][A-Za-z0-9 _/().\-&'*]+?)\s*:\s*(.+)$/.test(l);
    console.log(`  ${i}: ${hasPipe ? '[PIPE]' : '      '} ${hasColon ? '[COLON_END]' : '           '} ${colonInLine ? '[COLON_MID]' : '           '} "${l}"`);
  }
}

// PDF - we can't parse PDF in Node, show what we know from earlier trace
console.log('\n=== PDF (from earlier browser trace) ===');
console.log('  PDF parser produces pipe-delimited lines:');
console.log('  9: "Client Number | 016543 | Client Name | Borough of Ridgway | Invoice Number | 260804584270"');
console.log(' 10: "0165431006 | Bill Account Number | Bill Account Name | Borough Of Ridgway"');
console.log(' 11: "Sort Description: | Product/Sub Group-8 Digit"');
console.log(' 12: "Group | Total | Total Number of"');
console.log(' ...');

// RTF
const rtfBuf = fs.readFileSync(path.join(DIR, `${PREFIX}.rtf`));
const rtfLines = parseRtf(rtfBuf);
showCanonical(rtfLines, 'RTF');

// XLSX
const xlsxWb = XLSX.readFile(path.join(DIR, `${PREFIX}.xlsx`));
for (const sheetName of xlsxWb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(xlsxWb.Sheets[sheetName], { header: 1 });
  console.log(`\n=== XLSX Sheet: ${sheetName} (${rows.length} rows) ===`);
  for (let i = 0; i < rows.length; i++) {
    console.log(`  ${i}: [${rows[i].length} cols] ${JSON.stringify(rows[i])}`);
  }
}

console.log('\n\n=== KEY DIFFERENCES ===');
console.log('PDF line 10: "0165431006 | Bill Account Number | Bill Account Name | Borough Of Ridgway"');
console.log('  → irregular block, firstCell="0165431006" starts with DIGIT → NOT a label');
console.log('  → becomes PARAGRAPH (not field_value pairs)');
console.log('DOCX line 9-12: separate lines "Bill Account Number: 0165431006" etc.');
console.log('  → extractFieldValuesFromText → field_value items');
console.log('');
console.log('ROOT CAUSE: PDF puts value BEFORE label in pipe-delimited rows.');
console.log('The irregular block handler only pairs when first cell is alpha label.');
console.log('When first cell is a VALUE (e.g. "0165431006"), the row becomes a paragraph.');
console.log('The DOCX has proper "Label: Value" format → field_value items.');
console.log('The comparison then sees a paragraph in PDF vs field_value in DOCX → DIFFERENCE.');
