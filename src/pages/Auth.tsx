import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, FileCheck2, Lock, ShieldCheck, Wallet } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { startSession } from "@/lib/session";

/**
 * Auth entry point.
 *
 * This product is local-first: documents are parsed entirely in the browser
 * and no account is required to use the validator. "Signing in" starts a
 * local session so ignore rules persist on this device, then routes the user
 * to their intended destination (returnTo, default: the validator dashboard).
 */
export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/dashboard";

  const handleContinue = () => {
    startSession();
    navigate(returnTo, { replace: true });
  };

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
      <div className="pointer-events-none fixed left-1/2 top-[-280px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#07090d]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400 text-[#07090d]">
              <FileCheck2 className="size-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Document Version <span className="text-amber-400">Validator</span>
            </span>
          </a>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Local-only
            </span>
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-lg border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:text-white"
            >
              <a href="/">Back to home</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-400 text-[#07090d]">
              <ShieldCheck className="size-6" />
            </div>
            <h1 className="mt-5 text-center text-2xl font-bold tracking-tight text-white">
              Start validating
            </h1>
            <p className="mt-2 text-center text-sm leading-6 text-slate-400">
              Signing in is optional — the engine runs 100% in your browser and
              your documents never leave this device. A local session simply
              keeps your hashed ignore rules on this browser.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              {[
                { icon: Lock, text: "Documents are parsed locally — zero uploads" },
                { icon: Wallet, text: "Free to use, no API or AI service required" },
                { icon: ShieldCheck, text: "Ignore rules store SHA-256 hashes only" },
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-5 text-slate-300"
                >
                  <item.icon className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                  {item.text}
                </div>
              ))}
            </div>

            <Button
              type="button"
              onClick={handleContinue}
              className="mt-6 h-11 w-full gap-2 rounded-lg bg-amber-400 font-medium text-[#07090d] shadow-lg shadow-amber-400/20 hover:bg-amber-300"
            >
              Continue to the validator
              <ArrowRight className="size-4" />
            </Button>
            <p className="mt-3 text-center text-[11px] text-slate-500">
              No email or password needed. Nothing is uploaded or tracked.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
