// ============================================================================
// MIPTE Code Analysis Engine — Shared Types
// ============================================================================

/** A single extracted entity from source code. */
export interface Entity {
  type: EntityType;
  name: string;
  subType?: string;
  lineStart: number;
  lineEnd: number;
  signature?: string;
  annotations?: string[];
  modifiers?: string[];
  parentEntity?: string;
  metadata?: Record<string, unknown>;
}

export type EntityType =
  | "class"
  | "interface"
  | "enum"
  | "method"
  | "constructor"
  | "field"
  | "package"
  | "import"
  | "procedure"
  | "function"
  | "trigger"
  | "cursor"
  | "variable"
  | "exception_handler"
  | "sql_statement"
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "join"
  | "view"
  | "package_declaration"
  | "package_body"
  | "anonymous_block"
  | "job"
  | "script"
  | "shell_variable"
  | "java_invocation"
  | "control_m_reference"
  | "bean_definition"
  | "property"
  | "namespace"
  | "annotation"
  | "conditional"
  | "loop"
  | "try_catch"
  | "subquery"
  | "case_expression"
  | "config_property"
  | "batch_reader"
  | "batch_processor"
  | "batch_writer"
  | "batch_job"
  | "batch_step"
  | "spring_mapping";

/** A table or view reference found in source code. */
export interface TableReference {
  name: string;
  alias?: string;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE" | "ALTER" | "DROP" | "REFERENCE";
  lineStart: number;
  lineEnd: number;
  isView: boolean;
}

/** A dependency relationship between entities. */
export interface CodeDependency {
  type: DependencyType;
  source: string;
  target: string;
  lineStart: number;
  lineEnd: number;
  evidence?: string;
}

export type DependencyType =
  | "imports"
  | "extends"
  | "implements"
  | "calls"
  | "reads_table"
  | "writes_table"
  | "references_view"
  | "invokes_procedure"
  | "invokes_function"
  | "depends_on_package"
  | "references_trigger"
  | "uses_cursor"
  | "extends_class"
  | "implements_interface"
  | "annotated_with"
  | "configures"
  | "reads_property"
  | "executes_script"
  | "references_job";

/** Result returned by every analyzer. */
export interface AnalysisResult {
  language: string;
  entities: Entity[];
  tablesReferenced: TableReference[];
  dependencies: CodeDependency[];
  summary: AnalysisSummary;
}

/** Aggregate counts for the analysis result. */
export interface AnalysisSummary {
  totalEntities: number;
  totalTables: number;
  totalDependencies: number;
  byEntityType: Record<string, number>;
}

/** Helper to build a default summary from entities/tables/deps. */
export function buildSummary(
  entities: Entity[],
  tables: TableReference[],
  deps: CodeDependency[],
): AnalysisSummary {
  const byEntityType: Record<string, number> = {};
  for (const e of entities) {
    byEntityType[e.type] = (byEntityType[e.type] || 0) + 1;
  }
  return {
    totalEntities: entities.length,
    totalTables: tables.length,
    totalDependencies: deps.length,
    byEntityType,
  };
}

/** Convenience: extract the language key from a file extension. */
export function languageFromExtension(ext: string): string {
  const map: Record<string, string> = {
    java: "java",
    sql: "sql",
    pls: "plsql",
    pks: "plsql",
    pkb: "plsql",
    sh: "shell",
    bash: "shell",
    xml: "xml",
    properties: "properties",
    json: "json",
  };
  return map[ext.toLowerCase()] || "text";
}

export type Language = "java" | "plsql" | "sql" | "shell" | "xml" | "properties" | "json" | "text";

export type AnalyzerFn = (content: string, fileName: string) => AnalysisResult;
