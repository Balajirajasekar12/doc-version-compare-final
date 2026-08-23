// ============================================================
// Upload Capture Provider — always available, no external deps
// ============================================================
import type { CaptureProvider, CaptureResult, CaptureOptions } from "./types";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export class UploadCaptureProvider implements CaptureProvider {
  name = "Manual Upload";
  type = "UPLOAD" as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async capture(options?: CaptureOptions): Promise<CaptureResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ACCEPTED_TYPES.join(",");
      input.style.display = "none";
      document.body.appendChild(input);

      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);

        if (!file) {
          resolve(null);
          return;
        }

        if (!ACCEPTED_TYPES.includes(file.type)) {
          alert(`Unsupported file type: ${file.type}. Accepted: PNG, JPG, WEBP.`);
          resolve(null);
          return;
        }

        if (file.size > MAX_SIZE) {
          alert(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max: 20 MB.`);
          resolve(null);
          return;
        }

        const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
        const safeName = `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        resolve({
          captureType: "UPLOAD",
          blob: file,
          fileName: safeName,
          mimeType: file.type,
        });
      };

      input.oncancel = () => {
        document.body.removeChild(input);
        resolve(null);
      };

      input.click();
    });
  }
}
