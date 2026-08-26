/**
 * DVC Debug Panel
 *
 * Shows raw extraction output from each document parser and the canonical
 * representation used for comparison. This helps diagnose false differences.
 *
 * ONLY affects DVC — does not touch EO or MIP code.
 */

import { useState } from "react";
import { useValidator } from "@/context/ValidatorContext";
import { toCanonical, compareCanonical, type ContentItem, type CanonicalMatchResult } from "@/lib/validator/canonical";
import { comparableDocs } from "@/lib/validator/grouping";
import {
  buildComparisonChain,
  getDefaultBaseline,
  findDocForFormat,
} from "@/lib/validator/chain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Bug,
  FileText,
  Copy,
  Check,
} from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}

function RawLinesSection({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const preview = lines.slice(0, 5).join("\n");
  const fullText = lines.join("\n");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs hover:border-white/20"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
          )}
          <span className="font-medium text-slate-300">{title}</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {lines.length} lines
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded border border-white/10 bg-black/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Raw extracted lines
            </span>
            <CopyButton text={fullText} />
          </div>
          <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap font-mono">
            {isOpen ? fullText : preview}
          </pre>
          {!isOpen && lines.length > 5 && (
            <span className="text-[10px] text-slate-500">
              ... and {lines.length - 5} more lines
            </span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CanonicalItemsSection({
  title,
  items,
}: {
  title: string;
  items: ContentItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const itemsByKind = {
    field_value: items.filter((i) => i.kind === "field_value"),
    heading: items.filter((i) => i.kind === "heading"),
    paragraph: items.filter((i) => i.kind === "paragraph"),
    list_item: items.filter((i) => i.kind === "list_item"),
    table_cell: items.filter((i) => i.kind === "table_cell"),
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs hover:border-white/20"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
          )}
          <span className="font-medium text-slate-300">{title}</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {items.length} items
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded border border-white/10 bg-black/40 p-3 space-y-2">
          {Object.entries(itemsByKind).map(([kind, kindItems]) =>
            kindItems.length > 0 ? (
              <div key={kind}>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  {kind} ({kindItems.length})
                </div>
                <div className="space-y-0.5">
                  {kindItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-[11px] font-mono text-slate-400"
                    >
                      <span className="text-slate-500">[{item.key}]</span>{" "}
                      <span className="text-slate-300">{item.label}</span>
                      <span className="text-slate-500"> → </span>
                      <span className="text-emerald-400/80">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ComparisonPairDebug({
  baselineDoc,
  comparingDoc,
  groupLabel,
}: {
  baselineDoc: { id: string; fileName: string; ext: string; content?: { type: string; lines?: string[] } };
  comparingDoc: { id: string; fileName: string; ext: string; content?: { type: string; lines?: string[] } };
  groupLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Compute canonical representations
  const baselineCanonical = toCanonical(baselineDoc as never);
  const comparingCanonical = toCanonical(comparingDoc as never);

  // Get raw lines
  const baselineLines =
    baselineDoc.content?.type === "text"
      ? (baselineDoc.content as { type: "text"; lines: string[] }).lines
      : [];
  const comparingLines =
    comparingDoc.content?.type === "text"
      ? (comparingDoc.content as { type: "text"; lines: string[] }).lines
      : [];

  // Use the ACTUAL comparison engine to find real differences
  const matchResult: CanonicalMatchResult = compareCanonical(
    baselineCanonical,
    comparingCanonical,
    "intelligent",
  );

  // Extract mismatched items from the real comparison
  const mismatchedItems = matchResult.matched.filter(m => !m.identical);
  const missingItems = matchResult.missingInComparing;
  const addedItems = matchResult.addedInComparing;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs hover:border-white/20"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
          )}
          <FileText className="h-3 w-3 text-amber-400" />
          <span className="font-medium text-slate-300">
            {baselineDoc.fileName} → {comparingDoc.fileName}
          </span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {baselineCanonical.items.length} vs{" "}
            {comparingCanonical.items.length} items
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-3 rounded border border-white/10 bg-black/40 p-3">
          {/* Raw lines */}
          <RawLinesSection
            title={`${baselineDoc.ext.toUpperCase()} Raw Lines (${baselineDoc.fileName})`}
            lines={baselineLines}
          />
          <RawLinesSection
            title={`${comparingDoc.ext.toUpperCase()} Raw Lines (${comparingDoc.fileName})`}
            lines={comparingLines}
          />

          {/* Canonical items */}
          <CanonicalItemsSection
            title={`${baselineDoc.ext.toUpperCase()} Canonical Items`}
            items={baselineCanonical.items}
          />
          <CanonicalItemsSection
            title={`${comparingDoc.ext.toUpperCase()} Canonical Items`}
            items={comparingCanonical.items}
          />

          {/* Mismatched items (value differences) */}
          {mismatchedItems.length > 0 && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="text-[10px] text-amber-400 uppercase tracking-wider mb-2 font-medium">
                ⚠ Value Mismatches ({mismatchedItems.length})
              </div>
              <div className="space-y-2">
                {mismatchedItems.map((m, idx) => (
                  <div key={idx} className="text-[11px] font-mono space-y-1">
                    <div className="text-slate-400">
                      Key: <span className="text-slate-300">{m.baseline.key}</span>
                    </div>
                    <div className="pl-3">
                      <div className="text-emerald-400/80">
                        {baselineDoc.ext.toUpperCase()}: {m.baseline.value}
                      </div>
                      <div className="text-rose-400/80">
                        {comparingDoc.ext.toUpperCase()}: {m.comparing.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing content (in baseline but not in comparing) */}
          {missingItems.length > 0 && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3">
              <div className="text-[10px] text-rose-400 uppercase tracking-wider mb-2 font-medium">
                ✗ Missing in {comparingDoc.ext.toUpperCase()} ({missingItems.length})
              </div>
              <div className="space-y-1">
                {missingItems.map((item, idx) => (
                  <div key={idx} className="text-[11px] font-mono text-slate-400">
                    <span className="text-slate-500">[{item.key}]</span>{' '}
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-slate-500"> → </span>
                    <span className="text-emerald-400/80">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Added content (in comparing but not in baseline) */}
          {addedItems.length > 0 && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-[10px] text-emerald-400 uppercase tracking-wider mb-2 font-medium">
                + Added in {comparingDoc.ext.toUpperCase()} ({addedItems.length})
              </div>
              <div className="space-y-1">
                {addedItems.map((item, idx) => (
                  <div key={idx} className="text-[11px] font-mono text-slate-400">
                    <span className="text-slate-500">[{item.key}]</span>{' '}
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-slate-500"> → </span>
                    <span className="text-rose-400/80">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-medium">
              Comparison Summary
            </div>
            <div className="text-[11px] font-mono text-slate-400 space-y-0.5">
              <div>Matched: <span className="text-emerald-400">{matchResult.matched.length}</span></div>
              <div>Identical: <span className="text-emerald-400">{matchResult.matched.filter(m => m.identical).length}</span></div>
              <div>Value mismatches: <span className="text-amber-400">{mismatchedItems.length}</span></div>
              <div>Missing in {comparingDoc.ext.toUpperCase()}: <span className="text-rose-400">{missingItems.length}</span></div>
              <div>Added in {comparingDoc.ext.toUpperCase()}: <span className="text-emerald-400">{addedItems.length}</span></div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DebugPanel() {
  const { groups, enabledGroups, baselineFormatByGroup } = useValidator();
  const [showDebug, setShowDebug] = useState(false);

  // Build debug data for all enabled groups
  const debugPairs = groups
    .filter((g) => enabledGroups[g.id] !== false)
    .flatMap((group) => {
      const comparable = comparableDocs(group);
      if (comparable.length < 2) return [];

      const userBaseline = baselineFormatByGroup[group.id];
      const baselineFormat = userBaseline
        ? (userBaseline as import("@/lib/validator/types").DocKind)
        : getDefaultBaseline(group);

      const chain = buildComparisonChain(group, baselineFormat);
      const pairs: Array<{
        baselineDoc: (typeof comparable)[0];
        comparingDoc: (typeof comparable)[0];
        groupLabel: string;
      }> = [];

      for (const pair of chain.pairs) {
        const baselineDoc = findDocForFormat(group, pair.baselineFormat);
        const comparingDoc = findDocForFormat(group, pair.comparingFormat);
        if (baselineDoc && comparingDoc) {
          pairs.push({
            baselineDoc: baselineDoc as (typeof comparable)[0],
            comparingDoc: comparingDoc as (typeof comparable)[0],
            groupLabel: group.stem,
          });
        }
      }

      return pairs;
    });

  if (debugPairs.length === 0) return null;

  return (
    <Card className="shadow-none border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base">
              Debug: Extraction &amp; Comparison Analysis
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs"
          >
            {showDebug ? "Hide" : "Show"}
          </Button>
        </div>
      </CardHeader>
      {showDebug && (
        <CardContent>
          <p className="text-xs text-slate-400 mb-4">
            This debug panel shows the raw text extracted from each document and
            the canonical representation used for comparison. Use this to
            diagnose why false differences appear.
          </p>
          <div className="space-y-2">
            {debugPairs.map((pair, idx) => (
              <ComparisonPairDebug
                key={idx}
                baselineDoc={pair.baselineDoc}
                comparingDoc={pair.comparingDoc}
                groupLabel={pair.groupLabel}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
