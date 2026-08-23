import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  FolderOpen,
  Plus,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Code2,
  ScrollText,
  Database,
  HelpCircle,
  Beaker,
  Play,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useQuery(api.projects.get, {
    projectId: projectId as Id<"projects">,
  });
  const functionalAreas = useQuery(api.functionalAreas.listByProject, {
    projectId: projectId as Id<"projects">,
  });
  const sourceStats = useQuery(api.sourceFiles.getStats, {
    projectId: projectId as Id<"projects">,
  });
  const createArea = useMutation(api.functionalAreas.create);
  const deleteProject = useMutation(api.projects.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [areaName, setAreaName] = useState("");
  const [areaDesc, setAreaDesc] = useState("");
  const [creating, setCreating] = useState(false);

  if (project === undefined || functionalAreas === undefined) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Project not found
        </div>
      </AppLayout>
    );
  }

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaName.trim()) return;
    setCreating(true);
    try {
      await createArea({
        projectId: projectId as Id<"projects">,
        name: areaName.trim(),
        description: areaDesc.trim() || undefined,
      });
      setAreaName("");
      setAreaDesc("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this project and all its data?")) return;
    await deleteProject({ projectId: projectId as Id<"projects"> });
    navigate("/app");
  };

  return (
    <AppLayout>
      <PageHeader
        title={project.name}
        description={project.description}
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: project.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/app/projects/${projectId}/upload`)}
              className="gap-1.5"
            >
              Upload Files
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              className="gap-1.5 text-destructive hover:text-destructive border-destructive/20"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        }
      />

      <div className="p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Stats */}
          {sourceStats && sourceStats.total > 0 && (
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Total Files", value: sourceStats.total },
                { label: "Legacy", value: sourceStats.legacy },
                { label: "MOD", value: sourceStats.mod },
                {
                  label: "Languages",
                  value: sourceStats.languages.length,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-md border border-border bg-card px-3 py-2"
                >
                  <p className="text-[11px] text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Functional Areas */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Functional Areas</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreate(true)}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Area
            </Button>
          </div>

          {showCreate && (
            <Card className="border-border">
              <CardContent className="p-4">
                <form onSubmit={handleCreateArea} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Area Name *
                      </label>
                      <Input
                        value={areaName}
                        onChange={(e) => setAreaName(e.target.value)}
                        placeholder="e.g. Claim Processing"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Description
                      </label>
                      <Input
                        value={areaDesc}
                        onChange={(e) => setAreaDesc(e.target.value)}
                        placeholder="Brief description"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowCreate(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!areaName.trim() || creating}
                    >
                      {creating && (
                        <Loader2 className="mr-1 size-3.5 animate-spin" />
                      )}
                      Create
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {functionalAreas.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-10 text-center">
              <p className="text-xs text-muted-foreground">
                No functional areas yet. Create areas to organize source
                code by feature or business process.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {functionalAreas.map((area) => (
                <div
                  key={area._id}
                  onClick={() =>
                    navigate(
                      `/app/projects/${projectId}/areas/${area._id}`,
                    )
                  }
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">{area.name}</h3>
                    {area.description && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {area.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge
                      label={area.status}
                      variant={getStatusVariant(area.status)}
                    />
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div className="border-t border-border pt-6">
            <h2 className="mb-3 text-sm font-medium">Quick actions</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/projects/${projectId}/upload`)}
                className="justify-start gap-2"
              >
                <FolderOpen className="size-3.5" />
                Upload files
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/compare?project=${projectId}`)}
                className="justify-start gap-2"
              >
                <ArrowRight className="size-3.5" />
                Compare files
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/projects/${projectId}/rules`)}
                className="justify-start gap-2"
              >
                <ScrollText className="size-3.5" />
                Business Rules
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/projects/${projectId}/knowledge`)}
                className="justify-start gap-2"
              >
                <Database className="size-3.5" />
                Knowledge Base
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/projects/${projectId}/evidence`)}
                className="justify-start gap-2"
              >
                <HelpCircle className="size-3.5" />
                Evidence Requests
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/projects/${projectId}/automation`)}
                className="justify-start gap-2"
              >
                <Code2 className="size-3.5" />
                Automation Tests
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/projects/${projectId}/test-cycles`)}
                className="justify-start gap-2"
              >
                <Play className="size-3.5" />
                Test Execution
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/app/projects/${projectId}/test-data`)}
                className="justify-start gap-2"
              >
                <Beaker className="size-3.5" />
                Test Data
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
