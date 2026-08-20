import { diffWords } from "diff";
import type {
  DiffRecord,
  DiffType,
  ParsedDoc,
  VersionDiff,
  WordSeg,
} from "./types";

/**
 * Field-aware comparison for groups that mix formats (e.g. a report exported
 * as csv + docx + rtf + xlsx).
 *
 * Instead of diffing raw text (which drowns real differences in formatting
 * noise), every version is reduced to a set of named fields:
 *   - spreadsheets: header row → column names; each record cell becomes
 *     field = column name, value = cell
 *   - documents (docx/rtf): lines of the form "Field: value" become
 *     field = name, value = value; prose lines without a colon become
 *     "text #n" entries (aligned by position between text versions)
 *
 * Fields are then aligned by name across all versions so the report shows a
 * clean per-field difference: location "Summary → Sales Amount", baseline
 * value, and which versions differ — not a dump of both documents.
 */

interface FieldEntry {
  /** Normalized match key, e.g. "sales amount", "sales amount #1", "text#2". */
  key: string;
  /** Human label, e.g. "Sales Amount" or "Text · Line 5". */
  label: string;
  sheet?: string;
  line?: number;
  value: string;
}

function normalizeKey(field: string): string {
  return field
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

/** A sheet has a header row when the first row is text labels, not data. */
function hasHeaderRow(rows: string[][]): boolean {
  const row = rows[0];
  if (!row) return false;
  const cells = row.map((c) => c.trim()).filter((c) => c !== "");
  if (cells.length < 2) return false;
  if (!/^[A-Za-z]/.test(cells[0])) return false;
  return !cells.some((c) => /^[-+]?\d+(\.\d+)?$/.test(c));
}

/** True for values that are plain numbers (used to detect header rows). */
function isNumeric(value: string): boolean {
  return /^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(value.trim());
}

const KEY_VALUE_RE = /^([A-Za-z][A-Za-z0-9 _\/().\-'&]*?)\s*[:=]\s*(.+)$/;

function extractEntries(doc: ParsedDoc): FieldEntry[] {
  if (doc.content?.type === "sheet") {
    const out: FieldEntry[] = [];
    for (const sheet of doc.content.sheets) {
      const rows = sheet.rows;
      if (hasHeaderRow(rows)) {
        const headers = rows[0].map((h, c) => h.trim() || colLetters(c));
        const seen = new Map<string, number>();
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every((c) => c.trim() === "")) continue;
          for (let c = 0; c < headers.length; c++) {
            const value = (row[c] ?? "").trim();
            if (value === "") continue;
            const base = headers[c];
            const n = seen.get(base) ?? 0;
            seen.set(base, n + 1);
            const label = n > 0 ? `${base} #${n}` : base;
            out.push({
              key: normalizeKey(label),
              label,
              sheet: sheet.name,
              value,
            });
          }
        }
      } else {
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row) continue;
          for (let c = 0; c < row.length; c++) {
            const value = row[c].trim();
            if (value === "") continue;
            const addr = `${colLetters(c)}${r + 1}`;
            out.push({
              key: normalizeKey(`cell ${sheet.name} ${addr}`),
              label: addr,
              sheet: sheet.name,
              value,
            });
          }
        }
      }
    }
    return out;
  }

  // Text documents (docx / rtf / pdf).
  const lines = doc.content?.type === "text" ? doc.content.lines : [];
  const out: FieldEntry[] = [];
  let textIndex = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === "") return;
    const m = KEY_VALUE_RE.exec(line);
    if (m) {
      out.push({
        key: normalizeKey(m[1]),
        label: m[1].trim(),
        line: i + 1,
        value: m[2].trim(),
      });
    } else {
      out.push({
        key: `text#${textIndex}`,
        label: `Text · Line ${i + 1}`,
        line: i + 1,
        value: line,
      });
      textIndex++;
    }
  });
  return out;
}

function wordSegments(refText: string, versionText: string): WordSeg[] {
  return (diffWords(refText, versionText) as Array<{
    value: string;
    added?: boolean;
    removed?: boolean;
  }>).map((p) => ({
    value: p.value,
    added: p.added,
    removed: p.removed,
  }));
}

