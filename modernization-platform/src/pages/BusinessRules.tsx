import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  ScrollText,
  Plus,
  Loader2,
  Filter,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function BusinessRules() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const rules = useQuery(api.businessRules.listByProject, { projectId: pid });
  const stats = useQuery(api.businessRules.getStats, { projectId: pid });
  const createRule = useMutation(api.businessRules.create);
  const updateStatus = useMutation(api.businessRules.updateStatus);
  const removeRule = useMutation(api.businessRules.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [ruleId, setRuleId] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [condition, setCondition] = useState("");
  const [positiveOutcome, setPositiveOutcome] = useState("");
  const [negativeOutcome, setNegativeOutcome] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredRules =
    rules?.filter(
      (r) => statusFilter === "ALL" || r.status === statusFilter,
    ) ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleId.trim() || !description.trim() || !source.trim()) return;
    setCreating(true);
    try {
      await createRule({
        projectId: pid,
        ruleId: ruleId.trim(),
        description: description.trim(),
        source: source.trim(),
        condition: condition.trim() || undefined,
        positiveOutcome: positiveOutcome.trim() || undefined,
        failureOutcome: negativeOutcome.trim() || undefined,
        confidence: "UNKNOWN",
      });
      setRuleId("");
      setDescription("");
      setSource("");
      setCondition("");
      setPositiveOutcome("");
      setNegativeOutcome("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<Record<string, unknown>>[] = [
    { key: "ruleId", label: "Rule ID", sortable: true, width: "100px" },
    {
      key: "description",
      label: "Description",
      render: (row) => (
        <span className="text-xs max-w-[300px] truncate block">
          {row.description as string}
        </span>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {row.source as string}
        </span>
      ),
    },
    {
      key: "confidence",
      label: "Confidence",
      render: (row) => (
        <StatusBadge
          label={row.confidence as string}
          variant={getStatusVariant(row.confidence as string)}
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
      width: "180px",
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.status === "IDENTIFIED" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus({
                    id: row._id as Id<"businessRules">,
                    status: "CONFIRMED",
                  });
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10"
              >
                Confirm
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus({
                    id: row._id as Id<"businessRules">,
                    status: "MISSING_IN_MOD",
                  });
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-500/10"
              >
                Missing
              </button>
            </>
          )}
          {row.status === "CONFIRMED" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateStatus({
                  id: row._id as Id<"businessRules">,
                  status: "IN_MOD",
                });
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-500/10"
            >
              In MOD
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this rule?")) {
                removeRule({ id: row._id as Id<"businessRules"> });
              }
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Business Rules"
        description="Track and manage business rules extracted from legacy and modernized source code"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Business Rules" },
        ]}
        actions={
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add Rule
          </Button>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Stats */}
          {stats && stats.total > 0 && (
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-lg font-semibold">{stats.total}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Identified
                </p>
                <p className="text-lg font-semibold">{stats.identified}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Confirmed</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {stats.confirmed}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">In MOD</p>
                <p className="text-lg font-semibold text-blue-600">
                  {stats.inMod}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Missing in MOD
                </p>
                <p className="text-lg font-semibold text-red-600">
                  {stats.missingInMod}
                </p>
              </div>
            </div>
          )}

          {/* Create form */}
          {showCreate && (
            <Card className="border-border">
              <CardContent className="p-5">
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">New Business Rule</h3>
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
                        Rule ID *
                      </label>
                      <Input
                        value={ruleId}
                        onChange={(e) => setRuleId(e.target.value)}
                        placeholder="e.g. BR-001"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Source *
                      </label>
                      <Input
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder="e.g. CLAIMS_PKG.PROCESS_CLAIM"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Description *
                      </label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What this rule does"
                        required
                        className="text-xs min-h-[60px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Condition
                      </label>
                      <Input
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                        placeholder="When this rule applies"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Positive Outcome
                      </label>
                      <Input
                        value={positiveOutcome}
                        onChange={(e) => setPositiveOutcome(e.target.value)}
                        placeholder="Expected result when condition is true"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Failure Outcome
                      </label>
                      <Input
                        value={negativeOutcome}
                        onChange={(e) => setNegativeOutcome(e.target.value)}
                        placeholder="Expected result when condition is false"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        !ruleId.trim() ||
                        !description.trim() ||
                        !source.trim() ||
                        creating
                      }
                      className="gap-1.5"
                    >
                      {creating && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Create Rule
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="size-3 text-muted-foreground" />
            {[
              "ALL",
              "IDENTIFIED",
              "CONFIRMED",
              "IN_MOD",
              "MISSING_IN_MOD",
              "UNKNOWN",
            ].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {status === "ALL" ? "All" : status.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* Rules table */}
          {rules && (
            <DataTable
              columns={columns}
              data={filteredRules as Record<string, unknown>[]}
              keyExtractor={(row) => String(row._id)}
              pageSize={20}
              searchable
              searchPlaceholder="Search rules..."
              emptyMessage="No business rules yet. Rules are extracted during code analysis or added manually."
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
