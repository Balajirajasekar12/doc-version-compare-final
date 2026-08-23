/**
 * Business Rules — manage business rules identified during analysis.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useModStore, genId } from "../context";
import type { BusinessRuleEntry } from "../lib/types";
import { Plus, Shield, Trash2 } from "lucide-react";

export default function ModRules() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch } = useModStore();
  const [showAdd, setShowAdd] = useState(false);
  const [ruleId, setRuleId] = useState("");
  const [desc, setDesc] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<BusinessRuleEntry["status"]>("IDENTIFIED");

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const rules = Object.values(state.businessRuleEntries).filter((r) => r.projectId === project!.id);

  function addRule() {
    if (!ruleId.trim() || !desc.trim()) return;
    dispatch({
      type: "ADD_BUSINESS_RULE",
      entry: {
        id: genId(), projectId: project!.id, ruleId: ruleId.trim(), description: desc.trim(),
        source: source.trim() || "Manual", status, confidence: "UNKNOWN",
        createdAt: Date.now(), updatedAt: Date.now(),
      },
    });
    setRuleId(""); setDesc(""); setSource(""); setShowAdd(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Business Rules</h1>
          <p className="mt-1 text-xs text-muted-foreground">{rules.length} rules identified</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90">
          <Plus className="size-3" /> Add Rule
        </button>
      </div>

      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <input placeholder="Rule ID (e.g., BR-001)" value={ruleId} onChange={(e) => setRuleId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" />
          <textarea placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" />
          <input placeholder="Source (e.g., PKG_CHARGE_PREPARATION.sql L18)" value={source} onChange={(e) => setSource(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" />
          <select value={status} onChange={(e) => setStatus(e.target.value as BusinessRuleEntry["status"])}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring">
            {(["IDENTIFIED","CONFIRMED","IN_MOD","MISSING_IN_MOD","INTENTIONAL_CHANGE","UNKNOWN"] as const).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={addRule} className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90">Add</button>
            <button onClick={() => setShowAdd(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <Shield className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No business rules yet. Run analysis to extract rules from code.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium">{rule.ruleId}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    rule.status === "CONFIRMED" ? "bg-green-500/10 text-green-400" :
                    rule.status === "MISSING_IN_MOD" ? "bg-red-500/10 text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{rule.status.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                {rule.source && <p className="text-[9px] text-muted-foreground/60 mt-0.5">Source: {rule.source}</p>}
              </div>
              <button onClick={() => dispatch({ type: "REMOVE_BUSINESS_RULE", id: rule.id })}
                className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 ml-3">
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
