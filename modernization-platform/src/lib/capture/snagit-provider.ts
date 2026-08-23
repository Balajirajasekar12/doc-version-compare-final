// ============================================================
// Snagit Capture Provider — communicates with local Capture Agent
// Agent must be running on localhost to bridge to Snagit
// ============================================================
import type { CaptureProvider, CaptureResult, CaptureOptions, AgentStatus } from "./types";

const AGENT_PORT = 7890;
const AGENT_URL = `http://localhost:${AGENT_PORT}`;

export class SnagitCaptureProvider implements CaptureProvider {
  name = "Snagit";
  type = "SNAGIT" as const;

  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.getAgentStatus();
      return status.connected && status.snagitInstalled;
    } catch {
      return false;
    }
  }

  async getAgentStatus(): Promise<AgentStatus> {
    try {
      const response = await fetch(`${AGENT_URL}/status`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error("Agent not responding");
      return await response.json();
    } catch {
      return {
        connected: false,
        snagitInstalled: false,
        reason: "Capture Agent is not running. Install the MIPTE Capture Agent or use Browser Capture.",
      };
    }
  }

  async capture(options?: CaptureOptions): Promise<CaptureResult | null> {
    try {
      const response = await fetch(`${AGENT_URL}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "screenshot",
          format: "png",
          description: options?.description,
          application: options?.application,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Capture failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Agent returns a base64 image
      if (data.imageBase64) {
        const binaryString = atob(data.imageBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "image/png" });

        return {
          captureType: "SNAGIT",
          blob,
          fileName: data.fileName || `snagit-${Date.now()}.png`,
          mimeType: "image/png",
        };
      }

      return null;
    } catch (err) {
      console.warn("[SnagitCapture] Capture failed:", err);
      return null;
    }
  }
}
