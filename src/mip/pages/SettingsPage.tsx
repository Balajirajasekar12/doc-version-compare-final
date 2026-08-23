// ============================================================
// MIP Settings Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { Settings, Save, Trash2, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const { currentProject, dispatch, deleteProject } = useMip();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Settings size={40} className="mx-auto text-slate-600" />
          <h2 className="mt-3 text-sm font-medium text-slate-400">No project selected</h2>
        </div>
      </div>
    );
  }

  const updateField = (field: string, value: string) => {
    dispatch({ type: "UPDATE_PROJECT", payload: { ...currentProject, [field]: value, updatedAt: Date.now() } });
  };

  return (
    <div className="p-6 max-w-2xl">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-white">
          <Settings size={18} className="text-cyan-400" /> Project Settings
        </h1>
        <p className="mt-1 text-sm text-slate-400">Configure project details and preferences</p>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Project Name</label>
          <input value={currentProject.name} onChange={e => updateField("name", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Description</label>
          <textarea value={currentProject.description} onChange={e => updateField("description", e.target.value)} rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none resize-none focus:border-cyan-500/50" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Legacy Label</label>
            <input value={currentProject.legacyLabel} onChange={e => updateField("legacyLabel", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Modern Label</label>
            <input value={currentProject.modernLabel} onChange={e => updateField("modernLabel", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Analysis Depth</label>
          <select value={currentProject.settings.analysisDepth}
            onChange={e => {
              const settings = { ...currentProject.settings, analysisDepth: e.target.value as "basic" | "detailed" | "comprehensive" };
              dispatch({ type: "UPDATE_PROJECT", payload: { ...currentProject, settings, updatedAt: Date.now() } });
            }}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 outline-none">
            <option value="basic">Basic</option>
            <option value="detailed">Detailed</option>
            <option value="comprehensive">Comprehensive</option>
          </select>
        </div>

        {/* Project info */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="text-xs font-semibold text-slate-300">Project Info</h3>
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            <div>ID: <span className="font-mono text-slate-500">{currentProject.id}</span></div>
            <div>Created: {new Date(currentProject.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(currentProject.updatedAt).toLocaleString()}</div>
            <div>Status: <span className={`font-medium ${currentProject.status === "frozen" ? "text-blue-300" : "text-emerald-300"}`}>{currentProject.status}</span></div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-red-300">
            <AlertTriangle size={14} /> Danger Zone
          </h3>
          <p className="mt-1 text-xs text-slate-400">Permanently delete this project and all its data.</p>
          {confirmDelete ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-red-300">Are you sure?</span>
              <button onClick={() => { deleteProject(currentProject.id); }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400">
                Yes, Delete
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10">
              <Trash2 size={12} /> Delete Project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
