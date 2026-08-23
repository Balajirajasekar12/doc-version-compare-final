import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  AppLayout,
  PageHeader,
  Breadcrumbs,
} from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import {
  FolderOpen,
  Plus,
  Loader2,
  ArrowRight,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";
import { useQuery } from "convex/react";

export default function Dashboard() {
  const navigate = useNavigate();
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [owner, setOwner] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const id = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        domain: domain.trim() || undefined,
        owner: owner.trim() || undefined,
      });
      navigate(`/app/projects/${id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        description="Your projects at a glance"
        actions={
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            New Project
          </Button>
        }
      />

      <div className="p-8">
        <div className="mx-auto max-w-5xl">
          {/* Create form */}
          {showCreate && (
            <Card className="mb-6 border-border">
              <CardContent className="p-5">
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">New Project</h3>
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
                        Project name
                      </label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Claims Migration"
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Domain
                      </label>
                      <Input
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="e.g. Insurance, Healthcare"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Description
                      </label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What is being migrated and why"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Team owner
                      </label>
                      <Input
                        value={owner}
                        onChange={(e) => setOwner(e.target.value)}
                        placeholder="e.g. QA Team"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!name.trim() || creating}
                      className="gap-1.5"
                    >
                      {creating && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Create Project
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Project list */}
          {projects === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
                <FolderOpen
                  className="size-5 text-muted-foreground"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="text-sm font-medium">No projects yet</h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Create a project to start comparing legacy and modernized
                source code.
              </p>
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="mt-4 gap-1.5"
              >
                <Plus className="size-3.5" />
                Create Project
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project._id}
                  onClick={() => navigate(`/app/projects/${project._id}`)}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold">
                      {project.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium truncate">
                        {project.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {project.description || "No description set"}
                        {project.domain && ` · ${project.domain}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge
                      label={project.status}
                      variant={getStatusVariant(project.status)}
                    />
                    <ArrowRight className="size-3.5 text-muted-foreground" />
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
