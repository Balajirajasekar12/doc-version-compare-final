/**
 * styles.xml model.
 *
 * The optimizer never rewrites existing style records. It appends new
 * font/fill/border/number-format/xf records (deduplicated) and points cells
 * at them via their `s` attribute, exactly like Excel's own UI does. This
 * keeps every existing style untouched and makes the change trivially safe.
 */
import {
  XmlDoc,
  XmlEl,
  childElements,
  createElement,
  firstChildElement,
  getAttr,
  parseXml,
  serializeXml,
  setAttr,
} from "./xml";

export interface FontSpec {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  size?: number;
  name?: string;
  family?: string;
  scheme?: string;
  color?: Record<string, string>;
}

export interface FillSpec {
  patternType: string;
  fgColor?: Record<string, string>;
  bgColor?: Record<string, string>;
}

export interface BorderEdge {
  style?: string;
  color?: Record<string, string>;
}

export interface BorderSpec {
  left?: BorderEdge;
  right?: BorderEdge;
  top?: BorderEdge;
  bottom?: BorderEdge;
}

export interface XfAlignment {
  horizontal?: string;
  vertical?: string;
  wrapText?: boolean;
  [k: string]: string | boolean | undefined;
}

export interface XfSpec {
  numFmtId: number;
  fontId: number;
  fillId: number;
  borderId: number;
  alignment?: XfAlignment;
}

const BUILTIN_NUMFMTS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "mm-dd-yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

