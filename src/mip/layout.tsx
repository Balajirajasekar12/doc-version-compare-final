// ============================================================
// MIP Layout - Dark sidebar navigation + content area
// ============================================================

import React, { Suspense, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { MipProvider, useMip } from "./context";
import {
  LayoutDashboard,
  FolderKanban,
  Upload,
  ListTree,
  GitCompareArrows,
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  FileQuestion,
  Snowflake,
  TestTubeDiagonal,
  TestTubes,
  Bot,
  Database,
  Link2,
  BarChart3,
  Play,
  Camera,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  Download,
  Upload as UploadIcon,
  Loader2,
} from "lucide-react";

// --- Lazy page imports ---
const MipLanding = React.lazy(() => import("./pages/MipLanding.tsx"));
const MipUpload = React.lazy(() => import("./pages/UploadPage.tsx"));
const MipInventory = React.lazy(() => import("./pages/InventoryPage.tsx"));
const MipAnalysis = React.lazy(() => import("./pages/AnalysisPage.tsx"));
const MipFindings = React.lazy(() => import("./pages/FindingsPage.tsx"));
const MipRules = React.lazy(() => import("./pages/RulesPage.tsx"));
const MipKnowledge = React.lazy(() => import("./pages/KnowledgePage.tsx"));
const MipEvidenceReq = React.lazy(() => import("./pages/EvidenceRequestsPage.tsx"));
const MipFreeze = React.lazy(() => import("./pages/FreezePage.tsx"));
const MipTestDesign = React.lazy(() => import("./pages/TestDesignPage.tsx"));
const MipTestCases = React.lazy(() => import("./pages/TestCasesPage.tsx"));
const MipAutomation = React.lazy(() => import("./pages/AutomationPage.tsx"));
const MipTestData = React.lazy(() => import("./pages/TestDataPage.tsx"));
const MipTraceability = React.lazy(() => import("./pages/TraceabilityPage.tsx"));
const MipCoverage = React.lazy(() => import("./pages/CoveragePage.tsx"));
const MipExecution = React.lazy(() => import("./pages/ExecutionPage.tsx"));
const MipEvidence = React.lazy(() => import("./pages/EvidencePage.tsx"));
const MipReports = React.lazy(() => import("./pages/ReportsPage.tsx"));
const MipSettings = React.lazy(() => import("./pages/SettingsPage.tsx"));

function renderPage(pathname: string) {
  // Strip /mip prefix if present (HashRouter basename)
  const path = pathname.replace(/^\/mip/, "") || "/";
  switch (path) {
    case "/":
    case "/projects":
      return <MipLanding />;
    case "/upload":
      return <MipUpload />;
    case "/inventory":
      return <MipInventory />;
    case "/analysis":
      return <MipAnalysis />;
    case "/findings":
      return <MipFindings />;
    case "/rules":
      return <MipRules />;
    case "/knowledge":
      return <MipKnowledge />;
    case "/evidence-requests":
      return <MipEvidenceReq />;
    case "/freeze":
      return <MipFreeze />;
    case "/test-design":
      return <MipTestDesign />;
    case "/test-cases":
      return <MipTestCases />;
    case "/automation":
      return <MipAutomation />;
    case "/test-data":
      return <MipTestData />;
    case "/traceability":
      return <MipTraceability />;
    case "/coverage":
      return <MipCoverage />;
    case "/execution":
      return <MipExecution />;
    case "/evidence":
      return <MipEvidence />;
    case "/reports":
      return <MipReports />;
    case "/settings":
      return <MipSettings />;
    default:
      return <MipLanding />;
  }
}

// --- Navigation items ---
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { id: "projects", label: "Projects", icon: FolderKanban, path: "/projects" },
  { id: "upload", label: "Upload", icon: Upload, path: "/upload" },
  { id: "inventory", label: "Source Inventory", icon: ListTree, path: "/inventory" },
  { id: "analysis", label: "System Analysis", icon: GitCompareArrows, path: "/analysis" },
  { id: "findings", label: "Findings", icon: AlertTriangle, path: "/findings" },
  { id: "rules", label: "Rules", icon: BookOpen, path: "/rules" },
  { id: "knowledge", label: "Knowledge", icon: BrainCircuit, path: "/knowledge" },
  { id: "evidence-req", label: "Evidence Requests", icon: FileQuestion, path: "/evidence-requests" },
  { id: "freeze", label: "Freeze", icon: Snowflake, path: "/freeze" },
  { id: "divider", label: "TESTING", icon: null, path: "" },
  { id: "test-design", label: "Test Design", icon: TestTubeDiagonal, path: "/test-design" },
  { id: "test-cases", label: "Test Cases", icon: TestTubes, path: "/test-cases" },
  { id: "automation", label: "Automation", icon: Bot, path: "/automation" },
  { id: "test-data", label: "Test Data", icon: Database, path: "/test-data" },
  { id: "traceability", label: "Traceability", icon: Link2, path: "/traceability" },
  { id: "coverage", label: "Coverage", icon: BarChart3, path: "/coverage" },
  { id: "divider2", label: "EXECUTION", icon: null, path: "" },
  { id: "execution", label: "Test Execution", icon: Play, path: "/execution" },
  { id: "evidence", label: "Evidence", icon: Camera, path: "/evidence" },
  { id: "reports", label: "Reports", icon: FileBarChart, path: "/reports" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProject, state } = useMip();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/" || location.pathname === "";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <aside
      className={`flex flex-col border-r border-white/[0.06] bg-[#0c1118] transition-all duration-300 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-white/[0.06] px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500 text-[#07090d] font-bold text-xs">
          MIP
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-white">Modernization</div>
            <div className="truncate text-[10px] text-slate-500">Intelligence Platform</div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto shrink-0 rounded p-1 text-slate-500 hover:text-white"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Project indicator */}
      {currentProject && !collapsed && (
        <div className="border-b border-white/[0.06] px-3 py-2">
          <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">Project</div>
          <div className="truncate text-xs font-medium text-cyan-400">{currentProject.name}</div>
          {currentProject.status === "frozen" && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-blue-400">
              <Shield size={10} /> Frozen
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => {
          if (item.id.startsWith("divider")) {
            return collapsed ? null : (
              <div key={item.id} className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {item.label}
              </div>
            );
          }

          const active = isActive(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-500"
                  : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"
              }`}
              title={collapsed ? item.label : undefined}
            >
              {Icon && <Icon size={15} className="shrink-0" />}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Status footer */}
      <div className="border-t border-white/[0.06] px-3 py-2">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Local-only
            </span>
            {state.saving && (
              <span className="flex items-center gap-1 text-amber-400">
                <Loader2 size={10} className="animate-spin" /> Saving...
              </span>
            )}
            {!state.saving && state.lastSaved && (
              <span>Saved {new Date(state.lastSaved).toLocaleTimeString()}</span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function MipLayoutInner() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { exportProject, importProject, state, currentProject } = useMip();

  const handleExport = async () => {
    if (!currentProject) return;
    const blob = await exportProject(currentProject.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentProject.name.replace(/\s+/g, "_")}.mip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        try {
          const projectId = await importProject(file);
          // Navigate to the imported project
        } catch (err) {
          console.error("Import failed:", err);
        }
      }
    };
    input.click();
  };

  return (
    <div className="dark flex h-screen overflow-hidden bg-[#07090d] text-slate-200 antialiased">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0a0e14]/80 px-4 backdrop-blur-md">
          <div className="text-xs text-slate-500">
            MIP — Modernization Intelligence Platform
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/[0.07] hover:text-white"
            >
              <Download size={11} /> Import .mip
            </button>
            {currentProject && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/20"
              >
                <UploadIcon size={11} /> Export .mip
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-cyan-400" />
              </div>
            }
          >
            {renderPage(location.pathname)}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function MipLayout() {
  return (
    <MipProvider>
      <MipLayoutInner />
    </MipProvider>
  );
}
