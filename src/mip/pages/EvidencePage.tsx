// ============================================================
// MIP Evidence Page - Screenshot/paste evidence for test cases
// ============================================================

import React, { useState, useRef, useCallback } from "react";
import { useMip } from "../context";
import { Camera, Upload, Clipboard, Image, Trash2, Plus } from "lucide-react";

export default function EvidencePage() {
  const { state, dispatch } = useMip();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedTestCase, setSelectedTestCase] = useState<string>("");
  const [description, setDescription] = useState("");

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const evidence = {
              id: `ev_${Date.now()}`,
              projectId: state.currentProjectId || "",
              testCaseId: selectedTestCase || "unassigned",
              imageDataUrl: reader.result as string,
              description,
              timestamp: Date.now(),
              source: "paste" as const,
            };
            dispatch({ type: "ADD_EVIDENCE", payload: evidence });
            setDescription("");
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, [selectedTestCase, description, state.currentProjectId, dispatch]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const evidence = {
          id: `ev_${Date.now()}_${file.name}`,
          projectId: state.currentProjectId || "",
          testCaseId: selectedTestCase || "unassigned",
          imageDataUrl: reader.result as string,
          description: description || file.name,
          timestamp: Date.now(),
          source: "upload" as const,
        };
        dispatch({ type: "ADD_EVIDENCE", payload: evidence });
      };
      reader.readAsDataURL(file);
    }
    setDescription("");
    e.target.value = "";
  };

  return (
    <div className="p-6" onPaste={handlePaste} tabIndex={0}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <Camera size={18} className="text-cyan-400" /> Evidence
          </h1>
          <p className="mt-1 text-sm text-slate-400">Attach screenshots and evidence to test cases. Supports paste from Snagit.</p>
        </div>
      </div>

      {/* Capture area */}
      <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selectedTestCase} onChange={e => setSelectedTestCase(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 outline-none">
            <option value="">Select test case...</option>
            {state.testCases.map(tc => (
              <option key={tc.id} value={tc.id}>{tc.caseNumber} - {tc.title}</option>
            ))}
          </select>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
            className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.07]">
            <Upload size={12} /> Upload Screenshot
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          💡 Paste screenshots directly from Snagit or clipboard (Ctrl+V) • Supports drag & drop
        </p>
      </div>

      {/* Evidence gallery */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.evidence.map(ev => {
          const tc = state.testCases.find(t => t.id === ev.testCaseId);
          return (
            <div key={ev.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              {ev.imageDataUrl && (
                <div className="aspect-video bg-black/20">
                  <img src={ev.imageDataUrl} alt={ev.description || "Evidence"} className="w-full h-full object-contain" />
                </div>
              )}
              <div className="p-3">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">{ev.source}</span>
                  {tc && <span className="text-slate-500">{tc.caseNumber}</span>}
                  <span className="ml-auto text-slate-600">{new Date(ev.timestamp).toLocaleString()}</span>
                </div>
                {ev.description && <p className="mt-1 text-xs text-slate-400">{ev.description}</p>}
              </div>
            </div>
          );
        })}
        {state.evidence.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-white/10 py-12 text-center">
            <Camera size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No evidence attached yet</p>
            <p className="mt-1 text-xs text-slate-600">Paste (Ctrl+V) or upload screenshots from Snagit</p>
          </div>
        )}
      </div>
    </div>
  );
}
