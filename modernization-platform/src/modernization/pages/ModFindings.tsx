/**
 * Findings — Business View / Technical View toggle with full explanations.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useModStore } from "../context";
import type { Finding, FindingSeverity, FindingStatus } from "../lib/types";
import {
  ChevronDown,
  ChevronUp,
  Copy,  FileSearch,
} from "lucide-react";

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/20",
  HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  MEDIUM: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  LOW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  INFO: "bg-muted text-muted-foreground border-border",
};

const STATUS_COLORS: Record<FindingStatus, string> = {
  OPEN: "bg-amber-500/10 text-amber-400",
  REVIEWED: "bg-muted text-muted-foreground",
  ACCEPTED: "bg-green-500/10 text-green-400",
  INTENTIONAL: "bg-blue-500/10 text-blue-400",
  FALSE_POSITIVE: "bg-muted text-muted-foreground",
  FIX_REQUIRED: "bg-red-500/10 text-red-400",
  NEEDS_INFO: "bg-purple-500/10 text-purple-400",
};

const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  PROVEN: "Proven",
  STRONG_EVIDENCE: "Strong Evidence",
  POSSIBLE: "Possible",
  UNKNOWN: "Unknown",
  MISSING_INFORMATION: "Missing Information",
};

export default function ModFindings() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, getProjectFindings } = useModStore();
  const [viewMode, setViewMode] = useState<"business" | "technical">("business");
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<FindingStatus | "ALL">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);

  const findings = useMemo(
    () => (project ? getProjectFindings(project.id) : []),
    [project, getProjectFindings],
  );
  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== "ALL" && f.severity !== severityFilter) return false;
      if (statusFilter !== "ALL" && f.status !== statusFilter) return false;
      return true;
    });
  }, [findings, severityFilter, statusFilter]);

  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  function updateStatus(findingId: string, status: FindingStatus) {
    dispatch({ type: "UPDATE_FINDING", id: findingId, updates: { status } });
  }

  function copyQuestion(finding: Finding) {
    const q = `Legacy implements ${finding.title.toLowerCase()}.\n\n` +
      `The reviewed MOD source does not clearly show equivalent behavior.\n\n` +
      `Can you confirm where this validation is implemented in MOD?\nIf it has been intentionally removed, please confirm the business reason.`;
    navigator.clipboard.writeText(q);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Findings</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {findings.length} findings · {filtered.length} shown
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setViewMode("business")}
            className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${
              viewMode === "business" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Business View
          </button>
          <button
            onClick={() => setViewMode("technical")}
            className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${
              viewMode === "technical" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Technical View
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as FindingSeverity | "ALL")}
          className="rounded-md border border-border bg-background px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="ALL">All Severities</option>
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FindingStatus | "ALL")}
          className="rounded-md border border-border bg-background px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="ALL">All Statuses</option>
          {(["OPEN", "REVIEWED", "ACCEPTED", "INTENTIONAL", "FALSE_POSITIVE", "FIX_REQUIRED", "NEEDS_INFO"] as const).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {/* Findings List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center space-y-2">
          <FileSearch className="mx-auto size-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            {findings.length === 0 ? "No findings yet. Run analysis to generate findings." : "No findings match the current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((finding) => {
            const isExpanded = expandedId === finding.id;
            const be = finding.businessExplanation;

            return (
              <div key={finding.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Header Row */}
                <button
                  onClick={() => toggleExpand(finding.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-medium ${SEVERITY_COLORS[finding.severity]}`}>
                      {finding.severity}
                    </span>
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded ${STATUS_COLORS[finding.status]}`}>
                      {finding.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs font-medium truncate">{finding.title}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-5">
                    {/* Business View */}
                    {viewMode === "business" && be && (
                      <>
                        {/* Summary */}
                        <div className="rounded-md bg-muted/30 p-3">
                          <p className="text-xs leading-relaxed">{be.summary}</p>
                        </div>

                        {/* Legacy Behavior */}
                        <Section title="What Happens in Legacy?">
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{be.legacyBehavior}</p>
                        </Section>

                        {/* MOD Behavior */}
                        <Section title="What Happens in MOD?">
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{be.modBehavior}</p>
                        </Section>

                        {/* Difference */}
                        <Section title="What Is Different?">
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{be.difference}</p>
                        </Section>

                        {/* Impact */}
                        <Section title="Why Does This Matter?">
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{be.possibleImpact}</p>
                        </Section>

                        {/* Evidence Level */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-muted-foreground">Evidence Level:</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-muted">
                            {EVIDENCE_LEVEL_LABELS[be.evidenceLevel] ?? be.evidenceLevel}
                          </span>
                        </div>

                        {/* Confidence */}
                        <Section title="Confidence Assessment">
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium">{be.confidenceExplanation.level}</span> — {be.confidenceExplanation.reason}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Evidence strength: {be.confidenceExplanation.evidenceStrength}
                          </p>
                        </Section>

                        {/* Business Rules */}
                        {be.businessRules.length > 0 && (
                          <Section title={`Business Rules Identified (${be.businessRules.length})`}>
                            <div className="space-y-2">
                              {be.businessRules.map((rule) => (
                                <div key={rule.id} className="rounded border border-border p-2.5 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-medium">BR-{String(rule.ruleNumber).padStart(3, "0")}</span>
                                    <span className={`text-[9px] px-1 py-0.5 rounded ${
                                      rule.modStatus === "IMPLEMENTED" ? "bg-green-500/10 text-green-400" :
                                      rule.modStatus === "NOT_FOUND" ? "bg-red-500/10 text-red-400" :
                                      "bg-muted text-muted-foreground"
                                    }`}>
                                      MOD: {rule.modStatus.replace(/_/g, " ")}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">{rule.description}</p>
                                  <p className="text-[9px] text-muted-foreground/60">
                                    Source: {rule.sourceFile} L{rule.lineStart}–{rule.lineEnd}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </Section>
                        )}

                        {/* Missing Information */}
                        {be.missingInformation.length > 0 && (
                          <Section title="Information Needed">
                            <div className="space-y-2">
                              {be.missingInformation.map((info) => (
                                <div key={info.id} className="rounded border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1">
                                  <p className="text-[11px] font-medium">{info.whatIsNeeded}</p>
                                  <p className="text-[10px] text-muted-foreground">{info.whyNeeded}</p>
                                  {info.suggestedQuery && (
                                    <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 mt-1 whitespace-pre-wrap">
                                      {info.suggestedQuery}
                                    </pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          </Section>
                        )}

                        {/* Ask Development */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyQuestion(finding)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[10px] font-medium hover:bg-muted transition-colors"
                          >
                            <Copy className="size-3" />
                            What Should I Ask Development?
                          </button>
                        </div>
                      </>
                    )}

                    {/* Technical View */}
                    {viewMode === "technical" && (
                      <>
                        <Section title="Finding Details">
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div><span className="text-muted-foreground">Type:</span> {finding.findingType.replace(/_/g, " ")}</div>
                            <div><span className="text-muted-foreground">Severity:</span> {finding.severity}</div>
                            <div><span className="text-muted-foreground">Confidence:</span> {finding.confidence}</div>
                            <div><span className="text-muted-foreground">Status:</span> {finding.status.replace(/_/g, " ")}</div>
                          </div>
                        </Section>

                        <Section title="Description">
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{finding.description}</p>
                        </Section>

                        {/* Legacy Evidence */}
                        {finding.legacyEvidence.length > 0 && (
                          <Section title="Legacy Evidence">
                            {finding.legacyEvidence.map((ev, i) => (
                              <div key={i} className="rounded border border-border p-2.5 mb-2 space-y-1">
                                <p className="text-[10px] font-medium">{ev.fileName} L{ev.lineStart}–{ev.lineEnd}</p>
                                <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                                  {ev.snippet}
                                </pre>
                              </div>
                            ))}
                          </Section>
                        )}

                        {/* MOD Evidence */}
                        {finding.modEvidence.length > 0 && (
                          <Section title="MOD Evidence">
                            {finding.modEvidence.map((ev, i) => (
                              <div key={i} className="rounded border border-border p-2.5 mb-2 space-y-1">
                                <p className="text-[10px] font-medium">{ev.fileName} L{ev.lineStart}–{ev.lineEnd}</p>
                                <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                                  {ev.snippet}
                                </pre>
                              </div>
                            ))}
                          </Section>
                        )}
                      </>
                    )}

                    {/* Status Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <span className="text-[10px] text-muted-foreground">Set status:</span>
                      {(["OPEN", "ACCEPTED", "INTENTIONAL", "FALSE_POSITIVE", "FIX_REQUIRED", "NEEDS_INFO"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(finding.id, s)}
                          className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                            finding.status === s
                              ? "bg-foreground text-background"
                              : "border border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {s.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium">{title}</h3>
      {children}
    </div>
  );
}
