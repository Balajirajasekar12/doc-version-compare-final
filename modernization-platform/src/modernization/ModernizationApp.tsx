/**
 * Modernization Platform — Root Router
 *
 * All routes live under /modernization/*.
 * Zero Convex dependency. Zero authentication.
 */

import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router";
import { ModernizationProvider } from "./context";
import ModLayout from "./ModLayout";

// Lazy-loaded pages
const ModDashboard = lazy(() => import("./pages/ModDashboard"));
const ModProject = lazy(() => import("./pages/ModProject"));
const ModUpload = lazy(() => import("./pages/ModUpload"));
const ModInventory = lazy(() => import("./pages/ModInventory"));
const ModAnalysis = lazy(() => import("./pages/ModAnalysis"));
const ModFindings = lazy(() => import("./pages/ModFindings"));
const ModKnowledge = lazy(() => import("./pages/ModKnowledge"));
const ModRules = lazy(() => import("./pages/ModRules"));
const ModEvidenceRequests = lazy(() => import("./pages/ModEvidenceRequests"));
const ModTestDesign = lazy(() => import("./pages/ModTestDesign"));
const ModTestCases = lazy(() => import("./pages/ModTestCases"));
const ModAutomationCases = lazy(() => import("./pages/ModAutomationCases"));
const ModTestCycles = lazy(() => import("./pages/ModTestCycles"));
const ModReports = lazy(() => import("./pages/ModReports"));
const ModSettings = lazy(() => import("./pages/ModSettings"));
const ModFreeze = lazy(() => import("./pages/ModFreeze"));
const ModSourceViewer = lazy(() => import("./pages/ModSourceViewer"));
const ModCoverage = lazy(() => import("./pages/ModCoverage"));
const ModTraceability = lazy(() => import("./pages/ModTraceability"));
const ModTestData = lazy(() => import("./pages/ModTestData"));
const ModAutomationResults = lazy(() => import("./pages/ModAutomationResults"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-xs text-muted-foreground">Loading...</div>
    </div>
  );
}

export default function ModernizationApp() {
  return (
    <ModernizationProvider>
      <ModLayout>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route index element={<ModDashboard />} />
            <Route path="settings" element={<ModSettings />} />
            <Route path="project/:projectId" element={<ModProject />} />
            <Route path="project/:projectId/upload" element={<ModUpload />} />
            <Route path="project/:projectId/inventory" element={<ModInventory />} />
            <Route path="project/:projectId/analysis" element={<ModAnalysis />} />
            <Route path="project/:projectId/findings" element={<ModFindings />} />
            <Route path="project/:projectId/knowledge" element={<ModKnowledge />} />
            <Route path="project/:projectId/rules" element={<ModRules />} />
            <Route path="project/:projectId/evidence-requests" element={<ModEvidenceRequests />} />
            <Route path="project/:projectId/test-design" element={<ModTestDesign />} />
            <Route path="project/:projectId/test-cases" element={<ModTestCases />} />
            <Route path="project/:projectId/automation-cases" element={<ModAutomationCases />} />
            <Route path="project/:projectId/test-cycles" element={<ModTestCycles />} />
            <Route path="project/:projectId/test-cycles/:cycleId" element={<ModTestCycles />} />
            <Route path="project/:projectId/reports" element={<ModReports />} />
            <Route path="project/:projectId/freeze" element={<ModFreeze />} />
            <Route path="project/:projectId/source/:fileId" element={<ModSourceViewer />} />
            <Route path="project/:projectId/coverage" element={<ModCoverage />} />
            <Route path="project/:projectId/traceability" element={<ModTraceability />} />
            <Route path="project/:projectId/test-data" element={<ModTestData />} />
            <Route path="project/:projectId/test-cycles/:cycleId/automation-results" element={<ModAutomationResults />} />
          </Routes>
        </Suspense>
      </ModLayout>
    </ModernizationProvider>
  );
}
