# DVC Comparison Report
## Sample: Highmark Advance Deposit Statement
### PDF vs RTF (Same Document, Different Formats)

---

## Documents Compared
| Property | Baseline (PDF) | Comparing (RTF) |
|----------|---------------|-----------------|
| File | 0165431006_ADVANCE_DEPOSIT_260804584270.pdf | 0165431006_ADVANCE_DEPOSIT_260804584270.rtf |
| Format | PDF | RTF |
| Items Extracted | 21 | 21 |

---

## Comparison Summary
| Metric | Count |
|--------|-------|
| Total Matched | 21 |
| Identical | 21 |
| Value Mismatches | 0 |
| Missing in RTF | 0 |
| Added in RTF | 0 |
| **False Differences** | **0** |

---

## Matched Items (All Identical)

### Match 1
- **Key:** paid claims month
- **Label:** Paid Claims Month
- **Value:** August 2026
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 4
- **RTF Location:** Line 4

### Match 2
- **Key:** client number
- **Label:** Client Number
- **Value:** 016543
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 9
- **RTF Location:** Line 9

### Match 3
- **Key:** client name
- **Label:** Client Name
- **Value:** Borough Of Ridgway
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 10
- **RTF Location:** Line 10

### Match 4
- **Key:** bill account number
- **Label:** Bill Account Number
- **Value:** 0165431006
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 11
- **RTF Location:** Line 11

### Match 5
- **Key:** bill account name
- **Label:** Bill Account Name
- **Value:** Borough Of Ridgway
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 12
- **RTF Location:** Line 12

### Match 6
- **Key:** invoice number
- **Label:** Invoice Number
- **Value:** 260804584270
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 13
- **RTF Location:** Line 13

### Match 7
- **Key:** page
- **Label:** PAGE
- **Value:** 1 of 1
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 3
- **RTF Location:** Line 3

### Match 8
- **Key:** sort description
- **Label:** Sort Description
- **Value:** Product/Sub Group-8 Digit
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 14
- **RTF Location:** Line 14

### Match 9
- **Key:** group total total number of installment billed to date total installments billed to date unpaid advance balance current installment due
- **Label:** Group | Total | Total Number of Installment | Billed to Date | Total Installments Billed to Date | Unpaid Advance Balance | Current Installment Due
- **Value:** Group | Total | Total Number of Installment | Billed to Date | Total Installments Billed to Date | Unpaid Advance Balance | Current Installment Due
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 15
- **RTF Location:** Line 15

### Match 10
- **Key:** hdhp ppo
- **Label:** HDHP PPO
- **Value:** HDHP PPO, ($333.33), 3, $0.00, 0, ($333.33), ($111.11)
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 16
- **RTF Location:** Line 16

### Match 11
- **Key:** 105745 44
- **Label:** 105745-44
- **Value:** 105745-44, ($333.33), $0.00, ($333.33), ($111.11)
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 17
- **RTF Location:** Line 17

### Match 12
- **Key:** 105745 total
- **Label:** 105745 Total
- **Value:** 105745 Total, ($333.33), $0.00, ($333.33), ($111.11)
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 18
- **RTF Location:** Line 18

### Match 13
- **Key:** hdhp ppo total
- **Label:** HDHP PPO Total
- **Value:** HDHP PPO Total, ($333.33), $0.00, ($333.33), ($111.11)
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 19
- **RTF Location:** Line 19

### Match 14
- **Key:** advance deposit total
- **Label:** Advance Deposit Total
- **Value:** Advance Deposit Total, ($111.11)
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 20
- **RTF Location:** Line 20

### Match 15
- **Key:** para_12
- **Label:** HIGHMARK
- **Value:** HIGHMARK
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 1
- **RTF Location:** Line 1

### Match 16
- **Key:** para_13
- **Label:** An Independent Licensee of the Blue Cross and Blue Shield Association
- **Value:** An Independent Licensee of the Blue Cross and Blue Shield Association
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 2
- **RTF Location:** Line 2

### Match 17
- **Key:** para_15
- **Label:** (Prepared 08/04/2026)
- **Value:** (Prepared 08/04/2026)
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 5
- **RTF Location:** Line 5

### Match 18
- **Key:** para_16
- **Label:** Claims Paid Thru
- **Value:** Claims Paid Thru
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 6
- **RTF Location:** Line 6

### Match 19
- **Key:** para_17
- **Label:** 07/31/2026 (Bill Cycle 5 of 5)
- **Value:** 07/31/2026 (Bill Cycle 5 of 5)
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 7
- **RTF Location:** Line 7

### Match 20
- **Key:** para_18
- **Label:** ADVANCE DEPOSIT
- **Value:** ADVANCE DEPOSIT
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 8
- **RTF Location:** Line 8

### Match 21
- **Key:** para_20
- **Label:** *Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.
- **Value:** *Products marked with an (*) are not products of our company. Billing for these products is included for your convenience.
- **Status:** ✅ IDENTICAL
- **PDF Location:** Line 21
- **RTF Location:** Line 21

---

## Conclusion

**Result: ✅ PASS — ZERO FALSE DIFFERENCES**

The comparison engine correctly identifies that both documents contain identical content,
despite being extracted from different formats (PDF vs RTF).

### Key Fixes Applied
1. **Multi-column table handling:** 7-column table headers are now recognized as paragraphs, not split into false field_value pairs
2. **Label-label detection:** Tab-separated labels like "Client Number\tClient Name" are no longer treated as field_value pairs
3. **Key-aware matching:** Paragraphs matching field_value keys are matched correctly (e.g., "Claims Paid Thru" paragraph matches field_value key)
4. **Value paragraph consumption:** When a key match is found, the next paragraph matching the value is also consumed
5. **Phase 8 threshold:** Lowered from 0.5 to 0.35 for more aggressive content matching

---

*Generated: 2026-08-27T19:09:40.773Z*
*Engine: DVC Canonical Comparison v2*
