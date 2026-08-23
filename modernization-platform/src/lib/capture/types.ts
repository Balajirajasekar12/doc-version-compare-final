// ============================================================
// Capture Provider Architecture
// Supports Snagit, Playwright, Browser Capture, and Upload
// Extensible for future providers
// ============================================================

export type CaptureType = "SNAGIT" | "PLAYWRIGHT" | "UPLOAD" | "BROWSER_CAPTURE";

export interface CaptureResult {
  captureType: CaptureType;
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export interface CaptureProvider {
  name: string;
  type: CaptureType;
  isAvailable(): Promise<boolean>;
  capture(options?: CaptureOptions): Promise<CaptureResult | null>;
}

export interface CaptureOptions {
  description?: string;
  application?: string;
  stepNumber?: number;
  quality?: number;
}

export interface CaptureProviderStatus {
  name: string;
  type: CaptureType;
  available: boolean;
  reason?: string;
}

export interface AgentStatus {
  connected: boolean;
  snagitInstalled: boolean;
  version?: string;
  address?: string;
  reason?: string;
}
