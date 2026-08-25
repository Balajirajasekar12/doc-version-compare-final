// ============================================================
// MIP Findings Page - Business-Friendly Difference Explanations
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import type { Finding, FindingStatus, FindingSeverity, FindingCategory, BusinessExplanation, ExtractedBusinessRule, MissingInformation } from "../types";
import { AlertTriangle, Filter, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Shield, AlertCircle, Copy, HelpCircle, BookOpen, FileText, MessageCircle, Eye, Code } from "lucide-react";

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

const CATEGORY_LABELS: Record<string, string> = {
  logic_missing: "Missing Functionality",
  logic_changed: "Changed Behavior",
  validation_removed: "Missing Validation",
  validation_changed: "Changed Validation",
  error_handling_removed: "Missing Error Handling",
  db_operation_changed: "Changed Database Operation",
  table_mapping_changed: "Changed Table Mapping",
  field_mapping_changed: "Changed Field Mapping",
  condition_removed: "Missing Condition",
  condition_added: "Added Condition",
  missing_functionality: "Missing Functionality",
  changed_behavior: "Changed Behavior",
  missing_validation: "Missing Validation",
  external_rule: "External Rule",
  unknown: "Unknown",
};

// ============================================================
// Business Rule Row
// ============================================================

function BusinessRuleRow({ rule }: { rule: ExtractedBusinessRule }) {
  const statusColors: Record<string, string> = {
    not_found: "bg-red-500/10 text-red-300",
    found: "bg-emerald-500/10 text-emerald-300",
    confirmed: "bg-emerald-500/10 text-emerald-300",
    unknown: "bg-slate-500/10 text-slate-400",
    intentionally_removed: "bg-blue-500/10 text-blue-300",
  };
  const confColors: Record<string, string> = {
    high: "text-emerald-400",
    medium: "text-amber-400",
    low: "text-slate-500",
  };

  return (
    <div className="flex items-start gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
      <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300">{rule.ruleNumber}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white">{rule.title}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">{rule.description}</p>
        <div className="mt-1 flex items-center gap-3 text-[10px]">
          <span className="text-slate-500">Source: {rule.sourceRef}</span>
          <span className={confColors[rule.confidence] || "text-slate-500"}>{rule.confidence} confidence</span>
          <span className={`rounded px-1.5 py-0.5 ${statusColors[rule.statusInMod] || "bg-slate-500/10 text-slate-400"}`}>
            MOD: {rule.statusInMod.replace(/_/g, " ")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Missing Information Item
// ============================================================

function MissingInfoItem({ item }: { item: MissingInformation }) {
  const typeLabels: Record<string, string> = {
    table_schema: "Table Schema",
    sample_data: "Sample Data",
    clob_content: "CLOB/Config Data",
    configuration: "Configuration",
    java_class: "Java Class",
    sql_query: "SQL Query",
    status_code_meaning: "Status Code Meaning",
    other: "Other",
  };
  return (
    <div className="rounded-lg bg-amber-500/[0.05] border border-amber-500/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertCircle size={12} className="text-amber-400" />
        <span className="text-[10px] font-medium text-amber-300">{typeLabels[item.type] || item.type}</span>
      </div>
      <p className="mt-1 text-xs text-slate-300">{item.description}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">Why needed: {item.whyNeeded}</p>
      {item.suggestedQuery && (
        <pre className="mt-1 rounded bg-white/[0.03] p-2 text-[10px] text-slate-400 font-mono whitespace-pre-wrap">{item.suggestedQuery}</pre>
      )}
    </div>
  );
}

// ============================================================
// Business View Panel
// ============================================================

function BusinessViewPanel({ finding, explanation }: { finding: Finding; explanation: BusinessExplanation }) {
  const [showRules, setShowRules] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyQuestion = () => {
    navigator.clipboard.writeText(explanation.suggestedQuestionForDev);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Plain English Summary */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Summary</h4>
        <p className="mt-2 text-sm text-white leading-relaxed">{explanation.plainEnglishSummary}</p>
      </div>

      {/* 1. What Legacy Does */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-[9px] font-bold text-amber-300">1</span>
          What Happens in Legacy?
        </h4>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{explanation.whatLegacyDoes}</p>
      </div>

      {/* 2. What MOD Does */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500/20 text-[9px] font-bold text-cyan-300">2</span>
          What Happens in MOD?
        </h4>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{explanation.whatModDoes}</p>
      </div>

      {/* 3. What Is Different */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-[9px] font-bold text-red-300">3</span>
          What Is Different?
        </h4>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{explanation.whatIsDifferent}</p>
      </div>

      {/* 4. Why Does This Matter */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500/20 text-[9px] font-bold text-orange-300">4</span>
          Why Does This Matter?
        </h4>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{explanation.whyItMatters}</p>
      </div>

      {/* 5. Possible Impact */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-500/20 text-[9px] font-bold text-purple-300">5</span>
          Possible Impact
        </h4>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed">{explanation.possibleImpact}</p>
      </div>

      {/* 6. Simple Example */}
      {explanation.simpleExample && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-300">6</span>
            Simple Example
          </h4>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{explanation.simpleExample}</p>
        </div>
      )}

      {/* Confidence Explanation */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Why This Confidence?</h4>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">{explanation.confidenceExplanation}</p>
      </div>

      {/* Missing Information */}
      {explanation.missingInformation.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
          <button onClick={() => setShowMissing(!showMissing)} className="flex w-full items-center justify-between">
            <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              <AlertCircle size={12} />
              What Information Is Missing? ({explanation.missingInformation.length})
            </h4>
            {showMissing ? <ChevronUp size={14} className="text-amber-400" /> : <ChevronDown size={14} className="text-amber-400" />}
          </button>
          {showMissing && (
            <div className="mt-3 space-y-2">
              {explanation.missingInformation.map((item, i) => (
                <MissingInfoItem key={i} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Extracted Business Rules */}
      {explanation.extractedRules.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <button onClick={() => setShowRules(!showRules)} className="flex w-full items-center justify-between">
            <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <BookOpen size={12} />
              Business Rules Identified ({explanation.extractedRules.length})
            </h4>
            {showRules ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </button>
          {showRules && (
            <div className="mt-3 space-y-1.5">
              {explanation.extractedRules.map(rule => (
                <BusinessRuleRow key={rule.id} rule={rule} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 pt-2">
        <button onClick={copyQuestion}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-1.5 text-[11px] text-cyan-300 hover:bg-cyan-500/10">
          <MessageCircle size={12} />
          {copied ? "Copied!" : "What Should I Ask Development?"}
        </button>
        <button className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-1.5 text-[11px] text-amber-300 hover:bg-amber-500/10">
          <HelpCircle size={12} />
          What Information Do You Need?
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Technical View Panel
// ============================================================

function TechnicalViewPanel({ finding }: { finding: Finding }) {
  return (
    <div className="space-y-3 text-xs">
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
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Technical Impact</span>
        <p className="mt-1 text-slate-300">{finding.technicalImpact}</p>
      </div>
      <div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Recommendation</span>
        <p className="mt-1 text-cyan-300">{finding.recommendation}</p>
      </div>
      {finding.legacySource && (
        <div className="rounded-lg bg-white/[0.02] p-3">
          <span className="text-[10px] font-medium text-slate-500">Source References</span>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
            <FileText size={10} /> Legacy: {finding.legacySource.fileName}{finding.legacySource.line ? `:${finding.legacySource.line}` : ""}
            {finding.modernSource && (
              <>
                <span className="text-slate-600">→</span>
                <FileText size={10} /> MOD: {finding.modernSource.fileName}{finding.modernSource.line ? `:${finding.modernSource.line}` : ""}
              </>
            )}
          </div>
          {finding.legacySource.codeSnippet && (
            <pre className="mt-2 rounded bg-white/[0.03] p-2 text-[10px] text-slate-400 font-mono whitespace-pre-wrap">{finding.legacySource.codeSnippet}</pre>
          )}
        </div>
      )}
      <div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">User Decision</span>
        <p className="mt-1 text-slate-400">{finding.userDecision || "Not yet decided"}</p>
      </div>
    </div>
  );
}

// ============================================================
// Finding Card
// ============================================================

function FindingCard({ finding }: { finding: Finding }) {
  const { classifyFinding } = useMip();
  const [expanded, setExpanded] = useState(false);
  const [showClassify, setShowClassify] = useState(false);
  const [viewMode, setViewMode] = useState<"business" | "technical">("business");

  const statusOpt = STATUS_OPTIONS.find(s => s.value === finding.status);
  const explanation = finding.businessExplanation;
  const catLabel = CATEGORY_LABELS[finding.category] || finding.category.replace(/_/g, " ");

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
            <span className="text-[10px] text-slate-500">{catLabel}</span>
            {explanation?.functionality && (
              <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300">{explanation.functionality}</span>
            )}
            <span className={`text-[10px] ${finding.confidence === "confirmed" ? "text-emerald-400" : finding.confidence === "inferred" ? "text-amber-400" : "text-slate-500"}`}>
              {finding.confidence} confidence
            </span>
          </div>
          <h3 className="mt-1 text-sm font-medium text-white">{finding.title}</h3>
          {/* Show plain English summary in collapsed state if available */}
          {!expanded && explanation && (
            <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{explanation.plainEnglishSummary}</p>
          )}
          {!expanded && !explanation && (
            <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{finding.description}</p>
          )}
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
        <div className="border-t border-white/[0.06] p-4">
          {/* View toggle */}
          <div className="mb-4 flex items-center gap-1 rounded-lg bg-white/[0.03] p-0.5">
            <button onClick={() => setViewMode("business")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                viewMode === "business" ? "bg-cyan-500 text-[#07090d]" : "text-slate-400 hover:text-white"
              }`}>
              <Eye size={12} /> Business View
            </button>
            <button onClick={() => setViewMode("technical")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                viewMode === "technical" ? "bg-cyan-500 text-[#07090d]" : "text-slate-400 hover:text-white"
              }`}>
              <Code size={12} /> Technical View
            </button>
          </div>

          {viewMode === "business" && explanation ? (
            <BusinessViewPanel finding={finding} explanation={explanation} />
          ) : (
            <TechnicalViewPanel finding={finding} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

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

  const businessReady = state.findings.filter(f => f.businessExplanation).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <AlertTriangle size={18} className="text-cyan-400" /> Findings
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {state.findings.length} findings detected
            {businessReady > 0 && <span className="ml-2 text-cyan-400">• {businessReady} with business explanations</span>}
          </p>
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
