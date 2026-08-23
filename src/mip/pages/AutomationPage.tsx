// ============================================================
// MIP Automation Page - Generate automation cases, import results
// ============================================================

import React, { useState, useRef } from "react";
import { useMip } from "../context";
import { Bot, Plus, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function AutomationPage() {
  const { state, generateAutomationCases } = useMip();
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    if (selectedCases.length === 0) return;
    setGenerating(true);
    try {
      await generateAutomationCases(selectedCases);
      setSelectedCases([]);
    } finally {
      setGenerating(false);
    }
  };

  const toggleCase = (id: string) => {
    setSelectedCases(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleImportResults = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      // Try JSON first
      if (file.name.endsWith(".json")) {
        const data = JSON.parse(text);
        console.log("Imported automation results:", data);
      }
      // Try JUnit XML
      if (file.name.endsWith(".xml")) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const testcases = doc.querySelectorAll("testcase");
        console.log("Imported JUnit results:", testcases.length, "test cases");
      }
    } catch (err) {
      console.error("Failed to parse automation results:", err);
    }
    e.target.value = "";
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <Bot size={18} className="text-cyan-400" /> Automation
          </h1>
          <p className="mt-1 text-sm text-slate-400">Automation test cases and result import (JUnit XML, JSON)</p>
        </div>
        <div className="flex gap-2">
          <input ref={importRef} type="file" accept=".xml,.json,.txt" className="hidden" onChange={handleImportResults} />
          <button onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.07]">
            <Upload size={12} /> Import Results
          </button>
        </div>
      </div>

      {/* Generate from manual test cases */}
      <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
        <h3 className="text-xs font-semibold text-cyan-300">Generate Automation Cases</h3>
        <p className="mt-1 text-xs text-slate-400">Select manual test cases to generate corresponding automation cases.</p>
        <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {state.testCases.map(tc => (
            <label key={tc.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-1.5 cursor-pointer hover:bg-white/[0.04]">
              <input type="checkbox" checked={selectedCases.includes(tc.id)} onChange={() => toggleCase(tc.id)}
                className="rounded border-white/20 bg-white/[0.03]" />
              <span className="text-[10px] font-mono text-cyan-300">{tc.caseNumber}</span>
              <span className="text-xs text-slate-300">{tc.title}</span>
            </label>
          ))}
          {state.testCases.length === 0 && <p className="text-xs text-slate-600">Generate manual test cases first.</p>}
        </div>
        <button onClick={handleGenerate} disabled={selectedCases.length === 0 || generating}
          className="mt-3 flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-[#07090d] hover:bg-cyan-400 disabled:opacity-50">
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
          Generate Automation Cases ({selectedCases.length})
        </button>
      </div>

      {/* Automation cases list */}
      <div className="mt-6 space-y-2">
        {state.automationCases.map(ac => (
          <div key={ac.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-purple-300">{ac.automationId}</span>
              {ac.manualTestCaseId && (
                <span className="text-[10px] text-slate-500">← {state.testCases.find(t => t.id === ac.manualTestCaseId)?.caseNumber}</span>
              )}
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
                ac.status === "pass" ? "bg-emerald-500/10 text-emerald-300" :
                ac.status === "fail" ? "bg-red-500/10 text-red-300" :
                "bg-slate-500/10 text-slate-400"
              }`}>{ac.status}</span>
            </div>
            <h3 className="mt-1 text-sm font-medium text-white">{ac.scenario}</h3>
            <p className="mt-0.5 text-xs text-slate-400">Expected: {ac.expectedResult}</p>
            {ac.assertions.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {ac.assertions.map((a, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px] text-slate-500">
                    <CheckCircle2 size={10} /> {a}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {state.automationCases.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <Bot size={32} className="mx-auto text-slate-600" />
            <p className="mt-2 text-sm text-slate-400">No automation cases generated yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
