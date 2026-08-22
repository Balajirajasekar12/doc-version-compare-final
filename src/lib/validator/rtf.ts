/**
 * Lightweight RTF → plain-text extractor.
 *
 * RTF is a mostly-ASCII control-word format. We strip control words, skip
 * non-printing destinations (font tables, images, stylesheets, …), decode
 * `\'hh` byte escapes, `\uN` unicode escapes, and map common symbolic
 * controls. Text runs are joined with newlines at paragraph/table breaks.
 *
 * This is intentionally dependency-free and runs fully in the browser.
 */

// Control words whose destination group should be skipped entirely
// (font/color/style tables, embedded images/objects, metadata, …).
const SKIP_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "filetbl",
  "listtable",
  "listoverridetable",
  "revtbl",
  "rsidtbl",
  "datastore",
  "xmlnstbl",
  "generator",
  "latentstyles",
  "themedata",
  "colorschememapping",
  "liststylename",
  "fldinst",
  "fldrslt",
  "bkmkstart",
  "bkmkend",
  "header",
  "footer",
  "footnote",
  "annotref",
  "xe",
  "tc",
  "shppict",
  "pncmd",
  "pnseclvl",
  "pn",
  "pnseclvl",
  "pnalpha",
  "pndec",
  "pnucrm",
  "pnstart",
  "pnindent",
  "pntxtb",
  "pntxta",
  "atrfstart",
  "atrfend",
  "chpgn",
  "chftn",
  "chatn",
  "chdate",
  "chtime",
  "chdpl",
  "chdpa",
  "page",
  "par",
  "sect",
  "titlepg",
  "headery",
  "footery",
  "margl",
  "margr",
  "margt",
  "margb",
  "gutter",
  "paperw",
  "paperh",
  "landscape",
  "facingp",
  "twocolumn",
  "titlepage",
  "deftab",
  "widowctrl",
  "makeatletter",
  "makeatother",
]);

// cp1252 high-byte map (the de-facto encoding for Word-produced RTF).
const CP1252: Record<number, string> = {
  0x80: "€", 0x81: "", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†",
  0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8d: "",
  0x8e: "Ž", 0x8f: "", 0x90: "", 0x91: "'", 0x92: "'", 0x93: '"', 0x94: '"',
  0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9d: "", 0x9e: "ž", 0x9f: "Ÿ",
};

const SYMBOLS: Record<string, string> = {
  "\\": "\\",
  "{": "{",
  "}": "}",
  "~": "\u00a0",
  "-": "\u00ad",
  _: "\u2011",
  bullet: "•",
  endash: "–",
  emdash: "—",
  lquote: "‘",
  rquote: "’",
  ldblquote: "“",
  rdblquote: "”",
  emspace: "\u2003",
  enspace: "\u2002",
  qmspace: "\u2005",
  tab: "\t",
};

interface Ctx {
  s: string;
  i: number;
  out: string;
  skipDepth: number; // >0 → inside a skipped destination
  groupDepth: number;
}

function pushNewline(ctx: Ctx): void {
  // Collapse repeated breaks into a single newline.
  if (!ctx.out.endsWith("\n")) {
    ctx.out += "\n";
  }
}

