/**
 * Excel table column-name sync.
 *
 * When a header cell is title-cased, the sheet's Excel table (tableParts)
 * still declares the old name in its `<tableColumn name="…">` entries. Excel
 * keeps those two in sync, so the table part is updated to match — only for
 * columns whose header cell was actually re-cased, so no mismatch is ever
 * introduced. Table parts that need no change pass through untouched.
 */
import { Zip, readEntryText } from "./zip";
import { resolveSheetRels } from "./drawings";
import { toTitleCase } from "./casing";
import { ParsedSheet } from "./worksheet";
import { childElements, firstChildElement, getAttr, parseXml, serializeXml, setAttr } from "./xml";
import { colToName, rangeToRect } from "./refs";

/**
 * Updates table column names on `sheet` to match title-cased header cells.
 * Returns the number of columns renamed.
 */
export async function syncTableColumnNames(
  zip: Zip,
  sheet: ParsedSheet,
  sheetFile: string,
  changedRefs: Set<string>,
): Promise<number> {
  if (changedRefs.size === 0) return 0;
  const tableParts = firstChildElement(sheet.root, "tableParts");
  if (!tableParts) return 0;

  const rels = await resolveSheetRels(zip, sheetFile);
  let updated = 0;
  for (const tp of childElements(tableParts, "tablePart")) {
    const rid = getAttr(tp, "r:id");
    if (!rid) continue;
    const rel = rels.get(rid);
    if (!rel || !rel.type.includes("/table")) continue;
    const xml = await readEntryText(zip, rel.target);
    if (!xml) continue;
    let doc;
    try {
      doc = parseXml(xml);
    } catch {
      continue; // never touch a part the engine cannot parse
    }
    const root = doc.documentElement!;
    const ref = getAttr(root, "ref");
    const rect = ref ? rangeToRect(ref) : null;
    if (!rect) continue;
    const colsEl = firstChildElement(root, "tableColumns");
    if (!colsEl) continue;

    let changed = false;
    for (const tc of childElements(colsEl, "tableColumn")) {
      const id = parseInt(getAttr(tc, "id") ?? "0", 10);
      if (isNaN(id) || id < 1) continue;
      const headerRef = colToName(rect.col1 + (id - 1)) + rect.row1;
      if (!changedRefs.has(headerRef)) continue;
      const name = getAttr(tc, "name") ?? "";
      const cased = toTitleCase(name);
      if (cased !== name) {
        setAttr(tc, "name", cased);
        changed = true;
        updated++;
      }
    }
    if (changed) zip.file(rel.target, serializeXml(doc));
  }
  return updated;
}
