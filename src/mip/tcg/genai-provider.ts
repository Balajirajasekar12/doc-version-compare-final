// ============================================================
// Requirement → Test Case Generator — GenAI Provider
// TWO integration approaches:
//   1. HYBRID: Copy prompt → paste in Sidekick → paste response back
//   2. DIRECT: Endpoint + API key → automatic API call from browser
// ============================================================

import type {
  GenAIProvider,
  ExtractedKnowledge,
  GeneratedTestCase,
  TcgGenerationSummary,
  TestPriority,
} from "./types";

// ============================================================
// SIDEKICK PROMPT GENERATION (Approach 1 — Hybrid Manual)
// ============================================================

/**
 * Generates a structured prompt that the user copies into Sidekick chat.
 * Sidekick refines the test cases, then the user pastes the response back.
 */
export function generateSidekickPrompt(
  testCases: GeneratedTestCase[],
  knowledge: ExtractedKnowledge[],
  summary: TcgGenerationSummary
): string {
  const activeCases = testCases.filter((tc) => tc.status !== "ignored");

  let prompt = `You are a senior QA test analyst reviewing manually generated test cases for a software modernization project.

I need you to REVIEW and ENHANCE the following test cases. For each test case:

1. IMPROVE the wording to be professional QA language (fix grammar, spelling, clarity)
2. SUGGEST any missing edge cases or boundary conditions
3. VALIDATE that the test steps are specific and executable (not generic)
4. ENSURE database queries are correct and use actual table/column names from the schema
5. FLAG any test cases that should be merged because they test the same business scenario
6. SUGGEST additional negative scenarios if they represent meaningful business risk

DO NOT:
- Invent business rules not present in the source requirements
- Create test cases for trivial UI elements unless they represent meaningful business behavior
- Change technical identifiers (table names, column names, system names)
- Remove any test case — instead explain why it should be kept or merged

---

GENERATION SUMMARY:
- Business Flows: ${summary.businessFlows}
- Requirements Analyzed: ${summary.totalRequirements}
- Final Test Cases: ${summary.finalTestCases}
- P0 Critical: ${summary.p0Count}
- P1 High: ${summary.p1Count}
- P2 Medium: ${summary.p2Count}
- P3 Low: ${summary.p3Count}

---

SOURCE KNOWLEDGE EXTRACTED (${knowledge.length} items):

`;

  // Include key knowledge items
  const highConf = knowledge.filter((k) => k.confidence === "CONFIRMED").slice(0, 30);
  for (const k of highConf) {
    prompt += `- [${k.kind}] ${k.text}${k.relatedTables.length > 0 ? ` (Tables: ${k.relatedTables.join(", ")})` : ""}\n`;
  }

  prompt += `\n---\n\nTEST CASES TO REVIEW (${activeCases.length} cases):\n\n`;

  for (const tc of activeCases) {
    prompt += `
${tc.caseNumber} [${tc.priority}] [${tc.businessFlow}]
Description: ${tc.description}
Types: ${tc.types.join(", ")}
Precondition: ${tc.precondition}
Steps:
${tc.steps}
Expected Results: ${tc.expectedResults}
Query: ${tc.query}
Requirement Coverage: ${tc.requirementIds.join(", ")}
Risk: ${tc.riskRationale}
---`;
  }

  prompt += `

Please provide your enhanced version in this EXACT format for each test case:

ENHANCED-TC-<number> [<priority>] [<business flow>]
Description: <improved description>
Types: <type(s)>
Precondition: <precondition>
Steps:
<numbered steps>
Expected Results: <expected results>
Query: <SQL or N/A>
Requirements: <req IDs>
Risk: <risk rationale>
MERGE-SUGGESTION: <case numbers to merge with, or NONE>
NEW-EDGE-CASE: <description of missing edge case, or NONE>
---`;

  return prompt;
}

/**
 * Copies the Sidekick prompt to the user's clipboard.
 */
export async function copyPromptToClipboard(
  testCases: GeneratedTestCase[],
  knowledge: ExtractedKnowledge[],
  summary: TcgGenerationSummary
): Promise<{ success: boolean; charCount: number }> {
  const prompt = generateSidekickPrompt(testCases, knowledge, summary);
  try {
    await navigator.clipboard.writeText(prompt);
    return { success: true, charCount: prompt.length };
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = prompt;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return { success: ok, charCount: prompt.length };
  }
}

// ============================================================
// SIDEKICK RESPONSE PARSING (Approach 1 — Hybrid Manual)
// ============================================================

export interface ParsedSidekickCase {
  caseNumber: string;
  priority: string;
  businessFlow: string;
  description: string;
  types: string[];
  precondition: string;
  steps: string;
  expectedResults: string;
  query: string;
  requirementIds: string[];
  riskRationale: string;
  mergeSuggestion: string;
  newEdgeCase: string;
}

/**
 * Parses Sidekick's response text into structured test case objects.
 */
