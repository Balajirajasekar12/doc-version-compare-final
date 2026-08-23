// ============================================================================
// MIPTE Shell/Bash Analyzer — Extracts scripts, variables, commands,
// function definitions, conditionals, loops, file I/O, Java invocations,
// Control-M references, and any embedded SQL or table references.
// ============================================================================

import type {
  AnalyzerFn,
  AnalysisResult,
  Entity,
  TableReference,
  CodeDependency,
} from "./types";
import { buildSummary } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushEntity(
  entities: Entity[],
  e: Omit<Entity, "metadata"> & { metadata?: Record<string, unknown> },
) {
  entities.push(e);
}

/** Check if a word is a shell keyword we should skip in call detection. */
const SHELL_BUILTINS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "while",
  "until",
  "do",
  "done",
  "case",
  "esac",
  "in",
  "function",
  "select",
  "time",
  "coproc",
  "local",
  "declare",
  "typeset",
  "export",
  "readonly",
  "unset",
  "shift",
  "return",
  "exit",
  "break",
  "continue",
  "source",
  "eval",
  "exec",
  "trap",
  "wait",
  "set",
  "echo",
  "printf",
  "read",
  "test",
  "[",
  "[[",
  "let",
  "expr",
  "true",
  "false",
  "cd",
  "pwd",
  "pushd",
  "popd",
  "dirs",
  "mkdir",
  "rmdir",
  "rm",
  "cp",
  "mv",
  "ls",
  "cat",
  "grep",
  "sed",
  "awk",
  "find",
  "sort",
  "uniq",
  "wc",
  "head",
  "tail",
  "cut",
  "tr",
  "tee",
  "xargs",
  "chmod",
  "chown",
  "ln",
  "touch",
  "tar",
  "gzip",
  "gunzip",
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "kill",
  "killall",
  "ps",
  "jobs",
  "fg",
  "bg",
  "nohup",
  "sleep",
  "date",
  "hostname",
  "uname",
  "whoami",
  "id",
  "env",
  "export",
  "alias",
  "unalias",
  "history",
  "alias",
  "type",
  "which",
  "command",
  "builtin",
]);

