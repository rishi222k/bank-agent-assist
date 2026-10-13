"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, CircleX, History } from "lucide-react";
import type { AuditEvent, EvidenceRef } from "@baa/core";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EvidenceChips } from "./evidence";

const LABELS: Record<string, string> = {
  "call.started": "Call started",
  "caller.verified": "Caller verified",
  "caller.verification_failed": "Verification failed",
  "caller.verification_locked": "Verification locked",
  "action.refused": "Action refused",
  "transaction.confirmed": "Transaction confirmed",
  "dispute.created": "Dispute created",
  "dispute.rejected": "Dispute blocked",
  "call.wrapped_up": "Call wrapped up",
};

const label = (type: string) => LABELS[type] ?? type.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const RESULT = {
  ok: { icon: CircleCheck, className: "text-success" },
  rejected: { icon: CircleAlert, className: "text-warning" },
  failed: { icon: CircleX, className: "text-destructive" },
} as const;

export function AuditSheet({
  callId,
  version,
  open,
  onOpenChange,
}: {
  callId: string | null;
  version: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<{ events: AuditEvent[]; evidence: EvidenceRef[] } | null>(null);

  useEffect(() => {
    if (!open || !callId) return;
    let live = true;
    api
      .audit(callId)
      .then((d) => live && setData(d))
      .catch(() => live && setData({ events: [], evidence: [] }));
    return () => {
      live = false;
    };
  }, [open, callId, version]);

  const refs = useMemo(() => new Map(data?.evidence.map((r) => [r.id, r])), [data]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" /> Audit log
          </SheetTitle>
          <SheetDescription>Every action on this call: who, when, and the records it relied on.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {!data ? (
            <div className="space-y-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-5 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : data.events.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History />
                </EmptyMedia>
                <EmptyTitle className="text-base">No events yet</EmptyTitle>
                <EmptyDescription>Actions on this call will appear here as they happen.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ol>
              {data.events.map((e, i) => {
                const { icon: Icon, className } = RESULT[e.result];
                const last = i === data.events.length - 1;
                return (
                  <li key={e.id} className="relative flex gap-3 pb-6 last:pb-0">
                    {!last && <span className="absolute top-6 bottom-0 left-[9.5px] w-px bg-border" />}
                    <Icon className={cn("relative size-5 shrink-0 bg-background", className)} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{label(e.type)}</span>
                        <time
                          className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums"
                          dateTime={e.at}
                        >
                          {new Date(e.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{e.summary}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">{e.type}</span>·<span>by {e.actor}</span>
                      </p>
                      <EvidenceChips ids={e.evidenceIds} refs={refs} className="pt-1" />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
