/**
 * Settings — export/import, storage info, capture provider status.
 */

import { useState } from "react";
import { useModStore } from "../context";
import { exportProject, importProject } from "../lib/projectIO";
import { AlertTriangle, Check, Download, Info, Settings as SettingsIcon, Upload } from "lucide-react";

export default function ModSettings() {
  const { state, dispatch } = useModStore();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    try {
      const mip = await importProject(file);
      dispatch({ type: "IMPORT_PROJECT_DATA", data: mip.data });
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    }
    e.target.value = "";
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Modernization Platform configuration and data management
        </p>
      </div>

      {/* Storage */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium flex items-center gap-1.5">
          <Info className="size-3.5" /> Data Storage
        </h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>All project data is stored in <strong className="text-foreground">browser memory only</strong>.</p>
              <p>Refreshing or closing the browser will remove all data.</p>
              <p>Export your project as a .mip file to preserve your work and import it later.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Export / Import */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium flex items-center gap-1.5">
          <Download className="size-3.5" /> Project Data
        </h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (state.projects.length === 1) {
                  exportProject(state, state.projects[0].name);
                }
              }}
              disabled={state.projects.length !== 1}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                state.projects.length === 1
                  ? "bg-foreground text-background hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Download className="size-3" /> Export Project
            </button>
            <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-muted cursor-pointer transition-colors">
              <Upload className="size-3" /> Import .mip File
              <input type="file" accept=".mip" className="hidden" onChange={handleImport} />
            </label>
          </div>
          {state.projects.length !== 1 && (
            <p className="text-[10px] text-muted-foreground">
              Export is available when exactly one project exists. Currently {state.projects.length} project(s).
            </p>
          )}
          {importError && (
            <p className="text-[11px] text-red-400">{importError}</p>
          )}
          {importSuccess && (
            <p className="text-[11px] text-green-400 flex items-center gap-1">
              <Check className="size-3" /> Project imported successfully.
            </p>
          )}
        </div>
      </section>

      {/* Capture Providers */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium flex items-center gap-1.5">
          <SettingsIcon className="size-3.5" /> Evidence Capture
        </h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span>Browser Screen Capture</span>
            <span className="text-green-400">● Available</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span>File Upload (PNG, JPG, WEBP)</span>
            <span className="text-green-400">● Available</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span>Snagit Capture Agent</span>
            <span className="text-muted-foreground">○ Requires local agent</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span>Playwright Screenshots</span>
            <span className="text-muted-foreground">○ Import from automation results</span>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium">Architecture</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground space-y-1.5">
            <p><strong className="text-foreground">Runtime:</strong> Client-side only (browser)</p>
            <p><strong className="text-foreground">Database:</strong> None (browser memory)</p>
            <p><strong className="text-foreground">Server:</strong> None (no data transmitted)</p>
            <p><strong className="text-foreground">Auth:</strong> None required</p>
            <p><strong className="text-foreground">AI APIs:</strong> None (all analysis is deterministic)</p>
            <p><strong className="text-foreground">Storage:</strong> Export/Import via .mip files</p>
            <p><strong className="text-foreground">ZIP Processing:</strong> In-browser via JSZip</p>
            <p><strong className="text-foreground">Code Analysis:</strong> In-browser TypeScript parsers</p>
          </div>
        </div>
      </section>
    </div>
  );
}