let counter = 0;
function nextId(prefix: string): string {
  counter++;
  return `${prefix}-${counter}`;
}

export function compareFieldVersions(
  group: { id: string; account: string; stem: string },
  reference: ParsedDoc,
  others: ParsedDoc[],
): DiffRecord[] {
  const refEntries = extractEntries(reference);
  const otherDocs = others.map((doc) => ({ doc, entries: extractEntries(doc) }));
  const records: DiffRecord[] = [];

  // ── Sheet presence (structural) ─────────────────────────────────────────
  // Only meaningful between spreadsheet documents. In a mixed-format group
  // (e.g. csv + docx + rtf + xlsx of one report) a text version is not a
  // "missing sheet" — flagging it would drown the real value differences in
  // noise. Sheet names are matched positionally too, so a CSV "Sheet1" and an
  // XLSX "Summary" of the same grid are not reported as add/remove.
  if (reference.content?.type === "sheet") {
    const refSheets = reference.content.sheets;
    const refSheetNames = refSheets.map((s) => s.name);
    const sheetDocs = otherDocs.filter(
      (o) => o.doc.content?.type === "sheet",
    );
    for (const o of sheetDocs) {
      const otherSheets =
        o.doc.content?.type === "sheet" ? o.doc.content.sheets : [];
      const names = otherSheets.map((s) => s.name);
      const extra = names
        .map((n, i) => ({ n, i }))
        .filter(({ i }) => i >= refSheetNames.length);
      const removed = refSheetNames.filter(
        (n, i) => !names[i] && !names.includes(n),
      );
      for (const { n: name } of extra) {
        records.push({
          id: nextId("field-sheet"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "sheet_added" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${name}`,
          locationLabel: `Sheet “${name}” added`,
          referenceText: "(not present in reference)",
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [
            {
              docId: o.doc.id,
              fileName: o.doc.fileName,
              versionTag: o.doc.versionTag,
              kind: "added" as const,
              text: "Sheet added in this version",
            },
          ],
        });
      }
      for (const name of removed) {
        records.push({
          id: nextId("field-sheet"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "sheet_removed" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${name}`,
          locationLabel: `Sheet “${name}” removed`,
          referenceText: "Sheet present in reference",
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [
            {
              docId: o.doc.id,
              fileName: o.doc.fileName,
              versionTag: o.doc.versionTag,
              kind: "removed" as const,
              text: "(sheet not present)",
            },
          ],
        });
      }

      // Sheet name differences at the same position (XLSX "Summary" vs CSV
      // "Sheet1") — reported between spreadsheet versions only.
      for (let i = 0; i < Math.min(refSheetNames.length, names.length); i++) {
        if (!names[i] || names[i] === refSheetNames[i]) continue;
        records.push({
          id: nextId("field-sheet"),
          groupId: group.id,
          groupLabel: group.stem,
          account: group.account,
          docType: reference.ext,
          differenceType: "sheet_renamed" as DiffType,
          comparisonMode: "reference",
          locationSignature: `sheet|${refSheetNames[i]}|name`,
          locationLabel: `Sheet “${refSheetNames[i]}” · name differs`,
          sheet: refSheetNames[i],
          referenceText: refSheetNames[i],
          referenceFile: reference.fileName,
          referenceVersion: reference.versionTag,
          versions: [
            {
              docId: o.doc.id,
              fileName: o.doc.fileName,
              versionTag: o.doc.versionTag,
              kind: "changed" as const,
              text: names[i],
            },
          ],
        });
      }

      // Column names (header row) compared cell-by-cell at the same position.
      for (let i = 0; i < Math.min(refSheets.length, otherSheets.length); i++) {
        const refRow = refSheets[i].rows[0] ?? [];
        const otherRow = otherSheets[i].rows[0] ?? [];
        for (let c = 0; c < Math.max(refRow.length, otherRow.length); c++) {
          const rv = (refRow[c] ?? "").trim();
          const ov = (otherRow[c] ?? "").trim();
          if (rv === "" || ov === "" || rv === ov || isNumeric(rv)) continue;
          records.push({
            id: nextId("field-header"),
            groupId: group.id,
            groupLabel: group.stem,
            account: group.account,
            docType: reference.ext,
            differenceType: "header_changed" as DiffType,
            comparisonMode: "reference",
            locationSignature: `sheet|${refSheets[i].name}|header|${colLetters(c)}1`,
            locationLabel: `Sheet “${refSheets[i].name}” · Column “${rv}”`,
            sheet: refSheets[i].name,
            referenceText: rv,
            referenceFile: reference.fileName,
            referenceVersion: reference.versionTag,
            versions: [
              {
                docId: o.doc.id,
                fileName: o.doc.fileName,
                versionTag: o.doc.versionTag,
                kind: "changed" as const,
                text: ov,
                segments: wordSegments(rv, ov),
              },
            ],
          });
        }
      }
    }
  }

  // ── Field-by-field comparison ───────────────────────────────────────────
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const e of refEntries) {
    if (!seen.has(e.key)) {
      seen.add(e.key);
      keys.push(e.key);
    }
  }
  for (const o of otherDocs) {
    for (const e of o.entries) {
      if (!seen.has(e.key)) {
        seen.add(e.key);
        keys.push(e.key);
      }
    }
  }

  for (const key of keys) {
    const refList = refEntries.filter((e) => e.key === key);
    const lists = otherDocs.map((o) => ({
      doc: o.doc,
      list: o.entries.filter((e) => e.key === key),
    }));
    const maxCount = Math.max(refList.length, ...lists.map((l) => l.list.length));
    const isOccurrence = / #\d+$/.test(key);

    for (let i = 0; i < maxCount; i++) {
      const refEntry = refList[i];
      const refVal = refEntry?.value ?? "";
      const vVals = lists.map((l) => ({
        doc: l.doc,
        entry: l.list[i],
        value: l.list[i]?.value ?? "",
      }));
      const allSame = vVals.every((v) => v.value === refVal);
      if (allSame) continue;

      const present = vVals.filter((v) => v.value !== "");
      const allPresentIdentical =
        present.length > 0 &&
        present.every((v) => v.value === present[0].value);
      // Avoid noise: a value that exists in exactly one version (e.g. prose
      // lines or extra sheets only present in documents) is not a mismatch —
      // except for repeated-record fields, which indicate an extra record.
      if (refVal === "" && allPresentIdentical && !(isOccurrence && refList.length === 0)) {
        continue;
      }

      const labelEntry = refEntry ?? vVals.find((v) => v.entry)?.entry;
      const label = labelEntry?.label ?? key;
      const locationLabel = labelEntry?.sheet
        ? `${labelEntry.sheet} → ${label}`
        : label;
      const referenceText = refVal;

      const versions: VersionDiff[] = vVals.map((v) => {
        if (v.value === refVal) {
          return {
            docId: v.doc.id,
            fileName: v.doc.fileName,
            versionTag: v.doc.versionTag,
            kind: "unchanged" as const,
            text: v.value,
            unchanged: true,
          };
        }
        if (v.value === "") {
          return {
            docId: v.doc.id,
            fileName: v.doc.fileName,
            versionTag: v.doc.versionTag,
            kind: "removed" as const,
            text: "",
          };
        }
        if (refVal === "") {
          return {
            docId: v.doc.id,
            fileName: v.doc.fileName,
            versionTag: v.doc.versionTag,
            kind: "added" as const,
            text: v.value,
          };
        }
        return {
          docId: v.doc.id,
          fileName: v.doc.fileName,
          versionTag: v.doc.versionTag,
          kind: "changed" as const,
          text: v.value,
          segments: wordSegments(refVal, v.value),
        };
      });

      records.push({
        id: nextId("field"),
        groupId: group.id,
        groupLabel: group.stem,
        account: group.account,
        docType: reference.ext,
        differenceType: "cell_changed" as DiffType,
        comparisonMode: "reference",
        locationSignature: `field|${key}`,
        locationLabel,
        referenceText,
        referenceFile: reference.fileName,
        referenceVersion: reference.versionTag,
        versions,
      });
    }
  }

  return records;
}
