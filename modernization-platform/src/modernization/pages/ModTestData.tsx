/**
 * Test Data Management — manage test data linked to test cases with source tracking.
 * All data in React Context (browser memory).
 */

import { useState } from "react";
import { useParams } from "react-router";
import { useModStore, genId } from "../context";
import type { TestDataEntry, TestDataSource } from "../lib/types";
import { Plus, Trash2 } from "lucide-react";

const SOURCES: { value: TestDataSource; label: string }[] = [
  { value: "HISTORICAL", label: "Historical" },
  { value: "SCHEMA", label: "Schema" },
  { value: "CODE", label: "Code" },
  { value: "USER_CONFIRMED", label: "User Confirmed" },
  { value: "GENERATED", label: "Generated" },
];

export default function ModTestData() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch } = useModStore();
  const [showCreate, setShowCreate] = useState(false);
  const [testcaseId, setTestcaseId] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState<TestDataSource>("USER_CONFIRMED");
  const [sourceDetail, setSourceDetail] = useState("");

  const pid = projectId ?? "";
  const project = state.projects.find((p) => p.id === pid);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const testDataEntries = Object.values(state.testDataEntries).filter((e) => e.projectId === pid);
  const testCases = Object.values(state.testCases).filter((tc) => tc.projectId === pid);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fieldName.trim() || !value.trim()) return;
    const entry: TestDataEntry = {
      id: genId(),
      projectId: pid,
      testcaseId: testcaseId.trim() || undefined,
      fieldName: fieldName.trim(),
      value: value.trim(),
      source,
      sourceDetail: sourceDetail.trim() || undefined,
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_TEST_DATA_ENTRY", entry });
    setFieldName("");
    setValue("");
    setSourceDetail("");
    setShowCreate(false);
  }

  function sourceColor(s: string): string {
    switch (s) {
      case "USER_CONFIRMED": return "bg-green-500/10 text-green-400";
      case "CONFIRMED": return "bg-green-500/10 text-green-400";
      case "HISTORICAL": return "bg-blue-500/10 text-blue-400";
      case "SCHEMA": return "bg-purple-500/10 text-purple-400";
      case "CODE": return "bg-amber-500/10 text-amber-400";
      default: return "bg-muted text-muted-foreground";
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Test Data Management</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage test data linked to test cases with source tracking
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 transition-opacity"
        >
          <Plus className="size-3" /> Add Test Data
        </button>
      </div>

      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-5">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Add Test Data</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Test Case (optional)</label>
                <select
                  value={testcaseId}
                  onChange={(e) => setTestcaseId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Not linked</option>
                  {testCases.map((tc) => (
                    <option key={tc.id} value={tc.testcaseId}>
                      {tc.testcaseId} — {tc.description.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as TestDataSource)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Field Name *</label>
                <input
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="e.g. claim_amount, status_code"
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Value *</label>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 1500.00, ACTIVE"
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Source Detail</label>
                <input
                  value={sourceDetail}
                  onChange={(e) => setSourceDetail(e.target.value)}
                  placeholder="Where this test data came from"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!fieldName.trim() || !value.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Add Entry
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Data Table */}
      {testDataEntries.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <p className="text-xs text-muted-foreground">
            No test data entries yet. Add test data to link values to test cases.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 font-medium text-muted-foreground">Test Case</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Field</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Value</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Source</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Detail</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {testDataEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30 text-[11px]">
                  <td className="px-3 py-2 text-muted-foreground">{entry.testcaseId || "—"}</td>
                  <td className="px-3 py-2">{entry.fieldName}</td>
                  <td className="px-3 py-2 font-mono">{entry.value}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${sourceColor(entry.source)}`}>
                      {entry.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{entry.sourceDetail || "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        if (confirm("Delete this test data entry?")) {
                          dispatch({ type: "REMOVE_TEST_DATA_ENTRY", id: entry.id });
                        }
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