function extractTableRefsFromText(
  text: string,
  lineStart: number,
  lineEnd: number,
): TableReference[] {
  const refs: TableReference[] = [];
  const seen = new Set<string>();
  const patterns: [RegExp, TableReference["operation"]][] = [
    [/\bFROM\s+(?:\w+\.)?(\w+)/gi, "SELECT"],
    [/\bJOIN\s+(?:\w+\.)?(\w+)/gi, "SELECT"],
    [/\bINTO\s+(?:\w+\.)?(\w+)/gi, "INSERT"],
    [/\bUPDATE\s+(?:\w+\.)?(\w+)/gi, "UPDATE"],
    [/\bDELETE\s+FROM\s+(?:\w+\.)?(\w+)/gi, "DELETE"],
    [/\bINSERT\s+INTO\s+(?:\w+\.)?(\w+)/gi, "INSERT"],
    [/\\bTABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi, "CREATE"],
  ];
  for (const [pat, op] of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      const name = m[1].toUpperCase();
      if (!seen.has(`${name}:${op}`) && name.length > 1) {
        seen.add(`${name}:${op}`);
        refs.push({ name, operation: op, lineStart, lineEnd, isView: false });
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Main Analyzer
// ---------------------------------------------------------------------------

export const analyzeShell: AnalyzerFn = (content, fileName) => {
  const lines = content.split("\n");
  const entities: Entity[] = [];
  const tablesReferenced: TableReference[] = [];
  const dependencies: CodeDependency[] = [];
  const seenTables = new Set<string>();

  const addTable = (
    name: string,
    op: TableReference["operation"],
    ls: number,
    le: number,
  ) => {
    const key = `${name}:${op}`;
    if (!seenTables.has(key) && name.length > 1) {
      seenTables.add(key);
      tablesReferenced.push({ name, operation: op, lineStart: ls, lineEnd: le, isView: false });
    }
  };

  // --- Shebang ---
  if (lines.length > 0 && lines[0].startsWith("#!")) {
    pushEntity(entities, {
      type: "script",
      name: fileName,
      subType: "shebang",
      lineStart: 1,
      lineEnd: 1,
      signature: lines[0].trim(),
      metadata: { interpreter: lines[0].replace("#!", "").trim() },
    });
  }

  // --- Shell variable assignments (VAR=value or export VAR=value) ---
  for (let i = 0; i < lines.length; i++) {
    const varMatch = lines[i].match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)/,
    );
    if (varMatch) {
      const name = varMatch[1];
      const value = varMatch[2].trim();
      // Skip if it looks like a function definition (name(){ )
      if (value.startsWith("(")) continue;

      pushEntity(entities, {
        type: "shell_variable",
        name,
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
        metadata: {
          exported: lines[i].trimStart().startsWith("export "),
          value: value.slice(0, 200),
        },
      });
    }
  }

  // --- Function definitions: name() { or function name { ---
  for (let i = 0; i < lines.length; i++) {
    const fnMatch = lines[i].match(
      /^\s*(?:function\s+)?(\w[\w-]*)\s*\(\s*\)\s*\{?/,
    );
    const fnMatch2 = lines[i].match(
      /^\s*function\s+(\w[\w-]*)\s*\{/,
    );
    const match = fnMatch || fnMatch2;
    if (match) {
      const name = match[1];
      // Find closing }
      let depth = 0;
      let endLine = i;
      let started = false;
      for (let k = i; k < lines.length; k++) {
        for (const ch of lines[k]) {
          if (ch === "{") { depth++; started = true; }
          if (ch === "}") depth--;
        }
        if (started && depth <= 0) { endLine = k; break; }
      }

      pushEntity(entities, {
        type: "method",
        name,
        subType: "shell_function",
        lineStart: i + 1,
        lineEnd: endLine + 1,
        signature: lines[i].trim(),
      });

      // Scan function body for SQL/table refs
      const body = lines.slice(i, endLine + 1).join("\n");
      const tableRefs = extractTableRefsFromText(body, i + 1, endLine + 1);
      for (const ref of tableRefs) {
        addTable(ref.name, ref.operation, ref.lineStart, ref.lineEnd);
        dependencies.push({
          type: ref.operation === "SELECT" ? "reads_table" : "writes_table",
          source: name,
          target: ref.name,
          lineStart: ref.lineStart,
          lineEnd: ref.lineEnd,
        });
      }

      // Detect calls to external scripts/commands
      const callMatches = body.matchAll(/^\s*(\S+)/gm);
      for (const cm of callMatches) {
        const cmd = cm[1];
        // Detect Java invocations
        if (cmd === "java" || cmd === "java.exe") {
          dependencies.push({
            type: "executes_script",
            source: name,
            target: "java",
            lineStart: i + 1,
            lineEnd: endLine + 1,
            evidence: cm[0].trim().slice(0, 200),
          });
        }
        // Detect references to other shell scripts
        if (cmd.endsWith(".sh") || cmd.match(/^\.\//)) {
          dependencies.push({
            type: "executes_script",
            source: name,
            target: cmd,
            lineStart: i + 1,
            lineEnd: endLine + 1,
          });
        }
      }
      i = endLine;
      continue;
    }
  }

  // --- Conditionals: if/elif/else, case ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*if\s+/)) {
      pushEntity(entities, {
        type: "conditional",
        name: "if",
        subType: "if",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*elif\s+/)) {
      pushEntity(entities, {
        type: "conditional",
        name: "elif",
        subType: "else_if",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*case\s+/)) {
      pushEntity(entities, {
        type: "conditional",
        name: "case",
        subType: "case",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Loops: for/while/until ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\s*for\s+/)) {
      pushEntity(entities, {
        type: "loop",
        name: "for",
        subType: "for",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*while\s+/)) {
      pushEntity(entities, {
        type: "loop",
        name: "while",
        subType: "while",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
    if (lines[i].match(/^\s*until\s+/)) {
      pushEntity(entities, {
        type: "loop",
        name: "until",
        subType: "until",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Java invocations (outside functions) ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/\bjava\b/)) {
      pushEntity(entities, {
        type: "java_invocation",
        name: lines[i].match(/\bjava\s+(\S+)/)?.[1] || "java",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
      dependencies.push({
        type: "executes_script",
        source: fileName,
        target: "java",
        lineStart: i + 1,
        lineEnd: i + 1,
        evidence: lines[i].trim().slice(0, 200),
      });
    }
  }

  // --- Control-M references ---
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].match(/\b(ctm|controlm|control-m)\b/i) ||
      lines[i].match(/\bMC_\w+/)
    ) {
      pushEntity(entities, {
        type: "control_m_reference",
        name: lines[i].match(/\b(MC_\w+|ADD_JOB|DELETE_JOB|ORDER_AND_WAIT)/i)?.[1] || "control-m",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- SQL statements embedded in heredocs or echo/cat/printf ---
  let inHeredoc = false;
  let heredocContent = "";
  let heredocStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const heredocMatch = lines[i].match(
      /^\s*(?:cat|echo|printf)\s+(?:<<\s*['"]?(\w+)['"]?)/,
    );
    if (heredocMatch) {
      inHeredoc = true;
      heredocContent = "";
      heredocStart = i + 1;
      continue;
    }
    if (inHeredoc) {
      if (lines[i].match(/^\s*\w+\s*$/)) {
        // End of heredoc
        inHeredoc = false;
        const tableRefs = extractTableRefsFromText(
          heredocContent,
          heredocStart,
          i,
        );
        for (const ref of tableRefs) {
          addTable(ref.name, ref.operation, ref.lineStart, ref.lineEnd);
        }
        heredocContent = "";
      } else {
        heredocContent += lines[i] + "\n";
      }
    }
  }

  // --- File I/O operations ---
  for (let i = 0; i < lines.length; i++) {
    const fileOp = lines[i].match(
      /^\s*(?:cat|less|more|head|tail|grep|sed|awk|sort|uniq|wc|cut|tr)\s+.*?>\s*(\S+)/,
    );
    if (fileOp) {
      pushEntity(entities, {
        type: "script",
        name: fileOp[1],
        subType: "file_output",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Trap / signal handlers ---
  for (let i = 0; i < lines.length; i++) {
    const trapMatch = lines[i].match(
      /^\s*trap\s+['"](.+?)['"]\s+(.+)/,
    );
    if (trapMatch) {
      pushEntity(entities, {
        type: "exception_handler",
        name: `trap:${trapMatch[2]}`,
        subType: "signal_handler",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
        metadata: { signals: trapMatch[2], handler: trapMatch[1] },
      });
    }
  }

  // --- Global SQL table extraction from entire file ---
  const fullText = content;
  const globalTableRefs = extractTableRefsFromText(fullText, 1, lines.length);
  for (const ref of globalTableRefs) {
    addTable(ref.name, ref.operation, ref.lineStart, ref.lineEnd);
  }

  return {
    language: "shell",
    entities,
    tablesReferenced,
    dependencies,
    summary: buildSummary(entities, tablesReferenced, dependencies),
  };
};
