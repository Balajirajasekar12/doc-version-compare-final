import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { Lock, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function FreezePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId: pid });
  const diffStats = useQuery(api.differences.getStats, { projectId: pid });
  const freezes = useQuery(api.freeze.listByProject, { projectId: pid });
  const createFreeze = useMutation(api.freeze.create);

  const [version, setVersion] = useState("v1");
  const [reason, setReason] = useState("");
  const [freezing, setFreezing] = useState(false);

  const isFrozen = project?.status === "FROZEN";

  const handleFreeze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!version.trim() || !reason.trim()) return;
    setFreezing(true);
    try {
      await createFreeze({
        projectId: pid,
        version: version.trim(),
        reason: reason.trim(),
      });
    } finally {
      setFreezing(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Freeze MOD Version"
        description="Lock the current MOD version to enable test case generation"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Freeze" },
        ]}
      />
      <div className="p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {isFrozen && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <CheckCircle className="size-4 text-emerald-500" />
              <span className="text-sm text-emerald-500">
                This project is frozen. Test generation is enabled.
              </span>
            </div>
          )}

          {/* Diff summary */}
          {diffStats && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Total Diffs</p>
                <p className="text-lg font-semibold">{diffStats.total}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Open</p>
                <p className="text-lg font-semibold text-amber-600">{diffStats.open}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">High Severity</p>
                <p className="text-lg font-semibold text-red-600">{diffStats.high}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Removed</p>
                <p className="text-lg font-semibold">{diffStats.removed}</p>
              </div>
            </div>
          )}

          {diffStats && diffStats.high > 0 && !isFrozen && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <AlertTriangle className="size-4 mt-0.5 text-amber-500 shrink-0" />
              <div className="text-xs text-amber-600">
                <p className="font-medium">Unresolved high-severity differences</p>
                <p className="mt-0.5 text-muted-foreground">
                  You have {diffStats.high} high-severity open differences. Consider reviewing them before freezing.
                </p>
              </div>
            </div>
          )}

          {!isFrozen && (
            <Card className="border-border">
              <CardContent className="p-5">
                <form onSubmit={handleFreeze} className="space-y-4">
                  <h3 className="text-sm font-medium">Freeze Configuration</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Version</label>
                      <Input
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        placeholder="e.g. v1"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Reason for freeze</label>
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. All gaps resolved"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={!version.trim() || !reason.trim() || freezing} className="gap-1.5">
                      {freezing ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                      Freeze MOD Version
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Freeze history */}
          {freezes && freezes.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium">Freeze History</h3>
              <div className="space-y-2">
                {freezes.map((f) => (
                  <div key={f._id} className="rounded-md border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusBadge label={f.version} variant="success" />
                        <span className="text-xs text-muted-foreground">
                          by {f.userName || "Unknown"} · {new Date(f.frozenAt).toLocaleString()}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {f.resolvedDiffs}/{f.totalDiffs} diffs resolved · {f.unresolvedCriticalDiffs} critical open
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
