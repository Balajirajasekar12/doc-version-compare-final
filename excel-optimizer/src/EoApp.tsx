/**
 * Excel Optimizer — Root Router
 *
 * All routes live under /eo/* via HashRouter (basename="/eo").
 * 100% client-side. No Convex. No authentication. No backend.
 */

import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router";

// Lazy-load EO's existing pages (relative to DVC root where vite builds from)
const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-xs text-muted-foreground">
        Loading...
      </div>
    </div>
  );
}

export default function EoApp() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
