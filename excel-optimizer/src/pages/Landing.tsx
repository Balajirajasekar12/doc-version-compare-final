import { motion } from "framer-motion";
import {
  ArrowDown,
  BarChart3,
  FileSpreadsheet,
  Fingerprint,
  Grid3X3,
  Image as ImageIcon,
  Lock,
  Palette,
  ScanSearch,
  ShieldCheck,
  Sigma,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OptimizerApp } from "@eo/components/optimizer/OptimizerApp";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ------------------------------ Nav ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <FileSpreadsheet className="size-4.5" strokeWidth={1.9} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Excel Optimizer</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">What is preserved</a>
            <a href="#privacy" className="transition-colors hover:text-foreground">Privacy</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1.5 border-border/70 px-3 py-1 text-[11px] font-medium">
              <ShieldCheck className="size-3.5 text-brand" />
              100% private · in-browser
            </Badge>
            <Button asChild variant="outline" size="sm" className="cursor-pointer">
              <Link to="/dashboard">Open optimizer</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ------------------------------ Hero ----------------------------- */}
        <section className="relative">
          {/* Ambient background */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-brand/[0.07] blur-3xl" />
            <div className="absolute top-40 -right-40 h-72 w-72 rounded-full bg-brand/[0.05] blur-3xl" />
            <div className="absolute top-64 -left-40 h-72 w-72 rounded-full bg-brand/[0.04] blur-3xl" />
          </div>

          <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-16 text-center sm:pt-20">
            <motion.div initial="hidden" animate="show" variants={fadeUp}>
              <Badge variant="outline" className="mb-6 gap-2 rounded-full border-brand/30 bg-brand/5 px-3.5 py-1.5 text-xs font-medium text-brand">
                <Zap className="size-3.5" />
                Zero-cost · open source · runs entirely in your browser
              </Badge>
            </motion.div>

            <motion.h1
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl"
            >
              Make your Excel files clean, consistent and professional —{" "}
              <span className="text-brand">without touching your data.</span>
            </motion.h1>

            <motion.p
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Upload a workbook and the optimizer detects titles, tables, totals and number columns — then applies a
              consistent corporate style. Formulas, values, charts, pivot tables, merges and macros are preserved exactly.
            </motion.p>

            {/* The tool */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 text-left"
            >
              <div className="rounded-3xl border border-border/70 bg-card/70 p-2 shadow-xl shadow-black/[0.04] backdrop-blur">
                <div className="rounded-[20px] border border-border/50 bg-card px-5 py-8 sm:px-8">
                  <OptimizerApp />
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Supported: <span className="font-medium text-foreground/80">.xlsx</span> ·{" "}
                <span className="font-medium text-foreground/80">.xlsm</span> (macros preserved) ·{" "}
                <span className="font-medium text-foreground/80">.xls</span> (converted to modern format) — up to 30 MB
              </p>
              <p className="mt-3 text-center text-xs">
                <Link
                  to="/dashboard"
                  className="font-medium text-brand underline-offset-2 hover:underline"
                >
                  Open the full workspace with run history
                </Link>
              </p>
            </motion.div>
          </div>
        </section>

        {/* --------------------------- Trust strip -------------------------- */}
        <section className="border-y border-border/60 bg-muted/30">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 sm:grid-cols-4">
            {[
              { icon: Lock, title: "Nothing uploaded", text: "All processing happens in your browser" },
              { icon: Sigma, title: "Formulas preserved", text: "Validated before and after, zero changes" },
              { icon: Wand2, title: "Formatting only", text: "Presentation is optimized, content is never edited" },
              { icon: Zap, title: "Free forever", text: "Open source libraries, no API keys, no servers" },
            ].map((f) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.4 }} className="flex flex-col items-center gap-2.5 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-card text-brand">
                  <f.icon className="size-5" strokeWidth={1.7} />
                </span>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="max-w-[190px] text-xs leading-relaxed text-muted-foreground">{f.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* --------------------------- How it works ------------------------- */}
        <section id="how" className="mx-auto w-full max-w-5xl scroll-mt-20 px-5 py-20">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Three steps to a professional workbook</h2>
          </motion.div>

          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: FileSpreadsheet,
                title: "Upload",
                text: "Drop any .xlsx, .xlsm or .xls workbook. It is analyzed locally and never leaves your device.",
              },
              {
                step: "02",
                icon: ScanSearch,
                title: "The engine reads like an analyst",
                text: "Titles, section headings, table headers, data rows, totals, notes and number columns are detected from context — not guessed from single cells.",
              },
              {
                step: "03",
                icon: Palette,
                title: "Format & download",
                text: "A consistent, modern style is applied: crisp fonts, banded tables, aligned numbers, sized columns, frozen headers. Download the optimized file instantly.",
              },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative rounded-2xl border border-border/70 bg-card/60 p-6 transition-shadow hover:shadow-lg hover:shadow-black/[0.04]"
              >
                <span className="absolute right-5 top-4 text-4xl font-bold text-border/70 transition-colors group-hover:text-brand/20">{s.step}</span>
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <s.icon className="size-5.5" strokeWidth={1.7} />
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* --------------------------- Features ----------------------------- */}
        <section id="features" className="scroll-mt-20 border-t border-border/60 bg-muted/20">
          <div className="mx-auto w-full max-w-5xl px-5 py-20">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Preserved, not rewritten</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Everything that matters stays exactly the same</h2>
              <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
                The optimizer only changes presentation. Before delivering the file, it re-reads the output and validates
                it against the original — if anything changed unexpectedly, no file is produced.
              </p>
            </motion.div>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Sigma, title: "Formulas", text: "Every formula, reference and cached result is inventoried and verified byte-for-byte before delivery." },
                { icon: BarChart3, title: "Charts", text: "Charts, chart data and chart references are preserved exactly — never recreated." },
                { icon: Grid3X3, title: "Pivot tables", text: "Pivot tables, pivot caches and their source data are left untouched." },
                { icon: Grid3X3, title: "Merged cells", text: "Merged ranges are preserved exactly as they were." },
                { icon: ImageIcon, title: "Images", text: "Images and screenshots are preserved in place with their positions intact." },
                { icon: Lock, title: "Macros (.xlsm)", text: "VBA projects are kept byte-for-byte and the output stays a macro-enabled workbook." },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
                  className="rounded-2xl border border-border/70 bg-card/60 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <f.icon className="size-4.5" strokeWidth={1.7} />
                    </span>
                    <h3 className="text-sm font-semibold tracking-tight">{f.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------- Privacy ----------------------------- */}
        <section id="privacy" className="mx-auto w-full max-w-5xl scroll-mt-20 px-5 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/[0.07] via-card to-card p-8 sm:p-12"
          >
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-brand/10 blur-3xl" />
            <div className="relative grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Privacy & security</p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Your data never leaves your device</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Your Excel file is processed securely in your browser. Temporary in-memory copies are discarded as soon
                  as the session ends, nothing is stored, and no workbook content is ever sent to any server.
                </p>
              </div>
              <ul className="space-y-4">
                {[
                  { icon: Fingerprint, text: "No uploads — the file is analyzed and optimized entirely in your browser" },
                  { icon: Lock, text: "No execution of uploaded files — nothing in your workbook is ever run" },
                  { icon: ShieldCheck, text: "Uploaded filenames are never trusted; format is verified from file contents" },
                  { icon: Sparkles, text: "No AI services, no API keys, no accounts — free and deterministic" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/85">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-brand">
                      <item.icon className="size-4" strokeWidth={1.7} />
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </section>

        {/* ------------------------------ FAQ ------------------------------- */}
        <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-20 px-5 pb-24">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={fadeUp} className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">FAQ</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Good questions</h2>
          </motion.div>
          <div className="mt-10 space-y-3">
            {[
              {
                q: "Will my formulas change?",
                a: "No. Formulas, references and cached results are inventoried before optimization and compared cell-by-cell after. If even one formula changed, the output is rejected.",
              },
              {
                q: "Do you change my data?",
                a: "Never. Cell values, text and workbook logic are immutable. Only presentation is optimized — fonts, fills, borders, alignment, widths, heights, freeze panes and filters.",
              },
              {
                q: "Are my charts and pivot tables safe?",
                a: "Yes. Charts, pivot tables, images, merges, data validation and conditional formatting are preserved byte-for-byte. The engine only rewrites worksheet styling and layout parts.",
              },
              {
                q: "Why does .xls become .xlsx?",
                a: "Legacy .xls is converted to the modern format so it can be styled safely. Values, formulas, merges and basic formats carry over; embedded charts and images from legacy files are disclosed as a limitation.",
              },
              {
                q: "Is there any cost or account?",
                a: "None. The app runs on open-source libraries entirely in your browser — no sign-up, no API keys, no servers.",
              },
            ].map((item) => (
              <details key={item.q} className="group rounded-2xl border border-border/70 bg-card/60 px-6 py-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ArrowDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* ------------------------------ Footer ------------------------------ */}
      <footer className="border-t border-border/60 bg-muted/20">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <FileSpreadsheet className="size-3.5" strokeWidth={1.9} />
            </span>
            <span className="font-medium text-foreground">Excel Optimizer</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5 text-brand" />
            Clean · Format · Standardize · Preserve — free, private, in your browser
          </p>
        </div>
      </footer>
    </div>
  );
}
