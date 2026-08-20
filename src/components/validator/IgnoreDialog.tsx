import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useValidator } from "@/context/ValidatorContext";
import { fingerprintOf, SCOPE_DESCRIPTIONS, SCOPE_LABELS, type FingerprintParts } from "@/lib/validator/ignore";
import { shortFingerprint } from "@/lib/validator/hash";
import type { DiffRecord, RuleScope } from "@/lib/validator/types";
import { AlertTriangle, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface IgnoreDialogProps {
  diff: DiffRecord;
  parts: FingerprintParts;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCOPES: RuleScope[] = ["occurrence", "location", "report", "account", "global"];

export function IgnoreDialog({ diff, parts, open, onOpenChange }: IgnoreDialogProps) {
  const { addOccurrence, addPersistedRule } = useValidator();
  const [scope, setScope] = useState<RuleScope>("location");
  const [saving, setSaving] = useState(false);

  const handleApply = async () => {
    setSaving(true);
    try {
      if (scope === "occurrence") {
        addOccurrence(fingerprintOf(parts));
        toast.success("Ignored for this session", {
          description: "This difference is hidden until you end the session.",
        });
      } else {
        await addPersistedRule(scope, parts);
        toast.success("Ignore rule saved", {
          description: SCOPE_LABELS[scope],
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save rule", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4" />
            Ignore this difference
          </DialogTitle>
          <DialogDescription>
            <span className="block">{diff.locationLabel}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {diff.groupLabel} · {diff.differenceType} · fingerprint{" "}
              <code className="rounded bg-muted px-1">{shortFingerprint(fingerprintOf(parts))}</code>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {SCOPES.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                scope === s
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/70 hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="ignore-scope"
                className="mt-0.5 accent-primary"
                checked={scope === s}
                onChange={() => setScope(s)}
              />
              <span>
                <span className="block font-medium">{SCOPE_LABELS[s]}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {SCOPE_DESCRIPTIONS[s]}
                </span>
              </span>
            </label>
          ))}
        </div>

        {scope === "global" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Use with care:</strong> a global rule applies to every
              future report of this format/difference type. Because rules store
              only structural hashes, it can hide genuinely new changes at the
              same location/type.
            </span>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Privacy: only a SHA-256 structural fingerprint is saved — never the
            values, text, or contents of the documents.
          </span>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={saving}>
            {saving ? "Saving…" : "Apply rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
