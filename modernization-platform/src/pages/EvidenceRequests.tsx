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
import {
  HelpCircle,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";

const CATEGORIES = [
  { value: "MISSING_BUSINESS_RULE", label: "Missing Business Rule" },
  { value: "MISSING_STATUS_CODE", label: "Missing Status Code" },
  { value: "MISSING_TABLE_INFO", label: "Missing Table Info" },
  { value: "MISSING_DATA_TYPE", label: "Missing Data Type" },
  { value: "MISSING_RELATIONSHIP", label: "Missing Relationship" },
  { value: "CLARIFICATION_NEEDED", label: "Clarification Needed" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

export default function EvidenceRequests() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId as Id<"projects">;

  const requests = useQuery(api.evidence.listByProject, { projectId: pid });
  const stats = useQuery(api.evidence.getStats, { projectId: pid });
  const createRequest = useMutation(api.evidence.create);
  const answerRequest = useMutation(api.evidence.answer);
  const dismissRequest = useMutation(api.evidence.dismiss);

  const [showCreate, setShowCreate] = useState(false);
  const [category, setCategory] = useState<CategoryValue>("CLARIFICATION_NEEDED");
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [creating, setCreating] = useState(false);

  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setCreating(true);
    try {
      await createRequest({
        projectId: pid,
        question: question.trim(),
        context: context.trim() || undefined,
        category,
      });
      setQuestion("");
      setContext("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const handleAnswer = async (id: string) => {
    if (!answerText.trim()) return;
    setSubmittingAnswer(true);
    try {
      await answerRequest({
        id: id as Id<"evidenceRequests">,
        answer: answerText.trim(),
      });
      setAnsweringId(null);
      setAnswerText("");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Evidence Collection"
        description="Track missing information and collect evidence from team members instead of making assumptions"
        breadcrumbs={[
          { label: "Dashboard", path: "/app" },
          { label: "Evidence Collection" },
        ]}
        actions={
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Request Evidence
          </Button>
        }
      />
      <div className="p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {stats && stats.total > 0 && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-lg font-semibold">{stats.total}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Open</p>
                <p className="text-lg font-semibold text-amber-600">
                  {stats.open}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Answered</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {stats.answered}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Dismissed</p>
                <p className="text-lg font-semibold text-muted-foreground">
                  {stats.dismissed}
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
                      Request Missing Information
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
                    <div className="sm:col-span-2">
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
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Question *
                      </label>
                      <Textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="What information is missing or needs clarification?"
                        required
                        className="text-xs min-h-[60px]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Context
                      </label>
                      <Input
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        placeholder="Where in the code this gap was found, what triggered this request"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!question.trim() || creating}
                      className="gap-1.5"
                    >
                      {creating && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Submit Request
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {requests && requests.length > 0 ? (
            <div className="space-y-2">
              {requests.map((req) => (
                <Card key={req._id} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <StatusBadge
                            label={req.status}
                            variant={getStatusVariant(req.status)}
                          />
                          <StatusBadge
                            label={req.category.replace(/_/g, " ")}
                            variant="info"
                          />
                        </div>
                        <p className="text-sm font-medium">{req.question}</p>
                        {req.context && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Context: {req.context}
                          </p>
                        )}
                        {req.answer && (
                          <div className="mt-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <CheckCircle2 className="size-3 text-emerald-500" />
                              <span className="text-[11px] font-medium text-emerald-600">
                                Answer by {req.answeredBy || "Unknown"}
                              </span>
                            </div>
                            <p className="text-xs">{req.answer}</p>
                          </div>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {new Date(req.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {req.status === "OPEN" && (
                          <>
                            {answeringId === req._id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={answerText}
                                  onChange={(e) =>
                                    setAnswerText(e.target.value)
                                  }
                                  placeholder="Type your answer..."
                                  className="h-7 text-xs w-64"
                                  onKeyDown={(e) => {
                                    if (
                                      e.key === "Enter" &&
                                      !e.shiftKey
                                    ) {
                                      e.preventDefault();
                                      handleAnswer(req._id);
                                    }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleAnswer(req._id)}
                                  disabled={
                                    !answerText.trim() || submittingAnswer
                                  }
                                  className="h-7"
                                >
                                  {submittingAnswer ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="size-3" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setAnsweringId(null);
                                    setAnswerText("");
                                  }}
                                  className="h-7"
                                >
                                  <XCircle className="size-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => setAnsweringId(req._id)}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10"
                                >
                                  Answer
                                </button>
                                <button
                                  onClick={() =>
                                    dismissRequest({
                                      id: req._id,
                                    })
                                  }
                                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <HelpCircle
                className="mb-3 size-5 text-muted-foreground"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                No evidence requests yet. When the analysis finds gaps, request
                information from team members here.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
