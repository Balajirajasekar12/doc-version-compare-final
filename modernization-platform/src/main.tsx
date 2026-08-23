import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail.tsx"));
const UploadSource = lazy(() => import("./pages/UploadSource.tsx"));
const SourceViewer = lazy(() => import("./pages/SourceViewer.tsx"));
const Compare = lazy(() => import("./pages/Compare.tsx"));
const Differences = lazy(() => import("./pages/Differences.tsx"));
const BusinessRules = lazy(() => import("./pages/BusinessRules.tsx"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase.tsx"));
const EvidenceRequests = lazy(() => import("./pages/EvidenceRequests.tsx"));
const FreezePage = lazy(() => import("./pages/FreezePage.tsx"));
const TestDesign = lazy(() => import("./pages/TestDesign.tsx"));
const TestCases = lazy(() => import("./pages/TestCases.tsx"));
const AutomationTestCases = lazy(() => import("./pages/AutomationTestCases.tsx"));
const TestDataManagement = lazy(() => import("./pages/TestDataManagement.tsx"));
const Traceability = lazy(() => import("./pages/Traceability.tsx"));
const Coverage = lazy(() => import("./pages/Coverage.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const TestCycles = lazy(() => import("./pages/TestCycles.tsx"));
const CycleDetail = lazy(() => import("./pages/CycleDetail.tsx"));
const ManualExecution = lazy(() => import("./pages/ManualExecution.tsx"));
const EvidenceGallery = lazy(() => import("./pages/EvidenceGallery.tsx"));
const TestReport = lazy(() => import("./pages/TestReport.tsx"));
const AutomationResults = lazy(() => import("./pages/AutomationResults.tsx"));
const ModernizationApp = lazy(() => import("./modernization/ModernizationApp"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              {/* ─── Modernization Platform: Client-side only, NO Convex, NO auth ─── */}
              <Route path="/modernization/*" element={<ModernizationApp />} />

              {/* ─── Existing app: Convex-backed with auth ─── */}
              <Route element={<ConvexAuthProvider client={convex}><Outlet /></ConvexAuthProvider>}>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/app" />}
              />
              <Route
                path="/app"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId"
                element={
                  <RequireAuth>
                    <ProjectDetail />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/upload"
                element={
                  <RequireAuth>
                    <UploadSource />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/files/:fileId"
                element={
                  <RequireAuth>
                    <SourceViewer />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/compare"
                element={
                  <RequireAuth>
                    <Compare />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/differences"
                element={
                  <RequireAuth>
                    <Differences />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/rules"
                element={
                  <RequireAuth>
                    <BusinessRules />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/knowledge"
                element={
                  <RequireAuth>
                    <KnowledgeBase />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/evidence"
                element={
                  <RequireAuth>
                    <EvidenceRequests />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/freeze"
                element={
                  <RequireAuth>
                    <FreezePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/test-design"
                element={
                  <RequireAuth>
                    <TestDesign />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/test-cases"
                element={
                  <RequireAuth>
                    <TestCases />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/automation"
                element={
                  <RequireAuth>
                    <AutomationTestCases />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/test-data"
                element={
                  <RequireAuth>
                    <TestDataManagement />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/traceability"
                element={
                  <RequireAuth>
                    <Traceability />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/coverage"
                element={
                  <RequireAuth>
                    <Coverage />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/settings"
                element={
                  <RequireAuth>
                    <Settings />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/test-cycles"
                element={
                  <RequireAuth>
                    <TestCycles />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/test-cycles/:cycleId"
                element={
                  <RequireAuth>
                    <CycleDetail />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/test-cycles/:cycleId/execute/:executionId"
                element={
                  <RequireAuth>
                    <ManualExecution />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/test-cycles/:cycleId/evidence"
                element={
                  <RequireAuth>
                    <EvidenceGallery />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/test-cycles/:cycleId/report"
                element={
                  <RequireAuth>
                    <TestReport />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/projects/:projectId/test-cycles/:cycleId/automation-results"
                element={
                  <RequireAuth>
                    <AutomationResults />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
    </RootErrorBoundary>
  </StrictMode>,
);
