import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Ban,
  Check,
  CloudOff,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  FolderTree,
  GitCompareArrows,
  Layers,
  Lock,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

const FORMATS = [
  { icon: FileText, name: ".docx" },
  { icon: FileText, name: ".rtf" },
  { icon: FileSpreadsheet, name: ".xlsx" },
  { icon: FileSpreadsheet, name: ".xls" },
  { icon: FileSpreadsheet, name: ".csv" },
  { icon: FileText, name: ".pdf" },
];

const NEVER_INTEGRATES = [
  "No OpenAI",
  "No Anthropic",
  "No Google",
  "No Microsoft",
  "No Hugging Face",
  "No cloud storage",
  "No analytics",
  "No telemetry",
];

const FEATURES = [
  {
    icon: FolderTree,
    title: "Automatic version discovery",
    body: "Point at a report folder and groups are built for you — files sharing a base name and format become versions, from 2 up to 20+ in one run.",
  },
  {
    icon: GitCompareArrows,
    title: "N-way reference comparison",
    body: "Every version is diffed against a reference you choose. See what each of 3, 4, or more versions changed at the same place, side by side.",
  },
  {
    icon: FileSpreadsheet,
    title: "Cell-level spreadsheet diffs",
    body: "Excel and CSV reports are compared sheet by sheet, cell by cell — including added sheets, appended rows, and removed columns.",
  },
  {
    icon: Fingerprint,
    title: "Scope-based ignore rules",
    body: "Ignore one occurrence, a location, a report, an account, or globally. Rules persist as SHA-256 structural fingerprints — never the values.",
  },
  {
    icon: Download,
    title: "Local HTML / Excel reports",
    body: "Export a clean audit report in HTML or Excel (xlsx) with every difference. Generated in your browser and downloaded straight to your machine.",
  },
  {
    icon: ShieldCheck,
    title: "Zero-cost, zero-API engine",
    body: "Parsing, grouping, and diffing run entirely on-device with no paid API. Optional AI summaries via a local model like Ollama, never required.",
  },
];

const WORKFLOW = [
  {
    step: "01",
    title: "Select your input",
    body: "Pick a root folder of report packages (Mode A) or drop individual version files (Mode B).",
  },
  {
    step: "02",
    title: "Versions are grouped",
    body: "salesreport_2608041001.docx, …_1002, …_1003 become one report with three versions. Choose the reference.",
  },
  {
    step: "03",
    title: "Review differences",
    body: "Word-level line diffs for documents, cell-by-cell diffs for sheets — with filters and per-difference ignore actions.",
  },
  {
    step: "04",
    title: "Export & remember",
    body: "Download the audit report locally, and persist only hashed ignore rules for future runs.",
  },
];

const FAQS = [
  {
    q: "Is my confidential data or PHI ever uploaded?",
    a: "No. Documents are parsed entirely in your browser with local engines (Word, Excel/SheetJS, PDF.js, RTF). No bytes, extracted text, cell values, filenames, or metadata are ever sent to any server — there are no network calls for document data at all.",
  },
  {
    q: "What exactly gets saved to my account?",
    a: "Only two things: your sign-in identity, and ignore rules. Ignore rules store SHA-256 hashes of structural fingerprints (account, report, location signature, difference type, comparison mode) — never the values that differed. Nothing sensitive can be recovered from them.",
  },
  {
    q: "How does automatic grouping decide which files are versions?",
    a: "Files in the same folder with the same base name and format are treated as versions of one report. A trailing version token (date, v2, final, draft, …) is stripped from the name, and versions are ordered naturally. You can change the reference version per group or uncheck groups.",
  },
  {
    q: "Does it need AI? Is a paid API required?",
    a: "No to both. The core engine — parsing, grouping, comparison, ignore rules, reporting — works 100% without AI and costs nothing to run. An optional enhancement can summarize differences with a locally running model such as Ollama, with no cloud calls.",
  },
  {
    q: "What happens to my data after a session ends?",
    a: "Everything parsed lives in page memory for the session only. “End session” discards it all immediately; closing the tab does the same. Reports you explicitly download stay only in the file you saved.",
  },
];

