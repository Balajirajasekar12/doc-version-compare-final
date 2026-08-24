/**
 * workbook.xml model: sheet list, order, visibility state and the mapping of
 * rIds to worksheet part paths (via workbook.xml.rels).
 *
 * This module is read-only — the optimizer never modifies workbook.xml, which
 * is what guarantees sheet order, names and hidden state are preserved.
 */
import { Zip, readEntryText, workbookPath } from "./zip";
import { childElements, getAttr, parseXml } from "./xml";
import { SheetInfo } from "./types";

export interface WorkbookModel {
  sheets: SheetInfo[];
  activeTab: number | null;
}

export async function parseWorkbook(zip: Zip): Promise<WorkbookModel> {
  const wbPath = workbookPath(zip);
  const wbXml = await readEntryText(zip, wbPath);
  if (!wbXml) throw new Error("Workbook metadata could not be read.");
  const doc = parseXml(wbXml);
  const root = doc.documentElement!;

  // Resolve rId → target path.
  const relsPath = wbPath.replace(/workbook\.xml$/, "workbook.xml.rels");
  const relsXml = await readEntryText(zip, relsPath);
  const relTargets = new Map<string, string>();
  if (relsXml) {
    const relsDoc = parseXml(relsXml);
    for (const rel of childElements(relsDoc.documentElement!, "Relationship")) {
      const id = getAttr(rel, "Id");
      const target = getAttr(rel, "Target");
      const type = getAttr(rel, "Type") ?? "";
      if (id && target && type.includes("/worksheet")) {
        relTargets.set(id, normalizeTarget(wbPath, target));
      }
    }
  }

  const sheets: SheetInfo[] = [];
  const sheetsContainer = childElements(root, "sheets")[0] ?? root;
  const sheetEls = childElements(sheetsContainer, "sheet");
  for (let i = 0; i < sheetEls.length; i++) {
    const s = sheetEls[i];
    const name = getAttr(s, "name") ?? `Sheet${i + 1}`;
    const state = (getAttr(s, "state") ?? "visible") as SheetInfo["state"];
    const rid = getAttr(s, "r:id") ?? getAttr(s, "id") ?? "";
    const file = relTargets.get(rid) ?? `xl/worksheets/sheet${i + 1}.xml`;
    sheets.push({ name, file, state, index: i });
  }

  const activeEl = childElements(root, "bookViews")[0];
  let activeTab: number | null = null;
  if (activeEl) {
    const view = childElements(activeEl, "workbookView")[0];
    if (view) {
      const a = getAttr(view, "activeTab");
      if (a !== undefined) activeTab = parseInt(a, 10);
    }
  }

  return { sheets, activeTab };
}

/** Resolves a rel target (possibly relative or absolute) to a zip path. */
function normalizeTarget(wbPath: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\//, "");
  const dir = wbPath.substring(0, wbPath.lastIndexOf("/") + 1);
  const parts = (dir + target).split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}
