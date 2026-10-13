"use client";

import { useEffect, useState } from "react";
import { EllipsisVertical, Headset, History, Moon, RotateCcw, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CallFlow } from "@/lib/use-call-flow";
import { useTheme } from "@/lib/use-theme";
import { Stepper } from "./stepper";

function useElapsed(startedAt: number | null, stopped: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || stopped) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, stopped]);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function AiBadge({ info }: { info: CallFlow["aiInfo"] }) {
  if (!info) return null;
  const isGemini = info.provider === "gemini";
  const isMock = info.provider === "mock";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="hidden items-center gap-1.5 text-[11px] font-medium sm:inline-flex">
          <Sparkles className={`size-3 ${isGemini ? "text-ai" : isMock ? "text-warning" : "text-muted-foreground"}`} />
          <span className="text-muted-foreground">{isGemini ? "Gemini" : isMock ? "Mock" : "Off"}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        {isGemini ? `Live model: ${info.model ?? "Gemini"}` : isMock ? "Mock AI: offline rules" : "AI disabled"}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="hidden size-3.5 dark:block" />
          <Moon className="size-3.5 dark:hidden" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Toggle theme <Kbd>T</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function Header({ flow, onOpenAudit }: { flow: CallFlow; onOpenAudit: () => void }) {
  const elapsed = useElapsed(flow.startedAt, flow.ended);
  const onCall = !!(flow.call && flow.stage);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 dark:bg-surface-elevated">
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded bg-foreground text-background dark:bg-white dark:text-black">
          <Headset className="size-3.5" />
        </div>
        <div className="hidden leading-none sm:block">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">Bank Agent Assist</div>
        </div>
      </div>

      {onCall && (
        <>
          <div className="mx-2 h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            {flow.ended ? (
              <span className="text-[11px] font-medium text-muted-foreground">Ended</span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                <span className="text-[11px] font-medium text-success">Live</span>
              </div>
            )}
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{elapsed}</span>
            {flow.verified && (
              <span className="hidden items-center gap-1 text-[11px] font-medium text-success md:inline-flex">
                <ShieldCheck className="size-3" />
              </span>
            )}
          </div>
          <div className="mx-auto hidden xl:block">
            <Stepper stage={flow.stage!} />
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <AiBadge info={flow.aiInfo} />
        {flow.call && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={onOpenAudit}>
                <History className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Audit log <Kbd>A</Kbd>
            </TooltipContent>
          </Tooltip>
        )}
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="More">
              <EllipsisVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Demo
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={flow.actions.resetDemo} className="text-[13px]">
              <RotateCcw className="size-3.5" /> Reset data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