function HeroMock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15 }}
      className="relative"
    >
      <div className="absolute -inset-6 rounded-3xl bg-amber-500/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c1118] shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-red-400/80" />
          <span className="size-2.5 rounded-full bg-amber-400/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 font-mono text-xs text-slate-500">
            validator — session 8f2c
          </span>
          <span className="ml-auto rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
            0 bytes uploaded
          </span>
        </div>
        <div className="space-y-3 p-4 font-mono text-xs leading-5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div>
              <div className="text-slate-300">Package 1 / Non-Phi</div>
              <div className="mt-0.5 text-slate-500">
                salesreport_2608041001 → _1002 → _1003
              </div>
            </div>
            <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-amber-300">
              3 versions
            </span>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
              <span>Net revenue</span>
              <span className="text-slate-400">Sheet “Summary” · C5</span>
            </div>
            <div className="mt-1.5 text-slate-400">
              v1{" "}
              <span className="text-red-400 line-through decoration-red-400/60">
                $1,240,000
              </span>
            </div>
            <div className="mt-0.5 text-slate-400">
              v2{" "}
              <span className="text-emerald-300">$1,280,000</span>
            </div>
            <div className="mt-0.5 text-slate-500">v3 — unchanged</div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Line 41 · docx</div>
            <div className="mt-1 text-slate-400">
              <span className="text-red-400 line-through decoration-red-400/60">Outstanding balance</span>{" "}
              <span className="text-emerald-300">Current balance</span> as of
              period end
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-slate-400">
            <span className="flex items-center gap-2">
              <Check className="size-3.5 text-emerald-400" />
              4 differences found
            </span>
            <span className="text-slate-500">1 ignored · fingerprint a3f9…c21b</span>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute -left-6 -top-5 hidden rounded-xl border border-white/10 bg-[#0c1118] px-3 py-2 font-mono text-[11px] text-slate-300 shadow-xl sm:block"
      >
        <Lock className="mr-1.5 inline size-3 text-emerald-400" />
        SHA-256 fingerprint only
      </motion.div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="absolute -bottom-5 -right-4 hidden rounded-xl border border-white/10 bg-[#0c1118] px-3 py-2 font-mono text-[11px] text-slate-300 shadow-xl sm:block"
      >
        <CloudOff className="mr-1.5 inline size-3 text-amber-400" />
        processed locally
      </motion.div>
    </motion.div>
  );
}

