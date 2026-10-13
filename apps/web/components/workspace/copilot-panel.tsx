"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  FolderOpen,
  MessageSquareQuote,
  PhoneOff,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { DisputeForm, DisputeReason, IssueType, Transaction } from "@baa/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AVAILABLE_ISSUE_TYPES, ISSUE_LABELS, type CallFlow } from "@/lib/use-call-flow";
import { cn, usd } from "@/lib/utils";
import { EvidenceChips, useEvidence } from "./evidence";
import { AiLabel, Amount, CheckIcon, Eyebrow, TransactionSummary } from "./kit";

const ISSUE_TYPES = (["unrecognised_charge", "failed_transaction", "fee_query"] as const).map((id) => ({
  id,
  label: ISSUE_LABELS[id],
  available: AVAILABLE_ISSUE_TYPES.includes(id),
}));

const REASONS: { id: DisputeReason; label: string }[] = [
  { id: "not_authorised", label: "Customer didn't authorise it" },
  { id: "not_recognised", label: "Customer doesn't recognise it" },
  { id: "amount_differs", label: "Amount differs from what was agreed" },
  { id: "other", label: "Other" },
];

const SEGMENT_ON = "data-[state=on]:bg-foreground data-[state=on]:text-background";

export function CopilotPanel({ flow }: { flow: CallFlow }) {
  const { stage, context, selectedTxnId, confirmed, scriptDone, extractError, transcript } = flow;
  const latest = useRef<HTMLDivElement>(null);

  useEffect(() => {
    latest.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage, flow.createdCase?.id]);

  if (!flow.verified)
    return (
      <PanelEmpty
        icon={ShieldCheck}
        title="Co-pilot on standby"
        text="Unlocks after verification. Account data stays masked."
      />
    );
  if (transcript.length === 0)
    return (
      <PanelEmpty
        icon={Sparkles}
        title="Ready to listen"
        text="Play the call, or use the microphone. The co-pilot finds the transaction."
      />
    );

  const selected = context?.transactions.find((t) => t.id === selectedTxnId) ?? null;
  const waitingForMatch = !selected && !scriptDone && !extractError;

  return (
    <div className="space-y-2">
      {/* Once wrap-up starts, the notes describe the call: no new confirmation or case. */}
      {confirmed ? (
        <ConfirmedSummary flow={flow} />
      ) : (
        !flow.wrapUpRequested && (
          <div ref={stage === "confirm" ? latest : undefined} className="space-y-2">
            <IssueTypeCard flow={flow} />
            {waitingForMatch ? <ListeningCard /> : <MatchCard flow={flow} selected={selected} />}
          </div>
        )
      )}

      {confirmed && (
        <div ref={stage === "act" ? latest : undefined} className="space-y-2">
          <EligibilityCard flow={flow} />
          {confirmed.eligibility.eligible ? (
            flow.createdCase ? (
              <CaseCreatedCard flow={flow} />
            ) : (
              <>
                <RecommendationCard flow={flow} />
                <DisputeFormCard flow={flow} transaction={confirmed.transaction} />
              </>
            )
          ) : (
            <NotEligibleCard flow={flow} />
          )}
        </div>
      )}

      {flow.wrapUpRequested && (
        <div ref={stage === "wrapup" || stage === "done" ? latest : undefined}>
          {flow.ended ? <DoneCard flow={flow} /> : <WrapUpCard key={flow.wrapUp ? "draft" : "loading"} flow={flow} />}
        </div>
      )}
    </div>
  );
}

