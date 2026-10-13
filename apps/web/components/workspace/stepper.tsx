import { Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { STAGES, type Stage } from "@/lib/use-call-flow";
import { cn } from "@/lib/utils";

const indexOf = (stage: Stage) => (stage === "done" ? STAGES.length : STAGES.findIndex((s) => s.id === stage));

/** Full stepper for wide screens - compact, Linear-style. */
export function Stepper({ stage }: { stage: Stage }) {
  const current = indexOf(stage);
  return (
    <ol className="flex items-center gap-0.5 text-[11px]" aria-label="Call progress">
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="flex items-center gap-0.5" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex h-6 items-center gap-1 rounded px-2 font-medium transition-colors",
                done && "text-foreground",
                active && "bg-foreground text-background dark:bg-white dark:text-black",
                !done && !active && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-3.5 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums",
                  done && "bg-success text-background",
                  active && "bg-background/20 dark:bg-black/20",
                  !done && !active && "bg-muted",
                )}
              >
                {done ? <Check className="size-2" strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </span>
            {i < STAGES.length - 1 && <span className={cn("h-px w-3", i < current ? "bg-success/60" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Compact progress bar for narrower screens. */
export function CompactStepper({ stage }: { stage: Stage }) {
  const current = indexOf(stage);
  const label = stage === "done" ? "Complete" : STAGES[current]?.label;
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="shrink-0 font-medium tabular-nums">
        {stage === "done" ? "Complete" : `${current + 1}/${STAGES.length}`}
        <span className="ml-1.5 text-muted-foreground">{label}</span>
      </span>
      <Progress value={(Math.min(current, STAGES.length) / STAGES.length) * 100} className="h-1" />
    </div>
  );
}
