// ============================================================
// MIP Evidence Requests Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import type { EvidenceRequest } from "../types";
import { FileQuestion, Plus, CheckCircle2, Clock, Copy, ExternalLink } from "lucide-react";

export default function EvidenceRequestsPage() {
  const { state, dispatch } = useMip();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", suggestedQuery: "" });

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    const req: EvidenceRequest = {
      id: `evreq_${Date.now()}`,
      projectId: state.currentProjectId || "",
      title: form.title,
      description: form.description,
      suggestedQuery: form.suggestedQuery,
      status: "open",
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_EVIDENCE_REQUEST", payload: req });
    setForm({ title: "", description: "", suggestedQuery: "" });
    setShowAdd(false);
  };

  const handleStatus = (req: EvidenceRequest, status: EvidenceRequest["status"]) => {
    dispatch({ type: "UPDATE_EVIDENCE_REQUEST", payload: { ...req, status, completedAt: status === "completed" ? Date.now() : undefined } });
  };

  const copyQuery = (q: string) => navigator.clipboard.writeText(q);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <FileQuestion size={18} className="text-cyan-400" /> Evidence Requests
          </h1>
          <p className="mt-1 text-sm text-slate-400">When the system cannot determine something, request evidence from TOAD/SQL queries</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">
          <Plus size={14} /> New Request
        </button>
      </div>

      {showAdd && (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-3">
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Request title"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="What needs to be investigated" rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none resize-none" />
          <textarea value={form.suggestedQuery} onChange={e => setForm({...form, suggestedQuery: e.target.value})} placeholder="Suggested SQL query for TOAD (optional)" rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-slate-300 placeholder-slate-500 outline-none resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400">Cancel</button>
            <button onClick={handleAdd} disabled={!form.title.trim()} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-[#07090d] disabled:opacity-50">Save</button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {state.evidenceRequests.map(req => (
          <div key={req.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    req.status === "completed" ? "bg-emerald-500/10 text-emerald-300" :
                    req.status === "in_progress" ? "bg-amber-500/10 text-amber-300" :
                    req.status === "cancelled" ? "bg-slate-500/10 text-slate-400" :
                    "bg-cyan-500/10 text-cyan-300"
                  }`}>{req.status}</span>
                </div>
                <h3 className="mt-1 text-sm font-medium text-white">{req.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{req.description}</p>
              </div>
              <div className="flex gap-1">
                {(["open", "in_progress", "completed", "cancelled"] as const).map(s => (
                  <button key={s} onClick={() => handleStatus(req, s)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${req.status === s ? "bg-cyan-500/20 text-cyan-300" : "text-slate-600 hover:text-white"}`}>
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            {req.suggestedQuery && (
              <div className="mt-3 rounded-lg bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500">Suggested Query:</span>
                  <button onClick={() => copyQuery(req.suggestedQuery!)} className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300">
                    <Copy size={10} /> Copy
                  </button>
                </div>
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono">{req.suggestedQuery}</pre>
              </div>
            )}
          </div>
        ))}
        {state.evidenceRequests.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <FileQuestion size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No evidence requests</p>
          </div>
        )}
      </div>
    </div>
  );
}
