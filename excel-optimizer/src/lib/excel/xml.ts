/**
 * XML helpers built on @xmldom/xmldom. This library runs identically in the
 * browser (the Freebuff web app) and in Node (bun tests), so the engine has a
 * single code path. We round-trip XML documents and mutate them in place,
 * which preserves every part of the workbook we do not explicitly touch.
 */
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document as XDoc, Element as XEl, Node as XNode } from "@xmldom/xmldom";

export type XmlDoc = XDoc;
export type XmlEl = XEl;
export type XmlNode = XNode;

export function parseXml(text: string): XmlDoc {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  // @xmldom reports parse errors by including a <parsererror> element.
  const err = doc.getElementsByTagName("parsererror");
  if (err.length > 0) {
    throw new Error("XML parse error");
  }
  return doc;
}

export function serializeXml(node: XNode): string {
  const xml = new XMLSerializer().serializeToString(node);
  let out: string;
  // Ensure the standard OOXML declaration is present.
  if (!xml.startsWith("<?xml")) {
    out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${xml}`;
  } else {
    out = xml;
  }
  return escapeIllegalXmlChars(out);
}

/**
 * Characters that are illegal in an XML 1.0 document. A lenient DOM parser
 * (e.g. @xmldom/xmldom) accepts them, but Excel's loader rejects the whole
 * workbook when any part contains one, so they are escaped using Excel's own
 * `_xHHHH_` convention — Excel decodes `_x0001_` back to the original
 * character, so no data is lost.
 */
const ILLEGAL_XML_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function escapeIllegalXmlChars(text: string): string {
  return text.replace(ILLEGAL_XML_RE, (ch) => `_x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`);
}

/** Robust attribute getter that tolerates namespace prefixes. */
export function getAttr(el: XmlEl, name: string): string | undefined {
  if (el.hasAttribute(name)) return el.getAttribute(name) ?? undefined;
  const colon = name.indexOf(":");
  if (colon > 0) {
    const local = name.slice(colon + 1);
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      if (a.localName === local && a.prefix !== null) return a.value;
    }
  }
  return undefined;
}

export function setAttr(el: XmlEl, name: string, value: string | number): void {
  el.setAttribute(name, String(value));
}

export function removeAttr(el: XmlEl, name: string): void {
  el.removeAttribute(name);
}

export function childElements(el: XmlEl, localName?: string): XmlEl[] {
  const out: XmlEl[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i];
    if (n.nodeType === 1) {
      const e = n as XmlEl;
      if (!localName || e.localName === localName || e.nodeName === localName) {
        out.push(e);
      }
    }
  }
  return out;
}

export function firstChildElement(el: XmlEl, localName: string): XmlEl | undefined {
  const children = childElements(el, localName);
  return children.length > 0 ? children[0] : undefined;
}

export function createElement(doc: XmlDoc, tag: string, attrs?: Record<string, string | number>): XmlEl {
  const el = doc.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
  }
  return el;
}

export function textContent(el: XmlEl): string {
  let out = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i];
    if (n.nodeType === 3 || n.nodeType === 4) out += n.nodeValue ?? "";
    else if (n.nodeType === 1) out += textContent(n as XmlEl);
  }
  return out;
}

/** Replaces all children of `el` with a single text node. */
export function setTextContent(el: XmlEl, text: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(el.ownerDocument!.createTextNode(text));
}

/** Canonical child order of a CT_Worksheet per ECMA-376. */
export const WORKSHEET_CHILD_ORDER = [
  "sheetPr",
  "dimension",
  "sheetViews",
  "sheetFormatPr",
  "cols",
  "sheetData",
  "sheetCalcPr",
  "sheetProtection",
  "protectedRanges",
  "scenarios",
  "autoFilter",
  "sortState",
  "dataConsolidate",
  "customSheetViews",
  "mergeCells",
  "phoneticPr",
  "conditionalFormatting",
  "dataValidations",
  "hyperlinks",
  "printOptions",
  "pageMargins",
  "pageSetup",
  "headerFooter",
  "rowBreaks",
  "colBreaks",
  "customProperties",
  "cellWatches",
  "ignoredErrors",
  "smartTags",
  "drawing",
  "legacyDrawing",
  "legacyDrawingHF",
  "picture",
  "oleObjects",
  "controls",
  "webPublishItems",
  "tableParts",
  "extLst",
];

/**
 * Inserts `el` into `parent` at the position matching the canonical
 * CT_Worksheet child order (the OOXML schema is order-sensitive).
 */
export function insertInCanonicalOrder(parent: XmlEl, el: XmlEl, order: string[]): void {
  const myIndex = order.indexOf(el.localName || el.nodeName);
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i];
    if (n.nodeType !== 1) continue;
    const name = (n as XmlEl).localName || (n as XmlEl).nodeName;
    const idx = order.indexOf(name);
    if (myIndex >= 0 && idx >= 0 && idx > myIndex) {
      parent.insertBefore(el, n);
      return;
    }
  }
  parent.appendChild(el);
}
