// ============================================================
// MIP Source Inventory Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { ListTree, FileText, Code2, Database, Hash, Calendar, Filter } from "lucide-react";

export default function InventoryPage() {
  const { state } = useMip();
  const [filter, setFilter] = useState<"all" | "legacy" | "modern">("all");
  const [search, setSearch] = useState("");

  const files = state.sourceFiles
    .filter(f => filter === "all" || f.side === filter)
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.language.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <ListTree size={18} className="text-cyan-400" /> Source Inventory
          </h1>
          <p className="mt-1 text-sm text-slate-400">{state.sourceFiles.length} files across all projects</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
          {(["all", "legacy", "modern"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${filter === f ? "bg-cyan-500 text-[#07090d]" : "text-slate-400 hover:text-white"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative">
          <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
            className="rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-7 pr-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/50" />
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="px-4 py-2.5 font-medium text-slate-400">File Name</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Side</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Language</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Size</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Status</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Methods</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">SQL</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Tables</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Conditions</th>
            </tr>
          </thead>
          <tbody>
            {files.map(f => {
              const analysis = state.analyses.find(a => a.fileId === f.id);
              return (
                <tr key={f.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="flex items-center gap-2 px-4 py-2.5">
                    <FileText size={12} className="shrink-0 text-slate-500" />
                    <span className="truncate font-medium text-white">{f.name}</span>
                  </td>
                  <td className={`px-4 py-2.5 ${f.side === "legacy" ? "text-amber-300" : "text-cyan-300"}`}>{f.side}</td>
                  <td className="px-4 py-2.5 text-slate-300">{f.language}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatSize(f.size)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      f.status === "analyzed" ? "bg-emerald-500/10 text-emerald-300" :
                      f.status === "error" ? "bg-red-500/10 text-red-300" :
                      f.status === "analyzing" ? "bg-amber-500/10 text-amber-300" :
                      "bg-slate-500/10 text-slate-400"
                    }`}>{f.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{analysis?.methods?.length || f.methodCount || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-400">{analysis?.sqlStatements?.length || f.sqlCount || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-400">{analysis?.tableReferences?.length || "-"}</td>
                  <td className="px-4 py-2.5 text-slate-400">{analysis?.conditions?.length || f.conditionsDetected || "-"}</td>
                </tr>
              );
            })}
            {files.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-600">No files uploaded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
