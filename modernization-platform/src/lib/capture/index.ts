// ============================================================
// Capture Provider Barrel — registry and helpers
// ============================================================
import type { CaptureProvider, CaptureType, CaptureProviderStatus } from "./types";
import { UploadCaptureProvider } from "./upload-provider";
import { BrowserCaptureProvider } from "./browser-provider";
import { SnagitCaptureProvider } from "./snagit-provider";

export type { CaptureProvider, CaptureType, CaptureProviderStatus, CaptureResult, CaptureOptions, AgentStatus } from "./types";

// Singleton instances
const providers: Record<CaptureType, CaptureProvider> = {
  UPLOAD: new UploadCaptureProvider(),
  BROWSER_CAPTURE: new BrowserCaptureProvider(),
  SNAGIT: new SnagitCaptureProvider(),
  PLAYWRIGHT: new UploadCaptureProvider(), // Playwright results are imported, not captured live
};

export function getProvider(type: CaptureType): CaptureProvider {
  return providers[type];
}

export function getUploadProvider(): CaptureProvider {
  return providers.UPLOAD;
}

export async function getAllProviderStatuses(): Promise<CaptureProviderStatus[]> {
  const results: CaptureProviderStatus[] = [];
  for (const [type, provider] of Object.entries(providers)) {
    if (type === "PLAYWRIGHT") {
      results.push({ name: "Playwright", type: "PLAYWRIGHT", available: true, reason: "Automation results imported via file" });
      continue;
    }
    try {
      const available = await provider.isAvailable();
      results.push({ name: provider.name, type: type as CaptureType, available });
    } catch {
      results.push({ name: provider.name, type: type as CaptureType, available: false, reason: "Check provider status" });
    }
  }
  return results;
}

export async function captureWithFallback(
  preferredType: CaptureType = "UPLOAD",
): Promise<import("./types").CaptureResult | null> {
  // Try preferred provider first
  const preferred = providers[preferredType];
  if (preferred) {
    const available = await preferred.isAvailable().catch(() => false);
    if (available) {
      return preferred.capture();
    }
  }

  // Fallback to upload
  if (preferredType !== "UPLOAD") {
    return providers.UPLOAD.capture();
  }

  return null;
}
