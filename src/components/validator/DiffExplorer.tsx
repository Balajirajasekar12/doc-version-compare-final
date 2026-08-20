import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useValidator } from "@/context/ValidatorContext";
import { fingerprintOf, SCOPE_LABELS } from "@/lib/validator/ignore";
import {
  buildHtmlReport,
  buildXlsxReport,
  downloadBlob,
  downloadText,
  stamp,
} from "@/lib/validator/export";
import { buildReportModel } from "@/lib/validator/report";
import type { DiffRecord, DiffType, VersionDiff, WordSeg } from "@/lib/validator/types";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  FileText,
  GitCompareArrows,
  RotateCcw,
  Search,
  ShieldOff,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { IgnoreDialog } from "./IgnoreDialog";

const TYPE_STYLES: Record<DiffType, { badge: string; label: string }> = {
  text_changed: { badge: "bg-sky-500/10 text-sky-600 border-sky-500/30 dark:text-sky-400", label: "text changed" },
  cell_changed: { badge: "bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-400", label: "value mismatch" },
  header_changed: { badge: "bg-sky-500/10 text-sky-600 border-sky-500/30 dark:text-sky-400", label: "column name changed" },
  sheet_added: { badge: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400", label: "sheet added" },
  sheet_removed: { badge: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400", label: "sheet removed" },
  sheet_renamed: { badge: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400", label: "sheet renamed" },
  rows_added: { badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", label: "rows added" },
  rows_removed: { badge: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400", label: "rows removed" },
  cols_added: { badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", label: "columns added" },
  cols_removed: { badge: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400", label: "columns removed" },
  missing_content: { badge: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400", label: "missing content" },
  added_content: { badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", label: "added content" },
  value_mismatch: { badge: "bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-400", label: "value mismatch" },
  format_mismatch: { badge: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400", label: "format mismatch" },
  font_mismatch: { badge: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400", label: "font mismatch" },
  font_size_mismatch: { badge: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400", label: "font size mismatch" },
  image_added: { badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", label: "image added" },
  image_removed: { badge: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400", label: "image removed" },
  image_count_mismatch: { badge: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400", label: "image count mismatch" },
  number_format_mismatch: { badge: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400", label: "number format mismatch" },
  date_format_mismatch: { badge: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400", label: "date format mismatch" },
  currency_format_mismatch: { badge: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400", label: "currency format mismatch" },
  exact_match: { badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", label: "match" },
};

const ALL_TYPES: DiffType[] = [
  "text_changed",
  "cell_changed",
  "header_changed",
  "sheet_added",
  "sheet_removed",
  "sheet_renamed",
  "rows_added",
  "rows_removed",
  "cols_added",
  "cols_removed",
];

function DiffSegments({ segments }: { segments: WordSeg[] }) {
  const refParts: React.ReactNode[] = [];
  const newParts: React.ReactNode[] = [];
  let key = 0;
  for (const seg of segments) {
    if (!seg.added) {
      refParts.push(
        <span key={key++} className={seg.removed ? "rounded bg-red-500/15 text-red-600 line-through decoration-red-400/70 dark:text-red-400" : ""}>
          {seg.value}
        </span>,
      );
    }
    if (!seg.removed) {
      newParts.push(
        <span key={key++} className={seg.added ? "rounded bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-400" : ""}>
          {seg.value}
        </span>,
      );
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reference</div>
      <pre className="whitespace-pre-wrap break-words text-xs leading-5">{refParts}</pre>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Changed</div>
      <pre className="whitespace-pre-wrap break-words text-xs leading-5">{newParts}</pre>
    </div>
  );
}

function VersionLine({ version, showDiff }: { version: VersionDiff; showDiff: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const text = version.text;
  const truncated = text.length > 400 && !expanded;
  const display = truncated ? `${text.slice(0, 400)}…` : text;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">{version.fileName}</span>
        {version.versionTag && (
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{version.versionTag}</span>
        )}
        {text.length > 400 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 text-[11px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Collapse" : "Show full text"}
          </Button>
        )}
      </div>
      <div className="mt-1.5">
        {showDiff && version.segments ? (
          <DiffSegments segments={version.segments} />
        ) : (
          <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">{display || "—"}</pre>
        )}
      </div>
    </div>
  );
}

function DiffCard({ diff }: { diff: DiffRecord }) {
  const { fingerprints, getMatch, removeRule, removeOccurrence } = useValidator();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const parts = fingerprints[diff.id];
  const match = getMatch(diff);
  const typeStyle = TYPE_STYLES[diff.differenceType];

  const changedVersions = diff.versions.filter((v) => v.kind !== "unchanged");
  const unchangedVersions = diff.versions.filter((v) => v.kind === "unchanged");
  const isText = diff.differenceType === "text_changed";
  const referenceLong =
    diff.referenceText.length > 300 || diff.referenceText.split("\n").length > 6;

  const handleUndo = () => {
    if (!parts) return;
    if (match?.ruleId) {
      removeRule(match.ruleId).catch(() => toast.error("Could not remove rule"));
      toast.success("Ignore rule removed");
    } else if (match?.scope === "occurrence") {
      removeOccurrence(fingerprintOf(parts));
      toast.success("Session ignore removed");
    }
  };

  return (
    <Card className={`shadow-none transition-opacity ${match ? "opacity-55" : ""}`}>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`border ${typeStyle.badge}`}>
            {typeStyle.label}
          </Badge>
          <span className="text-sm font-semibold">{diff.locationLabel}</span>
          <span className="text-xs text-muted-foreground">{diff.groupLabel}</span>
          <span className="ml-auto flex items-center gap-2">
            {match && (
              <span className="flex items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                <ShieldOff className="size-3" />
                Ignored · {SCOPE_LABELS[match.scope]}
              </span>
            )}
            {match && (
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleUndo}>
                <Undo2 className="size-3" />
                Undo
              </Button>
            )}
            {!match && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={!parts}
                title={parts ? undefined : "Preparing structural fingerprint…"}
                onClick={() => setDialogOpen(true)}
              >
                <Ban className="size-3" />
                {parts ? "Ignore…" : "Preparing…"}
              </Button>
            )}
          </span>
        </div>

        {isText && diff.referenceText === "" && (
          <p className="mt-2 text-xs text-muted-foreground">Inserted content (not present in the reference):</p>
        )}
        {isText && diff.referenceText !== "" && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Reference · {diff.referenceFile || "baseline"}
              </span>
              {referenceLong && (
                <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Collapse" : "Expand"}
                </Button>
              )}
            </div>
            <pre className={`whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs leading-5 ${expanded ? "" : "line-clamp-6"}`}>
              {diff.referenceText || "—"}
            </pre>
          </div>
        )}

        {!isText && (
          <div className="mt-3 grid gap-2 text-xs">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Reference value · {diff.referenceFile || "baseline"}
              </span>
              <pre className="mt-1 whitespace-pre-wrap break-words leading-5">{diff.referenceText || "—"}</pre>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {changedVersions.map((v) => (
            <VersionLine key={v.docId} version={v} showDiff={isText} />
          ))}
        </div>

        {unchangedVersions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Unchanged in:
            {unchangedVersions.map((v) => (
              <span key={v.docId} className="rounded bg-muted/60 px-1.5 py-0.5">
                {v.fileName}
              </span>
            ))}
          </div>
        )}
      </CardContent>

      {parts && (
        <IgnoreDialog diff={diff} parts={parts} open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
    </Card>
  );
}

function ReportPanel() {
  const { diffs, stats, groups, resetSession, setStage, refIndexByGroup, getMatch } = useValidator();
  const [confirming, setConfirming] = useState(false);

  const model = useMemo(
    () =>
      buildReportModel(
        groups,
        diffs,
        stats,
        refIndexByGroup,
        (diff) => getMatch(diff) !== null,
      ),
    [groups, diffs, stats, refIndexByGroup, getMatch],
  );

  const handleHtml = () => {
    downloadText(`validator-report-${stamp()}.html`, buildHtmlReport(model), "text/html");
    toast.success("HTML report downloaded", { description: "Interactive audit report — generated locally." });
  };
  const handleXlsx = () => {
    const buffer = buildXlsxReport(model);
    downloadBlob(
      `validator-report-${stamp()}.xlsx`,
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    toast.success("Excel report downloaded", {
      description: "Workbook with summary, issues, hierarchy, and version sheets.",
    });
  };
  const handleEnd = () => {
    resetSession();
    setStage("input");
    toast.success("Session ended", { description: "All document data discarded from memory." });
  };

  return (
    <Card className="shadow-none border-border/70">
      <CardContent className="flex flex-wrap items-center gap-3 pt-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Download className="size-4" />
          Export report
        </div>
        <span className="text-xs text-muted-foreground">
          Reports are generated and downloaded on this device — nothing is uploaded.
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleHtml}>
            <FileText className="size-4" />
            HTML report
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleXlsx}>
            <FileText className="size-4" />
            Excel (.xlsx)
          </Button>
          <Button
            type="button"
            variant={confirming ? "destructive" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => {
              if (confirming) {
                handleEnd();
              } else {
                setConfirming(true);
                window.setTimeout(() => setConfirming(false), 4000);
              }
            }}
          >
            <RotateCcw className="size-4" />
            {confirming ? "Click again to confirm" : "End session & discard"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DiffExplorer() {
  const { diffs, stats, getMatch, groups, setStage, fingerprints } = useValidator();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DiffType>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [showIgnored, setShowIgnored] = useState(false);

  const groupOptions = useMemo(
    () => Array.from(new Set(diffs.map((d) => d.groupLabel))).sort(),
    [diffs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return diffs.filter((d) => {
      if (typeFilter !== "all" && d.differenceType !== typeFilter) return false;
      if (groupFilter !== "all" && d.groupLabel !== groupFilter) return false;
      if (!showIgnored && getMatch(d)) return false;
      if (q) {
        const haystack = [
          d.groupLabel,
          d.locationLabel,
          d.referenceText,
          ...d.versions.map((v) => v.text),
        ]
          .join("\n")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [diffs, query, typeFilter, groupFilter, showIgnored, getMatch]);

  const visibleCount = diffs.length - stats.ignored;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm">
          <b className="tabular-nums">{diffs.length}</b>{" "}
          <span className="text-muted-foreground">differences</span>
        </span>
        <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm">
          <b className="tabular-nums text-emerald-600 dark:text-emerald-400">{visibleCount}</b>{" "}
          <span className="text-muted-foreground">visible</span>
        </span>
        <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm">
          <b className="tabular-nums text-muted-foreground">{stats.ignored}</b>{" "}
          <span className="text-muted-foreground">ignored</span>
        </span>
        <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm">
          <b className="tabular-nums">{stats.comparableGroups}</b>{" "}
          <span className="text-muted-foreground">groups</span>
        </span>
        <span className="rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm">
          <b className="tabular-nums">{stats.accounts}</b>{" "}
          <span className="text-muted-foreground">accounts</span>
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search values, locations, reports…"
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | DiffType)}>
          <SelectTrigger className="w-40 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ALL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_STYLES[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-48 text-xs">
            <SelectValue placeholder="Report" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reports</SelectItem>
{(groupOptions as string[]).map((g) => (
  <SelectItem key={String(g)} value={String(g)}>
    {String(g)}
  </SelectItem>
))}
</SelectContent>
</Select>

<label className="flex items-center gap-2 text-xs text-muted-foreground">
  <Switch checked={showIgnored} onCheckedChange={setShowIgnored} />
  Show ignored
</label>
</div>

{/* List */}
{filtered.length === 0 ? (
  <Card className="shadow-none border-border/70">
    <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <GitCompareArrows className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">
          {diffs.length === 0 ? "No differences found" : "Nothing matches your filters"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {diffs.length === 0
            ? "All compared versions match their reference. Export a report or go back to adjust grouping."
            : "Try clearing the search or filters."}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setStage("groups")}>
        <ArrowLeft className="size-4" />
        Back to groups
      </Button>
    </CardContent>
  </Card>
) : (
  <div className="flex flex-col gap-3">
    {filtered.map((diff: DiffRecord) => (
      <DiffCard key={diff.id} diff={diff} />
    ))}
  </div>
)}

{fingerprints && Object.keys(fingerprints).length > 0 && <ReportPanel />}
</div>
);
}
