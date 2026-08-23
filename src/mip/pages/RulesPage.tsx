// ============================================================
// MIP Business Rules Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import type { BusinessRule } from "../types";
import { BookOpen, Plus, CheckCircle2, XCircle, Link2, Edit2, Trash2 } from "lucide-react";

export default function RulesPage() {
  const { state, addRule, updateRule } = useMip();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", condition: "", source: "", impact: "" });

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    await addRule({
      projectId: state.currentProjectId || "",
      title: form.title,
      description: form.description,
      condition: form.condition,
      source: form.source,
      impact: form.impact,
      status: "draft",
      linkedFindingIds: [],
      linkedScenarioIds: [],
      linkedTestCaseIds: [],
    });
    setForm({ title: "", description: "", condition: "", source: "", impact: "" });
    setShowAdd(false);
  };

  const handleStatusChange = async (rule: BusinessRule, status: BusinessRule["status"]) => {
    await updateRule({ ...rule, status });
  };

  const statusIcon = (s: BusinessRule["status"]) => {
    switch (s) {
      case "approved": return <CheckCircle2 size={12} className="text-emerald-400" />;
      case "rejected": return <XCircle size={12} className="text-red-400" />;
      case "linked": return <Link2 size={12} className="text-cyan-400" />;
      default: return null;
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <BookOpen size={18} className="text-cyan-400" /> Business Rules
          </h1>
          <p className="mt-1 text-sm text-slate-400">{state.rules.length} rules defined</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">
          <Plus size={14} /> Add Rule
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Rule title"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
            <input value={form.source} onChange={e => setForm({...form, source: e.target.value})} placeholder="Source file"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          </div>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none resize-none" />
          <input value={form.condition} onChange={e => setForm({...form, condition: e.target.value})} placeholder="Condition (e.g., CLAIM_STATUS = 'ACTIVE')"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <input value={form.impact} onChange={e => setForm({...form, impact: e.target.value})} placeholder="Impact"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
            <button onClick={handleAdd} disabled={!form.title.trim()}
              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-[#07090d] hover:bg-cyan-400 disabled:opacity-50">Save Rule</button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="mt-4 space-y-2">
        {state.rules.map(rule => (
          <div key={rule.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300">{rule.ruleNumber}</span>
                  {statusIcon(rule.status)}
                  <span className="text-[10px] capitalize text-slate-500">{rule.status}</span>
                </div>
                <h3 className="mt-1 text-sm font-medium text-white">{rule.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{rule.description}</p>
              </div>
              <div className="flex gap-1">
                {(["draft", "approved", "rejected"] as const).map(s => (
                  <button key={s} onClick={() => handleStatusChange(rule, s)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${rule.status === s ? "bg-cyan-500/20 text-cyan-300" : "text-slate-600 hover:text-white"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {rule.condition && (
              <div className="mt-2 rounded-lg bg-white/[0.02] px-3 py-1.5">
                <span className="text-[10px] text-slate-500">Condition:</span>
                <code className="ml-1 text-[11px] text-slate-300">{rule.condition}</code>
              </div>
            )}
            {rule.impact && <p className="mt-1.5 text-xs text-amber-300">Impact: {rule.impact}</p>}
            <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
              {rule.source && <span>Source: {rule.source}</span>}
              {rule.linkedFindingIds.length > 0 && <span>Linked findings: {rule.linkedFindingIds.length}</span>}
              {rule.linkedScenarioIds.length > 0 && <span>Linked scenarios: {rule.linkedScenarioIds.length}</span>}
            </div>
          </div>
        ))}
        {state.rules.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <BookOpen size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No business rules yet</p>
            <p className="mt-1 text-xs text-slate-600">Rules are extracted during analysis or added manually.</p>
          </div>
        )}
      </div>
    </div>
  );
}
