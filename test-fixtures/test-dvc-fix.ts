/**
 * Test: Verify zero false differences for identical Highmark documents
 * 
 * Simulates what the user's screenshots show:
 * - PDF extraction produces items with multi-column table, space-gap labels
 * - RTF/DOCX extraction produces items with alternating lines, tab-separated tables
 * - Both represent the SAME document — comparison should show zero differences
 */

import { toCanonical, compareCanonical, resetDiffCounter } from '../src/lib/validator/canonical';
import type { ParsedDoc } from '../src/lib/validator/types';

function makeDoc(lines: string[], fileName: string, ext: string): ParsedDoc {
  return {
    id: fileName,
    fileName,
    ext,
    versionTag: fileName,
    content: { type: 'text', lines },
  };
}

// ── Simulate PDF extraction ────────────────────────────────────────────────
// PDF text extraction often produces:
// - Space-separated labels on adjacent lines
// - Multi-column table headers as pipe-separated or space-separated
// - Joined words (e.g., "Numberof" instead of "Number of")
const pdfLines = [
  'HIGHMARK',
  'An Independent Licensee of the Blue Cross and Blue Shield Association',
  'PAGE: 1 of 1',
  'Paid Claims Month',
  'August 2026',
  '(Prepared 08/04/2026)',
  'Claims Paid Thru',
  '07/31/2026 (Bill Cycle 5 of 5)',
  'ADVANCE DEPOSIT',
  'Client Number',
  '016543',
  'Client Name',
  'Borough Of Ridgway',
  'Bill Account Number',
  '0165431006',
  'Bill Account Name',
  'Borough Of Ridgway',
  'Invoice Number',
  '260804584270',
  'Sort Description: Product/Sub Group-8 Digit',
  'Group | Total | Total Number of Installment | Billed to Date | Total Installments Billed to Date | Unpaid Advance Balance | Current Installment Due',
  'HDHP PPO | ($333.33) | 3 | $0.00 | 0 | ($333.33) | ($111.11)',
  '105745-44 | ($333.33) | | $0.00 | | ($333.33) | ($111.11)',
  '105745 Total | ($333.33) | | $0.00 | | ($333.33) | ($111.11)',
  'HDHP PPO Total | ($333.33) | | $0.00 | | ($333.33) | ($111.11)',
  'Advance Deposit Total | | | | | | ($111.11)',
  '*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.',
];

// ── Simulate RTF extraction ────────────────────────────────────────────────
// RTF text extraction typically produces:
// - Alternating key/value lines for field-value pairs
// - Tab-separated table rows
// - Clean text without joined words
const rtfLines = [
  'HIGHMARK',
  'An Independent Licensee of the Blue Cross and Blue Shield Association',
  'PAGE: 1 of 1',
  'Paid Claims Month',
  'August 2026',
  '(Prepared 08/04/2026)',
  'Claims Paid Thru',
  '07/31/2026 (Bill Cycle 5 of 5)',
  'ADVANCE DEPOSIT',
  'Client Number',
  '016543',
  'Client Name',
  'Borough Of Ridgway',
  'Bill Account Number',
  '0165431006',
  'Bill Account Name',
  'Borough Of Ridgway',
  'Invoice Number',
  '260804584270',
  'Sort Description: Product/Sub Group-8 Digit',
  'Group\tTotal\tTotal Number of Installment\tBilled to Date\tTotal Installments Billed to Date\tUnpaid Advance Balance\tCurrent Installment Due',
  'HDHP PPO\t($333.33)\t3\t$0.00\t0\t($333.33)\t($111.11)',
  '105745-44\t($333.33)\t\t$0.00\t\t($333.33)\t($111.11)',
  '105745 Total\t($333.33)\t\t$0.00\t\t($333.33)\t($111.11)',
  'HDHP PPO Total\t($333.33)\t\t$0.00\t\t($333.33)\t($111.11)',
  'Advance Deposit Total\t\t\t\t\t\t($111.11)',
  '*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.',
];

// ── Simulate DOCX extraction ───────────────────────────────────────────────
// DOCX extraction typically produces:
// - Colon-separated field-value pairs (e.g., "Client Number: 016543")
// - Tab-separated table rows (same as RTF)
const docxLines = [
  'HIGHMARK',
  'An Independent Licensee of the Blue Cross and Blue Shield Association',
  'PAGE: 1 of 1',
  'Paid Claims Month: August 2026',
  '(Prepared 08/04/2026)',
  'Claims Paid Thru: 07/31/2026 (Bill Cycle 5 of 5)',
  'ADVANCE DEPOSIT',
  'Client Number: 016543',
  'Client Name: Borough Of Ridgway',
  'Bill Account Number: 0165431006',
  'Bill Account Name: Borough Of Ridgway',
  'Invoice Number: 260804584270',
  'Sort Description: Product/Sub Group-8 Digit',
  'Group\tTotal\tTotal Number of Installment\tBilled to Date\tTotal Installments Billed to Date\tUnpaid Advance Balance\tCurrent Installment Due',
  'HDHP PPO\t($333.33)\t3\t$0.00\t0\t($333.33)\t($111.11)',
  '105745-44\t($333.33)\t\t$0.00\t\t($333.33)\t($111.11)',
  '105745 Total\t($333.33)\t\t$0.00\t\t($333.33)\t($111.11)',
  'HDHP PPO Total\t($333.33)\t\t$0.00\t\t($333.33)\t($111.11)',
  'Advance Deposit Total\t\t\t\t\t\t($111.11)',
  '*Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.',
];

