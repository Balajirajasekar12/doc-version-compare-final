// ============================================================
// MIP Findings Page
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import type { Finding, FindingStatus, FindingSeverity, FindingCategory } from "../types";
import { AlertTriangle, Filter, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, HelpCircle, Shield, AlertCircle } from "lucide-react";

const STATUS_OPTIONS: { value: FindingStatus; label: string; color: string }[] = [
  { value: "open", label: "Open", color: "bg-slate-500/10 text-slate-400" },
  { value: "valid_issue", label: "Valid Issue", color: "bg-red-500/10 text-red-300" },
  { value: "intentionally_missed", label: "Intentionally Missed", color: "bg-blue-500/10 text-blue-300" },
  { value: "deferred", label: "Deferred", color: "bg-amber-500/10 text-amber-300" },
  { value: "accepted", label: "Accepted Difference", color: "bg-purple-500/10 text-purple-300" },
  { value: "resolved", label: "Resolved", color: "bg-emerald-500/10 text-emerald-300" },
  { value: "needs_investigation", label: "Needs Investigation", color: "bg-orange-500/10 text-orange-300" },
];

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  low: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  info: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function FindingCard({ finding }: { finding: Finding }) {
  const { classifyFinding } = useMip();
  const [expanded, setExpanded] = useState(false);
  const [showClassify, setShowClassify] = useState(false);

  const statusOpt = STATUS_OPTIONS.find(s => s.value === finding.status);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setExpanded(!expanded)} className="mt-0.5 shrink-0 text-slate-500">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[finding.severity]}`}>
              {finding.severity}
            </span>
            <span className="text-[10px] text-slate-500">{finding.category.replace(/_/g, " ")}</span>
            {finding.confidence && (
              <span className={`text-[10px] ${finding.confidence === "confirmed" ? "text-emerald-400" : finding.confidence === "inferred" ? "text-amber-400" : "text-slate-500"}`}>
                {finding.confidence}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-medium text-white">{finding.title}</h3>
          <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{finding.description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusOpt?.color || ""}`}>
            {statusOpt?.label || finding.status}
          </span>
          <button onClick={() => setShowClassify(!showClassify)} className="rounded p-1 text-slate-500 hover:text-cyan-400">
            <Shield size={14} />
          </button>
        </div>
      </div>

      {/* Classification buttons */}
      {showClassify && (
        <div className="border-t border-white/[0.06] px-4 py-2 flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => { classifyFinding(finding.id, opt.value); setShowClassify(false); }}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors ${
                finding.status === opt.value ? "ring-1 ring-cyan-500 " : ""
              } ${opt.color} hover:opacity-80`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-3 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Legacy Behavior</span>
              <p className="mt-1 text-slate-300">{finding.legacyBehavior}</p>
            </div>
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Modern Behavior</span>
              <p className="mt-1 text-slate-300">{finding.modernBehavior}</p>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">What Changed</span>
            <p className="mt-1 text-slate-300">{finding.whatChanged}</p>
          </div>
          {finding.whatIsMissing && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">What Is Missing</span>
              <p className="mt-1 text-slate-300">{finding.whatIsMissing}</p>
            </div>
          )}
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Business Impact</span>
            <p className="mt-1 text-amber-300">{finding.businessImpact}</p>
          </div>
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Recommendation</span>
            <p className="mt-1 text-cyan-300">{finding.recommendation}</p>
          </div>
          {finding.legacySource && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span>Legacy: {finding.legacySource.fileName}{finding.legacySource.line ? `:${finding.legacySource.line}` : ""}</span>
              {finding.modernSource && <span>→ Modern: {finding.modernSource.fileName}{finding.modernSource.line ? `:${finding.modernSource.line}` : ""}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FindingsPage() {
  const { state } = useMip();
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<FindingStatus | "all">("all");

  const filtered = state.findings
    .filter(f => severityFilter === "all" || f.severity === severityFilter)
    .filter(f => statusFilter === "all" || f.status === statusFilter);

  const statusCounts = STATUS_OPTIONS.map(opt => ({
    ...opt,
    count: state.findings.filter(f => f.status === opt.value).length,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <AlertTriangle size={18} className="text-cyan-400" /> Findings
          </h1>
          <p className="mt-1 text-sm text-slate-400">{state.findings.length} findings detected</p>
        </div>
      </div>

      {/* Status summary chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {statusCounts.map(sc => (
          <button key={sc.value} onClick={() => setStatusFilter(statusFilter === sc.value ? "all" : sc.value)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
              statusFilter === sc.value ? "ring-1 ring-cyan-500 " : ""
            } ${sc.color}`}>
            {sc.label}: {sc.count}
          </button>
        ))}
      </div>

      {/* Severity filter */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px] text-slate-500">Severity:</span>
        {(["all", "critical", "high", "medium", "low", "info"] as const).map(s => (
          <button key={s} onClick={() => setSeverityFilter(s)}
            className={`rounded px-2 py-0.5 text-[10px] capitalize transition-colors ${
              severityFilter === s ? "bg-cyan-500 text-[#07090d]" : "text-slate-500 hover:text-white"
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* Findings list */}
      <div className="mt-4 space-y-2">
        {filtered.map(f => <FindingCard key={f.id} finding={f} />)}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <CheckCircle2 size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No findings match current filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
