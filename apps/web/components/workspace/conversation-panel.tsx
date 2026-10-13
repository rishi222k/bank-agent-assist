"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AudioLines, ChevronDown, CircleAlert, Mic, MicOff, Pause, Play, SkipForward } from "lucide-react";
import type { ExtractedFacts } from "@baa/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ISSUE_LABELS, type CallFlow, type Speaker, type Turn } from "@/lib/use-call-flow";
import { cn, usd } from "@/lib/utils";
import { AiLabel, PanelHeader } from "./kit";

/** Consecutive lines from the same speaker, shown as one block like a transcript document. */
type Block = { speaker: Speaker; at: string; lines: Turn[]; interim: string | null };

function toBlocks(flow: CallFlow): Block[] {
  const blocks: Block[] = [];
  const push = (speaker: Speaker, at: string, line: Turn | null, interim: string | null) => {
    const last = blocks.at(-1);
    if (last && last.speaker === speaker && last.interim === null) {
      if (line) last.lines.push(line);
      last.interim = interim;
    } else blocks.push({ speaker, at, lines: line ? [line] : [], interim });
  };
  for (const t of flow.transcript) push(t.speaker, t.at, t, null);
  const i = flow.interim;
  if (i) push(i.speaker, i.at, null, i.words.slice(0, i.shown).join(" "));
  return blocks;
}