function PanelEmpty({ icon: Icon, title, text }: { icon: React.ComponentType; title: string; text: string }) {
  return (
    <Empty className="h-full min-h-56 border border-dashed border-border bg-transparent">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-[14px]">{title}</EmptyTitle>
        <EmptyDescription className="text-[13px]">{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function SectionCard({ children, className, ai }: { children: React.ReactNode; className?: string; ai?: boolean }) {
  return (
    <div
      className={cn("rounded-lg border p-3", ai ? "border-ai/20 bg-ai-soft/30" : "border-border bg-card", className)}
    >
      {children}
    </div>
  );
}

function IssueTypeCard({ flow }: { flow: CallFlow }) {
  const { issueType, suggestedIssueType, facts } = flow;
  const suggestionUnavailable =
    suggestedIssueType && suggestedIssueType !== "unknown" && !AVAILABLE_ISSUE_TYPES.includes(suggestedIssueType);
  const description = suggestionUnavailable
    ? `The AI thinks this is a ${ISSUE_LABELS[suggestedIssueType].toLowerCase()}. That playbook isn't built yet, so handle it manually or pick another.`
    : issueType && issueType === suggestedIssueType
      ? "Suggested from the conversation. Change it if it's wrong."
      : facts
        ? "Not clear from the conversation yet. Pick one."
        : "Pick the issue the customer is calling about.";

  return (
    <SectionCard>
      <Eyebrow className="mb-1">Issue type</Eyebrow>
      <p className="mb-2 text-[13px] text-muted-foreground">{description}</p>
      <ToggleGroup
        type="single"
        value={issueType ?? ""}
        onValueChange={(v) => v && flow.actions.selectIssueType(v as IssueType)}
        variant="outline"
        size="sm"
        className="flex-wrap gap-1"
      >
        {ISSUE_TYPES.map((t) => {
          const suggested = t.id === suggestedIssueType;
          const item = (
            <ToggleGroupItem
              key={t.id}
              value={t.id}
              disabled={!t.available}
              className={cn("h-7 rounded px-2.5 text-[13px]", t.available && SEGMENT_ON)}
            >
              {suggested && <Sparkles className="size-3" />}
              {t.label}
            </ToggleGroupItem>
          );
          return t.available ? (
            item
          ) : (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="rounded outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {item}
                </span>
              </TooltipTrigger>
              <TooltipContent>Playbook coming after M0</TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    </SectionCard>
  );
}

function ListeningCard() {
  return (
    <SectionCard ai>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span className="size-1.5 animate-pulse rounded-full bg-ai" />
          <span className="size-1.5 animate-pulse rounded-full bg-ai [animation-delay:150ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-ai [animation-delay:300ms]" />
        </div>
        <AiLabel className="text-[13px]">Listening for transaction…</AiLabel>
      </div>
      <Skeleton className="mt-3 h-14 w-full rounded bg-ai/10" />
    </SectionCard>
  );
}

function MatchCard({ flow, selected }: { flow: CallFlow; selected: Transaction | null }) {
  const match = flow.matches.find((m) => m.transactionId === selected?.id);
  const others = flow.matches.filter((m) => m.transactionId !== selected?.id);
  const { highlight } = useEvidence();

  return (
    <SectionCard>
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>Transaction</Eyebrow>
        {match && (
          <Badge variant="ai" className="h-5 text-[11px]">
            <Sparkles className="size-3" /> Matched
          </Badge>
        )}
      </div>

      {flow.extractError && flow.matches.length === 0 && (
        <Alert variant="warning" className="mb-2 py-2">
          <CircleAlert className="size-4" />
          <AlertDescription className="text-[13px]">AI could not match. Ask customer for details.</AlertDescription>
        </Alert>
      )}

      {selected ? (
        <div
          className="rounded border border-border bg-surface p-2.5"
          onMouseEnter={() => highlight(selected.id)}
          onMouseLeave={() => highlight(null)}
        >
          <TransactionSummary t={selected} />
          {match && match.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
              {match.reasons.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                  <Check className="size-3 text-ai" />
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        !flow.extractError && <p className="text-[13px] text-muted-foreground">Select from transactions list.</p>
      )}

      {others.length > 0 && (
        <div className="mt-2 space-y-1">
          <Eyebrow>Other matches</Eyebrow>
          {others.map((m) => {
            const t = flow.context?.transactions.find((x) => x.id === m.transactionId);
            if (!t) return null;
            return (
              <button
                key={m.transactionId}
                type="button"
                onClick={() => flow.actions.selectTransaction(t.id)}
                className="flex w-full items-center justify-between rounded border border-border px-2.5 py-2 text-[13px] transition-colors hover:bg-muted/60"
              >
                <span className="truncate">{t.merchant}</span>
                <Amount value={t.amount} className="text-[13px]" />
              </button>
            );
          })}
        </div>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="mt-3 w-full gap-1.5"
            size="sm"
            disabled={!selected || !flow.issueType || flow.confirming}
            onClick={flow.actions.confirmTransaction}
          >
            {flow.confirming ? <Spinner className="size-3.5" /> : <CircleCheck className="size-4" />}
            Customer confirmed
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Confirm charge <Kbd>Enter</Kbd>
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="xs"
        className="mt-1.5 w-full text-muted-foreground"
        onClick={flow.actions.startWrapUp}
      >
        Wrap up without a case
      </Button>
    </SectionCard>
  );
}

function ConfirmedSummary({ flow }: { flow: CallFlow }) {
  const t = flow.confirmed!.transaction;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft/30 px-3 py-2.5">
      <CircleCheck className="size-4 shrink-0 text-success" />
      <div className="min-w-0 flex-1 text-[13px]">
        <span className="font-medium">
          <Amount value={t.amount} /> · {t.merchant}
        </span>
        <span className="ml-1.5 text-muted-foreground">{ISSUE_LABELS[flow.confirmed!.issueType]} · confirmed</span>
      </div>
      <EvidenceChips ids={[t.id]} />
    </div>
  );
}

function EligibilityCard({ flow }: { flow: CallFlow }) {
  const { eligibility } = flow.confirmed!;
  const [expanded, setExpanded] = useState(true);

  return (
    <SectionCard>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Eyebrow>Eligibility</Eyebrow>
          <Badge variant={eligibility.eligible ? "success" : "warning"} className="h-5 text-[11px]">
            {eligibility.eligible ? "Eligible" : "Not eligible"}
          </Badge>
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Policy <span className="font-mono">{eligibility.policyId}</span>
          </p>
          <ul className="space-y-1.5">
            {eligibility.checks.map((c) => (
              <li key={c.clauseId} className="flex items-start gap-2 text-[13px]">
                <CheckIcon passed={c.passed} className="mt-0.5 size-4" />
                <div className="min-w-0 flex-1">
                  <span className={cn(!c.passed && "text-destructive")}>{c.label}</span>
                  <span className="ml-1 text-muted-foreground">· {c.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function ScriptLines({ lines }: { lines: { text: string; evidenceIds: string[] }[] }) {
  return (
    <div className="space-y-2">
      <Eyebrow icon={MessageSquareQuote}>Say to customer</Eyebrow>
      {lines.map((l, i) => (
        <blockquote
          key={i}
          className="space-y-1.5 rounded border border-l-2 border-ai/30 border-l-ai bg-surface px-3 py-2.5 text-[13px]"
        >
          <p className="leading-relaxed">&ldquo;{l.text}&rdquo;</p>
          <EvidenceChips ids={l.evidenceIds} />
        </blockquote>
      ))}
    </div>
  );
}

function RecommendationCard({ flow }: { flow: CallFlow }) {
  const rec = flow.confirmed!.recommendation;
  const [expanded, setExpanded] = useState(true);

  if (!rec?.ok)
    return (
      <Alert variant="warning" className="py-2">
        <CircleAlert className="size-4" />
        <AlertDescription className="text-[13px]">AI recommendation unavailable. Follow policy DSP-1.</AlertDescription>
      </Alert>
    );

  return (
    <SectionCard ai>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <AiLabel className="text-[13px]">Recommended steps</AiLabel>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <ol className="space-y-2">
            {rec.data.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px]">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ai text-[11px] font-semibold text-background tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="leading-relaxed">{s.text}</p>
                  <EvidenceChips ids={s.evidenceIds} />
                </div>
              </li>
            ))}
          </ol>
          <ScriptLines lines={rec.data.scriptLines} />
        </div>
      )}
    </SectionCard>
  );
}

function DisputeFormCard({ flow, transaction }: { flow: CallFlow; transaction: Transaction }) {
  const rec = flow.confirmed!.recommendation;
  const prefill = rec?.ok ? rec.data.formPrefill : null;
  // Card possession decides whether the card is treated as compromised (DSP-1.6), so it is never
  // assumed: it starts from what the customer said, or empty until the agent asks.
  const [form, setForm] = useState<Omit<DisputeForm, "cardInPossession"> & { cardInPossession: boolean | null }>({
    transactionId: transaction.id,
    reason: prefill?.reason ?? (flow.facts?.customerRecognises === false ? "not_authorised" : "not_recognised"),
    customerStatement: prefill?.customerStatement ?? "",
    cardInPossession: flow.facts?.cardInPossession ?? null,
  });
  const [reviewing, setReviewing] = useState(false);
  const statementOk = form.customerStatement.trim().length >= 10;
  const complete = statementOk && form.cardInPossession !== null;
  const compromised = form.cardInPossession === false;
  const reasonLabel = REASONS.find((r) => r.id === form.reason)?.label;

  return (
    <SectionCard>
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>Dispute form</Eyebrow>
        {prefill && (
          <Badge variant="ai" className="h-5 text-[11px]">
            <Sparkles className="size-3" /> Pre-filled
          </Badge>
        )}
      </div>

      <FieldGroup className="gap-3">
        <div className="rounded border border-border bg-surface p-2.5">
          <TransactionSummary t={transaction} />
        </div>

        <Field>
          <FieldLabel className="text-[13px]">Reason</FieldLabel>
          <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v as DisputeReason })}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-[13px]">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field data-invalid={(!statementOk && form.customerStatement.length > 0) || undefined}>
          <FieldLabel className="text-[13px]">Customer statement</FieldLabel>
          <Textarea
            rows={2}
            value={form.customerStatement}
            onChange={(e) => setForm({ ...form, customerStatement: e.target.value })}
            className="text-[13px] leading-relaxed"
          />
          <FieldDescription className="flex justify-between text-[11px]">
            <span>Min 10 chars</span>
            <span className="font-mono tabular-nums">{form.customerStatement.trim().length}</span>
          </FieldDescription>
        </Field>

        <Field orientation="horizontal" className="justify-between">
          <FieldLabel className="text-[13px]">Card with customer?</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={form.cardInPossession === null ? "" : form.cardInPossession ? "yes" : "no"}
            onValueChange={(v) => v && setForm({ ...form, cardInPossession: v === "yes" })}
          >
            <ToggleGroupItem value="yes" className={cn("h-7 px-3 text-[13px]", SEGMENT_ON)}>
              Yes
            </ToggleGroupItem>
            <ToggleGroupItem value="no" className={cn("h-7 px-3 text-[13px]", SEGMENT_ON)}>
              No
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        {compromised && <CompromisedCardAlert />}
      </FieldGroup>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button className="mt-3 w-full gap-1.5" size="sm" disabled={!complete} onClick={() => setReviewing(true)}>
            Review & approve <ArrowRight className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Review dispute <Kbd>⌘</Kbd>
          <Kbd>Enter</Kbd>
        </TooltipContent>
      </Tooltip>

      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Approve dispute</DialogTitle>
            <DialogDescription className="text-[13px]">
              Creates a case in the bank system. You are approving as agent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-[13px]">
            <div className="rounded border border-border bg-surface p-2.5">
              <TransactionSummary t={transaction} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Reason</dt>
              <dd>{reasonLabel}</dd>
              <dt className="text-muted-foreground">Card with customer</dt>
              <dd>{form.cardInPossession ? "Yes" : "No, fraud escalation required"}</dd>
              <dt className="text-muted-foreground">Statement</dt>
              <dd className="leading-relaxed">&ldquo;{form.customerStatement.trim()}&rdquo;</dd>
              <dt className="text-muted-foreground">Policy</dt>
              <dd className="flex items-center gap-1 text-success">
                <CircleCheck className="size-4" /> Passed
              </dd>
            </dl>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewing(false)}>
              Back
            </Button>
            <Button
              size="sm"
              disabled={flow.submitting}
              onClick={async () => {
                if (form.cardInPossession === null) return;
                if (await flow.actions.submitDispute({ ...form, cardInPossession: form.cardInPossession }))
                  setReviewing(false);
              }}
            >
              {flow.submitting ? <Spinner className="size-3.5" /> : <ShieldCheck className="size-4" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function CompromisedCardAlert() {
  return (
    <Alert variant="warning" className="py-2">
      <CircleAlert className="size-4" />
      <AlertTitle className="text-[13px]">Treat the card as compromised</AlertTitle>
      <AlertDescription className="space-y-1.5 text-[13px]">
        <p>The card isn&apos;t with the customer. Escalate to the fraud team; the case is flagged for fraud review.</p>
        <EvidenceChips ids={["DSP-1.6"]} />
      </AlertDescription>
    </Alert>
  );
}

function CaseCreatedCard({ flow }: { flow: CallFlow }) {
  const c = flow.createdCase!;
  return (
    <SectionCard className="border-success/30">
      <div className="flex items-center gap-2">
        <CircleCheck className="size-5 text-success" />
        <div>
          <div className="font-mono text-[15px] font-semibold tracking-tight">{c.reference}</div>
          <div className="text-[13px] text-muted-foreground">
            {usd(c.amount)} · {c.merchant}
          </div>
        </div>
        <EvidenceChips ids={[c.id]} className="ml-auto" />
      </div>

      <div className="mt-3">
        <ScriptLines
          lines={[
            {
              text: `Your dispute reference is ${c.reference}. You'll hear about a provisional credit within 10 business days.`,
              evidenceIds: ["DSP-1.5"],
            },
          ]}
        />
      </div>

      {!flow.wrapUpRequested && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="mt-3 w-full gap-1.5" size="sm" onClick={flow.actions.startWrapUp}>
              Wrap up <ArrowRight className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Wrap up call <Kbd>W</Kbd>
          </TooltipContent>
        </Tooltip>
      )}
    </SectionCard>
  );
}

function NotEligibleCard({ flow }: { flow: CallFlow }) {
  const { eligibility, recommendation } = flow.confirmed!;
  const existing = eligibility.existingCase;

  return (
    <>
      <Alert variant="warning" className="py-2">
        <FolderOpen className="size-4" />
        <AlertTitle className="text-[13px]">{existing ? `Case ${existing.reference} open` : "Not eligible"}</AlertTitle>
        <AlertDescription className="text-[13px]">
          {existing
            ? `Opened for ${usd(existing.amount)} ${existing.merchant}`
            : eligibility.checks.find((c) => !c.passed)?.detail}
        </AlertDescription>
      </Alert>

      {recommendation?.ok && (
        <SectionCard ai>
          <AiLabel className="mb-2 text-[13px]">What to do</AiLabel>
          <ul className="space-y-2 text-[13px]">
            {recommendation.data.steps.map((s, i) => (
              <li key={i} className="space-y-1">
                <p className="leading-relaxed">{s.text}</p>
                <EvidenceChips ids={s.evidenceIds} />
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <ScriptLines lines={recommendation.data.scriptLines} />
          </div>
        </SectionCard>
      )}

      {!flow.wrapUpRequested && (
        <Button className="w-full gap-1.5" size="sm" onClick={flow.actions.startWrapUp}>
          Wrap up <ArrowRight className="size-3.5" />
        </Button>
      )}
    </>
  );
}

function WrapUpCard({ flow }: { flow: CallFlow }) {
  const draft = flow.wrapUp;
  const [notes, setNotes] = useState(draft?.ok ? draft.data.notes : "");
  const [saving, setSaving] = useState(false);

  return (
    <SectionCard>
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>Wrap-up notes</Eyebrow>
        {draft?.ok && (
          <Badge variant="ai" className="h-5 text-[11px]">
            <Sparkles className="size-3" /> Draft
          </Badge>
        )}
      </div>

      {!draft ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : (
        <Textarea
          aria-label="Wrap-up notes"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="text-[13px] leading-relaxed"
        />
      )}

      {draft?.ok && draft.data.followUps.length > 0 && (
        <div className="mt-2 space-y-1">
          <Eyebrow>Follow-ups</Eyebrow>
          <ul className="space-y-1 text-[13px]">
            {draft.data.followUps.map((f, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        className="mt-3 w-full gap-1.5"
        size="sm"
        disabled={!notes.trim() || saving}
        onClick={async () => {
          setSaving(true);
          await flow.actions.saveWrapUp(notes);
          setSaving(false);
        }}
      >
        {saving ? <Spinner className="size-3.5" /> : <PhoneOff className="size-4" />}
        Save & end call
      </Button>
    </SectionCard>
  );
}

function DoneCard({ flow }: { flow: CallFlow }) {
  const existing = flow.confirmed?.eligibility.existingCase;
  return (
    <SectionCard className="border-success/30 text-center">
      <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-success-soft">
        <CircleCheck className="size-5 text-success" />
      </div>
      <div className="text-[14px] font-semibold">Call complete</div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {flow.createdCase
          ? `Case ${flow.createdCase.reference} created.`
          : existing
            ? `Existing case ${existing.reference} shared.`
            : "Notes saved."}
      </p>
      <Button className="mt-3 w-full gap-1.5" size="sm" onClick={flow.actions.newCall}>
        Next call <ArrowRight className="size-3.5" />
      </Button>
    </SectionCard>
  );
}
