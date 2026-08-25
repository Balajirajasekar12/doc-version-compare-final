// ============================================================
// Requirement → Test Case Generator — GenAI Provider Abstraction
// Optional AI enhancement. Core generation works WITHOUT this.
// ============================================================

import type { GenAIProvider, ExtractedKnowledge, GeneratedTestCase } from "./types";

// --- Provider Registry ---
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

// --- Sidekick GenAI Provider (placeholder) ---
// This creates a clean interface that can be connected later.
// It does NOT expose any credentials or make calls by default.
export class SidekickProvider implements GenAIProvider {
  name = "Sidekick GenAI";
  private apiKey: string | null = null;
  private endpoint: string | null = null;

  constructor(config?: { apiKey?: string; endpoint?: string }) {
    this.apiKey = config?.apiKey ?? null;
    this.endpoint = config?.endpoint ?? null;
  }

  isAvailable(): boolean {
    // Only available if both API key and endpoint are configured
    // by the user through the Settings UI
    return !!(this.apiKey && this.endpoint);
  }

  async generateTestCases(_knowledge: ExtractedKnowledge[]): Promise<Partial<GeneratedTestCase>[]> {
    if (!this.isAvailable()) {
      console.warn("[GenAI] Sidekick provider not configured. Using deterministic engine only.");
      return [];
    }

    // NOTE: When implemented, this would:
    // 1. Format knowledge into a prompt
    // 2. Send to the Sidekick API endpoint
    // 3. Parse the response into test case format
    // 4. Return enriched test cases
    //
    // Security: The API key is only stored in memory, never persisted.
    // The user must explicitly configure it through the Settings UI.
    // The UI will clearly indicate that external processing will occur.

    console.info("[GenAI] Sidekick integration not yet implemented. Using deterministic engine.");
    return [];
  }
}

// --- Provider configuration from Settings ---
export interface GenAIConfig {
  enabled: boolean;
  provider: "sidekick" | "none";
  apiKey?: string;
  endpoint?: string;
}

export function configureGenAI(config: GenAIConfig): void {
  if (!config.enabled || config.provider === "none") {
    setGenAIProvider(null);
    return;
  }

  if (config.provider === "sidekick") {
    const provider = new SidekickProvider({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
    });
    setGenAIProvider(provider);
  }
}
