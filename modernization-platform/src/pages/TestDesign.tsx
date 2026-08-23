import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Wand2, Loader2, Lock } from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function TestDesign() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId: pid });
  const scenarios = useQuery(api.testDesign.listByProject, { projectId: pid });
  const stats = useQuery(api.testDesign.getStats, { projectId: pid });
  const generateScenarios = useMutation(api.testDesign.generateScenarios);
  const updateScenarioStatus = useMutation(api.testDesign.updateStatus);
  const removeScenario = useMutation(api.testDesign.remove);
  const [generating, setGenerating] = useState(false);

  const isFrozen = project?.status === "FROZEN";

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateScenarios({ projectId: pid });
    } finally {
      setGenerating(false);
    }
  };

  const columns: Column<Record<string, unknown>>[] = [
    { key: "scenarioId", label: "ID", sortable: true, width: "80px" },
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (row) => (
        <StatusBadge
          label={row.category as string}
          variant={getStatusVariant(row.category as string)}
        />
      ),
    },
    {
      key: "title",
      label: "Title",
      render: (row) => <span className="text-xs">{row.title as string}</span>,
    },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      render: (row) => (
        <StatusBadge
          label={row.priority as string}
          variant={getStatusVariant(row.priority as string)}
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => (
        <StatusBadge
          label={row.status as string}
          variant={getStatusVariant(row.status as string)}
        />
      ),
    },
    {
      key: "_id",
      label: "",
      width: "130px",
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.status === "DRAFT" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateScenarioStatus({ id: row._id as Id<"testScenarios">, status: "APPROVED" });
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10"
              >
                Approve
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateScenarioStatus({ id: row._id as Id<"testScenarios">, status: "EXCLUDED" });
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              >
                Exclude
              </button>
            </>
          )}
          {row.status === "EXCLUDED" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateScenarioStatus({ id: row._id as Id<"testScenarios">, status: "DRAFT" });
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
            >
              Reinclude
            </button>
          )}
        </div>
      ),
    },
  ];

  const categoryCounts = [
    { label: "Positive", count: stats?.positive ?? 0, color: "text-emerald-600" },
    { label: "Negative", count: stats?.negative ?? 0, color: "text-red-600" },
    { label: "Boundary", count: stats?.boundary ?? 0, color: "text-amber-600" },
    { label: "Error Handling", count: stats?.errorHandling ?? 0, color: "text-orange-600" },
    { label: "End-to-End", count: stats?.endToEnd ?? 0, color: "text-blue-600" },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Test Design"
        description="Generate and review test scenarios from comparison results"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Design" },
        ]}
        actions={
          isFrozen ? (
            <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5">
              {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
              Generate Scenarios
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
              <Lock className="size-3" />
              Freeze MOD first
            </div>
          )
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Category breakdown */}
          {stats && stats.total > 0 && (
            <div className="grid gap-3 sm:grid-cols-5">
              {categoryCounts.map((c) => (
                <div key={c.label} className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{c.label}</p>
                  <p className={`text-lg font-semibold ${c.color}`}>{c.count}</p>
                </div>
              ))}
            </div>
          )}

          {/* Summary bar */}
          {stats && stats.total > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{stats.total} total scenarios</span>
              <span className="text-emerald-600">{stats.approved} approved</span>
              <span>{stats.excluded} excluded</span>
            </div>
          )}

          {/* Scenarios table */}
          {scenarios && (
            <DataTable
              columns={columns}
              data={scenarios as Record<string, unknown>[]}
              keyExtractor={(row) => String(row._id)}
              pageSize={20}
              searchable
              searchPlaceholder="Search scenarios..."
              emptyMessage={isFrozen ? "No scenarios generated yet. Click Generate Scenarios." : "Freeze the MOD version to generate scenarios."}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
