import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useValidator } from "@/context/ValidatorContext";
import { comparableDocs } from "@/lib/validator/grouping";
import { buildComparisonChain, getDefaultBaseline } from "@/lib/validator/chain";
import { FORMAT_LABELS, type DocKind } from "@/lib/validator/types";
import type { DocGroup } from "@/lib/validator/types";
import { cn } from "@/lib/utils";
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ClipboardCopy,
  Files,
  FolderTree,
  GitCompareArrows,
  Landmark,
  Layers,
  Route,
} from "lucide-react";

function AccountLevelPicker() {
  const { groups, accountLevel, changeAccountLevel, stats } = useValidator();

  const levels = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const g of groups) {
      const segs = g.dir.split("/").filter(Boolean);
      segs.forEach((seg, i) => {
        if (!map.has(i + 1)) map.set(i + 1, new Set());
        map.get(i + 1)!.add(seg);
      });
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([level, names]) => ({
        level,
        count: names.size,
        names: Array.from(names).sort((x, y) => x.localeCompare(y)),
      }));
  }, [groups]);

  if (levels.length === 0) return null;

  return (
    <Card className="shadow-none border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FolderTree className="size-4 text-primary" />
          <CardTitle className="text-base">Folder structure &amp; account level</CardTitle>
        </div>
        <CardDescription>
          The browser never exposes the name of the folder you picked, so folders
          are shown by level instead. Click the level that contains your{" "}
          <strong>accounts</strong> — the account count updates instantly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {levels.map((lv) => (
            <button
              key={lv.level}
              type="button"
              onClick={() => changeAccountLevel(lv.level)}
              className={cn(
                "cursor-pointer flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                accountLevel === lv.level
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted/70",
              )}
            >
              Level {lv.level}
              <span className="tabular-nums">
                {lv.count} folder{lv.count === 1 ? "" : "s"}
              </span>
            </button>
          ))}
          <span className="text-xs text-muted-foreground">
            → <b className="tabular-nums">{stats.accounts}</b> account
            {stats.accounts === 1 ? "" : "s"} detected
          </span>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {levels.map((lv) => (
            <div key={lv.level} className="flex items-center gap-2">
              <span className="w-14 shrink-0 tabular-nums">L{lv.level}:</span>
              <span className="truncate">
                {lv.names.slice(0, 8).join(" · ")}
                {lv.names.length > 8 ? ` · +${lv.names.length - 8} more` : ""}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <div className="text-xl font-semibold leading-none tabular-nums">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/** Display the comparison chain for a group. */
function ComparisonChainDisplay({ group }: { group: DocGroup }) {
  const { baselineFormatByGroup } = useValidator();
  const userBaseline = baselineFormatByGroup[group.id];
  const baselineFormat = (userBaseline || getDefaultBaseline(group)) as DocKind;
  const chain = buildComparisonChain(group, baselineFormat);

  if (chain.pairs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Route className="size-3.5 shrink-0" />
      <span className="font-medium">Chain:</span>
      {chain.pairs.map((pair, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/50">→</span>}
          <span className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">
            {pair.baselineFormat.toUpperCase()} → {pair.comparingFormat.toUpperCase()}
          </span>
        </span>
      ))}
    </div>
  );
}

function ErrorBadge({ error }: { error: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(error).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [error]);
  return (
    <span className="inline-flex items-start gap-1 max-w-80 break-all rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 text-[11px] text-destructive">
      <span className="shrink-0" title={error}>{error}</span>
      <button
        onClick={copy}
        className="shrink-0 text-destructive/60 hover:text-destructive"
        title="Copy error details"
      >
        {copied ? <span className="text-[9px]">✓</span> : <ClipboardCopy className="size-3" />}
      </button>
    </span>
  );
}

function GroupRow({ group }: { group: DocGroup }) {
  const { refIndexByGroup, enabledGroups, setRefIndex, toggleGroup, baselineFormatByGroup, setBaselineFormat } = useValidator();
  const enabled = enabledGroups[group.id] !== false;
  const comparable = comparableDocs(group);
  const refIndex = Math.min(refIndexByGroup[group.id] ?? 0, comparable.length - 1);
  const failed = group.docs.filter((d) => d.error).length;
  const singleVersion = comparable.length < 2;

  // Available formats for baseline selection
  const availableFormats = useMemo(() => {
    const fmts = new Set<DocKind>();
    for (const doc of comparable) fmts.add(doc.ext);
    return Array.from(fmts).sort();
  }, [comparable]);

  const userBaseline = baselineFormatByGroup[group.id];
  const currentBaseline = (userBaseline || getDefaultBaseline(group)) as DocKind;

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 transition-opacity ${
        enabled ? "border-border/70 bg-card" : "border-border/40 bg-muted/30 opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox
          checked={enabled}
          onCheckedChange={() => toggleGroup(group.id)}
          aria-label={`Include ${group.stem}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{group.stem}</span>
            {group.formats.map((f) => (
              <span
                key={f}
                className="rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground"
              >
                .{f}
              </span>
            ))}
            {singleVersion && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                single version — skipped
              </span>
            )}
            {failed > 0 && (
              <span className="flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                <AlertTriangle className="size-3" />
                {failed} parse error{failed > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate">{group.dir || "(root)"}</span>
            <span className="flex items-center gap-1">
              <Layers className="size-3" />
              account: {group.account}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Baseline</span>
          <Select
            value={currentBaseline}
            onValueChange={(v) => setBaselineFormat(group.id, v)}
            disabled={!enabled || availableFormats.length < 2}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Select baseline" />
            </SelectTrigger>
            <SelectContent>
              {availableFormats.map((f) => (
                <SelectItem key={f} value={f} className="text-xs">
                  {f.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Comparison chain */}
      {enabled && <ComparisonChainDisplay group={group} />}

      <div className="flex flex-wrap items-center gap-2 pl-7">
        {group.docs.map((doc, idx) => {
          const isRef = comparable.length > 0 && comparable[refIndex]?.id === doc.id;
          return (
            <span
              key={doc.id}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                doc.error
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : isRef
                    ? "border-primary/50 bg-primary/10 font-medium text-primary"
                    : "border-border/70 bg-muted/40 text-foreground/80"
              }`}
            >
              <span className="tabular-nums text-muted-foreground">{idx + 1}.</span>
              <span className="max-w-56 truncate">{doc.fileName}</span>
              {isRef && <span className="text-[10px] uppercase tracking-wide text-primary/70">ref</span>}
              {doc.error && (
                <ErrorBadge error={doc.error} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function GroupReview() {
  const { groups, stats, setStage, performanceMetrics, comparisonMode, setComparisonMode } = useValidator();

  const accountBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of groups) {
      map.set(g.account, (map.get(g.account) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groups]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatChip icon={<Files className="size-4" />} label="Files parsed" value={stats.parsed} />
        <StatChip icon={<Landmark className="size-4" />} label="Accounts" value={stats.accounts} />
        <StatChip icon={<FolderTree className="size-4" />} label="Report groups" value={stats.groups} />
        <StatChip icon={<GitCompareArrows className="size-4" />} label="Comparable groups" value={stats.comparableGroups} />
        <StatChip icon={<AlertTriangle className="size-4" />} label="Parse failures" value={stats.failed} />
      </div>

      <AccountLevelPicker />

      {/* Comparison mode selector */}
      <Card className="shadow-none border-border/70">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GitCompareArrows className="size-4" />
              Comparison Mode
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setComparisonMode("exact")}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  comparisonMode === "exact"
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted/70",
                )}
              >
                Exact
              </button>
              <button
                type="button"
                onClick={() => setComparisonMode("intelligent")}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  comparisonMode === "intelligent"
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted/70",
                )}
              >
                Intelligent Normalization
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {comparisonMode === "exact"
                ? "Strict comparison — meaningful formatting and value differences are reported."
                : "Normalizes harmless differences (whitespace, spacing, equivalent formatting)."}
            </span>
          </div>
        </CardContent>
      </Card>

      {accountBreakdown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium">
            <Landmark className="size-3.5" />
            Accounts detected:
          </span>
          {accountBreakdown.map(([name, count]) => (
            <span
              key={name}
              className="rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5"
            >
              {name} <b className="tabular-nums">{count}</b>
            </span>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <Card className="shadow-none border-border/70">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              No documents were parsed. Go back and pick a folder or files.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} />
          ))}
        </div>
      )}

      <Card className="shadow-none border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How grouping &amp; comparison works</CardTitle>
          <CardDescription className="text-xs">
            Files sharing a folder and base name are treated as versions of the
            same report — regardless of format. The comparison follows a format
            chain based on priority: <strong>PDF → RTF, PDF → DOCX</strong>,
            then <strong>DOCX → XLSX, XLSX → CSV</strong>. If PDF is absent,
            the chain starts at <strong>DOCX → RTF</strong>. You can select the
            baseline format per group. Each pair is compared using semantic
            content matching — physical line position is NOT the primary key.
            Uncheck a group to exclude it.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={() => setStage("input")} className="gap-2">
          <ArrowLeft className="size-4" />
          Choose different documents
        </Button>
        <Button
          type="button"
          onClick={() => setStage("diffs")}
          disabled={stats.comparableGroups === 0}
          className="gap-2"
        >
          Review differences
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