function readControl(ctx: Ctx): void {
  const { s } = ctx;
  // Optional '*' destination marker.
  let isStar = false;
  if (s[ctx.i] === "*") {
    isStar = true;
    ctx.i++;
  }
  let word = "";
  while (ctx.i < s.length && /[a-zA-Z]/.test(s[ctx.i])) {
    word += s[ctx.i];
    ctx.i++;
  }
  // Optional signed numeric parameter.
  let param: number | undefined;
  let sign = 1;
  if (s[ctx.i] === "-") {
    sign = -1;
    ctx.i++;
  }
  let digits = "";
  while (ctx.i < s.length && /\d/.test(s[ctx.i])) {
    digits += s[ctx.i];
    ctx.i++;
  }
  if (digits) {
    param = sign * parseInt(digits, 10);
  }
  // Control words may be followed by a single space delimiter.
  if (s[ctx.i] === " ") {
    ctx.i++;
  }

  if (word === "u" && param !== undefined) {
    // Unicode escape: \uN + one fallback char to drop.
    let code = param;
    if (code < 0) {
      code += 65536;
    }
    if (ctx.skipDepth === 0) {
      ctx.out += String.fromCharCode(code);
    }
    // Skip the fallback ANSI character that follows \uN.
    if (ctx.i < s.length) {
      const fallback = s[ctx.i];
      if (fallback === "\\") {
        // A control word follows instead of a literal char — do not consume.
        return;
      }
      ctx.i++;
    }
    return;
  }

  if (word === "par" || word === "line" || word === "row") {
    if (ctx.skipDepth === 0) pushNewline(ctx);
    return;
  }
  if (word === "cell") {
    if (ctx.skipDepth === 0) pushNewline(ctx);
    return;
  }

  if (word === "'") {
    // Hex byte escape.
    const hex = s.slice(ctx.i, ctx.i + 2);
    if (/^[0-9a-fA-F]{2}$/.test(hex)) {
      const byte = parseInt(hex, 16);
      if (ctx.skipDepth === 0) {
        if (byte >= 0x80 && CP1252[byte] !== undefined) {
          ctx.out += CP1252[byte] || "";
        } else {
          ctx.out += String.fromCharCode(byte);
        }
      }
      ctx.i += 2;
    }
    return;
  }

  if (word === "bin" && param !== undefined) {
    // \binN — skip N bytes of binary data.
    const bytesToSkip = Math.min(Math.max(0, param), s.length - ctx.i);
    ctx.i += bytesToSkip;
    return;
  }

  if (word === "*") {
    return;
  }

  if (isStar) {
    // \* destinations (like \*\fldinst) are skipped: their whole group is
    // non-printing. Mark the current group as skipped when we hit the '{'.
    return;
  }

  if (ctx.skipDepth === 0 && SYMBOLS[word] !== undefined) {
    ctx.out += SYMBOLS[word];
  }
}

export function rtfToText(rtf: string): string {
  const ctx: Ctx = { s: rtf, i: 0, out: "", skipDepth: 0, groupDepth: 0 };
  // Track which group depths are being skipped (by groupDepth at '{' time).
  const skipStack: number[] = [];
  const len = ctx.s.length;

  try {
    while (ctx.i < len) {
      const ch = ctx.s[ctx.i];
      if (ch === "{") {
        ctx.groupDepth++;
        ctx.i++;
        // Peek ahead: is this a skipped destination or a \* destination?
        let j = ctx.i;
        let isSkipped = false;
        if (j < len && ctx.s[j] === "\\") {
          j++;
          let isStar = false;
          if (j < len && ctx.s[j] === "*") {
            isStar = true;
            j++;
          }
          let word = "";
          while (j < len && /[a-zA-Z]/.test(ctx.s[j])) {
            word += ctx.s[j];
            j++;
          }
          if (isStar || SKIP_DESTINATIONS.has(word.toLowerCase())) {
            isSkipped = true;
          }
        }
        if (isSkipped) {
          ctx.skipDepth++;
          skipStack.push(ctx.groupDepth);
        }
        continue;
      }
      if (ch === "}") {
        if (skipStack.length > 0 && skipStack[skipStack.length - 1] === ctx.groupDepth) {
          ctx.skipDepth = Math.max(0, ctx.skipDepth - 1);
          skipStack.pop();
        }
        ctx.groupDepth--;
        ctx.i++;
        continue;
      }
      if (ch === "\\") {
        ctx.i++;
        readControl(ctx);
        continue;
      }
      // Regular character.
      if (ctx.skipDepth === 0) {
        ctx.out += ch;
      }
      ctx.i++;
    }
  } catch (_e) {
    // If parsing crashes (e.g., malformed RTF, out-of-bounds), return
    // whatever text was extracted so far rather than throwing.
  }

  // Collapse 3+ blank lines and trim stray leading/trailing whitespace lines.
  return ctx.out
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}
