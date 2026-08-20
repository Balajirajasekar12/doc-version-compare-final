import type {
  DiffRecord,
  DiffType,
  ParsedDoc,
  SheetData,
  VersionDiff,
} from "./types";

/**
 * Reference-based spreadsheet comparison: sheet-by-sheet, cell-by-cell.
 * Structural changes (added/removed sheets, appended/trimmed rows and
 * columns) are reported separately from value changes.
 *
 * Sheets are matched by name first, then positionally — so a CSV export
 * ("Sheet1") and an XLSX export ("Summary") of the same report are compared
 * grid-to-grid instead of being reported as added/removed sheets.
 */

/** Canonical grid rendering for mixed-format groups: each data row becomes
 *  one tab-separated line, prefixed with a [sheet name] header line. */
export function sheetToLines(sheets: SheetData[]): string[] {
  const lines: string[] = [];
  for (const sheet of sheets) {
    lines.push(`[${sheet.name}]`);
    for (const row of sheet.rows) {
      let end = row.length;
      while (end > 0 && row[end - 1] === "") end--;
      lines.push(row.slice(0, end).join("\t"));
    }
  }
  return lines;
}

function colLetters(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function a1(row: number, col: number): string {
  return `${colLetters(col)}${row + 1}`;
}

/** Effective height: last row index containing any non-empty cell (+1). */
function effectiveRows(sheet: SheetData): number {
  for (let r = sheet.rows.length - 1; r >= 0; r--) {
    if (sheet.rows[r].some((c) => c !== "")) return r + 1;
  }
  return 0;
}

/** Effective width: last column index with any non-empty cell (+1). */
function effectiveCols(sheet: SheetData): number {
  let maxCol = 0;
  for (const row of sheet.rows) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "") maxCol = Math.max(maxCol, c + 1);
    }
  }
  return maxCol;
}

function cellValue(sheet: SheetData | undefined, row: number, col: number): string {
  if (!sheet) return "";
  return sheet.rows[row]?.[col] ?? "";
}

interface VersionSheets {
  docId: string;
  fileName: string;
  versionTag: string;
  sheets: SheetData[];
  /** ref sheet name → matched sheet (name match first, then positional). */
  matched: Map<string, SheetData | undefined>;
  /** Sheets that matched positionally but carry a different name. */
  renamed: Array<{ refName: string; actualName: string }>;
}

function buildVersionSheets(
  doc: ParsedDoc,
  refSheets: SheetData[],
): VersionSheets {
  const sheets = doc.content?.type === "sheet" ? doc.content.sheets : [];
  const matched = new Map<string, SheetData | undefined>();
  const renamed: Array<{ refName: string; actualName: string }> = [];
  const claimedNames = new Set<string>();
  const claimedIndices = new Set<number>();

  refSheets.forEach((refSheet, i) => {
    // 1. Name match (first unclaimed occurrence).
    const byName = sheets.find(
      (s, idx) => s.name === refSheet.name && !claimedNames.has(s.name) && !claimedIndices.has(idx),
    );
    if (byName) {
      const idx = sheets.indexOf(byName);
      claimedNames.add(byName.name);
      claimedIndices.add(idx);
      matched.set(refSheet.name, byName);
      return;
    }
    // 2. Positional match (cross-format exports usually have one sheet).
    //    A different name at the same position (e.g. XLSX "Summary" vs CSV
    //    "Sheet1") is reported as a sheet rename below.
    const positional = sheets[i];
    if (positional && !claimedIndices.has(i)) {
      claimedIndices.add(i);
      matched.set(refSheet.name, positional);
      if (positional.name !== refSheet.name) {
        renamed.push({ refName: refSheet.name, actualName: positional.name });
      }
      return;
    }
    matched.set(refSheet.name, undefined);
  });

  return {
    docId: doc.id,
    fileName: doc.fileName,
    versionTag: doc.versionTag,
    sheets,
    matched,
    renamed,
  };
}

