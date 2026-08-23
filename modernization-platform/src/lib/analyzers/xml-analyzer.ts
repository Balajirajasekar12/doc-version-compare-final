// ============================================================================
// MIPTE XML Analyzer — Extracts Spring bean definitions, configuration
// properties, SQL mapping references, namespace declarations, Control-M job
// definitions, batch job configs, and embedded table references from XML
// files (Spring XML, MyBatis, Maven, Control-M, etc.).
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

export const analyzeXml: AnalyzerFn = (content, fileName) => {
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

  // Determine XML type from filename or content
  const lowerName = fileName.toLowerCase();
  const isSpringConfig =
    lowerName.includes("applicationcontext") ||
    lowerName.includes("spring") ||
    lowerName.includes("beans") ||
    lowerName.includes("dispatcher") ||
    lowerName.includes("context");
  const isMyBatis =
    lowerName.includes("mybatis") ||
    lowerName.includes("mapper") ||
    lowerName.includes("sqlmap");
  const isControlM =
    lowerName.includes("controlm") ||
    lowerName.includes("ctm") ||
    lowerName.includes("jobdef");
  const isBatchConfig =
    lowerName.includes("batch") ||
    lowerName.includes("job");
  const isPom = lowerName === "pom.xml";

  // --- Namespace declarations ---
  for (let i = 0; i < lines.length; i++) {
    const nsMatches = lines[i].matchAll(
      /xmlns(?::(\w+))?\s*=\s*"([^"]+)"/g,
    );
    for (const nm of nsMatches) {
      const prefix = nm[1] || "(default)";
      const uri = nm[2];
      pushEntity(entities, {
        type: "namespace",
        name: prefix,
        subType: "xmlns",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: `xmlns:${prefix}="${uri}"`,
        metadata: { uri },
      });
    }
  }

  // --- Spring Bean Definitions ---
  // <bean id="..." class="..." .../>
  for (let i = 0; i < lines.length; i++) {
    const beanMatch = lines[i].match(
      /<bean\s+[^>]*(?:id|name)\s*=\s*"([^"]+)"[^>]*class\s*=\s*"([^"]+)"[^>]*/i,
    ) || lines[i].match(
      /<bean\s+[^>]*class\s*=\s*"([^"]+)"[^>]*(?:id|name)\s*=\s*"([^"]+)"[^>]*/i,
    );
    if (beanMatch) {
      const beanId = beanMatch[1];
      const beanClass = beanMatch[2];

      pushEntity(entities, {
        type: "bean_definition",
        name: beanId,
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim().slice(0, 200),
        metadata: { className: beanClass },
      });

      dependencies.push({
        type: "configures",
        source: fileName,
        target: beanClass,
        lineStart: i + 1,
        lineEnd: i + 1,
        evidence: `bean id="${beanId}"`,
      });
    }
  }

  // --- Spring Property Placeholders ---
  // ${property.name} references
  for (let i = 0; i < lines.length; i++) {
    const propMatches = lines[i].matchAll(/\$\{([^}]+)\}/g);
    for (const pm of propMatches) {
      const propName = pm[1].trim();
      if (propName && !propName.startsWith("?")) {
        pushEntity(entities, {
          type: "config_property",
          name: propName,
          lineStart: i + 1,
          lineEnd: i + 1,
          signature: `${pm[0]}`,
          metadata: { resolved: false },
        });
      }
    }
  }

  // --- Spring @Value / @PropertySource annotations in XML comments or attributes ---
  for (let i = 0; i < lines.length; i++) {
    const propFileMatch = lines[i].match(
      /<context:property-placeholder\s+[^>]*location\s*=\s*"([^"]+)"/i,
    );
    if (propFileMatch) {
      pushEntity(entities, {
        type: "config_property",
        name: propFileMatch[1],
        subType: "property_file",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- Component Scan ---
  for (let i = 0; i < lines.length; i++) {
    const scanMatch = lines[i].match(
      /<context:component-scan\s+[^>]*base-package\s*=\s*"([^"]+)"/i,
    );
    if (scanMatch) {
      pushEntity(entities, {
        type: "annotation",
        name: scanMatch[1],
        subType: "component_scan",
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
      dependencies.push({
        type: "configures",
        source: fileName,
        target: scanMatch[1],
        lineStart: i + 1,
        lineEnd: i + 1,
      });
    }
  }

  // --- Import statements in Spring XML ---
  for (let i = 0; i < lines.length; i++) {
    const importMatch = lines[i].match(
      /<import\s+resource\s*=\s*"([^"]+)"/i,
    );
    if (importMatch) {
      pushEntity(entities, {
        type: "import",
        name: importMatch[1],
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim(),
      });
    }
  }

  // --- MyBatis SQL Mappings ---
  if (isMyBatis) {
    // <select id="..." resultType="..." ...>
    // <insert id="..." ...>
    // <update id="..." ...>
    // <delete id="..." ...>
    const stmtTypes = ["select", "insert", "update", "delete"] as const;
    for (const stmtType of stmtTypes) {
      const re = new RegExp(
        `<${stmtType}\\s+[^>]*id\\s*=\\s*"([^"]+)"[^>]*>`,
        "gi",
      );
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(lines[i])) !== null) {
          pushEntity(entities, {
            type: "sql_statement",
            name: m[1],
            subType: stmtType.toUpperCase(),
            lineStart: i + 1,
            lineEnd: i + 1,
            signature: lines[i].trim().slice(0, 200),
          });
        }
      }
    }

    // ResultMap definitions
    for (let i = 0; i < lines.length; i++) {
      const rmMatch = lines[i].match(
        /<resultMap\s+[^>]*id\s*=\s*"([^"]+)"[^>]*type\s*=\s*"([^"]+)"/i,
      ) || lines[i].match(
        /<resultMap\s+[^>]*type\s*=\s*"([^"]+)"[^>]*id\s*=\s*"([^"]+)"/i,
      );
      if (rmMatch) {
        pushEntity(entities, {
          type: "view",
          name: rmMatch[1],
          subType: "resultMap",
          lineStart: i + 1,
          lineEnd: i + 1,
          signature: lines[i].trim().slice(0, 200),
          metadata: { resultType: rmMatch[2] },
        });
      }
    }
  }

  // --- Spring Batch XML ---
  if (isBatchConfig) {
    // <job id="..." ...>
    for (let i = 0; i < lines.length; i++) {
      const jobMatch = lines[i].match(
        /<batch:job\s+[^>]*id\s*=\s*"([^"]+)"[^>]*/i,
      ) || lines[i].match(
        /<job\s+[^>]*id\s*=\s*"([^"]+)"[^>]*>/i,
      );
      if (jobMatch) {
        pushEntity(entities, {
          type: "batch_job",
          name: jobMatch[1],
          lineStart: i + 1,
          lineEnd: i + 1,
          signature: lines[i].trim().slice(0, 200),
        });
      }

      // <step id="..." ...>
      const stepMatch = lines[i].match(
        /<batch:step\s+[^>]*id\s*=\s*"([^"]+)"[^>]*/i,
      ) || lines[i].match(
        /<step\s+[^>]*id\s*=\s*"([^"]+)"[^>]*>/i,
      );
      if (stepMatch) {
        pushEntity(entities, {
          type: "batch_step",
          name: stepMatch[1],
          lineStart: i + 1,
          lineEnd: i + 1,
          signature: lines[i].trim().slice(0, 200),
        });
      }

      // <reader/processor/writer ref="...">
      const componentTypes = [
        { tag: "chunk", attr: "reader" },
        { tag: "chunk", attr: "processor" },
        { tag: "chunk", attr: "writer" },
      ];
      for (const ct of componentTypes) {
        const refMatch = lines[i].match(
          new RegExp(`${ct.attr}\\s*=\\s*"([^"]+)"`, "i"),
        );
        if (refMatch) {
          pushEntity(entities, {
            type: ct.attr === "reader" ? "batch_reader" : ct.attr === "writer" ? "batch_writer" : "batch_processor",
            name: refMatch[1],
            lineStart: i + 1,
            lineEnd: i + 1,
            signature: lines[i].trim(),
          });
        }
      }
    }
  }

  // --- Control-M Job Definitions ---
  if (isControlM) {
    for (let i = 0; i < lines.length; i++) {
      // Job definitions
      const jobMatch = lines[i].match(
        /<(?:CONTROL-M_JOB|job)\s+[^>]*(?:JOBNAME|job_name)\s*=\s*"([^"]+)"[^>]*/i,
      );
      if (jobMatch) {
        pushEntity(entities, {
          type: "job",
          name: jobMatch[1],
          subType: "control_m_job",
          lineStart: i + 1,
          lineEnd: i + 1,
          signature: lines[i].trim().slice(0, 200),
        });
      }

      // Table references in Control-M definitions
      const tableMatch = lines[i].match(
        /(?:TABLE|table)\s*=\s*"([^"]+)"/i,
      );
      if (tableMatch) {
        addTable(tableMatch[1].toUpperCase(), "REFERENCE", i + 1, i + 1);
      }
    }
  }

  // --- Spring property elements ---
  for (let i = 0; i < lines.length; i++) {
    const propMatch = lines[i].match(
      /<property\s+[^>]*name\s*=\s*"([^"]+)"[^>]*value\s*=\s*"([^"]*)"/i,
    ) || lines[i].match(
      /<property\s+[^>]*value\s*=\s*"([^"]*)"[^>]*name\s*=\s*"([^"]+)"/i,
    );
    if (propMatch) {
      pushEntity(entities, {
        type: "property",
        name: propMatch[1],
        lineStart: i + 1,
        lineEnd: i + 1,
        signature: lines[i].trim().slice(0, 200),
        metadata: { value: propMatch[2] },
      });
    }

    // ref="..." attributes — bean references
    const refMatches = lines[i].matchAll(/\bref\s*=\s*"([^"]+)"/g);
    for (const rm of refMatches) {
      dependencies.push({
        type: "configures",
        source: fileName,
        target: rm[1],
        lineStart: i + 1,
        lineEnd: i + 1,
      });
    }
  }

  // --- SQL embedded in CDATA sections ---
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("<![CDATA[")) {
      let cdataContent = "";
      let cdataStart = i + 1;
      let cdataEnd = i;
      for (let k = i; k < lines.length; k++) {
        cdataContent += lines[k] + "\n";
        if (lines[k].includes("]]>")) {
          cdataEnd = k;
          break;
        }
      }
      const tableRefs = extractTableRefsFromText(cdataContent, cdataStart, cdataEnd);
      for (const ref of tableRefs) {
        addTable(ref.name, ref.operation, ref.lineStart, ref.lineEnd);
      }
    }
  }

  // --- Table references in any SQL-containing elements ---
  const sqlElements = ["where", "having", "orderBy", "groupBy", "sql"];
  for (const el of sqlElements) {
    for (let i = 0; i < lines.length; i++) {
      const re = new RegExp(`<${el}[^>]*>`, "i");
      if (re.test(lines[i])) {
        // Gather content until closing tag
        let content = "";
        let start = i;
        let end = i;
        for (let k = i; k < Math.min(i + 30, lines.length); k++) {
          content += lines[k] + "\n";
          end = k;
          if (lines[k].match(new RegExp(`</${el}>`, "i"))) break;
        }
        const tableRefs = extractTableRefsFromText(content, start + 1, end + 1);
        for (const ref of tableRefs) {
          addTable(ref.name, ref.operation, ref.lineStart, ref.lineEnd);
        }
      }
    }
  }

  // --- Maven dependencies (pom.xml) ---
  if (isPom) {
    for (let i = 0; i < lines.length; i++) {
      const depMatch = lines[i].match(
        /<groupId>([^<]+)<\/groupId>/i,
      );
      if (depMatch) {
        // Look ahead for artifactId
        for (let k = i + 1; k < Math.min(i + 5, lines.length); k++) {
          const artMatch = lines[k].match(
            /<artifactId>([^<]+)<\/artifactId>/i,
          );
          if (artMatch) {
            pushEntity(entities, {
              type: "import",
              name: `${depMatch[1]}:${artMatch[1]}`,
              subType: "maven_dependency",
              lineStart: i + 1,
              lineEnd: k + 1,
              signature: `${depMatch[1]}:${artMatch[1]}`,
            });
            dependencies.push({
              type: "imports",
              source: fileName,
              target: `${depMatch[1]}:${artMatch[1]}`,
              lineStart: i + 1,
              lineEnd: k + 1,
            });
            break;
          }
        }
      }
    }
  }

  return {
    language: "xml",
    entities,
    tablesReferenced,
    dependencies,
    summary: buildSummary(entities, tablesReferenced, dependencies),
  };
};
