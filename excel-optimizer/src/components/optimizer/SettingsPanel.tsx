import { motion } from "framer-motion";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SETTINGS,
  DateFormat,
  FONT_PRESETS,
  HeaderStyle,
  OptimizerSettings,
  TriState,
} from "@eo/lib/excel";

interface Props {
  settings: OptimizerSettings;
  onChange: (s: OptimizerSettings) => void;
}

const SIZE_OPTIONS = [9, 10, 10.5, 11, 12, 14, 16, 18];

function TriStateSelect({
  value,
  onChange,
  labels = { automatic: "Automatic", on: "On", off: "Off" },
}: {
  value: TriState;
  onChange: (v: TriState) => void;
  labels?: Record<TriState, string>;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TriState)}>
      <SelectTrigger className="w-full justify-between" aria-label="Setting value">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="automatic">{labels.automatic}</SelectItem>
        <SelectItem value="on">{labels.on}</SelectItem>
        <SelectItem value="off">{labels.off}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function BinarySelect({ value, onChange, ariaLabel, autoLabel, otherLabel }: { value: "automatic" | "preserve"; onChange: (v: "automatic" | "preserve") => void; ariaLabel: string; autoLabel: string; otherLabel: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as "automatic" | "preserve")}>
      <SelectTrigger className="w-full justify-between" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="automatic">{autoLabel}</SelectItem>
        <SelectItem value="preserve">{otherLabel}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SizeSelect({ value, onChange, ariaLabel }: { value: number; onChange: (n: number) => void; ariaLabel: string }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(parseFloat(v))}>
      <SelectTrigger className="w-full justify-between" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SIZE_OPTIONS.map((s) => (
          <SelectItem key={s} value={String(s)}>
            {s} pt
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="w-40 shrink-0">{children}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/50 px-5 pb-3 pt-4">
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function SettingsPanel({ settings, onChange }: Props) {
  const set = (patch: Partial<OptimizerSettings>) => onChange({ ...settings, ...patch });
  const advanced = settings.mode === "advanced";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Optimization settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The optimizer formats tables, headings and numbers while preserving every formula, value and workbook feature.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => set({ mode: "automatic" })}
          aria-pressed={!advanced}
          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
            !advanced ? "border-brand/60 bg-brand/5 shadow-sm" : "border-border/70 bg-card/50 hover:border-border"
          }`}
        >
          <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${!advanced ? "bg-brand text-white" : "bg-muted text-muted-foreground"}`}>
            <Sparkles className="size-4.5" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Automatic</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              The system decides headings, tables, totals, number formats and layout — nothing to configure.
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => set({ mode: "advanced" })}
          aria-pressed={advanced}
          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
            advanced ? "border-brand/60 bg-brand/5 shadow-sm" : "border-border/70 bg-card/50 hover:border-border"
          }`}
        >
          <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${advanced ? "bg-brand text-white" : "bg-muted text-muted-foreground"}`}>
            <SlidersHorizontal className="size-4.5" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Advanced</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Fine-tune typography, table styling, layout and number handling while keeping the same safety guarantees.
            </p>
          </div>
        </button>
      </div>

      {advanced && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.25 }} className="space-y-3">
          <Group title="Typography">
            <Row label="Global font" hint="Applied to headings and body text">
              <Select value={settings.globalFont} onValueChange={(v) => set({ globalFont: v })}>
                <SelectTrigger className="w-full justify-between" aria-label="Global font">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_PRESETS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Title size">
              <SizeSelect value={settings.titleFontSize} onChange={(v) => set({ titleFontSize: v })} ariaLabel="Title font size" />
            </Row>
            <Row label="Heading size">
              <SizeSelect value={settings.headingFontSize} onChange={(v) => set({ headingFontSize: v })} ariaLabel="Heading font size" />
            </Row>
            <Row label="Subheading size">
              <SizeSelect value={settings.subheadingFontSize} onChange={(v) => set({ subheadingFontSize: v })} ariaLabel="Subheading font size" />
            </Row>
            <Row label="Table header size">
              <SizeSelect value={settings.tableHeaderFontSize} onChange={(v) => set({ tableHeaderFontSize: v })} ariaLabel="Table header font size" />
            </Row>
            <Row label="Body size">
              <SizeSelect value={settings.bodyFontSize} onChange={(v) => set({ bodyFontSize: v })} ariaLabel="Body font size" />
            </Row>
            <SwitchRow
              label="Title-case headings"
              hint="Consistent capitals for titles, subtitles and table headers — data cells are never changed"
              checked={settings.titleCase}
              onChange={(v) => set({ titleCase: v })}
            />
          </Group>

          <Group title="Tables">
            <Row label="Header style" hint="How table header rows are treated">
              <Select value={settings.headerStyle} onValueChange={(v) => set({ headerStyle: v as HeaderStyle })}>
                <SelectTrigger className="w-full justify-between" aria-label="Header style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="accent">Accent</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Borders">
              <TriStateSelect value={settings.borders} onChange={(v) => set({ borders: v })} labels={{ automatic: "Automatic", on: "Thin grid", off: "Off" }} />
            </Row>
            <Row label="Alternating rows" hint="Subtle banding on data tables">
              <TriStateSelect value={settings.alternatingRows} onChange={(v) => set({ alternatingRows: v })} />
            </Row>
            <Row label="Alignment" hint="Text left, numbers right, dates centered">
              <BinarySelect
                value={settings.alignment}
                onChange={(v) => set({ alignment: v })}
                ariaLabel="Alignment"
                autoLabel="Automatic"
                otherLabel="Preserve existing"
              />
            </Row>
            <Row label="Wrap text" hint="Long descriptions wrap instead of overflowing">
              <TriStateSelect value={settings.wrapText} onChange={(v) => set({ wrapText: v })} />
            </Row>
          </Group>

          <Group title="Layout">
            <Row label="Column width" hint="Content-aware, clamped to readable sizes">
              <BinarySelect
                value={settings.columnWidth}
                onChange={(v) => set({ columnWidth: v })}
                ariaLabel="Column width"
                autoLabel="Automatic"
                otherLabel="Preserve"
              />
            </Row>
            <Row label="Row height">
              <BinarySelect
                value={settings.rowHeight}
                onChange={(v) => set({ rowHeight: v })}
                ariaLabel="Row height"
                autoLabel="Automatic"
                otherLabel="Preserve"
              />
            </Row>
            <Row label="Freeze headers" hint="Keep table headers visible when scrolling">
              <TriStateSelect value={settings.freezeHeaders} onChange={(v) => set({ freezeHeaders: v })} />
            </Row>
            <Row label="Auto filter" hint="Add filters on clearly detected tables">
              <TriStateSelect value={settings.autoFilter} onChange={(v) => set({ autoFilter: v })} />
            </Row>
          </Group>

          <Group title="Numbers">
            <SwitchRow label="Number formatting" hint="Thousands separators and consistent decimals" checked={settings.numberFormatting} onChange={(v) => set({ numberFormatting: v })} />
            <SwitchRow label="Currency detection" hint="Professional display, values never change" checked={settings.currencyDetection} onChange={(v) => set({ currencyDetection: v })} />
            <SwitchRow label="Percentage detection" hint="e.g. 0.25 displayed as 25%" checked={settings.percentDetection} onChange={(v) => set({ percentDetection: v })} />
            <SwitchRow label="Date detection" hint="Consistent date display, serials unchanged" checked={settings.dateDetection} onChange={(v) => set({ dateDetection: v })} />
            <Row label="Date format">
              <Select value={settings.dateFormat} onValueChange={(v) => set({ dateFormat: v as DateFormat })}>
                <SelectTrigger className="w-full justify-between" aria-label="Date format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dd-mmm-yyyy">12-Jan-2024</SelectItem>
                  <SelectItem value="yyyy-mm-dd">2024-01-12</SelectItem>
                  <SelectItem value="dd/mm/yyyy">12/01/2024</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </Group>

          <p className="px-1 text-xs text-muted-foreground">
            Reset to defaults:
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_SETTINGS, mode: "advanced" })}
              className="ml-1.5 font-medium text-brand underline-offset-2 hover:underline"
            >
              restore defaults
            </button>
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
