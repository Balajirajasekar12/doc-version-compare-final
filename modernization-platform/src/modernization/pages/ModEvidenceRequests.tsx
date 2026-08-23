/**
 * Evidence Requests — manage missing information requests.
 */

import { useEffect } from "react";
import { useParams } from "react-router";
import { useModStore } from "../context";
import type { InfoRequestStatus } from "../lib/types";
import { MessageSquare } from "lucide-react";

export default function ModEvidenceRequests() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, dispatch } = useModStore();

  useEffect(() => {
    if (projectId) dispatch({ type: "SET_CURRENT_PROJECT", projectId });
  }, [projectId, dispatch]);

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">Project not found.</div>;

  const requests = Object.values(state.informationRequests).filter((r) => r.projectId === project.id);

  function updateStatus(id: string, status: InfoRequestStatus) {
    dispatch({ type: "UPDATE_INFORMATION_REQUEST", id, updates: { status } });
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Evidence Requests</h1>
        <p className="mt-1 text-xs text-muted-foreground">{requests.length} information requests</p>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card p-10 text-center">
          <MessageSquare className="mx-auto size-6 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No evidence requests yet. Analysis will generate these when information is missing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    req.status === "PENDING" ? "bg-amber-500/10 text-amber-400" :
                    req.status === "PROVIDED" ? "bg-green-500/10 text-green-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{req.status.replace(/_/g, " ")}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{req.type.replace(/_/g, " ")}</span>
                </div>
              </div>
              <h3 className="text-xs font-medium">{req.title}</h3>
              <p className="text-[11px] text-muted-foreground">{req.description}</p>
              {req.suggestedQuery && (
                <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap">{req.suggestedQuery}</pre>
              )}
              <div className="flex gap-1.5">
                {(["PENDING", "PROVIDED", "DISMISSED", "GENERATED_QUERY"] as const).map((s) => (
                  <button key={s} onClick={() => updateStatus(req.id, s)}
                    className={`text-[9px] px-2 py-0.5 rounded transition-colors ${
                      req.status === s ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-muted"
                    }`}>{s.replace(/_/g, " ")}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
