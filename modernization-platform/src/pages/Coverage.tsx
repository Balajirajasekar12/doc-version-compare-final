import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { BarChart3 } from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

function CoverageBar({ label, covered, total }: { label: string; covered: number; total: number }) {
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{covered}/{total} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444",
          }}
        />
      </div>
    </div>
  );
}

export default function Coverage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId: pid });
  const coverage = useQuery(api.traceability.getCoverage, { projectId: pid });
  const ruleStats = useQuery(api.businessRules.getStats, { projectId: pid });
  const scenarioStats = useQuery(api.testDesign.getStats, { projectId: pid });

  const isFrozen = project?.status === "FROZEN";

  return (
    <AppLayout>
      <PageHeader
        title="Coverage Dashboard"
        description="Overview of rules, test scenarios, test cases, and difference resolution"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Coverage" },
        ]}
      />
      <div className="p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {!isFrozen ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="mb-3 size-5 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-xs text-muted-foreground">
                Freeze the MOD version and generate test scenarios to see coverage metrics.
              </p>
            </div>
          ) : coverage ? (
            <>
              <CoverageBar label="Rule Coverage" covered={coverage.rules.covered} total={coverage.rules.total} />
              <CoverageBar label="Test Scenario Approval" covered={coverage.scenarios.approved} total={coverage.scenarios.total} />
              <CoverageBar label="Test Case Execution" covered={coverage.testCases.executed} total={coverage.testCases.total} />
              <CoverageBar label="Difference Resolution" covered={coverage.differences.resolved} total={coverage.differences.total} />

              {/* Detailed breakdown */}
              <div className="grid gap-3 sm:grid-cols-2">
                {ruleStats && (
                  <div className="rounded-md border border-border bg-card p-4">
                    <h3 className="text-xs font-medium mb-3">Business Rules</h3>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Identified</span><span>{ruleStats.identified}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Confirmed</span><span className="text-emerald-600">{ruleStats.confirmed}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">In MOD</span><span>{ruleStats.inMod}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Missing in MOD</span><span className="text-red-600">{ruleStats.missingInMod}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Unknown</span><span className="text-muted-foreground">{ruleStats.unknown}</span></div>
                    </div>
                  </div>
                )}
                {scenarioStats && (
                  <div className="rounded-md border border-border bg-card p-4">
                    <h3 className="text-xs font-medium mb-3">Test Scenarios</h3>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{scenarioStats.total}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Positive</span><span className="text-emerald-600">{scenarioStats.positive}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Negative</span><span className="text-red-600">{scenarioStats.negative}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Boundary</span><span className="text-amber-600">{scenarioStats.boundary}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Error Handling</span><span>{scenarioStats.errorHandling}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span className="text-emerald-600">{scenarioStats.approved}</span></div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
