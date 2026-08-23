/**
 * Test Design — create and manage test scenarios from findings.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useModStore, genId } from "../context";
import { Beaker, Plus, Trash2 } from "lucide-react";

interface TestScenario {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: string;
  expectedBehavior: string;
  findingIds: string[];
  status: "DRAFT" | "REVIEWED" | "APPROVED";
  createdAt: number;
}

export default function ModTestDesign() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch, getProjectFindings } = useModStore();
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [expected, setExpected] = useState("");
  const [category, setCategory] = useState("POSITIVE");
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const findings = getProjectFindings(project!.id);

  function addScenario() {
    if (!title.trim()) return;
    setScenarios((prev) => [
      ...prev,
      { id: genId(), projectId: project!.id, title: title.trim(), description: desc.trim(), category, expectedBehavior: expected.trim(), findingIds: selectedFindings, status: "DRAFT", createdAt: Date.now() },
    ]);
    setTitle(""); setDesc(""); setExpected(""); setSelectedFindings([]); setShowAdd(false);
  }

  function deleteScenario(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Test Design</h1>
          <p className="mt-1 text-xs text-muted-foreground">{scenarios.length} test scenarios</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90">
          <Plus className="size-3" /> New Scenario
        </button>
      </div>

      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <input placeholder="Scenario title" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring" />
          <textarea placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" />
          <textarea placeholder="Expected behavior" value={expected} onChange={(e) => setExpected(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring">
            {["POSITIVE", "NEGATIVE", "BOUNDARY", "NULL", "ERROR_HANDLING", "DATA_COMBINATION", "END_TO_END", "REGRESSION"].map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
            ))}
          </select>
          {findings.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Link to findings (optional):</p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {findings.map((f) => (
                  <label key={f.id} className={`text-[9px] px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                    selectedFindings.includes(f.id) ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:bg-muted"
                  }`}>
                    <input type="checkbox" className="hidden"
                      checked={selectedFindings.includes(f.id)}
                      onChange={() => setSelectedFindings((prev) => prev.includes(f.id) ? prev.filter((x) => x !== f.id) : [...prev, f.id])} />
                    {f.title.slice(0, 30)}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={addScenario} className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90">Create</button>
            <button onClick={() => setShowAdd(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {scenarios.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <Beaker className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No test scenarios yet. Create scenarios based on findings.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scenarios.map((s) => (
            <div key={s.id} className="flex items-start justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s.category.replace(/_/g, " ")}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    s.status === "APPROVED" ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"
                  }`}>{s.status}</span>
                </div>
                <p className="text-xs font-medium mt-1">{s.title}</p>
                {s.description && <p className="text-[10px] text-muted-foreground mt-0.5">{s.description}</p>}
                {s.expectedBehavior && <p className="text-[10px] text-muted-foreground mt-0.5">Expected: {s.expectedBehavior}</p>}
              </div>
              <button onClick={() => deleteScenario(s.id)}
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
