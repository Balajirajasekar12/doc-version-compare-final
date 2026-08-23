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
  Plus,
  Loader2,
  Filter,
  Trash2,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

const CATEGORIES = [
  { value: "LIFECYCLE_CODE", label: "Lifecycle Code" },
  { value: "STATUS_CODE", label: "Status Code" },
  { value: "DATA_TYPE", label: "Data Type" },
  { value: "TABLE_RELATIONSHIP", label: "Table Relationship" },
  { value: "BUSINESS_RULE", label: "Business Rule" },
  { value: "FIELD_CONSTRAINT", label: "Field Constraint" },
  { value: "ENUM_VALUE", label: "Enum Value" },
  { value: "OTHER", label: "Other" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

const PROVENANCE = [
  { value: "FACT", label: "Fact" },
  { value: "OBSERVATION", label: "Observation" },
  { value: "DERIVED", label: "Derived" },
  { value: "USER_CONFIRMED", label: "User Confirmed" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;

type ProvenanceValue = (typeof PROVENANCE)[number]["value"];

export default function KnowledgeBase() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const entries = useQuery(api.knowledge.listByProject, { projectId: pid });
  const stats = useQuery(api.knowledge.getStats, { projectId: pid });
  const createEntry = useMutation(api.knowledge.create);
  const removeEntry = useMutation(api.knowledge.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [provenanceFilter, setProvenanceFilter] = useState<string>("ALL");

  const [category, setCategory] = useState<CategoryValue>("STATUS_CODE");
  const [fieldName, setFieldName] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [provenance, setProvenance] = useState<ProvenanceValue>("USER_CONFIRMED");
  const [sourceDetail, setSourceDetail] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredEntries =
    entries?.filter((e) => {
      if (categoryFilter !== "ALL" && e.category !== categoryFilter)
        return false;
      if (provenanceFilter !== "ALL" && e.provenance !== provenanceFilter)
        return false;
      return true;
    }) ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim() || !value.trim() || !description.trim()) return;
    setCreating(true);
    try {
      await createEntry({
        projectId: pid,
        category,
        fieldName: fieldName.trim(),
        value: value.trim(),
        description: description.trim(),
        provenance,
        sourceDetail: sourceDetail.trim() || undefined,
      });
      setFieldName("");
      setValue("");
      setDescription("");
      setSourceDetail("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (row) => (
        <StatusBadge
          label={(row.category as string).replace(/_/g, " ")}
          variant="info"
        />
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
      key: "description",
      label: "Description",
      render: (row) => (
        <span className="text-xs max-w-[250px] truncate block text-muted-foreground">
          {row.description as string}
        </span>
      ),
    },
    {
      key: "provenance",
      label: "Provenance",
      render: (row) => (
        <StatusBadge
          label={row.provenance as string}
          variant={getStatusVariant(row.provenance as string)}
        />
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
            if (confirm("Delete this entry?")) {
              removeEntry({ id: row._id as Id<"knowledgeEntries"> });
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
        title="Knowledge Data Warehouse"
        description="Store and manage business knowledge with provenance tracking — facts, observations, and user confirmations"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Knowledge Base" },
        ]}
        actions={
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add Entry
          </Button>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {stats && stats.total > 0 && (
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-lg font-semibold">{stats.total}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Facts</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {stats.fact}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Observations
                </p>
                <p className="text-lg font-semibold text-blue-600">
                  {stats.observation}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Derived</p>
                <p className="text-lg font-semibold text-amber-600">
                  {stats.derived}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  User Confirmed
                </p>
                <p className="text-lg font-semibold text-purple-600">
                  {stats.userConfirmed}
                </p>
              </div>
            </div>
          )}

          {showCreate && (
            <Card className="border-border">
              <CardContent className="p-5">
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">
                      New Knowledge Entry
                    </h3>
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
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as CategoryValue)}
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Provenance
                      </label>
                      <select
                        value={provenance}
                        onChange={(e) => setProvenance(e.target.value as ProvenanceValue)}
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {PROVENANCE.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
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
                        placeholder="e.g. CLAIM_STATUS"
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
                        placeholder="e.g. A=Active, I=Inactive, C=Closed"
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
                        placeholder="What this field/value means and where it was observed"
                        required
                        className="text-xs min-h-[60px]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Source Detail
                      </label>
                      <Input
                        value={sourceDetail}
                        onChange={(e) => setSourceDetail(e.target.value)}
                        placeholder="e.g. claims_table.sql line 42, user confirmed on 2024-01-15"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        !fieldName.trim() ||
                        !value.trim() ||
                        !description.trim() ||
                        creating
                      }
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

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="size-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Category:</span>
              {["ALL", ...CATEGORIES.map((c) => c.value)].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    categoryFilter === cat
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat === "ALL" ? "All" : cat.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {entries && (
            <DataTable
              columns={columns}
              data={filteredEntries as Record<string, unknown>[]}
              keyExtractor={(row) => String(row._id)}
              pageSize={20}
              searchable
              searchPlaceholder="Search entries..."
              emptyMessage="No knowledge entries yet. Add entries to track business knowledge."
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
