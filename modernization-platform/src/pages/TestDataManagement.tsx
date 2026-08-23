import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Plus, Loader2, Trash2 } from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

const SOURCES = [
  { value: "HISTORICAL", label: "Historical" },
  { value: "SCHEMA", label: "Schema" },
  { value: "CODE", label: "Code" },
  { value: "USER_CONFIRMED", label: "User Confirmed" },
  { value: "GENERATED", label: "Generated" },
] as const;

type SourceValue = (typeof SOURCES)[number]["value"];

export default function TestDataManagement() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const testData = useQuery(api.testData.listByProject, { projectId: pid });
  const testCases = useQuery(api.testCases.listByProject, { projectId: pid });
  const createEntry = useMutation(api.testData.create);
  const removeEntry = useMutation(api.testData.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [testcaseId, setTestcaseId] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState<SourceValue>("USER_CONFIRMED");
  const [sourceDetail, setSourceDetail] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim() || !value.trim()) return;
    setCreating(true);
    try {
      await createEntry({
        projectId: pid,
        testcaseId: testcaseId.trim() || undefined,
        fieldName: fieldName.trim(),
        value: value.trim(),
        source,
        sourceDetail: sourceDetail.trim() || undefined,
      });
      setFieldName("");
      setValue("");
      setSourceDetail("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "testcaseId",
      label: "Test Case",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {(row.testcaseId as string) || "—"}
        </span>
      ),
    },
    { key: "fieldName", label: "Field", sortable: true },
    {
      key: "value",
      label: "Value",
      render: (row) => (
        <span className="font-mono text-xs">{row.value as string}</span>
      ),
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      render: (row) => (
        <StatusBadge
          label={row.source as string}
          variant={getStatusVariant(row.source as string)}
        />
      ),
    },
    {
      key: "sourceDetail",
      label: "Detail",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground max-w-[200px] truncate block">
          {(row.sourceDetail as string) || "—"}
        </span>
      ),
    },
    {
      key: "_id",
      label: "",
      width: "60px",
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Delete this test data entry?")) {
              removeEntry({ id: row._id as Id<"testData"> });
            }
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <Trash2 className="size-3" />
        </button>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Test Data Management"
        description="Manage test data linked to test cases with source tracking and provenance"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Data" },
        ]}
        actions={
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add Test Data
          </Button>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {showCreate && (
            <Card className="border-border">
              <CardContent className="p-5">
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Add Test Data</h3>
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Test Case (optional)
                      </label>
                      <select
                        value={testcaseId}
                        onChange={(e) => setTestcaseId(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Not linked</option>
                        {testCases?.map((tc) => (
                          <option key={tc._id} value={tc.testcaseId}>
                            {tc.testcaseId} — {tc.description.slice(0, 40)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Source
                      </label>
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value as SourceValue)}
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {SOURCES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Field Name *
                      </label>
                      <Input
                        value={fieldName}
                        onChange={(e) => setFieldName(e.target.value)}
                        placeholder="e.g. claim_amount, status_code"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Value *
                      </label>
                      <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="e.g. 1500.00, ACTIVE"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Source Detail
                      </label>
                      <Input
                        value={sourceDetail}
                        onChange={(e) => setSourceDetail(e.target.value)}
                        placeholder="Where this test data came from"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!fieldName.trim() || !value.trim() || creating}
                      className="gap-1.5"
                    >
                      {creating && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Add Entry
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {testData && (
            <DataTable
              columns={columns}
              data={testData as Record<string, unknown>[]}
              keyExtractor={(row) => String(row._id)}
              pageSize={20}
              searchable
              searchPlaceholder="Search test data..."
              emptyMessage="No test data entries yet. Add test data to link values to test cases."
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
