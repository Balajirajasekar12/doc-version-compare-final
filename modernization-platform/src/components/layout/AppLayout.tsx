import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  GitCompare,
  AlertTriangle,
  Settings,
  LogOut,
  ChevronRight,
  Lock,
  FlaskConical,
  ClipboardCheck,
  Link2,
  BarChart3,
  Code2,
  ScrollText,
  Database,
  HelpCircle,
  Beaker,
  PlayCircle,
  Camera,
  FileText,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", path: "/app", icon: LayoutDashboard },
  { label: "Projects", path: "/app/projects", icon: FolderOpen },
  { label: "System Analysis", path: "/app/compare", icon: GitCompare },
  { label: "Differences", path: "/app/differences", icon: AlertTriangle },
  { label: "Rules", path: "/app", icon: ScrollText, section: "analysis" },
  { label: "Knowledge", path: "/app", icon: Database, section: "analysis" },
  { label: "Evidence", path: "/app", icon: HelpCircle, section: "analysis" },
  { label: "Freeze", path: "/app/freeze", icon: Lock, section: "test" },
  { label: "Test Design", path: "/app/test-design", icon: FlaskConical, section: "test" },
  { label: "Test Cases", path: "/app/test-cases", icon: ClipboardCheck, section: "test" },
  { label: "Automation", path: "/app", icon: Code2, section: "test" },
  { label: "Test Data", path: "/app", icon: Beaker, section: "test" },
  { label: "Traceability", path: "/app/traceability", icon: Link2, section: "test" },
  { label: "Coverage", path: "/app/coverage", icon: BarChart3, section: "test" },
  { label: "Test Execution", path: "/app", icon: PlayCircle, section: "execution" },
  { label: "Evidence", path: "/app", icon: Camera, section: "execution" },
  { label: "Reports", path: "/app", icon: FileText, section: "execution" },
  { label: "Settings", path: "/app/settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center border-b border-border px-5">
          <Link to="/app" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded bg-white/10 text-[11px] font-bold text-foreground">
              M
            </div>
            <span className="text-sm font-semibold tracking-tight">MIP</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const showDivider = item.section === "test" && (idx === 0 || navItems[idx - 1].section !== "test");
            return (
              <React.Fragment key={item.path}>
                {showDivider && (
                  <div className="my-2 border-t border-border" />
                )}
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                  {item.label}
                </Link>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                {user?.name?.[0]?.toUpperCase() ||
                  user?.email?.[0]?.toUpperCase() ||
                  "?"}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {user?.name || user?.email || "User"}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="h-full">{children}</div>
      </main>
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; path?: string }>;
}) {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3" />}
          {item.path ? (
            <Link to={item.path} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; path?: string }>;
}) {
  return (
    <div className="border-b border-border px-8 py-5">
      <div className="mx-auto max-w-6xl">
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
