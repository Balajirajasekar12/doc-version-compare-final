/**
 * Modernization Platform Layout
 * 
 * Sidebar navigation + main content area.
 * Zero Convex dependency.
 */

import { Link, useLocation, useParams } from "react-router";
import { useModStore } from "./context";
import {
  ArrowLeft,
  BarChart3,
  Beaker,
  BookOpen,
  Bug,
  ClipboardList,
  FileSearch,
  FolderOpen,
  Home,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  TestTube,
  Upload,
  Zap,
} from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresProject?: boolean;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/modernization", icon: Home },
  { label: "Settings", path: "/modernization/settings", icon: Settings, section: "general" },
];

const PROJECT_NAV_ITEMS: NavItem[] = [
  { label: "Overview", path: "", icon: LayoutDashboard },
  { label: "Upload Source", path: "/upload", icon: Upload },
  { label: "Source Inventory", path: "/inventory", icon: FolderOpen },
  { label: "Analysis", path: "/analysis", icon: Zap },
  { label: "Findings", path: "/findings", icon: FileSearch },
  { label: "Knowledge Base", path: "/knowledge", icon: BookOpen },
  { label: "Business Rules", path: "/rules", icon: Shield },
  { label: "Evidence Requests", path: "/evidence-requests", icon: MessageSquare },
  { label: "Test Design", path: "/test-design", icon: Beaker },
  { label: "Manual Test Cases", path: "/test-cases", icon: ClipboardList },
  { label: "Automation Cases", path: "/automation-cases", icon: Bug },
  { label: "Test Cycles", path: "/test-cycles", icon: TestTube },
  { label: "Test Reports", path: "/reports", icon: BarChart3 },
  { label: "Freeze", path: "/freeze", icon: Shield },
  { label: "Coverage", path: "/coverage", icon: BarChart3 },
  { label: "Traceability", path: "/traceability", icon: FileSearch },
  { label: "Test Data", path: "/test-data", icon: ClipboardList },
];

export default function ModLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const params = useParams();
  const { currentProject, state } = useModStore();

  const projectId = params.projectId ?? state.currentProjectId;
  const isDashboard = location.pathname === "/modernization" || location.pathname === "/modernization/";
  const isSettings = location.pathname === "/modernization/settings";

  function getProjectNavPath(item: NavItem): string {
    if (!projectId) return "/modernization";
    const basePath = `/modernization/project/${projectId}`;
    return item.path === "" ? basePath : `${basePath}${item.path}`;
  }

  function isActive(item: NavItem): boolean {
    if (item.path === "") {
      return location.pathname === `/modernization/project/${projectId}`;
    }
    return location.pathname.startsWith(`/modernization/project/${projectId}${item.path}`);
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Link to="/modernization" className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-foreground">
              M
            </div>
            <div>
              <span className="text-xs font-semibold tracking-tight">MIP</span>
              <span className="ml-1 rounded border border-border px-1 py-0.5 text-[8px] text-muted-foreground">
                CLIENT
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {!isDashboard && !isSettings && projectId && (
            <>
              <Link
                to="/modernization"
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                All Projects
              </Link>
              <div className="my-2 border-t border-border" />
            </>
          )}

          {isDashboard && NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${
                location.pathname === item.path
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </Link>
          ))}

          {projectId && currentProject && (
            <>
              <div className="px-2.5 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {currentProject.name}
                </p>
              </div>
              {PROJECT_NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  to={getProjectNavPath(item)}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${
                    isActive(item)
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              ))}
            </>
          )}

          {!projectId && !isDashboard && !isSettings && (
            <div className="px-2.5 py-4 text-[11px] text-muted-foreground">
              Select a project to view its details.
            </div>
          )}
        </nav>

        {/* Memory Warning */}
        <div className="border-t border-border px-3 py-2.5">
          <p className="text-[9px] leading-tight text-muted-foreground/60">
            Project data is stored only in browser memory. Export your project to save progress.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full">{children}</div>
      </main>
    </div>
  );
}
