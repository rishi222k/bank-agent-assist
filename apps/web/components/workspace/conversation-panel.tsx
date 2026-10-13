"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AudioLines, ChevronDown, CircleAlert, Pause, Play, SkipForward } from "lucide-react";
import type { ExtractedFacts } from "@baa/core";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ISSUE_LABELS, type CallFlow, type Speaker } from "@/lib/use-call-flow";
import { cn, usd } from "@/lib/utils";
import { AiLabel, PanelHeader } from "./kit";

/** Consecutive lines from the same speaker, shown as one block like a transcript document. */
type Block = { speaker: Speaker; at: string; lines: string[]; interim: string | null };

function toBlocks(flow: CallFlow): Block[] {
  const blocks: Block[] = [];
  const push = (speaker: Speaker, at: string, text: string | null, interim: string | null) => {
    const last = blocks.at(-1);
    if (last && last.speaker === speaker && last.interim === null) {
      if (text) last.lines.push(text);
      last.interim = interim;
    } else blocks.push({ speaker, at, lines: text ? [text] : [], interim });
  };
  for (const t of flow.transcript) push(t.speaker, t.at, t.text, null);
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
  const { call, transcript, interim, playing, scriptDone, verified, context } = flow;
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

  const controls = verified && !scriptDone && !flow.wrapUpRequested && (
    <>
      {playing ? (
        <Button size="sm" variant="outline" onClick={flow.actions.pause}>
          <Pause /> Pause
        </Button>
      ) : (
        <Button size="sm" onClick={flow.actions.play}>
          <Play /> {started ? "Resume" : "Play call"}
        </Button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={flow.actions.step}
            disabled={playing}
            aria-label={interim ? "Finish this line" : "Next line"}
          >
            <SkipForward />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{interim ? "Finish this line" : "Next line"}</TooltipContent>
      </Tooltip>
    </>
  );

  return (
    <>
      <PanelHeader icon={AudioLines} title="Transcript" meta={<TranscriptStatus flow={flow} total={total} />}>
        {controls}
      </PanelHeader>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {!started ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AudioLines />
              </EmptyMedia>
              <EmptyTitle className="text-base">
                {verified ? "Ready to play the call" : "Waiting for verification"}
              </EmptyTitle>
              <EmptyDescription>
                {verified
                  ? "Press Play call. The transcript streams in here as each side speaks, and the co-pilot listens for the charge."
                  : "Verify the caller first. The transcript starts once their identity is confirmed."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div role="log" aria-live="polite" aria-label="Call transcript" className="space-y-3">
              {blocks.map((b, i) => (
                <TranscriptBlock
                  key={i}
                  block={b}
                  time={offset(b.at, flow.startedAt)}
                  customerName={context?.customer.name ?? "Customer"}
                />
              ))}
            </div>
            {scriptDone && (
              <div className="mt-6 flex items-center gap-3 text-[11px] text-muted-foreground">
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

function TranscriptStatus({ flow, total }: { flow: CallFlow; total: number }) {
  const done = flow.transcript.length;
  if (flow.ended || flow.wrapUpRequested) return <>Call wrapped up · {done} lines</>;
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

function TranscriptBlock({ block, time, customerName }: { block: Block; time: string; customerName: string }) {
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
      <h3 className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold">
        <span className="truncate">{agent ? "Agent" : customerName}</span>
        {agent && <span className="font-normal text-muted-foreground">· you</span>}
        <time className="ml-auto pl-2 font-mono text-[11px] font-normal text-muted-foreground tabular-nums">
          {time}
        </time>
      </h3>
      <p className={cn("text-[15px] leading-7 text-pretty", agent ? "text-foreground/70" : "text-foreground")}>
        {block.lines.join(" ")}
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
    <section className="shrink-0 border-t bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 px-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6"
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
        <div className="px-4 pb-4 sm:px-6">
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