export function parseSidekickResponse(responseText: string): {
  enhancedCases: ParsedSidekickCase[];
  newEdgeCases: string[];
  mergeSuggestions: { source: string; targets: string }[];
  parseErrors: string[];
} {
  const enhancedCases: ParsedSidekickCase[] = [];
  const newEdgeCases: string[] = [];
  const mergeSuggestions: { source: string; targets: string }[] = [];
  const parseErrors: string[] = [];

  // Split by test case boundaries
  const blocks = responseText.split(/ENHANCED-TC-\d+/i).filter((b) => b.trim().length > 10);

  // Extract case numbers
  const caseNumbers = [...responseText.matchAll(/ENHANCED-TC-(\d+)/gi)].map((m) => m[1]);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const caseNum = caseNumbers[i] || `Parsed-${i + 1}`;

    try {
      const get = (label: string): string => {
        const regex = new RegExp(`${label}:\\s*(.+?)(?=\\n(?:Types|Precondition|Steps|Expected|Query|Requirements|Risk|MERGE|NEW-EDGE|---|$))`, "is");
        const match = block.match(regex);
        return match ? match[1].trim() : "";
      };

      const getMultiLine = (label: string): string => {
        const regex = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:Expected|Query|Requirements|Risk|MERGE|NEW-EDGE|---|$))`, "is");
        const match = block.match(regex);
        return match ? match[1].trim() : "";
      };

      // Extract priority and flow from the header line
      const headerMatch = block.match(/\[(\w+)\]\s*\[(.+?)\]/);
      const priority = headerMatch?.[1] || "P1";
      const businessFlow = headerMatch?.[2] || "General";

      // Extract types
      const typesStr = get("Types");
      const types = typesStr
        ? typesStr.split(",").map((t) => t.trim()).filter(Boolean)
        : ["Functional"];

      const tc: ParsedSidekickCase = {
        caseNumber: `TC-${caseNum}`,
        priority: priority.toUpperCase().startsWith("P") ? priority.toUpperCase() : "P1",
        businessFlow,
        description: get("Description"),
        types,
        precondition: get("Precondition"),
        steps: getMultiLine("Steps"),
        expectedResults: get("Expected Results"),
        query: get("Query"),
        requirementIds: get("Requirements")
          ? get("Requirements").split(",").map((r) => r.trim()).filter(Boolean)
          : [],
        riskRationale: get("Risk"),
        mergeSuggestion: get("MERGE-SUGGESTION"),
        newEdgeCase: get("NEW-EDGE-CASE"),
      };

      enhancedCases.push(tc);

      // Track merge suggestions
      if (tc.mergeSuggestion && tc.mergeSuggestion !== "NONE") {
        mergeSuggestions.push({ source: tc.caseNumber, targets: tc.mergeSuggestion });
      }

      // Track new edge cases
      if (tc.newEdgeCase && tc.newEdgeCase !== "NONE") {
        newEdgeCases.push(tc.newEdgeCase);
      }
    } catch (err) {
      parseErrors.push(`Failed to parse block ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return { enhancedCases, newEdgeCases, mergeSuggestions, parseErrors };
}

// ============================================================
// DIRECT API INTEGRATION (Approach 2 — Automatic)
// ============================================================

export interface SidekickApiConfig {
  endpoint: string; // e.g. "https://genai.highmark.cloud/sidekick/api/v1/chat/completions"
  apiKey: string; // Bearer token
  model?: string; // e.g. "gpt-4", "claude-3-sonnet"
  maxTokens?: number;
  temperature?: number;
}

// In-memory only — never persisted to localStorage/disk
let _apiConfig: SidekickApiConfig | null = null;

export function setSidekickApiConfig(config: SidekickApiConfig | null): void {
  _apiConfig = config;
}

export function getSidekickApiConfig(): SidekickApiConfig | null {
  return _apiConfig;
}

export function isDirectApiAvailable(): boolean {
  return !!(_apiConfig?.endpoint && _apiConfig?.apiKey);
}

/**
 * Calls the Sidekick API directly from the browser.
 * Uses OpenAI-compatible chat/completions format (standard for most AI platforms).
 */
