import { Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, GitCompare, FileSearch, Shield, Terminal } from "lucide-react";

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded bg-white/10 text-[11px] font-bold text-foreground">
            M
          </div>
          <span className="text-sm font-semibold tracking-tight">MIP</span>
          <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            v1
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              to="/app"
              className="flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
            >
              Open Dashboard
              <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <Link
              to="/auth"
              className="flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
            >
              Sign In
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-28 pb-20 text-center">
        <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">
          <Terminal className="size-3" />
          Internal tooling for modernization teams
        </div>
        <h1 className="text-3xl font-semibold tracking-tight leading-tight sm:text-4xl">
          Modernization
          <br />
          Intelligence Platform
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground max-w-lg mx-auto">
          Compare legacy and modernized source code, track every difference
          with evidence, and generate test cases once the implementation is
          frozen. Built for QA teams working on large-scale migrations.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to={isAuthenticated ? "/app" : "/auth"}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-5 py-2 text-xs font-medium text-background hover:opacity-90 transition-opacity"
          >
            Get Started
            <ArrowRight className="size-3.5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="border-t border-border px-6 py-20"
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            What's included in v1
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: FileSearch,
                title: "Source Catalog",
                desc: "Upload legacy and MOD source files as a ZIP or individually. Build a complete inventory with language detection, deduplication, and SHA-256 tracking.",
              },
              {
                icon: GitCompare,
                title: "Code Comparison",
                desc: "Compare any legacy file against its MOD counterpart. View additions, removals, and changes side by side with line-level precision and similarity scoring.",
              },
              {
                icon: Shield,
                title: "Evidence Tracking",
                desc: "Every difference is logged with severity, confidence, and resolution status. Team members can comment, mark intentional changes, and track fixes.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-border bg-card p-5"
              >
                <f.icon
                  className="mb-3 size-5 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <h3 className="text-sm font-medium">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Design principles
          </h2>
          <div className="mt-8 space-y-2">
            {[
              "Evidence before assumption — the platform never invents business requirements.",
              "Every difference is traceable: legacy code → gap → evidence → resolution.",
              "Local-first and secure by default — no external API calls, no telemetry.",
              "Built for developers and testers working on large-scale enterprise migrations.",
            ].map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3"
              >
                <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {p}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 text-center">
        <p className="text-[11px] text-muted-foreground">
          Modernization Intelligence Platform · Internal use
        </p>
      </footer>
    </div>
  );
}
