// ============================================================
// MIP Knowledge Base Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import type { KnowledgeEntry } from "../types";
import { BrainCircuit, Plus, Search, Tag } from "lucide-react";

const CATEGORY_LABELS: Record<KnowledgeEntry["category"], string> = {
  business_rule: "Business Rule",
  legacy_behavior: "Legacy Behavior",
  database_observation: "DB Observation",
  data_profile: "Data Profile",
  scheduler_behavior: "Scheduler",
  file_relationship: "File Relationship",
  dependency: "Dependency",
  finding: "Finding",
  accepted_difference: "Accepted Diff",
  deferred_item: "Deferred",
};

export default function KnowledgePage() {
  const { state, dispatch } = useMip();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", category: "business_rule" as KnowledgeEntry["category"], tags: "" });

  const entries = state.knowledge
    .filter(e => catFilter === "all" || e.category === catFilter)
    .filter(e => !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.content.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    const entry: KnowledgeEntry = {
      id: `kb_${Date.now()}`,
      projectId: state.currentProjectId || "",
      category: form.category,
      title: form.title,
      content: form.content,
      sourceFileIds: [],
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_KNOWLEDGE", payload: entry });
    setForm({ title: "", content: "", category: "business_rule", tags: "" });
    setShowAdd(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <BrainCircuit size={18} className="text-cyan-400" /> Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-slate-400">{state.knowledge.length} entries</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">
          <Plus size={14} /> Add Entry
        </button>
      </div>

      {/* Search + filter */}
      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search knowledge base..."
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-7 pr-3 text-xs text-white placeholder-slate-500 outline-none" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-slate-300 outline-none">
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Title"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value as KnowledgeEntry["category"]})}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 outline-none">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Content / observation" rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none resize-none" />
          <input value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} placeholder="Tags (comma separated)"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400">Cancel</button>
            <button onClick={handleAdd} disabled={!form.title.trim()} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-[#07090d] disabled:opacity-50">Save</button>
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="mt-4 space-y-2">
        {entries.map(e => (
          <div key={e.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">{CATEGORY_LABELS[e.category]}</span>
              {e.tags.map(t => (
                <span key={t} className="flex items-center gap-0.5 rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-500">
                  <Tag size={8} /> {t}
                </span>
              ))}
            </div>
            <h3 className="mt-1.5 text-sm font-medium text-white">{e.title}</h3>
            <p className="mt-1 text-xs text-slate-400">{e.content}</p>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <BrainCircuit size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No knowledge entries yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