/** "00:42" from the start of the call. */
function offset(at: string, startedAt: number | null) {
  const s = Math.max(0, Math.floor((new Date(at).getTime() - (startedAt ?? 0)) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ConversationPanel({ flow }: { flow: CallFlow }) {
  const { call, transcript, interim, playing, scriptDone, verified, context, mode, speech } = flow;
  const live = mode === "live";
  const scroller = useRef<HTMLDivElement>(null);
  // Follow new text only while the agent is at the bottom, so scrolling back to re-read isn't yanked away.
  const stick = useRef(true);
  const total = call?.script.length ?? 0;
  const started = transcript.length > 0 || interim !== null;
  const blocks = toBlocks(flow);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [transcript.length, interim?.shown, scriptDone]);

  const scriptControls = verified && !live && !scriptDone && !flow.wrapUpRequested && (
    <>
      {!started && speech.supported && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-xs" variant="outline" onClick={flow.actions.startLive} aria-label="Use microphone">
              <Mic className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Use microphone instead of the scripted call</TooltipContent>
        </Tooltip>
      )}
      {playing ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="xs" variant="outline" onClick={flow.actions.pause} className="gap-1">
              <Pause className="size-3" /> Pause
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Pause <Kbd>Space</Kbd>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="xs" onClick={flow.actions.play} className="gap-1">
              <Play className="size-3" /> {started ? "Resume" : "Play"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {started ? "Resume" : "Play call"} <Kbd>Space</Kbd>
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={flow.actions.step}
            disabled={playing}
            aria-label={interim ? "Finish this line" : "Next line"}
          >
            <SkipForward className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {interim ? "Finish this line" : "Next line"} <Kbd>→</Kbd>
        </TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <>
      <PanelHeader icon={AudioLines} title="Transcript" meta={<TranscriptStatus flow={flow} total={total} />}>
        {scriptControls}
        {live && !flow.wrapUpRequested && (
          <Button
            size="xs"
            variant="outline"
            className="gap-1"
            onClick={speech.listening ? flow.actions.pauseLive : flow.actions.resumeLive}
          >
            {speech.listening ? <MicOff className="size-3" /> : <Mic className="size-3" />}
            {speech.listening ? "Pause mic" : "Resume mic"}
          </Button>
        )}
      </PanelHeader>
      {live && !flow.wrapUpRequested && <LiveBar flow={flow} />}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3 lg:px-4 dark:bg-surface-sunken"
      >
        {!started ? (
          <Empty className="h-full border-0 bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AudioLines className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">
                {!verified ? "Waiting for verification" : live ? "Listening" : "Ready to play the call"}
              </EmptyTitle>
              <EmptyDescription className="text-[13px]">
                {!verified
                  ? "Verify the caller first. The transcript starts once their identity is confirmed."
                  : live
                    ? "Start speaking. Pick who is talking above; the transcript streams in here."
                    : "Press Play call, or use the microphone. The transcript streams in here as each side speaks, and the co-pilot listens for the charge."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div>
            <div role="log" aria-live="polite" aria-label="Call transcript" className="space-y-1">
              {blocks.map((b, i) => (
                <TranscriptBlock
                  key={i}
                  block={b}
                  time={offset(b.at, flow.startedAt)}
                  customerName={context?.customer.name ?? "Customer"}
                  onRetry={flow.actions.retryTurn}
                />
              ))}
            </div>
            {scriptDone && (
              <div className="mt-3 flex items-center gap-2 px-2 py-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <span className="h-px flex-1 bg-border" />
                End of scripted call
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
          </div>
        )}
      </div>

      {verified && started && <DetailsHeard flow={flow} />}
    </>
  );
}

/**
 * Live mode with one microphone. On a real call each side is its own audio channel, so the speaker
 * is known; here the agent says who is talking.
 */
function LiveBar({ flow }: { flow: CallFlow }) {
  const customer = flow.context?.customer.name ?? "Customer";
  return (
    <div className="shrink-0 space-y-2 border-b border-border bg-surface px-3 py-2 lg:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs text-muted-foreground">Who is speaking?</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={flow.liveSpeaker}
          onValueChange={(v) => v && flow.actions.setLiveSpeaker(v as Speaker)}
        >
          <ToggleGroupItem
            value="agent"
            className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            Agent
          </ToggleGroupItem>
          <ToggleGroupItem
            value="customer"
            className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {customer}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="text-[11px] text-muted-foreground">
        One microphone stands in for both sides of the call. Speech is transcribed by the browser (Chrome uses Google’s
        free speech service).
      </p>
      {flow.speech.error && (
        <Alert variant="warning" className="py-2">
          <CircleAlert />
          <AlertDescription>{flow.speech.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function TranscriptStatus({ flow, total }: { flow: CallFlow; total: number }) {
  const done = flow.transcript.length;
  if (flow.ended || flow.wrapUpRequested) return <>Call wrapped up · {done} lines</>;
  if (flow.mode === "live")
    return flow.speech.listening ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
        Live · microphone
      </span>
    ) : (
      <>Microphone paused · {done} lines</>
    );
  if (flow.scriptDone) return <>Call finished · {done} lines</>;
  if (flow.playing)
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
        Live · line {Math.min(done + 1, total)} of {total}
      </span>
    );
  if (done > 0 || flow.interim)
    return (
      <>
        Paused · line {Math.min(done + 1, total)} of {total}
      </>
    );
  return <>Scripted call</>;
}

function TranscriptBlock({
  block,
  time,
  customerName,
  onRetry,
}: {
  block: Block;
  time: string;
  customerName: string;
  onRetry: (turn: Turn) => void;
}) {
  const agent = block.speaker === "agent";
  return (
    // A coloured band down the left edge tells the speakers apart at a glance:
    // neutral for the agent, the AI accent for the customer.
    <article
      className={cn(
        "animate-in rounded-r-md border-l-[3px] py-1.5 pr-2 pl-3 duration-300 fade-in-0",
        agent ? "border-muted-foreground/30" : "border-ai bg-ai-soft/40",
      )}
    >
      <h3 className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
        <span className="truncate">{agent ? "Agent" : customerName}</span>
        {agent && <span className="font-normal text-muted-foreground">· you</span>}
        <time className="ml-auto pl-2 font-mono text-[11px] font-normal text-muted-foreground tabular-nums">
          {time}
        </time>
      </h3>
      <p className={cn("text-[14px] leading-relaxed text-pretty", agent ? "text-foreground/80" : "text-foreground")}>
        {block.lines.map((line, i) => (
          <span key={i}>
            {i > 0 && " "}
            {line.failed ? (
              // The server never stored this line, so the co-pilot hasn't heard it.
              <span className="rounded-sm bg-destructive/10 text-destructive">
                {line.text}{" "}
                <button
                  type="button"
                  onClick={() => onRetry(line)}
                  className="inline-flex items-center gap-1 align-baseline text-xs font-medium underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <CircleAlert className="size-3" /> Not saved · Retry
                </button>
              </span>
            ) : (
              line.text
            )}
          </span>
        ))}
        {block.interim !== null && (
          <span aria-hidden className="text-muted-foreground">
            {block.lines.length > 0 && " "}
            {block.interim}
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-muted-foreground/70" />
          </span>
        )}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------

const yesNo = (v: boolean | null) => (v == null ? null : v ? "Yes" : "No");

function factRows(f: ExtractedFacts | null): { label: string; value: string | null }[] {
  return [
    {
      label: "Issue (suggested)",
      value: f && f.suggestedIssueType !== "unknown" ? ISSUE_LABELS[f.suggestedIssueType] : null,
    },
    { label: "Merchant", value: f?.merchant ?? null },
    { label: "Amount", value: f?.amount != null ? `~${usd(f.amount)}` : null },
    { label: "When", value: f?.approxDaysAgo != null ? `~${f.approxDaysAgo} days ago` : null },
    { label: "Recognises it", value: yesNo(f?.customerRecognises ?? null) },
    { label: "Card with customer", value: yesNo(f?.cardInPossession ?? null) },
  ];
}

/** What the AI has pulled out of the call so far, docked under the transcript. */
function DetailsHeard({ flow }: { flow: CallFlow }) {
  const [open, setOpen] = useState(true);
  const { facts, extractError, analyzing } = flow;
  const rows = factRows(facts);
  const found = rows.filter((r) => r.value).length;

  return (
    <section className="shrink-0 border-t border-border bg-surface dark:bg-surface-elevated">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 px-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset lg:px-4"
      >
        <AiLabel>Details heard</AiLabel>
        <span className="text-xs text-muted-foreground">
          {analyzing ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3" /> Listening…
            </span>
          ) : facts ? (
            `${found} of ${rows.length}`
          ) : null}
        </span>
        <ChevronDown
          className={cn("ml-auto size-4 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 lg:px-4">
          {extractError && !facts ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <CircleAlert className="mt-px size-3.5 shrink-0 text-warning" />
              The AI couldn’t read the call. Ask for the merchant and amount, then pick the transaction from the list.
            </p>
          ) : !facts ? (
            <p className="text-xs text-muted-foreground">
              Nothing yet. Details appear here as the customer describes the problem.
            </p>
          ) : (
            <dl className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-3">
              {rows.map((r) => (
                <div key={r.label} className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
                  <dd className={cn("text-sm font-medium", !r.value && "font-normal text-muted-foreground/60")}>
                    {r.value ?? "Not heard"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