export async function callSidekickDirectApi(
  testCases: GeneratedTestCase[],
  knowledge: ExtractedKnowledge[],
  summary: TcgGenerationSummary
): Promise<{ success: boolean; response: string; error?: string }> {
  if (!isDirectApiAvailable() || !_apiConfig) {
    return { success: false, response: "", error: "Sidekick API not configured. Add endpoint and API key in Settings." };
  }

  const prompt = generateSidekickPrompt(testCases, knowledge, summary);

  try {
    const response = await fetch(_apiConfig.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${_apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: _apiConfig.model || "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a senior QA test analyst. You review and enhance software test cases. You respond only with enhanced test cases in the exact format requested. You do not invent business rules.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: _apiConfig.maxTokens || 8000,
        temperature: _apiConfig.temperature || 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return { success: false, response: "", error: `API error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ||
      data.response ||
      data.content ||
      "";

    if (!content) {
      return { success: false, response: "", error: "API returned empty response" };
    }

    return { success: true, response: content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    // CORS or network issues — fall back to hybrid approach
    if (msg.includes("CORS") || msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return {
        success: false,
        response: "",
        error: `Cannot reach Sidekick API directly (likely CORS restriction). Use the "Copy Prompt" approach instead: copy the prompt, paste it into Sidekick chat, then paste the response back.`,
      };
    }
    return { success: false, response: "", error: `API call failed: ${msg}` };
  }
}

/**
 * Merges AI-enhanced/added test cases with the existing set.
 * Returns new cases to add (deduped against existing).
 */
export function mergeAiEnhancedCases(
  existingCases: GeneratedTestCase[],
  parsedCases: ParsedSidekickCase[]
): { added: GeneratedTestCase[]; duplicatesSkipped: number } {
  const added: GeneratedTestCase[] = [];
  let duplicatesSkipped = 0;

  // Build a set of existing descriptions for dedup
  const existingDescriptions = new Set(
    existingCases.map((tc) =>
      tc.description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
    )
  );

  for (const parsed of parsedCases) {
    const normalizedDesc = (parsed.description || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    if (existingDescriptions.has(normalizedDesc) || !parsed.description) {
      duplicatesSkipped++;
      continue;
    }

    const now = Date.now();
    const newCase: GeneratedTestCase = {
      id: `ai_enhanced_${now}_${added.length}`,
      caseNumber: parsed.caseNumber.startsWith("TC-") ? parsed.caseNumber : `TC-AI-${added.length + 1}`,
      description: parsed.description,
      steps: parsed.steps,
      precondition: parsed.precondition || "See test case description.",
      query: parsed.query || "N/A",
      expectedResults: parsed.expectedResults,
      types: (parsed.types.length > 0 ? parsed.types : ["Functional"]) as GeneratedTestCase["types"][number][],
      priority: (["P0", "P1", "P2", "P3"].includes(parsed.priority) ? parsed.priority : "P1") as TestPriority,
      businessFlow: parsed.businessFlow || "AI Enhanced",
      requirementIds: parsed.requirementIds,
      sources: [{ documentId: "ai", documentName: "Sidekick AI", sectionRef: "AI Enhancement", kind: "other" }],
      riskRationale: parsed.riskRationale || "AI-enhanced test case",
      queryStatus: "NOT_REQUIRED" as const,
      completeness: "COMPLETE" as const,
      incompleteReasons: [],
      missingEntities: [],
      status: "kept",
      originalData: {
        id: "",
        caseNumber: "",
        description: parsed.description,
        steps: parsed.steps,
        precondition: parsed.precondition,
        query: parsed.query,
        expectedResults: parsed.expectedResults,
        types: parsed.types as GeneratedTestCase["types"][number][],
        priority: parsed.priority as TestPriority,
        businessFlow: parsed.businessFlow,
        requirementIds: parsed.requirementIds,
        sources: [],
        riskRationale: parsed.riskRationale,
        queryStatus: "NOT_REQUIRED" as const,
        completeness: "COMPLETE" as const,
        incompleteReasons: [],
        missingEntities: [],
      },
    };

    added.push(newCase);
  }

  return { added, duplicatesSkipped };
}

// ============================================================
// LEGACY PROVIDER INTERFACE (kept for compatibility)
// ============================================================

let activeProvider: GenAIProvider | null = null;

export function setGenAIProvider(provider: GenAIProvider | null): void {
  activeProvider = provider;
}

export function getGenAIProvider(): GenAIProvider | null {
  return activeProvider;
}

export function isGenAIAvailable(): boolean {
  return activeProvider !== null && activeProvider.isAvailable();
}

export class SidekickProvider implements GenAIProvider {
  name = "Sidekick GenAI";
  private _config: SidekickApiConfig;

  constructor(config: SidekickApiConfig) {
    this._config = config;
  }

  isAvailable(): boolean {
    return !!(this._config.endpoint && this._config.apiKey);
  }

  async generateTestCases(
    _knowledge: ExtractedKnowledge[]
  ): Promise<Partial<GeneratedTestCase>[]> {
    // Direct API approach — delegated to callSidekickDirectApi
    return [];
  }
}

export interface GenAIConfig {
  enabled: boolean;
  provider: "sidekick" | "none";
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

export function configureGenAI(config: GenAIConfig): void {
  if (!config.enabled || config.provider === "none") {
    setGenAIProvider(null);
    setSidekickApiConfig(null);
    return;
  }

  if (config.provider === "sidekick" && config.apiKey && config.endpoint) {
    const apiConfig: SidekickApiConfig = {
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      model: config.model,
    };
    setSidekickApiConfig(apiConfig);
    setGenAIProvider(new SidekickProvider(apiConfig));
  }
}
