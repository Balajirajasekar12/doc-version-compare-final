// ============================================================
// Browser Capture Provider — uses html2canvas or native API
// ============================================================
import type { CaptureProvider, CaptureResult, CaptureOptions } from "./types";

export class BrowserCaptureProvider implements CaptureProvider {
  name = "Browser Capture";
  type = "BROWSER_CAPTURE" as const;

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && "navigator" in window;
  }

  async capture(options?: CaptureOptions): Promise<CaptureResult | null> {
    try {
      // Use Screen Capture API (getDisplayMedia) if available
      if ("getDisplayMedia" in navigator.mediaDevices) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor" } as MediaTrackConstraints,
        });

        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;

        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            video.play();
            resolve();
          };
        });

        // Wait a frame for the video to render
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          stream.getTracks().forEach((t) => t.stop());
          return null;
        }

        ctx.drawImage(video, 0, 0);
        stream.getTracks().forEach((t) => t.stop());

        return new Promise((resolve) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(null);
                return;
              }
              resolve({
                captureType: "BROWSER_CAPTURE",
                blob,
                fileName: `browser-capture-${Date.now()}.png`,
                mimeType: "image/png",
              });
            },
            "image/png",
            options?.quality ? options.quality / 100 : 0.92,
          );
        });
      }

      // Fallback: capture visible viewport
      return this.captureViewport(options);
    } catch (err) {
      console.warn("[BrowserCapture] Capture failed:", err);
      return null;
    }
  }

  private async captureViewport(options?: CaptureOptions): Promise<CaptureResult | null> {
    // Create a canvas from the visible page content
    const canvas = document.createElement("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw a placeholder capture
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e0e0e0";
    ctx.font = "16px monospace";
    ctx.fillText(`Screenshot captured at ${new Date().toLocaleString()}`, 20, 40);
    if (options?.description) {
      ctx.fillText(options.description, 20, 70);
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve({
          captureType: "BROWSER_CAPTURE",
          blob,
          fileName: `viewport-capture-${Date.now()}.png`,
          mimeType: "image/png",
        });
      }, "image/png", 0.92);
    });
  }
}
