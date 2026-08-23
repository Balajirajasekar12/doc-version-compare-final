// ============================================================
// MIP Reports Page - Client-side report generation and export
// ============================================================

import React, { useState } from "react";
import { useMip } from "../context";
import { FileBarChart, Download, FileText, AlertTriangle, BookOpen, TestTubes, BarChart3, Link2 } from "lucide-react";
import * as XLSX from "xlsx";

const REPORT_TYPES = [
  { id: "executive", label: "Executive Summary", icon: FileBarChart, desc: "High-level project overview" },
  { id: "technical", label: "Technical Analysis", icon: FileText, desc: "Detailed source analysis" },
  { id: "rules", label: "Business Rules Report", icon: BookOpen, desc: "All business rules" },
  { id: "findings", label: "Difference Report", icon: AlertTriangle, desc: "All findings and classifications" },
  { id: "coverage", label: "Coverage Report", icon: BarChart3, desc: "Test coverage metrics" },
  { id: "traceability", label: "Traceability Report", icon: Link2, desc: "Full traceability chain" },
  { id: "testcases", label: "Test Case Report", icon: TestTubes, desc: "All test cases" },
];

export default function ReportsPage() {
  const { state, currentProject } = useMip();
  const [generating, setGenerating] = useState<string | null>(null);

  const generateReport = async (type: string) => {
    setGenerating(type);
    try {
      const wb = XLSX.utils.book_new();

      switch (type) {
        case "executive": {
          const data = [
            ["Project", currentProject?.name || "N/A"],
            ["Description", currentProject?.description || ""],
            ["Status", currentProject?.status || ""],
            [""],
            ["Metric", "Value"],
            ["Legacy Files", state.sourceFiles.filter(f => f.side === "legacy").length],
            ["Modern Files", state.sourceFiles.filter(f => f.side === "modern").length],
            ["Analyzed Files", state.sourceFiles.filter(f => f.status === "analyzed").length],
            ["Findings", state.findings.length],
            ["Business Rules", state.rules.length],
            ["Test Scenarios", state.scenarios.length],
            ["Test Cases", state.testCases.length],
            ["Automation Cases", state.automationCases.length],
          ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Executive Summary");
          break;
        }
        case "findings": {
          const headers = ["ID", "Title", "Severity", "Category", "Status", "Legacy Source", "Modern Source", "Business Impact", "Recommendation", "Confidence"];
          const rows = state.findings.map(f => [
            f.id, f.title, f.severity, f.category.replace(/_/g, " "), f.status.replace(/_/g, " "),
            f.legacySource?.fileName || "", f.modernSource?.fileName || "", f.businessImpact, f.recommendation, f.confidence,
          ]);
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Findings");
          break;
        }
        case "rules": {
          const headers = ["Rule #", "Title", "Description", "Condition", "Source", "Impact", "Status"];
          const rows = state.rules.map(r => [r.ruleNumber, r.title, r.description, r.condition, r.source, r.impact, r.status]);
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Business Rules");
          break;
        }
        case "testcases": {
          // Each test case in separate sheet
          state.testCases.forEach((tc, idx) => {
            const sheetData = [
              ["Test Case ID", tc.caseNumber],
              ["Title", tc.title],
              ["Objective", tc.objective],
              ["Requirement", tc.requirement],
              ["Priority", tc.priority],
              ["Status", tc.status],
              [""],
              ["Preconditions"],
              ...tc.preconditions.map(p => [p]),
              [""],
              ["Step", "Action", "Expected Result", "SQL"],
              ...tc.steps.map(s => [s.stepNumber, s.action, s.expectedResult, s.sql || ""]),
              [""],
              ["Expected Result (Overall)", tc.expectedResult],
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), tc.caseNumber.slice(0, 31));
          });
          // Summary sheet
          const summaryHeaders = ["Case #", "Title", "Priority", "Status", "Type"];
          const summaryRows = state.testCases.map(tc => [tc.caseNumber, tc.title, tc.priority, tc.status, tc.type]);
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]), "Summary");
          break;
        }
        case "coverage": {
          const totalFindings = state.findings.length;
          const data = [
            ["Coverage Report"],
            [""],
            ["Metric", "Value", "Percentage"],
            ["Legacy Files Analyzed", state.sourceFiles.filter(f => f.side === "legacy" && f.status === "analyzed").length, ""],
            ["Conditions Detected", state.analyses.reduce((s, a) => s + a.conditions.length, 0), ""],
            ["Business Rules", state.rules.length, ""],
            ["Rules with Scenarios", state.rules.filter(r => r.linkedScenarioIds.length).length, ""],
            ["Rules with Test Cases", state.rules.filter(r => r.linkedTestCaseIds.length).length, ""],
            ["Findings Resolved", state.findings.filter(f => f.status === "resolved").length, totalFindings > 0 ? `${Math.round(state.findings.filter(f => f.status === "resolved").length / totalFindings * 100)}%` : "0%"],
            ["Test Cases Generated", state.testCases.length, ""],
            ["Tests Executed", state.testCases.filter(t => t.status !== "not_run").length, ""],
            ["Pass Rate", state.testCases.filter(t => t.status === "pass").length, ""],
          ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Coverage");
          break;
        }
        case "traceability": {
          const headers = ["Rule #", "Rule Title", "Findings", "Scenarios", "Test Cases", "Status"];
          const rows = state.rules.map(r => [
            r.ruleNumber, r.title,
            state.findings.filter(f => r.linkedFindingIds.includes(f.id)).map(f => f.title).join("; "),
            state.scenarios.filter(s => r.linkedScenarioIds.includes(s.id)).map(s => s.scenarioNumber).join("; "),
            state.testCases.filter(tc => r.linkedTestCaseIds.includes(tc.id)).map(tc => tc.caseNumber).join("; "),
            r.status,
          ]);
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Traceability");
          break;
        }
      }

      const fileName = `${currentProject?.name || "MIP"}_${type}_report.xlsx`;
      XLSX.writeFile(wb, fileName);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-white">
          <FileBarChart size={18} className="text-cyan-400" /> Reports
        </h1>
        <p className="mt-1 text-sm text-slate-400">Generate and export reports client-side as Excel files</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map(report => {
          const Icon = report.icon;
          return (
            <div key={report.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-cyan-500/20">
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-cyan-400" />
                <h3 className="text-sm font-medium text-white">{report.label}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">{report.desc}</p>
              <button onClick={() => generateReport(report.id)} disabled={generating === report.id}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50">
                <Download size={12} />
                {generating === report.id ? "Generating..." : "Export Excel"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
