// ============================================================
// MIP Test Design Page - Create test scenarios
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { TestTubeDiagonal, Plus, Link2, AlertTriangle, BookOpen } from "lucide-react";

export default function TestDesignPage() {
  const { state, addScenario } = useMip();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; objective: string; expectedOutcome: string; priority: "critical" | "high" | "medium" | "low" }>({ title: "", description: "", objective: "", expectedOutcome: "", priority: "medium" });

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    await addScenario({
      projectId: state.currentProjectId || "",
      title: form.title,
      description: form.description,
      objective: form.objective,
      expectedOutcome: form.expectedOutcome,
      priority: form.priority,
      linkedRuleIds: [],
      linkedFindingIds: [],
      linkedSourceFileIds: state.sourceFiles.map(f => f.id),
    });
    setForm({ title: "", description: "", objective: "", expectedOutcome: "", priority: "medium" });
    setShowAdd(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <TestTubeDiagonal size={18} className="text-cyan-400" /> Test Design
          </h1>
          <p className="mt-1 text-sm text-slate-400">Define test scenarios before generating test cases</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">
          <Plus size={14} /> New Scenario
        </button>
      </div>

      {showAdd && (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Scenario title (e.g., Validate active claim processing)"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
            <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value as "critical"|"high"|"medium"|"low"})}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 outline-none">
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none resize-none" />
          <textarea value={form.objective} onChange={e => setForm({...form, objective: e.target.value})} placeholder="Objective" rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none resize-none" />
          <input value={form.expectedOutcome} onChange={e => setForm({...form, expectedOutcome: e.target.value})} placeholder="Expected outcome"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400">Cancel</button>
            <button onClick={handleAdd} disabled={!form.title.trim()} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-[#07090d] disabled:opacity-50">Save Scenario</button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {state.scenarios.map(s => (
          <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300">{s.scenarioNumber}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                s.priority === "critical" ? "bg-red-500/10 text-red-300" :
                s.priority === "high" ? "bg-orange-500/10 text-orange-300" :
                s.priority === "medium" ? "bg-amber-500/10 text-amber-300" :
                "bg-slate-500/10 text-slate-400"
              }`}>{s.priority}</span>
            </div>
            <h3 className="mt-1 text-sm font-medium text-white">{s.title}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{s.description}</p>
            {s.expectedOutcome && <p className="mt-1 text-xs text-emerald-300">Expected: {s.expectedOutcome}</p>}
            <div className="mt-2 flex gap-3 text-[10px] text-slate-500">
              {s.linkedRuleIds.length > 0 && <span className="flex items-center gap-1"><BookOpen size={10} /> {s.linkedRuleIds.length} rules</span>}
              {s.linkedFindingIds.length > 0 && <span className="flex items-center gap-1"><AlertTriangle size={10} /> {s.linkedFindingIds.length} findings</span>}
            </div>
          </div>
        ))}
        {state.scenarios.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <TestTubeDiagonal size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No test scenarios yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
