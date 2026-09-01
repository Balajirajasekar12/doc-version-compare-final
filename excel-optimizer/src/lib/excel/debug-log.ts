/**
 * Debug log collector for the EO optimizer.
 * Captures key events during optimization so users can download
 * the log and share it for debugging.
 */

interface LogEntry {
  timestamp: number;
  stage: string;
  message: string;
  data?: unknown;
}

class DebugLogger {
  private entries: LogEntry[] = [];
  private enabled = true;

  log(stage: string, message: string, data?: unknown): void {
    if (!this.enabled) return;
    this.entries.push({
      timestamp: Date.now(),
      stage,
      message,
      data,
    });
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  /**
   * Generate a downloadable text log file.
   */
  toText(): string {
    const lines: string[] = [
      '=== EO Optimizer Debug Log ===',
      `Generated: ${new Date().toISOString()}`,
      `Entries: ${this.entries.length}`,
      '',
    ];

    for (const entry of this.entries) {
      const time = new Date(entry.timestamp).toISOString().slice(11, 23);
      lines.push(`[${time}] [${entry.stage}] ${entry.message}`);
      if (entry.data !== undefined) {
        lines.push(`  Data: ${JSON.stringify(entry.data, null, 2).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get the log as a Blob for embedding in downloads.
   */
  toBlob(): Blob {
    return new Blob([this.toText()], { type: 'text/plain' });
  }

  /**
   * Trigger a browser download of the log file.
   */
  download(filename?: string): void {
    const text = this.toText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `eo-debug-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Singleton instance
export const debugLog = new DebugLogger();
