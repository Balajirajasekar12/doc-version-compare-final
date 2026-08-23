import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  Plus,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Trash2,
  Pause,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function TestCycles() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;
  const navigate = useNavigate();

  const project = useQuery(api.projects.get, { projectId: pid });
  const cycles = useQuery(api.testExecution.listCycles, { projectId: pid });
  const createCycle = useMutation(api.testExecution.createCycle);
  const deleteCycle = useMutation(api.testExecution.deleteCycle);
  const updateCycle = useMutation(api.testExecution.updateCycle);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [release, setRelease] = useState("");
  const [build, setBuild] = useState("");
  const [environment, setEnvironment] = useState("QA");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const cycleId = await createCycle({
        projectId: pid,
        name: name.trim(),
        release: release.trim() || undefined,
        build: build.trim() || undefined,
        environment: environment.trim() || undefined,
        tester: project?.owner || "Unknown",
        notes: notes.trim() || undefined,
      });
      setShowCreate(false);
      setName("");
      setRelease("");
      setBuild("");
      setEnvironment("QA");
      setNotes("");
      navigate(`/app/projects/${projectId}/test-cycles/${cycleId}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (cycleId: Id<"testCycles">, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this test cycle and all its execution data?")) return;
    await deleteCycle({ cycleId });
  };

  const handleStatusChange = async (
    cycleId: Id<"testCycles">,
    status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED",
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    await updateCycle({ cycleId, status });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "PLANNED": return <Clock className="size-3.5" />;
      case "IN_PROGRESS": return <Play className="size-3.5" />;
      case "COMPLETED": return <CheckCircle2 className="size-3.5" />;
      case "ABORTED": return <XCircle className="size-3.5" />;
      default: return <Clock className="size-3.5" />;
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Test Execution"
        description="Create and manage test cycles, execute manual and automation tests, capture evidence"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Test Cycles" },
        ]}
        actions={
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            New Test Cycle
          </Button>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Create Form */}
          {showCreate && (
            <Card className="border-border">
              <CardContent className="p-4">
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Cycle Name *
                      </label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Regression Cycle 01"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Release
                      </label>
                      <Input
                        value={release}
                        onChange={(e) => setRelease(e.target.value)}
                        placeholder="e.g. MOD-1.4"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Build
                      </label>
                      <Input
                        value={build}
                        onChange={(e) => setBuild(e.target.value)}
                        placeholder="e.g. MOD-2026.08.22.01"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Environment
                      </label>
                      <Input
                        value={environment}
                        onChange={(e) => setEnvironment(e.target.value)}
                        placeholder="QA"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Notes
                      </label>
                      <Input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional notes"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={!name.trim() || creating}>
                      {creating && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                      Create Cycle
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Cycles List */}
          {cycles === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : cycles.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-16 text-center">
              <Calendar className="mx-auto mb-3 size-5 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm font-medium">No test cycles</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a test cycle to begin executing test cases and capturing evidence.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cycles.map((cycle) => (
                <div
                  key={cycle._id}
                  onClick={() => navigate(`/app/projects/${projectId}/test-cycles/${cycle._id}`)}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      {statusIcon(cycle.status)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium">{cycle.name}</h3>
                      <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        {cycle.release && <span>{cycle.release}</span>}
                        {cycle.build && <span className="font-mono">{cycle.build}</span>}
                        {cycle.environment && <span>{cycle.environment}</span>}
                        <span>Tester: {cycle.tester}</span>
                        <span>{new Date(cycle.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge
                      label={cycle.status}
                      variant={getStatusVariant(cycle.status)}
                    />
                    {cycle.status === "PLANNED" && (
                      <button
                        onClick={(e) => handleStatusChange(cycle._id, "IN_PROGRESS", e)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-600"
                        title="Start execution"
                      >
                        <Play className="size-3.5" />
                      </button>
                    )}
                    {cycle.status === "IN_PROGRESS" && (
                      <button
                        onClick={(e) => handleStatusChange(cycle._id, "COMPLETED", e)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-600"
                        title="Complete cycle"
                      >
                        <CheckCircle2 className="size-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(cycle._id, e)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      title="Delete cycle"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
