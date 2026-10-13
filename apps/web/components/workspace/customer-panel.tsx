"use client";

import { useEffect, useRef } from "react";
import { CircleAlert, CreditCard, FolderOpen } from "lucide-react";
import type { Transaction } from "@baa/core";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { CallFlow } from "@/lib/use-call-flow";
import { cn, daysAgo, initials, usd } from "@/lib/utils";
import { EvidenceChips, useEvidence } from "./evidence";
import { AiLabel, Amount } from "./kit";

export function CustomerPanel({ flow }: { flow: CallFlow }) {
  const { context, briefing } = flow;
  if (!context)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );

  const { customer, card, transactions, cases } = context;
  const openCases = cases.filter((c) => c.status === "open");
  const utilisation = Math.round((card.balance / card.creditLimit) * 100);

  return (
    <div className="space-y-3">
      {/* Customer info */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-foreground text-[11px] font-medium text-background dark:bg-white dark:text-black">
              {initials(customer.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{customer.name}</div>
            <div className="text-[13px] text-muted-foreground">
              {customer.segment} · {customer.city}
            </div>
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <CreditCard className="size-3.5 text-muted-foreground" />
            <span className="text-[13px] font-medium">{card.product}</span>
            <span className="font-mono text-[13px] text-muted-foreground">•••• {card.last4}</span>
            <Badge variant={card.status === "active" ? "success" : "destructive"} className="ml-auto h-5 text-[11px]">
              {card.status}
            </Badge>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-mono tabular-nums">
                <span className="font-medium">{usd(card.balance)}</span>
                <span className="text-muted-foreground"> / {usd(card.creditLimit)}</span>
              </span>
            </div>
            <Progress value={utilisation} className="h-1" aria-label={`${utilisation}% used`} />
          </div>
        </div>
      </div>

      {/* AI Briefing */}
      <div className="rounded-lg border border-ai/20 bg-ai-soft/30 p-3">
        <AiLabel className="mb-2 text-[11px]">Briefing</AiLabel>
        {!briefing ? (
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full bg-ai/10" />
            <Skeleton className="h-4 w-4/5 bg-ai/10" />
            <Skeleton className="h-4 w-3/5 bg-ai/10" />
          </div>
        ) : briefing.ok ? (
          <div className="space-y-2">
            <p className="text-[13px] leading-relaxed text-foreground">{briefing.data.summary}</p>
            <ul className="space-y-2">
              {briefing.data.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-ai/70" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-[13px] leading-relaxed text-foreground/90">{h.text}</p>
                    <EvidenceChips ids={h.evidenceIds} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            AI briefing unavailable. Account details are complete.
          </p>
        )}
      </div>

      {/* Transactions */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Transactions</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <FolderOpen className="size-3.5" />
              {openCases.length === 0 ? "No cases" : `${openCases.length} open`}
            </div>
          </div>
          <span className="font-mono text-[13px] text-muted-foreground tabular-nums">{transactions.length}</span>
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5 lg:max-h-none">
          <ul className="space-y-0.5">
            {transactions.map((t) => (
              <TransactionRow
                key={t.id}
                t={t}
                flow={flow}
                hasCase={cases.some((c) => c.transactionId === t.id && c.status === "open")}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ t, flow, hasCase }: { t: Transaction; flow: CallFlow; hasCase: boolean }) {
  const { highlighted } = useEvidence();
  const ref = useRef<HTMLLIElement>(null);
  const isHighlighted = highlighted === t.id;
  const selected = flow.selectedTxnId === t.id;
  const matched = flow.matches.some((m) => m.transactionId === t.id);
  const selectable = flow.transcript.length > 0 && !flow.confirmed && t.amount > 0;

  useEffect(() => {
    if (isHighlighted) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isHighlighted]);

  return (
    <li ref={ref}>
      <button
        type="button"
        disabled={!selectable}
        aria-pressed={selectable ? selected : undefined}
        onClick={() => flow.actions.selectTransaction(t.id)}
        className={cn(
          "relative flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors outline-none",
          "focus-visible:ring-1 focus-visible:ring-ring",
          selectable && "hover:bg-muted/60",
          !selectable && "cursor-default",
          matched && !selected && "bg-ai-soft/40",
          selected && "bg-ai-soft/60 ring-1 ring-ai/30",
          isHighlighted && "bg-warning-soft ring-1 ring-warning/40",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{t.merchant}</span>
            {t.status === "pending" && (
              <Badge variant="outline" className="h-4 px-1 text-[11px]">
                Pending
              </Badge>
            )}
            {hasCase && (
              <Badge variant="warning" className="h-4 px-1 text-[11px]">
                Disputed
              </Badge>
            )}
            {matched && !hasCase && (
              <Badge variant="ai" className="h-4 px-1 text-[11px]">
                Match
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {daysAgo(t.daysAgo)} · {t.category}
            {t.channel === "online" && " · Online"}
          </div>
        </div>
        <Amount value={t.amount} className="text-[13px]" />
      </button>
    </li>
  );
}
