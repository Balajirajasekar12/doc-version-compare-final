// ============================================================
// MIP Test Data Management Page
// ============================================================

import React, { useState, useRef } from "react";
import { useMip } from "../context";
import type { TestDataRecord, TestDataCategory } from "../types";
import { Database, Plus, Upload, Filter } from "lucide-react";
import * as XLSX from "xlsx";

export default function TestDataPage() {
  const { state, dispatch } = useMip();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ field: "", value: "", dataType: "string", category: "positive" as TestDataCategory, notes: "" });
  const profileRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    if (!form.field.trim()) return;
    const record: TestDataRecord = {
      id: `td_${Date.now()}`,
      projectId: state.currentProjectId || "",
      field: form.field,
      value: form.value,
      dataType: form.dataType,
      source: "manual",
      notes: form.notes,
      category: form.category,
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_TEST_DATA", payload: record });
    setForm({ field: "", value: "", dataType: "string", category: "positive", notes: "" });
    setShowAdd(false);
  };

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      for (const col of cols) {
        const values = rows.map(r => String(r[col] ?? "")).filter(Boolean);
        const distinct = new Set(values);
        const nullCount = rows.length - values.length;
        const record: TestDataRecord = {
          id: `td_${Date.now()}_${col}`,
          projectId: state.currentProjectId || "",
          field: col,
          value: [...distinct].slice(0, 10).join(", "),
          dataType: typeof rows[0][col] === "number" ? "number" : "string",
          source: file.name,
          notes: `${distinct.size} distinct values, ${nullCount} nulls, ${rows.length} total rows`,
          category: "historical",
          minLength: Math.min(...values.map(v => v.length)),
          maxLength: Math.max(...values.map(v => v.length)),
          createdAt: Date.now(),
        };
        dispatch({ type: "ADD_TEST_DATA", payload: record });
      }
    }
    e.target.value = "";
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <Database size={18} className="text-cyan-400" /> Test Data Management
          </h1>
          <p className="mt-1 text-sm text-slate-400">Manage test data including positive, negative, boundary, and historical data</p>
        </div>
        <div className="flex gap-2">
          <input ref={profileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleProfileUpload} />
          <button onClick={() => profileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.07]">
            <Upload size={12} /> Upload TOAD Results
          </button>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20">
            <Plus size={14} /> Add Test Data
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={form.field} onChange={e => setForm({...form, field: e.target.value})} placeholder="Field name"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
            <input value={form.value} onChange={e => setForm({...form, value: e.target.value})} placeholder="Value"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value as TestDataCategory})}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 outline-none">
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="boundary">Boundary</option>
              <option value="null">Null</option>
              <option value="duplicate">Duplicate</option>
              <option value="historical">Historical</option>
              <option value="special_char">Special Characters</option>
              <option value="invalid_format">Invalid Format</option>
            </select>
          </div>
          <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400">Cancel</button>
            <button onClick={handleAdd} disabled={!form.field.trim()} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-[#07090d] disabled:opacity-50">Save</button>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="px-4 py-2.5 font-medium text-slate-400">Field</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Value</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Type</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Category</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Source</th>
              <th className="px-4 py-2.5 font-medium text-slate-400">Notes</th>
            </tr>
          </thead>
          <tbody>
            {state.testData.map(td => (
              <tr key={td.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-4 py-2 font-medium text-white">{td.field}</td>
                <td className="px-4 py-2 text-slate-300 max-w-xs truncate">{td.value}</td>
                <td className="px-4 py-2 text-slate-500">{td.dataType}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    td.category === "positive" ? "bg-emerald-500/10 text-emerald-300" :
                    td.category === "negative" ? "bg-red-500/10 text-red-300" :
                    td.category === "boundary" ? "bg-amber-500/10 text-amber-300" :
                    td.category === "historical" ? "bg-blue-500/10 text-blue-300" :
                    "bg-slate-500/10 text-slate-400"
                  }`}>{td.category}</span>
                </td>
                <td className="px-4 py-2 text-slate-500">{td.source}</td>
                <td className="px-4 py-2 text-slate-500 max-w-xs truncate">{td.notes}</td>
              </tr>
            ))}
            {state.testData.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-600">No test data records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
