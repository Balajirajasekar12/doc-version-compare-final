/**
 * Knowledge Base — store and manage project knowledge in browser memory.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useModStore, genId } from "../context";
import type { KnowledgeCategory, KnowledgeProvenance } from "../lib/types";
import { BookOpen, Plus, Trash2 } from "lucide-react";

export default function ModKnowledge() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch } = useModStore();
  const [showAdd, setShowAdd] = useState(false);
  const [category, setCategory] = useState<KnowledgeCategory>("BUSINESS_RULE");
  const [fieldName, setFieldName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [provenance, setProvenance] = useState<KnowledgeProvenance>("USER_CONFIRMED");

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const entries = Object.values(state.knowledgeEntries).filter((e) => e.projectId === project!.id);

  function addEntry() {
    if (!fieldName.trim() || !value.trim()) return;
    dispatch({
      type: "ADD_KNOWLEDGE",
      entry: {
        id: genId(), projectId: project!.id, category, fieldName: fieldName.trim(),
        value: value.trim(), description: description.trim(), provenance,
        createdAt: Date.now(), updatedAt: Date.now(),
      },
    });
    setFieldName(""); setValue(""); setDescription(""); setShowAdd(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Knowledge Base</h1>
          <p className="mt-1 text-xs text-muted-foreground">{entries.length} entries · Stored in browser memory</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90"
        >
          <Plus className="size-3" /> Add Knowledge
        </button>
      </div>

      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring">
                {(["LIFECYCLE_CODE","STATUS_CODE","DATA_TYPE","TABLE_RELATIONSHIP","BUSINESS_RULE","FIELD_CONSTRAINT","ENUM_VALUE","OTHER"] as const).map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Provenance</label>
              <select value={provenance} onChange={(e) => setProvenance(e.target.value as KnowledgeProvenance)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring">
                {(["FACT","OBSERVATION","DERIVED","USER_CONFIRMED","UNKNOWN"] as const).map((p) => (
                  <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <input placeholder="Field name" value={fieldName} onChange={(e) => setFieldName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" />
          <input placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" />
          <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" />
          <div className="flex gap-2">
            <button onClick={addEntry} className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90">Add</button>
            <button onClick={() => setShowAdd(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <BookOpen className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No knowledge entries yet. Add information from your analysis.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entry.category.replace(/_/g, " ")}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entry.provenance.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs font-medium mt-1">{entry.fieldName} = {entry.value}</p>
                {entry.description && <p className="text-[10px] text-muted-foreground mt-0.5">{entry.description}</p>}
              </div>
              <button onClick={() => dispatch({ type: "REMOVE_KNOWLEDGE", id: entry.id })}
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