let counter = 0;
function nextId(prefix: string): string {
  counter++;
  return `${prefix}-${counter}`;
}

function versionDiffFor(doc: VersionSheets, kind: VersionDiff["kind"], text: string): VersionDiff {
  return {
    docId: doc.docId,
    fileName: doc.fileName,
    versionTag: doc.versionTag,
    kind,
    text,
  };
}

/** True for values that are plain numbers (used to detect header rows). */
function isNumeric(value: string): boolean {
  return /^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(value.trim());
}

export function compareSheetVersions(
  group: { id: string; account: string; stem: string },
  reference: ParsedDoc,
  others: ParsedDoc[],
): DiffRecord[] {
  const refSheets = reference.content?.type === "sheet" ? reference.content.sheets : [];
  const records: DiffRecord[] = [];

  const versionSheets = others.map((doc) => buildVersionSheets(doc, refSheets));

  // Sheet name differences (same position, different name — e.g. XLSX
  // "Summary" vs CSV "Sheet1"). Reported between spreadsheet versions only.
  for (const vs of versionSheets) {
    for (const { refName, actualName } of vs.renamed) {
      records.push({
        id: nextId("sheetname"),
        groupId: group.id,
        groupLabel: group.stem,
        account: group.account,
        docType: reference.ext,
        differenceType: "sheet_renamed" as DiffType,
        comparisonMode: "reference",
        locationSignature: `sheet|${refName}|name`,
        locationLabel: `Sheet “${refName}” · name differs`,
        sheet: refName,
        referenceText: refName,
        referenceFile: reference.fileName,
        referenceVersion: reference.versionTag,
        versions: [versionDiffFor(vs, "changed", actualName)],
      });
    }
  }

  // Sheets present in a version but matched to no reference sheet → added.
  for (const vs of versionSheets) {
    const matchedValues = Array.from(vs.matched.values());
    vs.sheets.forEach((sheet, idx) => {
      if (matchedValues.includes(sheet)) return;
      // Only count genuinely extra sheets (beyond the reference's count).
      if (idx >= refSheets.length) {
        records.push({
          id: nextId("sheet"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "sheet_added" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${sheet.name}`,
          locationLabel: `Sheet “${sheet.name}” added`,
          referenceText: "(not present in reference)",
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [
            versionDiffFor(
              vs,
              "added",
              `${effectiveRows(sheet)} rows × ${effectiveCols(sheet)} cols`,
            ),
          ],
        });
      }
    });
  }

  refSheets.forEach((refSheet, i) => {
    const othersForSheet: Array<VersionSheets & { sheet: SheetData | undefined }> =
      versionSheets.map((vs) => ({ ...vs, sheet: vs.matched.get(refSheet.name) }));

    // Structural: rows/cols added or removed.
    const refRows = effectiveRows(refSheet);
    const refCols = effectiveCols(refSheet);
    for (const meta of othersForSheet) {
      if (!meta.sheet) continue;
      const vRows = effectiveRows(meta.sheet);
      const vCols = effectiveCols(meta.sheet);
      if (vRows > refRows) {
        records.push({
          id: nextId("rows"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "rows_added" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${refSheet.name}|rows`,
          locationLabel: `Sheet “${refSheet.name}” · rows appended`,
          referenceText: `${refRows} rows`,
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [versionDiffFor(meta, "changed", `${vRows} rows (+${vRows - refRows})`)],
        });
      }
      if (vRows < refRows) {
        records.push({
          id: nextId("rows"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "rows_removed" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${refSheet.name}|rows`,
          locationLabel: `Sheet “${refSheet.name}” · rows removed`,
          referenceText: `${refRows} rows`,
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [versionDiffFor(meta, "changed", `${vRows} rows (−${refRows - vRows})`)],
        });
      }
      if (vCols > refCols) {
        records.push({
          id: nextId("cols"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "cols_added" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${refSheet.name}|cols`,
          locationLabel: `Sheet “${refSheet.name}” · columns added`,
          referenceText: `${refCols} columns`,
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [versionDiffFor(meta, "changed", `${vCols} columns (+${vCols - refCols})`)],
        });
      }
      if (vCols < refCols) {
        records.push({
          id: nextId("cols"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "cols_removed" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${refSheet.name}|cols`,
          locationLabel: `Sheet “${refSheet.name}” · columns removed`,
          referenceText: `${refCols} columns`,
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [versionDiffFor(meta, "changed", `${vCols} columns (−${refCols - vCols})`)],
        });
      }
    }

    // Sheet present in the reference but matched in no version → removed.
    const missing = othersForSheet.filter((m) => m.sheet === undefined);
    if (missing.length > 0) {
      records.push({
        id: nextId("sheet"),
        groupId: group.id,
        groupLabel: group.stem,
        account: group.account,
        docType: reference.ext,
        differenceType: "sheet_removed" as DiffType,
        comparisonMode: "reference",
        locationSignature: `sheet|${refSheet.name}`,
        locationLabel: `Sheet “${refSheet.name}” removed`,
        referenceText: `${refRows} rows × ${refCols} cols`,
        referenceFile: reference.fileName,
        referenceVersion: reference.versionTag,
        versions: missing.map((m) => versionDiffFor(m, "removed", "(sheet not present)")),
      });
    }

    // Cell-by-cell comparison over the union of cell addresses.
    const maxRow = Math.max(
      refRows,
      ...othersForSheet.map((m) => (m.sheet ? effectiveRows(m.sheet) : 0)),
    );
    const maxCol = Math.max(
      refCols,
      ...othersForSheet.map((m) => (m.sheet ? effectiveCols(m.sheet) : 0)),
    );

    for (let r = 0; r < maxRow; r++) {
      for (let c = 0; c < maxCol; c++) {
        const refVal = cellValue(refSheet, r, c);
        const versionVals = othersForSheet.map((m) => ({
          meta: m,
          value: m.sheet ? cellValue(m.sheet, r, c) : "",
        }));
        const allSame = versionVals.every((v) => v.value === refVal);
        const allEmpty = refVal === "" && versionVals.every((v) => v.value.trim() === "");
        if (allSame || allEmpty) continue;

        // Header row: a non-numeric label that differs from the other
        // versions is a column-name mismatch, not a value mismatch.
        const isHeaderCell = r === 0 && refVal.trim() !== "" && !isNumeric(refVal);
        if (isHeaderCell) {
          const nonEmpty = versionVals.filter((v) => v.value.trim() !== "");
          const differs = nonEmpty.some((v) => v.value !== refVal);
          if (nonEmpty.length > 0 && differs) {
            const versions: VersionDiff[] = versionVals.map((v) =>
              versionDiffFor(v.meta, v.value === refVal ? "unchanged" : "changed", v.value),
            );
            const address = a1(r, c);
            records.push({
              id: nextId("header"),
              groupId: group.id,
              groupLabel: group.stem,
              account: group.account,
              docType: reference.ext,
              differenceType: "header_changed" as DiffType,
              comparisonMode: "reference",
              locationSignature: `sheet|${refSheet.name}|header|${address}`,
              locationLabel: `Sheet “${refSheet.name}” · Column “${refVal}”`,
              sheet: refSheet.name,
              address,
              referenceText: refVal,
              referenceFile: reference.fileName,
              referenceVersion: reference.versionTag,
              versions,
            });
            continue;
          }
        }

        const versions: VersionDiff[] = versionVals.map((v) =>
          versionDiffFor(v.meta, v.value === refVal ? "unchanged" : "changed", v.value),
        );
        const address = a1(r, c);
        records.push({
          id: nextId("cell"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "cell_changed" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${refSheet.name}|${address}`,
          locationLabel: `Sheet “${refSheet.name}” · ${address}`,
          sheet: refSheet.name,
          address,
          referenceText: refVal,
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions,
        });
      }
    }
  });

  return records;
}
