"use client";

import { useState } from "react";
import { ArrowRight, Check, FileSearch, Headset, ShieldCheck, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { CallFlow } from "@/lib/use-call-flow";
import { cn } from "@/lib/utils";

const PRINCIPLES = [
  { icon: Sparkles, label: "AI recommends" },
  { icon: ShieldCheck, label: "You decide" },
  { icon: FileSearch, label: "Fully audited" },
];

function GradientMesh() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Subtle dot grid - Linear style */}
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.15]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />
      {/* Gradient mesh orbs - Stripe style */}
      <div className="absolute top-[10%] -left-[20%] h-[500px] w-[500px] rounded-full bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-transparent blur-[100px] dark:from-violet-500/30 dark:via-purple-500/15" />
      <div className="absolute top-[30%] -right-[10%] h-[400px] w-[400px] rounded-full bg-gradient-to-bl from-blue-500/15 via-cyan-500/10 to-transparent blur-[80px] dark:from-blue-500/20 dark:via-cyan-500/10" />
      <div className="absolute -bottom-[10%] left-[20%] h-[300px] w-[300px] rounded-full bg-gradient-to-tr from-emerald-500/10 to-transparent blur-[60px] dark:from-emerald-500/15" />
    </div>
  );
}

export function StartScreen({ flow }: { flow: CallFlow }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const scenarioId = selected ?? flow.scenarios[0]?.id ?? null;

  const start = async () => {
    if (!scenarioId) return;
    setStarting(true);
    await flow.actions.startCall(scenarioId);
    setStarting(false);
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-y-auto bg-gradient-to-b from-background via-background to-muted/20 dark:from-[#0a0a0b] dark:via-[#0a0a0b] dark:to-[#0f0f12]">
      <GradientMesh />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center px-6 py-12 sm:py-16">
        {/* Hero icon with glow */}
        <div className="relative mb-8">
          <div
            className={cn(
              "absolute -inset-4 rounded-3xl bg-gradient-to-b from-violet-500/20 to-violet-500/0 opacity-0 blur-2xl transition-opacity duration-500",
              hovered && "opacity-100",
            )}
          />
          <div
            className="group relative flex size-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.12] to-white/[0.04] shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_2px_4px_rgba(0,0,0,0.05),0_12px_24px_rgba(0,0,0,0.05)] backdrop-blur-sm transition-transform duration-300 hover:scale-105 sm:size-16 dark:border-white/[0.06] dark:from-white/[0.08] dark:to-white/[0.02] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_2px_4px_rgba(0,0,0,0.4),0_12px_24px_rgba(0,0,0,0.4)]"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <Headset className="size-6 text-foreground/80 transition-colors duration-300 group-hover:text-violet-500 sm:size-7 dark:text-white/70 dark:group-hover:text-violet-400" />
          </div>
        </div>

        {/* Headline */}
        <h1 className="mb-3 text-center text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl dark:text-white">
          Ready for calls
        </h1>
        <p className="mb-10 max-w-sm text-center text-[15px] leading-relaxed text-muted-foreground dark:text-white/50">
          Your AI co-pilot briefs you, follows the conversation, and prepares policy-backed resolutions.
        </p>

        {/* Glassy card */}
        <div className="w-full rounded-xl border border-black/[0.04] bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.06),0_8px_16px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.03] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.5)]">
          {/* Scenario list */}
          <div className="p-4 sm:p-5">
            <div role="radiogroup" aria-label="Demo scenario" className="space-y-2">
              {flow.scenarios.length === 0 && <Skeleton className="h-16 w-full rounded-lg" />}
              {flow.scenarios.map((s, i) => {
                const checked = scenarioId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setSelected(s.id)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-all duration-200 outline-none",
                      checked
                        ? "border-violet-500/30 bg-violet-500/[0.06] dark:border-violet-400/20 dark:bg-violet-500/[0.08]"
                        : "border-transparent bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]",
                      "focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                        checked
                          ? "border-violet-500 bg-violet-500 text-white dark:border-violet-400 dark:bg-violet-400"
                          : "border-black/20 dark:border-white/20",
                      )}
                    >
                      {checked && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="rounded bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground dark:bg-white/[0.06]">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-[13px] font-medium text-foreground dark:text-white/90">{s.title}</span>
                      </span>
                      <span className="mt-1 block text-[13px] leading-snug text-muted-foreground dark:text-white/45">
                        {s.summary}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-black/[0.06] to-transparent dark:via-white/[0.06]" />

          {/* CTA */}
          <div className="p-4 sm:p-5">
            <button
              type="button"
              disabled={!scenarioId || starting}
              onClick={start}
              className={cn(
                "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-4 py-2.5 text-[14px] font-medium transition-all duration-200",
                "bg-gradient-to-b from-foreground to-foreground/90 text-background shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_8px_-2px_rgba(0,0,0,0.15)] dark:from-white dark:to-white/90 dark:text-black",
                "hover:shadow-[0_1px_2px_rgba(0,0,0,0.25),0_8px_16px_-4px_rgba(0,0,0,0.2)] hover:brightness-110",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
                "focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              {/* Shine effect on hover */}
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-all duration-500 group-hover:translate-x-full group-hover:opacity-100" />
              {starting ? (
                <Spinner className="size-4" />
              ) : (
                <span className="relative flex items-center gap-2">
                  Start call
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Principles */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-x-8">
          {PRINCIPLES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-muted-foreground dark:text-white/40">
              <Icon className="size-4" />
              <span className="text-[13px] font-medium tracking-[-0.01em]">{label}</span>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="mt-8 text-center text-[11px] tracking-wide text-muted-foreground/60 dark:text-white/25">
          All customers, transactions, and policies are fictional.
        </p>
      </div>
    </div>
  );
}
