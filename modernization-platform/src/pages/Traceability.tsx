import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { StatusBadge, getStatusVariant } from "@/components/ui/status-badge";
import { Link2, Loader2, RefreshCw } from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

export default function Traceability() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId: pid });
  const links = useQuery(api.traceability.listByProject, { projectId: pid });
  const coverage = useQuery(api.traceability.getCoverage, { projectId: pid });
  const generateLinks = useMutation(api.traceability.generateLinks);

  const isFrozen = project?.status === "FROZEN";
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateLinks({ projectId: pid });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Traceability Matrix"
        description="Map requirements to rules, test cases, and evidence"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Traceability" },
        ]}
        actions={
          isFrozen ? (
            <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5">
              {generating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Rebuild Matrix
            </Button>
          ) : null
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Coverage summary */}
          {coverage && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Rule Coverage</p>
                <p className="text-lg font-semibold">
                  {coverage.rules.covered}/{coverage.rules.total}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Test Cases</p>
                <p className="text-lg font-semibold">
                  {coverage.testCases.total}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Execution Rate</p>
                <p className="text-lg font-semibold">
                  {coverage.testCases.total > 0
                    ? Math.round((coverage.testCases.executed / coverage.testCases.total) * 100)
                    : 0}%
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Pass Rate</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {coverage.testCases.executed > 0
                    ? Math.round((coverage.testCases.passed / coverage.testCases.executed) * 100)
                    : 0}%
                </p>
              </div>
            </div>
          )}

          {/* Links table */}
          {links && links.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 font-medium text-muted-foreground">Requirement</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Rule</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Test Case</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link._id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 max-w-[300px] truncate">{link.requirement}</td>
                      <td className="px-3 py-2 text-muted-foreground">{link.ruleId ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{link.testcaseId ?? "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          label={link.status}
                          variant={getStatusVariant(link.status)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Link2 className="mb-3 size-5 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-xs text-muted-foreground">
                {isFrozen
                  ? "No traceability links yet. Click Rebuild Matrix to generate."
                  : "Freeze the MOD version and generate test cases first."}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