// ── Test 1: PDF vs RTF ─────────────────────────────────────────────────────
console.log('=== TEST 1: PDF vs RTF ===');
resetDiffCounter();
const pdfDoc = makeDoc(pdfLines, '0165431006_ADVANCE_DEPOSIT_260804584270.pdf', 'pdf');
const rtfDoc = makeDoc(rtfLines, '0165431006_ADVANCE_DEPOSIT_260804584270.rtf', 'rtf');

const pdfCanon = toCanonical(pdfDoc);
const rtfCanon = toCanonical(rtfDoc);

console.log(`PDF items: ${pdfCanon.items.length}`);
pdfCanon.items.forEach((item, i) => {
  console.log(`  [${i}] ${item.kind} key="${item.key}" label="${item.label}" value="${item.value}"`);
});

console.log(`\nRTF items: ${rtfCanon.items.length}`);
rtfCanon.items.forEach((item, i) => {
  console.log(`  [${i}] ${item.kind} key="${item.key}" label="${item.label}" value="${item.value}"`);
});

const result1 = compareCanonical(pdfCanon, rtfCanon, 'intelligent');
console.log(`\nComparison Result:`);
console.log(`  Matched: ${result1.matched.length}`);
console.log(`  Identical: ${result1.matched.filter(m => m.identical).length}`);
console.log(`  Value Mismatches: ${result1.matched.filter(m => !m.identical).length}`);
console.log(`  Missing in RTF: ${result1.missingInComparing.length}`);
console.log(`  Added in RTF: ${result1.addedInComparing.length}`);

if (result1.matched.filter(m => !m.identical).length > 0) {
  console.log('\n  VALUE MISMATCHES:');
  result1.matched.filter(m => !m.identical).forEach(m => {
    console.log(`    Key: ${m.baseline.key}`);
    console.log(`      PDF: ${m.baseline.value}`);
    console.log(`      RTF: ${m.comparing.value}`);
  });
}
if (result1.missingInComparing.length > 0) {
  console.log('\n  MISSING IN RTF:');
  result1.missingInComparing.forEach(item => {
    console.log(`    [${item.key}] ${item.label} → ${item.value}`);
  });
}
if (result1.addedInComparing.length > 0) {
  console.log('\n  ADDED IN RTF:');
  result1.addedInComparing.forEach(item => {
    console.log(`    [${item.key}] ${item.label} → ${item.value}`);
  });
}

const totalFalse1 = result1.matched.filter(m => !m.identical).length + result1.missingInComparing.length + result1.addedInComparing.length;
console.log(`\n  TOTAL FALSE DIFFERENCES: ${totalFalse1}`);

// ── Test 2: PDF vs DOCX ────────────────────────────────────────────────────
console.log('\n=== TEST 2: PDF vs DOCX ===');
resetDiffCounter();
const docxDoc = makeDoc(docxLines, '0165431006_ADVANCE_DEPOSIT_260804584270.docx', 'docx');
const docxCanon = toCanonical(docxDoc);

console.log(`DOCX items: ${docxCanon.items.length}`);
docxCanon.items.forEach((item, i) => {
  console.log(`  [${i}] ${item.kind} key="${item.key}" label="${item.label}" value="${item.value}"`);
});

const result2 = compareCanonical(pdfCanon, docxCanon, 'intelligent');
console.log(`\nComparison Result:`);
console.log(`  Matched: ${result2.matched.length}`);
console.log(`  Identical: ${result2.matched.filter(m => m.identical).length}`);
console.log(`  Value Mismatches: ${result2.matched.filter(m => !m.identical).length}`);
console.log(`  Missing in DOCX: ${result2.missingInComparing.length}`);
console.log(`  Added in DOCX: ${result2.addedInComparing.length}`);

if (result2.matched.filter(m => !m.identical).length > 0) {
  console.log('\n  VALUE MISMATCHES:');
  result2.matched.filter(m => !m.identical).forEach(m => {
    console.log(`    Key: ${m.baseline.key}`);
    console.log(`      PDF: ${m.baseline.value}`);
    console.log(`      DOCX: ${m.comparing.value}`);
  });
}
if (result2.missingInComparing.length > 0) {
  console.log('\n  MISSING IN DOCX:');
  result2.missingInComparing.forEach(item => {
    console.log(`    [${item.key}] ${item.label} → ${item.value}`);
  });
}
if (result2.addedInComparing.length > 0) {
  console.log('\n  ADDED IN DOCX:');
  result2.addedInComparing.forEach(item => {
    console.log(`    [${item.key}] ${item.label} → ${item.value}`);
  });
}

const totalFalse2 = result2.matched.filter(m => !m.identical).length + result2.missingInComparing.length + result2.addedInComparing.length;
console.log(`\n  TOTAL FALSE DIFFERENCES: ${totalFalse2}`);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n=== SUMMARY ===');
console.log(`PDF vs RTF:  ${totalFalse1} false differences (expected: 0)`);
console.log(`PDF vs DOCX: ${totalFalse2} false differences (expected: 0)`);

if (totalFalse1 === 0 && totalFalse2 === 0) {
  console.log('\n✅ ALL TESTS PASSED — Zero false differences!');
} else {
  console.log('\n❌ TESTS FAILED — False differences detected!');
  process.exit(1);
}
