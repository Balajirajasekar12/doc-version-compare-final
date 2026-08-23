import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { AlertTriangle, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function Differences() {
  const projects = useQuery(api.projects.list);
  const [selectedProject, setSelectedProject] = useState<string>("");

  const allDiffs = useQuery(
    api.differences.listByProject,
    selectedProject
      ? { projectId: selectedProject as Id<"projects"> }
      : "skip",
  );
  const diffStats = useQuery(
    api.differences.getStats,
    selectedProject
      ? { projectId: selectedProject as Id<"projects"> }
      : "skip",
  );
  const updateDiffStatus = useMutation(api.differences.updateStatus);

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);

  const filteredDiffs = useMemo(() => {
    if (!allDiffs) return [];
    if (categoryFilter === "ALL") return allDiffs;
    return allDiffs.filter((d) => d.category === categoryFilter);
  }, [allDiffs, categoryFilter]);

  const categories = [
    "ALL",
    "REMOVED",
    "ADDED",
    "CHANGED",
    "MISSING",
    "UNKNOWN",
  ];

  const columns: Column<Record<string, unknown>>[] = [
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
      key: "severity",
      label: "Severity",
      sortable: true,
      render: (row) => (
        <StatusBadge
          label={row.severity as string}
          variant={getStatusVariant(row.severity as string)}
        />
      ),
    },
    {
      key: "description",
      label: "Description",
      render: (row) => (
        <span className="text-xs leading-relaxed">
          {row.description as string}
        </span>
      ),
    },
    {
      key: "confidence",
      label: "Confidence",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {row.confidence as string}
        </span>
      ),
    },
    {
      key: "legacyLineStart",
      label: "Legacy",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground">
          L{row.legacyLineStart as number}–{row.legacyLineEnd as number}
        </span>
      ),
    },
    {
      key: "modLineStart",
      label: "MOD",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground">
          L{row.modLineStart as number}–{row.modLineEnd as number}
        </span>
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
      width: "140px",
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.status !== "ACCEPTED" && row.status !== "INTENTIONAL" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateDiffStatus({
                    id: row._id as Id<"differences">,
                    status: "ACCEPTED",
                  });
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10"
                title="Accept"
              >
                Accept
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const comment = prompt("Comment (optional):");
                  updateDiffStatus({
                    id: row._id as Id<"differences">,
                    status: "INTENTIONAL",
                    developerComment: comment || undefined,
                  });
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                title="Mark Intentional"
              >
                Intentional
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Differences"
        description="Review and resolve all detected differences between legacy and modernized source"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Differences" },
        ]}
      />

      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Project selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Project:</label>
            <select
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setCategoryFilter("ALL");
                setExpandedDiff(null);
              }}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select project...</option>
              {projects?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stats */}
          {diffStats && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Total Differences
                </p>
                <p className="mt-0.5 text-lg font-semibold">
                  {diffStats.total}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Open</p>
                <p className="mt-0.5 text-lg font-semibold text-amber-600">
                  {diffStats.open}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  High Severity
                </p>
                <p className="mt-0.5 text-lg font-semibold text-red-600">
                  {diffStats.high}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Removed</p>
                <p className="mt-0.5 text-lg font-semibold">
                  {diffStats.removed}
                </p>
              </div>
            </div>
          )}

          {/* Category filter */}
          {selectedProject && (
            <div className="flex items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    categoryFilter === cat
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat === "ALL" ? "All" : cat}
                </button>
              ))}
            </div>
          )}

          {/* Differences list with expandable details + comments */}
          {selectedProject && (
            <div className="space-y-1.5">
              {filteredDiffs.length === 0 ? (
                <div className="rounded-md border border-border bg-card py-10 text-center text-xs text-muted-foreground">
                  No differences found for this filter
                </div>
              ) : (
                filteredDiffs.map((diff) => (
                  <DiffRow
                    key={diff._id}
                    diff={diff}
                    isExpanded={expandedDiff === diff._id}
                    onToggle={() =>
                      setExpandedDiff(
                        expandedDiff === diff._id ? null : diff._id,
                      )
                    }
                    projectId={selectedProject as Id<"projects">}
                    onStatusUpdate={(status, comment) =>
                      updateDiffStatus({
                        id: diff._id,
                        status,
                        developerComment: comment,
                      })
                    }
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function DiffRow({
  diff,
  isExpanded,
  onToggle,
  projectId,
  onStatusUpdate,
}: {
  diff: {
    _id: Id<"differences">;
    category: string;
    severity: string;
    description: string;
    confidence: string;
    legacyLineStart: number;
    legacyLineEnd: number;
    modLineStart: number;
    modLineEnd: number;
    legacySnippet: string;
    modSnippet: string;
    status: string;
    developerComment?: string | undefined;
    comparisonId: Id<"comparisons">;
  };
  isExpanded: boolean;
  onToggle: () => void;
  projectId: Id<"projects">;
  onStatusUpdate: (
    status:
      | "OPEN"
      | "REVIEWED"
      | "ACCEPTED"
      | "INTENTIONAL"
      | "FALSE_POSITIVE"
      | "FIX_REQUIRED",
    comment?: string,
  ) => void;
}) {
  const comments = useQuery(
    api.comments.listByDifference,
    isExpanded ? { differenceId: diff._id } : "skip",
  );
  const addComment = useMutation(api.comments.create);
  const [commentText, setCommentText] = useState("");

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    await addComment({
      differenceId: diff._id,
      projectId,
      author: "You",
      content: commentText.trim(),
    });
    setCommentText("");
  };

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusBadge
            label={diff.category}
            variant={getStatusVariant(diff.category)}
          />
          <StatusBadge
            label={diff.severity}
            variant={getStatusVariant(diff.severity)}
          />
          <span className="text-xs text-foreground truncate">
            {diff.description}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <StatusBadge
            label={diff.status}
            variant={getStatusVariant(diff.status)}
          />
          {isExpanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Code diff */}
          <div className="grid divide-x divide-border sm:grid-cols-2">
            <div className="max-h-48 overflow-auto">
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border">
                Legacy
                {diff.legacyLineStart > 0 && (
                  <span className="ml-2">
                    Lines {diff.legacyLineStart}–{diff.legacyLineEnd}
                  </span>
                )}
              </div>
              <pre className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
                {diff.legacySnippet || (
                  <span className="italic text-muted-foreground">(empty)</span>
                )}
              </pre>
            </div>
            <div className="max-h-48 overflow-auto">
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border">
                Modernized
                {diff.modLineStart > 0 && (
                  <span className="ml-2">
                    Lines {diff.modLineStart}–{diff.modLineEnd}
                  </span>
                )}
              </div>
              <pre className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
                {diff.modSnippet || (
                  <span className="italic text-muted-foreground">(empty)</span>
                )}
              </pre>
            </div>
          </div>

          {/* Status actions */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-2">
            {diff.status !== "ACCEPTED" && diff.status !== "INTENTIONAL" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatusUpdate("ACCEPTED")}
                  className="h-6 text-[10px]"
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const c = prompt("Why is this intentional?");
                    if (c !== null)
                      onStatusUpdate("INTENTIONAL", c || undefined);
                  }}
                  className="h-6 text-[10px]"
                >
                  Intentional
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatusUpdate("FIX_REQUIRED")}
                  className="h-6 text-[10px]"
                >
                  Needs Fix
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatusUpdate("FALSE_POSITIVE")}
                  className="h-6 text-[10px]"
                >
                  False Positive
                </Button>
              </>
            )}
            {diff.developerComment && (
              <span className="ml-auto text-[11px] text-muted-foreground italic">
                {diff.developerComment}
              </span>
            )}
          </div>

          {/* Comments section */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground">
                Comments
              </span>
              {comments && comments.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({comments.length})
                </span>
              )}
            </div>

            {comments === undefined ? (
              <div className="text-[11px] text-muted-foreground">Loading...</div>
            ) : comments.length > 0 ? (
              <div className="space-y-2 mb-3">
                {comments.map((c) => (
                  <div
                    key={c._id}
                    className="rounded bg-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-medium">
                        {c.author}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-foreground">{c.content}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Add comment */}
            <div className="flex items-start gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={!commentText.trim()}
                className="h-8 text-[11px]"
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
