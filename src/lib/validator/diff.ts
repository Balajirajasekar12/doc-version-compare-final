import { diffArrays, diffWords } from "diff";
import type {
  DiffRecord,
  DiffType,
  ParsedDoc,
  VersionDiff,
  WordSeg,
} from "./types";

/**
 * Reference-based multi-version text comparison.
 *
 * Every non-reference version is line-diffed against the reference. Instead
 * of collapsing a whole document into one giant hunk, differences are
 * reported per reference line: one record per changed line, with a clean
 * "Line N" location and only that line's content in baseline/different —
 * never a dump of both documents.
 */

interface Hunk {
  /** Reference lines [refStart, refEnd) replaced by `add`. */
  refStart: number;
  refEnd: number;
  add: string[];
  docId: string;
}

function hunksBetween(
  refLines: string[],
  versionLines: string[],
  docId: string,
): Hunk[] {
  const parts = diffArrays(refLines, versionLines) as Array<{
    value: string[];
    added?: boolean;
    removed?: boolean;
    count: number;
  }>;
  const hunks: Hunk[] = [];
  let refCursor = 0;
  let pendingRemove: { start: number; end: number } | null = null;
  for (const part of parts) {
    const count = part.count ?? part.value.length;
    if (part.added) {
      if (pendingRemove) {
        // diffArrays emits a replacement as a removed part immediately
        // followed by an added part — merge them into one replacement hunk.
        hunks.push({
          refStart: pendingRemove.start,
          refEnd: pendingRemove.end,
          add: part.value,
          docId,
        });
        pendingRemove = null;
      } else {
        hunks.push({ refStart: refCursor, refEnd: refCursor, add: part.value, docId });
      }
    } else if (part.removed) {
      pendingRemove = { start: refCursor, end: refCursor + count };
      refCursor += count;
    } else {
      pendingRemove = null;
      refCursor += count;
    }
  }
  if (pendingRemove) {
    hunks.push({ refStart: pendingRemove.start, refEnd: pendingRemove.end, add: [], docId });
  }
  return hunks;
}

function wordDiff(refText: string, versionText: string): WordSeg[] {
  const parts = diffWords(refText, versionText) as Array<{
    value: string;
    added?: boolean;
    removed?: boolean;
  }>;
  return parts.map((p) => ({
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

export function compareTextVersions(
  group: { id: string; account: string; stem: string },
  reference: ParsedDoc,
  others: ParsedDoc[],
): DiffRecord[] {
  const refLines = reference.content?.type === "text" ? reference.content.lines : [];
  const hunks: Hunk[] = [];
  for (const doc of others) {
    const lines = doc.content?.type === "text" ? doc.content.lines : [];
    hunks.push(...hunksBetween(refLines, lines, doc.id));
  }
  if (hunks.length === 0) return [];

  const records: DiffRecord[] = [];

  // ── Pure insertions (added lines with no reference line replaced) ───────
  const pureAddsByLine = new Map<number, Hunk[]>();
  for (const h of hunks) {
    if (h.refStart !== h.refEnd || h.add.length === 0) continue;
    const list = pureAddsByLine.get(h.refStart);
    if (list) list.push(h);
    else pureAddsByLine.set(h.refStart, [h]);
  }
  for (const [line, adds] of pureAddsByLine) {
    const inserted = adds.flatMap((h) => h.add).filter((l) => l.trim() !== "");
    if (inserted.length === 0) continue;
    const insertIndex = Math.min(line, refLines.length);
    records.push({
      id: nextId("text"),
      groupId: group.id,
      groupLabel: group.stem,
      account: group.account,
      docType: reference.ext,
      differenceType: "text_changed" as DiffType,
      comparisonMode: "reference",
      locationSignature: `after-L${insertIndex}`,
      locationLabel: `Inserted after line ${insertIndex}`,
      referenceText: "",
      referenceFile: reference.fileName,
      referenceVersion: reference.versionTag,
      versions: adds.map((h) => {
        const doc = others.find((d) => d.id === h.docId);
        const text = h.add.filter((l) => l.trim() !== "").join("\n");
        return {
          docId: h.docId,
          fileName: doc?.fileName ?? h.docId,
          versionTag: doc?.versionTag ?? "",
          kind: "added" as const,
          text,
          segments: wordDiff("", text),
        };
      }),
    });
  }

  // ── Per-version, per-reference-line additions ───────────────────────────
  // docId → refLine → added lines at that position.
  const byDocLine = new Map<string, Map<number, string[]>>();
  for (const h of hunks) {
    for (let refLine = h.refStart; refLine < h.refEnd; refLine++) {
      let docMap = byDocLine.get(h.docId);
      if (!docMap) {
        docMap = new Map();
        byDocLine.set(h.docId, docMap);
      }
      const slice = h.add.slice(refLine - h.refStart, refLine - h.refStart + 1);
      const existing = docMap.get(refLine);
      if (existing) existing.push(...slice);
      else docMap.set(refLine, [...slice]);
    }
  }

  // Union of changed reference line numbers.
  const changedLines = new Set<number>();
  for (const docMap of byDocLine.values()) {
    for (const refLine of docMap.keys()) changedLines.add(refLine);
  }
  const orderedLines = Array.from(changedLines).sort((a, b) => a - b);

  for (const refLine of orderedLines) {
    const refText = refLines[refLine] ?? "";
    const versions: VersionDiff[] = [];
    for (const doc of others) {
      const added = byDocLine.get(doc.id)?.get(refLine);
      if (added === undefined) {
        versions.push({
          docId: doc.id,
          fileName: doc.fileName,
          versionTag: doc.versionTag,
          kind: "unchanged" as const,
          text: refText,
          unchanged: true,
        });
        continue;
      }
      const text = added.join("\n");
      if (text === "") {
        versions.push({
          docId: doc.id,
          fileName: doc.fileName,
          versionTag: doc.versionTag,
          kind: "removed" as const,
          text: "",
        });
      } else {
        versions.push({
          docId: doc.id,
          fileName: doc.fileName,
          versionTag: doc.versionTag,
          kind: "changed" as const,
          text,
          segments: wordDiff(refText, text),
        });
      }
    }

    // A version whose added text equals the reference line contributes
    // nothing; drop the record when no version actually differs.
    const anyRealChange = versions.some((v) => {
      if (v.kind === "unchanged") return false;
      return v.kind === "removed" || v.text !== refText;
    });
    if (!anyRealChange) continue;

    const lineNo = refLine + 1;
    records.push({
      id: nextId("text"),
      groupId: group.id,
      groupLabel: group.stem,
      account: group.account,
      docType: reference.ext,
      differenceType: "text_changed" as DiffType,
      comparisonMode: "reference",
      locationSignature: `L${lineNo}`,
      locationLabel: `Line ${lineNo}`,
      referenceText: refText,
      referenceFile: reference.fileName,
      referenceVersion: reference.versionTag,
      versions,
    });
  }

  return records;
}
