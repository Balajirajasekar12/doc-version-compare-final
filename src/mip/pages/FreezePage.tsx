// ============================================================
// MIP Freeze Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { Snowflake, Shield, Lock, Unlock, Clock, AlertTriangle } from "lucide-react";

export default function FreezePage() {
  const { currentProject, freezeProject, dispatch } = useMip();
  const [showFreeze, setShowFreeze] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const handleFreeze = async () => {
    if (!reason.trim() || !currentProject) return;
    await freezeProject(reason, note);
    setShowFreeze(false);
    setReason("");
    setNote("");
  };

  const handleUnfreeze = async () => {
    if (!currentProject) return;
    const updated = { ...currentProject, status: "active" as const, updatedAt: Date.now() };
    dispatch({ type: "UPDATE_PROJECT", payload: updated });
  };

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Snowflake size={40} className="mx-auto text-slate-600" />
          <h2 className="mt-3 text-sm font-medium text-slate-400">No project selected</h2>
        </div>
      </div>
    );
  }

  const isFrozen = currentProject.status === "frozen";

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <Snowflake size={18} className="text-cyan-400" /> Freeze / Code Finalization
          </h1>
          <p className="mt-1 text-sm text-slate-400">Lock the project to prevent accidental changes after implementation is finalized</p>
        </div>
        {isFrozen ? (
          <button onClick={handleUnfreeze}
            className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/20">
            <Unlock size={14} /> Unfreeze Project
          </button>
        ) : (
          <button onClick={() => setShowFreeze(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/20">
            <Lock size={14} /> Freeze Project
          </button>
        )}
      </div>

      {/* Status */}
      <div className={`mt-6 rounded-xl border p-6 ${isFrozen ? "border-blue-500/30 bg-blue-500/[0.05]" : "border-white/[0.06] bg-white/[0.02]"}`}>
        <div className="flex items-center gap-3">
          {isFrozen ? <Shield size={24} className="text-blue-400" /> : <Snowflake size={24} className="text-slate-500" />}
          <div>
            <h2 className={`text-sm font-semibold ${isFrozen ? "text-blue-300" : "text-slate-300"}`}>
              {isFrozen ? "Project is FROZEN" : "Project is ACTIVE"}
            </h2>
            <p className="text-xs text-slate-500">
              {isFrozen ? "Editing actions are restricted. Unfreeze to make changes." : "All editing actions are available."}
            </p>
          </div>
        </div>
      </div>

      {/* Freeze form */}
      {showFreeze && (
        <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle size={14} />
            Freezing will restrict editing. This action is recorded in the freeze history.
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for freeze (e.g., Implementation finalized for Sprint 1)"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Additional notes (optional)" rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFreeze(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400">Cancel</button>
            <button onClick={handleFreeze} disabled={!reason.trim()}
              className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-[#07090d] disabled:opacity-50">
              <Lock size={12} className="mr-1 inline" /> Freeze
            </button>
          </div>
        </div>
      )}

      {/* Freeze history */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-300">Freeze History</h3>
        {currentProject.freezeHistory.length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">No freeze history yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {currentProject.freezeHistory.map((record, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <Snowflake size={12} className="text-blue-400" />
                  <span className="text-xs font-mono text-cyan-300">{record.version}</span>
                  <span className="text-[10px] text-slate-500">
                    <Clock size={10} className="mr-1 inline" />
                    {new Date(record.date).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{record.reason}</p>
                {record.note && <p className="mt-0.5 text-[11px] text-slate-500">{record.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
