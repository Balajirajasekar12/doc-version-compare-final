import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  Loader2,
  Image,
  Camera,
  Monitor,
  Upload,
  Trash2,
  Eye,
  Calendar,
  User,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function EvidenceGallery() {
  const { projectId, cycleId } = useParams<{ projectId: string; cycleId: string }>();
  const pid = projectId as Id<"projects">;
  const cid = cycleId as Id<"testCycles">;

  const stats = useQuery(api.testExecution.getCycleStats, { cycleId: cid });
  const evidence = useQuery(api.testExecution.listEvidence, { testCycleId: cid });
  const deleteEvidenceMutation = useMutation(api.testExecution.deleteEvidence);
  const updateEvidence = useMutation(api.testExecution.updateEvidence);

  const [filter, setFilter] = useState<string>("all");
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);

  const handleDelete = async (evId: Id<"testEvidence">) => {
    if (!confirm("Delete this evidence item?")) return;
    await deleteEvidenceMutation({ evidenceId: evId });
  };

  const handleAnnotate = async (evId: Id<"testEvidence">) => {
    const desc = prompt("Enter annotation or description:");
    if (desc !== null) {
      await updateEvidence({ evidenceId: evId, description: desc || undefined });
    }
  };

  const filteredEvidence = evidence?.filter((ev) => {
    if (filter === "all") return true;
    if (filter === "SNAGIT") return ev.captureType === "SNAGIT";
    if (filter === "BROWSER") return ev.captureType === "BROWSER_CAPTURE";
    if (filter === "UPLOAD") return ev.captureType === "UPLOAD";
    if (filter === "PLAYWRIGHT") return ev.captureType === "PLAYWRIGHT";
    return true;
  });

  const captureTypeIcon = (type: string) => {
    switch (type) {
      case "SNAGIT": return <Camera className="size-3.5" />;
      case "BROWSER_CAPTURE": return <Monitor className="size-3.5" />;
      case "UPLOAD": return <Upload className="size-3.5" />;
      case "PLAYWRIGHT": return <Image className="size-3.5" />;
      default: return <Image className="size-3.5" />;
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Evidence Gallery"
        description={stats ? `Test Cycle: ${stats.cycle?.name} · ${evidence?.length ?? 0} items` : "Loading..."}
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Cycles", path: `/app/projects/${projectId}/test-cycles` },
          { label: cycleId ?? "", path: `/app/projects/${projectId}/test-cycles/${cycleId}` },
          { label: "Evidence" },
        ]}
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Filter */}
          <div className="flex items-center gap-2">
            {["all", "SNAGIT", "BROWSER", "UPLOAD", "PLAYWRIGHT"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-[11px] transition-colors ${
                  filter === f
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {f === "all" ? "All" : f === "BROWSER" ? "Browser Capture" : f}
              </button>
            ))}
          </div>

          {/* Evidence Grid */}
          {evidence === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEvidence?.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-16 text-center">
              <Image className="mx-auto mb-3 size-5 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm font-medium">No evidence captured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Execute test cases and capture screenshots to see them here.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEvidence?.map((ev) => (
                <Card key={ev._id} className="border-border overflow-hidden group">
                  {/* Thumbnail placeholder */}
                  <div className="relative h-40 bg-muted flex items-center justify-center">
                    {captureTypeIcon(ev.captureType)}
                    <span className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                      {ev.captureType}
                    </span>
                    <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white font-mono">
                      Step {ev.stepNumber}
                    </span>
                    {/* Hover actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedEvidence(ev._id)}
                        className="gap-1 text-[10px] h-7 bg-black/40 text-white border-white/20 hover:bg-black/60"
                      >
                        <Eye className="size-3" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(ev._id)}
                        className="gap-1 text-[10px] h-7 bg-black/40 text-white border-white/20 hover:bg-red-600/80"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium truncate">{ev.originalName}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{ev.testcaseId}</span>
                        <span>·</span>
                        <span>{ev.application || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <User className="size-3" />
                        <span>{ev.capturedBy}</span>
                        <span>·</span>
                        <span>{new Date(ev.capturedAt).toLocaleString()}</span>
                      </div>
                      {ev.description && (
                        <p className="text-[10px] text-muted-foreground italic mt-1">
                          {ev.description}
                        </p>
                      )}
                    </div>
                    {ev.isRedacted && (
                      <span className="mt-1 inline-block rounded bg-amber-600/20 px-1.5 py-0.5 text-[9px] text-amber-500">
                        Redacted
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
