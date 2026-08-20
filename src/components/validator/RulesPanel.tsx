import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useValidator } from "@/context/ValidatorContext";
import { shortFingerprint } from "@/lib/validator/hash";
import { SCOPE_LABELS } from "@/lib/validator/ignore";
import type { PersistedRule } from "@/lib/validator/types";
import { Fingerprint, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const SCOPE_BADGES: Record<PersistedRule["scope"], string> = {
  location: "bg-sky-500/10 text-sky-600 border-sky-500/30 dark:text-sky-400",
  report: "bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-400",
  account: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  global: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
};

function RuleRow({ rule }: { rule: PersistedRule }) {
  const { removeRule } = useValidator();
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeRule(rule._id);
      toast.success("Rule removed");
    } catch {
      toast.error("Could not remove rule");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Fingerprint className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${SCOPE_BADGES[rule.scope]}`}>
            {SCOPE_LABELS[rule.scope]}
          </span>
          <span className="text-xs text-muted-foreground">{rule.docType}</span>
          <span className="text-xs text-muted-foreground">{rule.differenceType}</span>
          <span className="text-xs text-muted-foreground">{rule.comparisonMode}</span>
        </div>
        <code className="mt-1.5 block break-all font-mono text-[11px] text-muted-foreground">
          {shortFingerprint(rule.fingerprint, 16, 8)}
        </code>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Saved {new Date(rule.createdAt).toLocaleString()}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={handleRemove}
        disabled={removing}
        aria-label="Delete rule"
      >
        {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </Button>
    </div>
  );
}

export function RulesPanel() {
  const { rules, rulesLoading, clearRules } = useValidator();
  const [confirming, setConfirming] = useState(false);

  const handleClearAll = async () => {
    try {
      await clearRules();
      toast.success("All rules cleared");
    } catch {
      toast.error("Could not clear rules");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-none border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <CardTitle className="text-base">Ignore rules</CardTitle>
          </div>
          <CardDescription>
            Rules remember which differences you want skipped on future runs.
            Each rule stores only a <strong>SHA-256 structural fingerprint</strong> —
            never document values, text, or filenames — so nothing sensitive can
            be recovered from this list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {rulesLoading ? "Loading…" : `${rules.length} rule${rules.length === 1 ? "" : "s"} stored`}
            </span>
            {rules.length > 0 && (
              <Button
                type="button"
                variant={confirming ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  if (confirming) {
                    handleClearAll();
                  } else {
                    setConfirming(true);
                    window.setTimeout(() => setConfirming(false), 4000);
                  }
                }}
              >
                {confirming ? "Click again to confirm" : "Clear all rules"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {rules.length === 0 ? (
        <Card className="shadow-none border-border/70">
          <CardContent className="py-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <Fingerprint className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">No ignore rules yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              When reviewing differences, use the <em>Ignore…</em> action to save a
              rule. Scope it narrowly — the wider the scope, the more future
              differences it can hide.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => (
            <RuleRow key={rule._id} rule={rule} />
          ))}
        </div>
      )}
    </div>
  );
}
