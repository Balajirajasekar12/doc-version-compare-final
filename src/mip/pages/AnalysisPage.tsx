// ============================================================
// MIP System Analysis Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { GitCompareArrows, Code2, Database, AlertTriangle, BookOpen, Clock, Zap, Search } from "lucide-react";

export default function AnalysisPage() {
  const { state } = useMip();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "conditions" | "sql" | "rules">("overview");

  const analyzedFiles = state.sourceFiles.filter(f => f.status === "analyzed");
  const analysis = selectedFile ? state.analyses.find(a => a.fileId === selectedFile) : null;
  const selectedSourceFile = selectedFile ? state.sourceFiles.find(f => f.id === selectedFile) : null;

  // Aggregate stats
  const totalConditions = state.analyses.reduce((s, a) => s + a.conditions.length, 0);
  const totalSql = state.analyses.reduce((s, a) => s + a.sqlStatements.length, 0);
  const totalRules = state.analyses.reduce((s, a) => s + a.businessRules.length, 0);
  const totalTables = new Set(state.analyses.flatMap(a => a.tableReferences.map(t => t.name))).size;

  return (
    <div className="flex h-full">
      {/* File list sidebar */}
      <div className="w-64 shrink-0 border-r border-white/[0.06] overflow-y-auto">
        <div className="p-3 border-b border-white/[0.06]">
          <h2 className="text-xs font-semibold text-slate-300">Analyzed Files ({analyzedFiles.length})</h2>
        </div>
        <div className="p-2 space-y-0.5">
          {analyzedFiles.map(f => (
            <button key={f.id} onClick={() => setSelectedFile(f.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                selectedFile === f.id ? "bg-cyan-500/10 text-cyan-300" : "text-slate-400 hover:bg-white/[0.03]"
              }`}>
              <div className="truncate font-medium">{f.name}</div>
              <div className="mt-0.5 text-[10px] text-slate-600">{f.language} · {f.side}</div>
            </button>
          ))}
          {analyzedFiles.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-slate-600">
              No files analyzed yet. Upload and analyze files first.
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {!analysis ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <GitCompareArrows size={40} className="mx-auto text-slate-600" />
              <h2 className="mt-3 text-sm font-medium text-slate-400">Select a file to view analysis</h2>
              <p className="mt-1 text-xs text-slate-600">{analyzedFiles.length} files available</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {/* File header */}
            <div className="flex items-center gap-3">
              <Code2 size={18} className="text-cyan-400" />
              <div>
                <h1 className="text-lg font-bold text-white">{selectedSourceFile?.name}</h1>
                <p className="text-xs text-slate-400">{analysis.language} · {analysis.side} · {analysis.fileId.slice(0, 12)}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5 w-fit">
              {(["overview", "conditions", "sql", "rules"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1 text-xs capitalize transition-colors ${tab === t ? "bg-cyan-500 text-[#07090d]" : "text-slate-400 hover:text-white"}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="mt-4">
              {tab === "overview" && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Classes", value: analysis.classes.length, icon: Code2 },
                    { label: "Methods", value: analysis.methods.length, icon: Code2 },
                    { label: "SQL Statements", value: analysis.sqlStatements.length, icon: Database },
                    { label: "Conditions", value: analysis.conditions.length, icon: AlertTriangle },
                    { label: "Business Rules", value: analysis.businessRules.length, icon: BookOpen },
                    { label: "Validations", value: analysis.validations.length, icon: AlertTriangle },
                    { label: "Error Handlers", value: analysis.errorHandlers.length, icon: AlertTriangle },
                    { label: "Table References", value: analysis.tableReferences.length, icon: Database },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">{item.label}</span>
                        <item.icon size={12} className="text-slate-600" />
                      </div>
                      <div className="mt-1 text-xl font-bold text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "conditions" && (
                <div className="space-y-1.5">
                  {analysis.conditions.length === 0 ? (
                    <p className="text-xs text-slate-600 py-4">No conditions detected.</p>
                  ) : analysis.conditions.map((c, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          c.type === "if" ? "bg-blue-500/10 text-blue-300" :
                          c.type === "case" || c.type === "when" ? "bg-purple-500/10 text-purple-300" :
                          c.type.includes("check") ? "bg-amber-500/10 text-amber-300" :
                          "bg-slate-500/10 text-slate-400"
                        }`}>{c.type}</span>
                        {c.line && <span className="text-[10px] text-slate-600">Line {c.line}</span>}
                      </div>
                      <code className="mt-1 block text-slate-300 break-all">{c.expression}</code>
                    </div>
                  ))}
                </div>
              )}

              {tab === "sql" && (
                <div className="space-y-1.5">
                  {analysis.sqlStatements.length === 0 ? (
                    <p className="text-xs text-slate-600 py-4">No SQL statements detected.</p>
                  ) : analysis.sqlStatements.map((sql, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          sql.type === "SELECT" ? "bg-emerald-500/10 text-emerald-300" :
                          sql.type === "INSERT" || sql.type === "UPDATE" || sql.type === "DELETE" ? "bg-amber-500/10 text-amber-300" :
                          "bg-slate-500/10 text-slate-400"
                        }`}>{sql.type}</span>
                        {sql.tables.length > 0 && (
                          <span className="text-[10px] text-slate-500">Tables: {sql.tables.join(", ")}</span>
                        )}
                      </div>
                      <code className="mt-1 block text-slate-300 break-all whitespace-pre-wrap">{sql.raw}</code>
                    </div>
                  ))}
                </div>
              )}

              {tab === "rules" && (
                <div className="space-y-1.5">
                  {analysis.businessRules.length === 0 ? (
                    <p className="text-xs text-slate-600 py-4">No business rules detected.</p>
                  ) : analysis.businessRules.map((rule, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          rule.confidence === "confirmed" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
                        }`}>{rule.confidence}</span>
                        {rule.line && <span className="text-[10px] text-slate-600">Line {rule.line}</span>}
                      </div>
                      <p className="mt-1 text-slate-300">{rule.description}</p>
                      <code className="mt-1 block text-[10px] text-slate-500">{rule.condition}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
