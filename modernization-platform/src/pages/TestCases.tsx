import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FileSpreadsheet, Loader2, Lock, Download } from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

function exportTestCasesToCSV(cases: Array<Record<string, string>>) {
  const headers = [
    "Testcase ID",
    "Requirement",
    "Precondition",
    "Testcase Description",
    "Test Data",
    "Steps",
    "Expected Result",
    "Actual Result",
    "Status",
  ];
  const csvRows = [
    headers.map((h) => `"${h}"`).join(","),
    ...cases.map((tc) =>
      headers
        .map((h) => {
          const val = tc[h] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ];
  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Manual_TestCases.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function TestCases() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId: pid });
  const testCases = useQuery(api.testCases.listByProject, { projectId: pid });
  const stats = useQuery(api.testCases.getStats, { projectId: pid });
  const scenarios = useQuery(api.testDesign.listByProject, { projectId: pid });
  const generateCases = useMutation(api.testCases.generateFromScenarios);
  const updateResult = useMutation(api.testCases.updateResult);
  const [generating, setGenerating] = useState(false);

  const isFrozen = project?.status === "FROZEN";
  const approvedCount = scenarios?.filter((s) => s.status === "APPROVED").length ?? 0;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateCases({ projectId: pid });
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = () => {
    if (!testCases) return;
    const rows = testCases.map((tc) => ({
      "Testcase ID": tc.testcaseId,
      Requirement: tc.requirement,
      Precondition: tc.precondition,
      "Testcase Description": tc.description,
      "Test Data": tc.testData,
      Steps: tc.steps,
      "Expected Result": tc.expectedResult,
      "Actual Result": tc.actualResult ?? "",
      Status: tc.status,
    }));
    exportTestCasesToCSV(rows);
  };

  const columns: Column<Record<string, unknown>>[] = [
    { key: "testcaseId", label: "ID", sortable: true, width: "80px" },
    {
      key: "requirement",
      label: "Requirement",
      render: (row) => <span className="text-xs max-w-[200px] truncate block">{row.requirement as string}</span>,
    },
    {
      key: "description",
      label: "Description",
      render: (row) => <span className="text-xs max-w-[250px] truncate block">{row.description as string}</span>,
    },
    {
      key: "category",
      label: "Type",
      render: (row) => <span className="text-[11px] text-muted-foreground">{(row as Record<string, unknown>).category as string ?? "—"}</span>,
    },
    {
      key: "expectedResult",
      label: "Expected Result",
      render: (row) => <span className="text-xs max-w-[200px] truncate block">{row.expectedResult as string}</span>,
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
      width: "80px",
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const result = prompt("Actual Result:");
            if (result !== null) {
              updateResult({
                id: row._id as Id<"testCases">,
                status: "PASS",
                actualResult: result || undefined,
              });
            }
          }}
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
        >
          Execute
        </button>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Manual Test Cases"
        description="Generate test cases from approved scenarios and export for execution"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Cases" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isFrozen && approvedCount > 0 && (
              <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
                Generate Cases
              </Button>
            )}
            {testCases && testCases.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
                <Download className="size-3.5" />
                Export CSV
              </Button>
            )}
            {!isFrozen && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
                <Lock className="size-3" />
                Freeze MOD first
              </div>
            )}
          </div>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Stats */}
          {stats && stats.total > 0 && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-lg font-semibold">{stats.total}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Not Executed</p>
                <p className="text-lg font-semibold text-amber-600">{stats.notExecuted}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Passed</p>
                <p className="text-lg font-semibold text-emerald-600">{stats.pass}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Failed</p>
                <p className="text-lg font-semibold text-red-600">{stats.fail}</p>
              </div>
            </div>
          )}

          {/* Table */}
          {testCases && (
            <DataTable
              columns={columns}
              data={testCases as Record<string, unknown>[]}
              keyExtractor={(row) => String(row._id)}
              pageSize={20}
              searchable
              searchPlaceholder="Search test cases..."
              emptyMessage={isFrozen && approvedCount > 0
                ? "No test cases generated yet. Click Generate Cases."
                : isFrozen
                  ? "Approve test scenarios first in Test Design."
                  : "Freeze the MOD version to enable test case generation."}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