function colorAttrs(el: XmlEl | undefined): Record<string, string> | undefined {
  if (!el) return undefined;
  const attrs: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    attrs[a.name] = a.value;
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function parseFont(el: XmlEl): FontSpec {
  const spec: FontSpec = {};
  for (const child of childElements(el)) {
    const name = child.localName || child.nodeName;
    switch (name) {
      case "b":
        spec.bold = true;
        break;
      case "i":
        spec.italic = true;
        break;
      case "u":
        spec.underline = true;
        break;
      case "strike":
        spec.strike = true;
        break;
      case "sz": {
        const v = getAttr(child, "val");
        if (v !== undefined) spec.size = parseFloat(v);
        break;
      }
      case "name": {
        const v = getAttr(child, "val");
        if (v !== undefined) spec.name = v;
        break;
      }
      case "family": {
        const v = getAttr(child, "val");
        if (v !== undefined) spec.family = v;
        break;
      }
      case "scheme": {
        const v = getAttr(child, "val");
        if (v !== undefined) spec.scheme = v;
        break;
      }
      case "color":
        spec.color = colorAttrs(child);
        break;
      default:
        break;
    }
  }
  return spec;
}

function parseFill(el: XmlEl): FillSpec {
  const pattern = firstChildElement(el, "patternFill");
  if (!pattern) return { patternType: "none" };
  const spec: FillSpec = { patternType: getAttr(pattern, "patternType") ?? "none" };
  spec.fgColor = colorAttrs(firstChildElement(pattern, "fgColor"));
  spec.bgColor = colorAttrs(firstChildElement(pattern, "bgColor"));
  return spec;
}

function parseEdge(el: XmlEl): BorderEdge | undefined {
  const style = getAttr(el, "style");
  const color = colorAttrs(firstChildElement(el, "color"));
  if (!style && !color) return undefined;
  return { style, color };
}

function parseBorder(el: XmlEl): BorderSpec {
  const spec: BorderSpec = {};
  for (const child of childElements(el)) {
    const name = child.localName || child.nodeName;
    if (name === "left") spec.left = parseEdge(child);
    else if (name === "right") spec.right = parseEdge(child);
    else if (name === "top") spec.top = parseEdge(child);
    else if (name === "bottom") spec.bottom = parseEdge(child);
  }
  return spec;
}

function parseAlignment(el: XmlEl | undefined): XfAlignment | undefined {
  if (!el) return undefined;
  const a: XfAlignment = {};
  const h = getAttr(el, "horizontal");
  const v = getAttr(el, "vertical");
  const w = getAttr(el, "wrapText");
  if (h !== undefined) a.horizontal = h;
  if (v !== undefined) a.vertical = v;
  if (w !== undefined) a.wrapText = w === "1" || w === "true";
  const textRotation = getAttr(el, "textRotation");
  if (textRotation !== undefined) a.textRotation = textRotation;
  const indent = getAttr(el, "indent");
  if (indent !== undefined) a.indent = indent;
  return a;
}

function parseXf(el: XmlEl): XfSpec {
  const numFmtId = parseInt(getAttr(el, "numFmtId") ?? "0", 10);
  const fontId = parseInt(getAttr(el, "fontId") ?? "0", 10);
  const fillId = parseInt(getAttr(el, "fillId") ?? "0", 10);
  const borderId = parseInt(getAttr(el, "borderId") ?? "0", 10);
  const alignment = parseAlignment(firstChildElement(el, "alignment"));
  return { numFmtId, fontId, fillId, borderId, alignment };
}

const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

export class StyleLibrary {
  doc: XmlDoc;
  root: XmlEl;
  numFmtsEl?: XmlEl;
  fontsEl?: XmlEl;
  fillsEl?: XmlEl;
  bordersEl?: XmlEl;
  cellXfsEl?: XmlEl;
  hasCellStyleXfs: boolean;

  private fonts: FontSpec[] = [];
  private fills: FillSpec[] = [];
  private borders: BorderSpec[] = [];
  private numFmts: { id: number; code: string }[] = [];
  private xfs: XfSpec[] = [];

  private fontKey = new Map<string, number>();
  private fillKey = new Map<string, number>();
  private borderKey = new Map<string, number>();
  private numFmtCodeKey = new Map<string, number>();
  private numFmtCodeById = new Map<number, string>();
  private xfKey = new Map<string, number>();
  private nextNumFmtId: number;

  constructor(xml: string | null) {
    this.doc = parseXml(xml ?? DEFAULT_XML);
    this.root = this.doc.documentElement!;
    this.numFmtsEl = firstChildElement(this.root, "numFmts");
    this.fontsEl = firstChildElement(this.root, "fonts");
    this.fillsEl = firstChildElement(this.root, "fills");
    this.bordersEl = firstChildElement(this.root, "borders");
    this.cellXfsEl = firstChildElement(this.root, "cellXfs");
    this.hasCellStyleXfs = !!firstChildElement(this.root, "cellStyleXfs");

    this.ensureDefaults();

    // Parse existing records so lookups (fontAt/xfAt/...) work for cells
    // that already carry styles, and so appends never duplicate entries.
    // Every DOM record is pushed in order — a workbook may legitimately
    // contain duplicate font/fill/border records, and the in-memory index
    // MUST match the DOM child index or appended styles would point at the
    // wrong record. The dedup maps simply keep the first index per spec.
    if (this.fontsEl) {
      for (const f of childElements(this.fontsEl, "font")) {
        const spec = parseFont(f);
        const key = this.fontKeyFor(spec);
        if (!this.fontKey.has(key)) this.fontKey.set(key, this.fonts.length);
        this.fonts.push(spec);
      }
    }
    if (this.fillsEl) {
      for (const f of childElements(this.fillsEl, "fill")) {
        const spec = parseFill(f);
        const key = this.fillKeyFor(spec);
        if (!this.fillKey.has(key)) this.fillKey.set(key, this.fills.length);
        this.fills.push(spec);
      }
    }
    if (this.bordersEl) {
      for (const b of childElements(this.bordersEl, "border")) {
        const spec = parseBorder(b);
        const key = this.borderKeyFor(spec);
        if (!this.borderKey.has(key)) this.borderKey.set(key, this.borders.length);
        this.borders.push(spec);
      }
    }
    if (this.cellXfsEl) {
      for (const x of childElements(this.cellXfsEl, "xf")) {
        this.xfs.push(parseXf(x));
      }
    }

    // Seed numeric formats: built-ins first, then customs.
    const codeToId = new Map<string, number>();
    for (const [id, code] of Object.entries(BUILTIN_NUMFMTS)) {
      if (!codeToId.has(code)) codeToId.set(code, parseInt(id, 10));
    }
    let maxCustom = 164;
    if (this.numFmtsEl) {
      for (const nf of childElements(this.numFmtsEl, "numFmt")) {
        const id = parseInt(getAttr(nf, "numFmtId") ?? "0", 10);
        const code = getAttr(nf, "formatCode") ?? "";
        if (id > maxCustom) maxCustom = id;
        this.numFmts.push({ id, code });
        this.numFmtCodeById.set(id, code);
        if (id >= 164 && !codeToId.has(code)) codeToId.set(code, id);
      }
    }
    this.nextNumFmtId = maxCustom + 1;
    for (const nf of this.numFmts) {
      if (!this.numFmtCodeKey.has(nf.code)) this.numFmtCodeKey.set(nf.code, nf.id);
    }
    // Allow reuse of matching built-in ids for our common codes.
    for (const [id, code] of Object.entries(BUILTIN_NUMFMTS)) {
      if (!this.numFmtCodeKey.has(code)) this.numFmtCodeKey.set(code, parseInt(id, 10));
    }
    void codeToId;
  }

  private ensureDefaults(): void {
    if (!this.fontsEl) {
      const el = createElement(this.doc, "fonts", { count: 1 });
      el.appendChild(createElement(this.doc, "font", {}));
      this.insertChild(this.root, el);
      this.fontsEl = el;
    }
    if (!this.fillsEl) {
      const el = createElement(this.doc, "fills", { count: 2 });
      this.insertChild(this.root, el);
      this.fillsEl = el;
    }
    if (!this.bordersEl) {
      const el = createElement(this.doc, "borders", { count: 1 });
      this.insertChild(this.root, el);
      this.bordersEl = el;
    }
    if (!this.cellXfsEl) {
      const el = createElement(this.doc, "cellXfs", { count: 1 });
      this.insertChild(this.root, el);
      this.cellXfsEl = el;
    }
    if (!this.numFmtsEl) {
      const el = createElement(this.doc, "numFmts", { count: 0 });
      this.insertChild(this.root, el);
      this.numFmtsEl = el;
    }
  }

  private insertChild(parent: XmlEl, el: XmlEl): void {
    // styles.xml children: numFmts, fonts, fills, borders, cellStyleXfs, cellXfs, ...
    const order = ["numFmts", "fonts", "fills", "borders", "cellStyleXfs", "cellXfs", "cellStyles", "dxfs", "tableStyles"];
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

  /* ------------------------------ fonts ------------------------------ */

  fontKeyFor(spec: FontSpec): string {
    return JSON.stringify({
      bold: spec.bold || false,
      italic: spec.italic || false,
      underline: spec.underline || false,
      strike: spec.strike || false,
      size: spec.size ?? null,
      name: spec.name ?? null,
      family: spec.family ?? null,
      scheme: spec.scheme ?? null,
      color: spec.color ?? null,
    });
  }

  addFont(spec: FontSpec): number {
    const key = this.fontKeyFor(spec);
    const existing = this.fontKey.get(key);
    if (existing !== undefined) return existing;
    const el = createElement(this.doc, "font");
    if (spec.bold) el.appendChild(createElement(this.doc, "b"));
    if (spec.italic) el.appendChild(createElement(this.doc, "i"));
    if (spec.underline) el.appendChild(createElement(this.doc, "u"));
    if (spec.strike) el.appendChild(createElement(this.doc, "strike"));
    if (spec.size !== undefined) el.appendChild(createElement(this.doc, "sz", { val: String(spec.size) }));
    if (spec.color) {
      const c = createElement(this.doc, "color", spec.color);
      el.appendChild(c);
    }
    if (spec.name) el.appendChild(createElement(this.doc, "name", { val: spec.name }));
    if (spec.family) el.appendChild(createElement(this.doc, "family", { val: spec.family }));
    if (spec.scheme) el.appendChild(createElement(this.doc, "scheme", { val: spec.scheme }));
    this.fontsEl!.appendChild(el);
    const idx = this.fonts.length;
    this.fonts.push(spec);
    this.fontKey.set(key, idx);
    return idx;
  }

  fontAt(i: number): FontSpec {
    return this.fonts[i] ?? { name: "Calibri", size: 11 };
  }

  /* ------------------------------ fills ------------------------------ */

  fillKeyFor(spec: FillSpec): string {
    return JSON.stringify({ patternType: spec.patternType, fgColor: spec.fgColor ?? null, bgColor: spec.bgColor ?? null });
  }

  addFill(spec: FillSpec): number {
    const key = this.fillKeyFor(spec);
    const existing = this.fillKey.get(key);
    if (existing !== undefined) return existing;
    const fill = createElement(this.doc, "fill");
    const pattern = createElement(this.doc, "patternFill", { patternType: spec.patternType });
    if (spec.fgColor) pattern.appendChild(createElement(this.doc, "fgColor", spec.fgColor));
    if (spec.bgColor) pattern.appendChild(createElement(this.doc, "bgColor", spec.bgColor));
    fill.appendChild(pattern);
    this.fillsEl!.appendChild(fill);
    const idx = this.fills.length;
    this.fills.push(spec);
    this.fillKey.set(key, idx);
    return idx;
  }

  fillAt(i: number): FillSpec {
    return this.fills[i] ?? { patternType: "none" };
  }

  /** Index 0 = none; 1 = gray125; solid fills appended after. */
  solidFill(rgb: string): number {
    return this.addFill({ patternType: "solid", fgColor: { rgb }, bgColor: { indexed: "64" } });
  }

  /* ----------------------------- borders ----------------------------- */

  borderKeyFor(spec: BorderSpec): string {
    return JSON.stringify({
      left: spec.left ?? null,
      right: spec.right ?? null,
      top: spec.top ?? null,
      bottom: spec.bottom ?? null,
    });
  }

  addBorder(spec: BorderSpec): number {
    const key = this.borderKeyFor(spec);
    const existing = this.borderKey.get(key);
    if (existing !== undefined) return existing;
    const border = createElement(this.doc, "border");
    const edges: ("left" | "right" | "top" | "bottom")[] = ["left", "right", "top", "bottom"];
    for (const edge of edges) {
      const e = spec[edge];
      const edgeEl = createElement(this.doc, edge);
      if (e && e.style) {
        setAttr(edgeEl, "style", e.style);
        if (e.color) edgeEl.appendChild(createElement(this.doc, "color", e.color));
      }
      border.appendChild(edgeEl);
    }
    border.appendChild(createElement(this.doc, "diagonal"));
    this.bordersEl!.appendChild(border);
    const idx = this.borders.length;
    this.borders.push(spec);
    this.borderKey.set(key, idx);
    return idx;
  }

  borderAt(i: number): BorderSpec {
    return this.borders[i] ?? {};
  }

  thinBorder(colorRgb: string): number {
    const edge = { style: "thin", color: { rgb: colorRgb } };
    return this.addBorder({ left: edge, right: edge, top: edge, bottom: edge });
  }

  /* --------------------------- number formats ------------------------ */

  numFmtIdFor(code: string): number {
    const existing = this.numFmtCodeKey.get(code);
    if (existing !== undefined) return existing;
    const id = this.nextNumFmtId++;
    this.numFmts.push({ id, code });
    this.numFmtCodeKey.set(code, id);
    if (this.numFmtsEl) {
      this.numFmtsEl.appendChild(createElement(this.doc, "numFmt", { numFmtId: String(id), formatCode: code }));
    }
    return id;
  }

  /* ------------------------------ xfs -------------------------------- */

  xfKeyFor(spec: XfSpec): string {
    return JSON.stringify({
      numFmtId: spec.numFmtId,
      fontId: spec.fontId,
      fillId: spec.fillId,
      borderId: spec.borderId,
      alignment: spec.alignment ?? null,
    });
  }

  addXf(spec: XfSpec): number {
    const key = this.xfKeyFor(spec);
    const existing = this.xfKey.get(key);
    if (existing !== undefined) return existing;
    const attrs: Record<string, string | number> = {
      numFmtId: spec.numFmtId,
      fontId: spec.fontId,
      fillId: spec.fillId,
      borderId: spec.borderId,
    };
    if (this.hasCellStyleXfs) attrs.xfId = 0;
    if (spec.numFmtId !== 0) attrs.applyNumberFormat = 1;
    attrs.applyFont = 1;
    if (spec.fillId !== 0) attrs.applyFill = 1;
    if (spec.borderId !== 0) attrs.applyBorder = 1;
    const xf = createElement(this.doc, "xf", attrs);
    if (spec.alignment) {
      const aAttrs: Record<string, string | number> = {};
      if (spec.alignment.horizontal) aAttrs.horizontal = spec.alignment.horizontal;
      if (spec.alignment.vertical) aAttrs.vertical = spec.alignment.vertical;
      if (spec.alignment.wrapText) aAttrs.wrapText = "1";
      if (spec.alignment.textRotation !== undefined) aAttrs.textRotation = spec.alignment.textRotation as string;
      if (spec.alignment.indent !== undefined) aAttrs.indent = spec.alignment.indent as string;
      const a = createElement(this.doc, "alignment", aAttrs);
      xf.appendChild(a);
      setAttr(xf, "applyAlignment", 1);
    }
    this.cellXfsEl!.appendChild(xf);
    const idx = this.xfs.length;
    this.xfs.push(spec);
    this.xfKey.set(key, idx);
    return idx;
  }

  xfAt(i: number): XfSpec {
    return this.xfs[i] ?? { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 };
  }

  numFmtIdAt(i: number): number {
    return this.xfAt(i).numFmtId;
  }

  /** Resolves the display format code for a style index (built-in or custom). */
  numFmtCodeAt(i: number): string {
    const id = this.xfAt(i).numFmtId;
    const custom = this.numFmtCodeById.get(id);
    if (custom !== undefined) return custom;
    return BUILTIN_NUMFMTS[id] ?? "General";
  }

  /** True when the style's number format is generic (safe to replace). */
  isReplaceableNumberFormat(i: number): boolean {
    const id = this.xfAt(i).numFmtId;
    if ([0, 1, 2, 3, 4, 9, 10].includes(id)) return true;
    return this.numFmtCodeAt(i) === "General";
  }

  /* ---------------------------- serialization ------------------------ */

  serialize(): string {
    // Counts always reflect the actual DOM children, never the deduplicated
    // in-memory arrays — the original file may legitimately contain duplicate
    // font/fill/border records, and Excel flags a `count` that disagrees with
    // the real child count as "found a problem with some content".
    const setCount = (el: XmlEl | undefined, count: number) => {
      if (el) setAttr(el, "count", count);
    };
    const childCount = (el: XmlEl | undefined, childName: string): number =>
      el ? childElements(el, childName).length : 0;
    setCount(this.numFmtsEl, childCount(this.numFmtsEl, "numFmt"));
    setCount(this.fontsEl, childCount(this.fontsEl, "font"));
    setCount(this.fillsEl, childCount(this.fillsEl, "fill"));
    setCount(this.bordersEl, childCount(this.bordersEl, "border"));
    setCount(this.cellXfsEl, childCount(this.cellXfsEl, "xf"));
    return serializeXml(this.doc);
  }
}