export default function Landing() {
  return (
    <div className="dark min-h-screen bg-[#07090d] text-slate-200 antialiased selection:bg-amber-400/30">
      {/* Background grid + glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
        }}
      />
      <div className="pointer-events-none fixed left-1/2 top-[-320px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#07090d]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <a href="#" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400 text-[#07090d]">
              <FileCheck2 className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Document Version <span className="text-amber-400">Validator</span>
            </span>
          </a>
          <nav className="ml-6 hidden items-center gap-5 text-sm text-slate-400 lg:flex">
            <a href="#features" className="transition-colors hover:text-slate-200">Features</a>
            <a href="#workflow" className="transition-colors hover:text-slate-200">Workflow</a>
            <a href="#privacy" className="transition-colors hover:text-slate-200">Privacy</a>
            <a href="#faq" className="transition-colors hover:text-slate-200">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Local-only
            </span>
            <Button
              asChild
              className="gap-2 rounded-lg bg-amber-400 font-medium text-[#07090d] shadow-lg shadow-amber-400/20 hover:bg-amber-300"
            >
              <a href="/auth?returnTo=%2Fdashboard">
                Launch validator
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300"
            >
              <ScanSearch className="size-3.5 text-amber-400" />
              Multi-version document validation &amp; comparison
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              Know <span className="text-amber-400">exactly what changed</span> between document versions.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-5 max-w-xl text-base leading-7 text-slate-400"
            >
              Drop in a folder of business reports and get a validated, diff-by-diff
              audit of every version — Word, Excel, CSV, RTF, and PDF. Runs 100%
              in your browser, costs nothing, and is safe for confidential and
              PHI-bearing documents.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button
                asChild
                className="h-11 gap-2 rounded-lg bg-amber-400 px-6 font-medium text-[#07090d] shadow-lg shadow-amber-400/20 hover:bg-amber-300"
              >
                <a href="/auth?returnTo=%2Fdashboard">
                  Start validating
                  <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 gap-2 rounded-lg border-white/15 bg-white/[0.03] px-6 text-slate-200 hover:bg-white/[0.07] hover:text-white"
              >
                <a href="#workflow">See how it works</a>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500"
            >
              <span className="flex items-center gap-1.5">
                <Wallet className="size-3.5 text-emerald-400" /> $0.00 runtime
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-emerald-400" /> 100% in-browser · no uploads
              </span>
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5 text-emerald-400" /> 2 – 20+ versions
              </span>
            </motion.div>
          </div>

          <HeroMock />
        </div>

        {/* Format strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-2.5"
        >
          {FORMATS.map((f) => (
            <span
              key={f.name}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-slate-300"
            >
              <f.icon className="size-3.5 text-amber-400/80" />
              {f.name}
            </span>
          ))}
          <span className="ml-2 text-xs text-slate-500">parsed on-device</span>
        </motion.div>
      </section>

      {/* Privacy contract */}
      <section id="privacy" className="relative border-y border-white/5 bg-[#0a0e14]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <div>
              <Badge variant="outline" className="mb-4 border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-300">
                <ShieldCheck className="mr-1.5 size-3.5" />
                Privacy contract
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Your data never leaves this device.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-400">
                Built first for confidentiality. The comparison engine never talks
                to an external service — for validation, for AI, or for analytics.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {NEVER_INTEGRATES.map((item) => (
                  <span
                    key={item}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400"
                  >
                    <Ban className="size-3 text-red-400/80" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  icon: CloudOff,
                  title: "Zero uploads",
                  body: "docx, xlsx, pdf and more are parsed with in-browser engines. No network requests carry document data.",
                },
                {
                  icon: Database,
                  title: "Memory-only",
                  body: "Extracted text and cell values exist in page memory for the session, then are discarded.",
                },
                {
                  icon: Fingerprint,
                  title: "Hash-only rules",
                  body: "Ignore decisions persist as SHA-256 structural fingerprints — never the underlying values.",
                },
                {
                  icon: Download,
                  title: "Local exports",
                  body: "Audit reports are generated and downloaded in your browser, straight to your machine.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <card.icon className="size-5 text-amber-400" />
                  <h3 className="mt-3 text-sm font-semibold text-white">{card.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-400">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4 border-white/10 bg-white/[0.04] px-3 py-1 text-slate-300">
            <Sparkles className="mr-1.5 size-3.5 text-amber-400" />
            Features
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            An audit engine for report versions
          </h2>
          <p className="mt-4 text-base text-slate-400">
            Everything a validation desk needs — grouping, diffing, ignoring,
            and reporting — without leaving the browser.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-amber-400/30 hover:bg-white/[0.04]"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-y border-white/5 bg-[#0a0e14]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4 border-white/10 bg-white/[0.04] px-3 py-1 text-slate-300">
              <GitCompareArrows className="mr-1.5 size-3.5 text-amber-400" />
              Workflow
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              From folder to audit report in four steps
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW.map((w, i) => (
              <motion.div
                key={w.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="relative rounded-xl border border-white/10 bg-white/[0.02] p-6"
              >
                <span className="font-mono text-3xl font-bold text-amber-400/30">{w.step}</span>
                <h3 className="mt-3 text-sm font-semibold text-white">{w.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{w.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <Badge variant="outline" className="mb-4 border-white/10 bg-white/[0.04] px-3 py-1 text-slate-300">
            FAQ
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Questions, answered
          </h2>
        </div>
        <Accordion type="single" collapsible className="mt-10">
          {FAQS.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-white/10">
              <AccordionTrigger className="text-left text-sm font-medium text-slate-200 hover:text-white">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-7 text-slate-400">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#141a24] via-[#0c1118] to-[#07090d] p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[600px] -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Validate your next report in minutes.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base text-slate-400">
            Free, private, and local-first. Create an account to keep your
            hashed ignore rules in sync — your documents never leave your device.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              className="h-11 gap-2 rounded-lg bg-amber-400 px-7 font-medium text-[#07090d] shadow-lg shadow-amber-400/25 hover:bg-amber-300"
            >
              <a href="/auth?returnTo=%2Fdashboard">
                Launch the validator
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-lg border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:text-white"
            >
              <a href="#privacy">Read the privacy contract</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <FileCheck2 className="size-4 text-amber-400" />
            Document Version Validator
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5" />
              Local-first
            </span>
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              Zero-cost
            </span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
