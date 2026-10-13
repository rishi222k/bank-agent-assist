"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  { id: "not_authorised", label: "Customer didn’t authorise it" },
  { id: "not_recognised", label: "Customer doesn’t recognise it" },
  { id: "amount_differs", label: "Amount differs from what was agreed" },
  { id: "other", label: "Other" },
];

/** Selected state for segmented controls: solid, so the choice reads at a glance. */
const SEGMENT_ON = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

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
        text="The co-pilot unlocks once the caller is verified. Account data stays masked until then."
      />
    );
  if (transcript.length === 0)
    return (
      <PanelEmpty
        icon={Sparkles}
        title="Ready to listen"
        text="Play the call. The co-pilot follows the conversation and finds the transaction the customer describes."
      />
    );

  const selected = context?.transactions.find((t) => t.id === selectedTxnId) ?? null;
  const waitingForMatch = !selected && !scriptDone && !extractError;

  return (
    <div className="space-y-4">
      {/* Once wrap-up starts, the notes describe the call: no new confirmation or case. */}
      {confirmed ? (
        <ConfirmedSummary flow={flow} />
      ) : (
        !flow.wrapUpRequested && (
          <div ref={stage === "confirm" ? latest : undefined} className="space-y-4">
            <IssueTypeCard flow={flow} />
            {waitingForMatch ? <ListeningCard /> : <MatchCard flow={flow} selected={selected} />}
          </div>
        )
      )}

      {confirmed && (
        <div ref={stage === "act" ? latest : undefined} className="space-y-4">
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
          {flow.ended ? (
            <DoneCard flow={flow} />
          ) : (
            // Remount once the draft arrives so the editor starts from it.
            <WrapUpCard key={flow.wrapUp ? "draft" : "loading"} flow={flow} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PanelEmpty({ icon: Icon, title, text }: { icon: React.ComponentType; title: string; text: string }) {
  return (
    <Empty className="h-full min-h-72 border border-dashed bg-background/50 md:p-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function IssueTypeCard({ flow }: { flow: CallFlow }) {
  const { issueType, suggestedIssueType, facts } = flow;
  const suggestionUnavailable =
    suggestedIssueType && suggestedIssueType !== "unknown" && !AVAILABLE_ISSUE_TYPES.includes(suggestedIssueType);
  const description = suggestionUnavailable
    ? `The AI thinks this is a ${ISSUE_LABELS[suggestedIssueType].toLowerCase()}. That playbook isn’t built yet, so handle it manually or pick another.`
    : issueType && issueType === suggestedIssueType
      ? "Suggested from the conversation. Change it if it’s wrong."
      : facts
        ? "Not clear from the conversation yet. Pick one."
        : "Pick the issue the customer is calling about.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issue type</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          value={issueType ?? ""}
          onValueChange={(v) => v && flow.actions.selectIssueType(v as IssueType)}
          variant="outline"
          size="sm"
          spacing={1.5}
          className="flex-wrap"
        >
          {ISSUE_TYPES.map((t) => {
            const suggested = t.id === suggestedIssueType;
            const item = (
              <ToggleGroupItem
                key={t.id}
                value={t.id}
                disabled={!t.available}
                className={cn("rounded-full", t.available && SEGMENT_ON)}
              >
                {suggested && <Sparkles />}
                {t.label}
              </ToggleGroupItem>
            );
            return t.available ? (
              item
            ) : (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {item}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Playbook coming after M0</TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}

function ListeningCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <AiLabel className="animate-pulse text-sm font-semibold">Listening for the transaction…</AiLabel>
        </CardTitle>
        <CardDescription>Matches appear as soon as the customer mentions a merchant, amount or date.</CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-14 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

function MatchCard({ flow, selected }: { flow: CallFlow; selected: Transaction | null }) {
  const match = flow.matches.find((m) => m.transactionId === selected?.id);
  const others = flow.matches.filter((m) => m.transactionId !== selected?.id);
  const { highlight } = useEvidence();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction the customer means</CardTitle>
        <CardDescription>
          {match
            ? "Matched from what the customer said. Confirm it with them."
            : "Select the transaction from the list on the left."}
        </CardDescription>
        {match && (
          <CardAction>
            <Badge variant="ai">
              <Sparkles /> Matched
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {flow.extractError && flow.matches.length === 0 && (
          <Alert variant="warning">
            <CircleAlert />
            <AlertTitle>AI couldn’t match a transaction</AlertTitle>
            <AlertDescription>
              Ask the customer for the merchant and amount, then pick it from the list.
            </AlertDescription>
          </Alert>
        )}
        {selected ? (
          <div
            className="rounded-lg border bg-surface p-3"
            onMouseEnter={() => highlight(selected.id)}
            onMouseLeave={() => highlight(null)}
          >
            <TransactionSummary t={selected} />
            {match && match.reasons.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                {match.reasons.map((r) => (
                  <li key={r} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CircleCheck className="size-3.5 text-ai" />
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          !flow.extractError && (
            <p className="text-sm text-muted-foreground">No transaction matched what the customer said.</p>
          )
        )}
        {others.length > 0 && (
          <div className="space-y-1.5">
            <Eyebrow>Other possible matches</Eyebrow>
            {others.map((m) => {
              const t = flow.context?.transactions.find((x) => x.id === m.transactionId);
              if (!t) return null;
              return (
                <button
                  key={m.transactionId}
                  type="button"
                  onClick={() => flow.actions.selectTransaction(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="truncate">{t.merchant}</span>
                  <Amount value={t.amount} />
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button
          className="w-full"
          disabled={!selected || !flow.issueType || flow.confirming}
          onClick={flow.actions.confirmTransaction}
        >
          {flow.confirming ? <Spinner /> : <CircleCheck />}
          Customer confirmed this charge
        </Button>
        {/* The customer may hang up or the call may need no action: the agent can always wrap up. */}
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={flow.actions.startWrapUp}>
          Wrap up without a case
        </Button>
      </CardFooter>
    </Card>
  );
}

function ConfirmedSummary({ flow }: { flow: CallFlow }) {
  const t = flow.confirmed!.transaction;
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs">
      <CircleCheck className="size-4 shrink-0 text-success" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">
          {ISSUE_LABELS[flow.confirmed!.issueType]} · confirmed with customer
        </div>
        <div className="truncate text-sm font-medium">
          <Amount value={t.amount} /> · {t.merchant}
        </div>
      </div>
      <EvidenceChips ids={[t.id]} />
    </div>
  );
}

function EligibilityCard({ flow }: { flow: CallFlow }) {
  const { eligibility } = flow.confirmed!;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispute eligibility</CardTitle>
        <CardDescription>Checked by the bank’s rules, not the AI · demo policy {eligibility.policyId}</CardDescription>
        <CardAction>
          {eligibility.eligible ? (
            <Badge variant="success">Eligible</Badge>
          ) : (
            <Badge variant="warning">Not eligible</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {eligibility.checks.map((c) => (
            <li key={c.clauseId} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              <CheckIcon passed={c.passed} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
              </div>
              <EvidenceChips ids={[c.clauseId]} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ScriptLines({ lines }: { lines: { text: string; evidenceIds: string[] }[] }) {
  return (
    <div className="space-y-2">
      <Eyebrow icon={MessageSquareQuote}>Say to the customer</Eyebrow>
      {lines.map((l, i) => (
        <blockquote
          key={i}
          className="space-y-2 rounded-lg border border-l-2 border-l-ai bg-background px-3 py-2.5 text-sm"
        >
          <p className="leading-relaxed">“{l.text}”</p>
          <EvidenceChips ids={l.evidenceIds} />
        </blockquote>
      ))}
    </div>
  );
}

function AiCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="border-ai/20 bg-ai-soft/50">
      <CardHeader>
        <CardTitle>
          <AiLabel className="text-sm font-semibold">{title}</AiLabel>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function RecommendationCard({ flow }: { flow: CallFlow }) {
  const rec = flow.confirmed!.recommendation;
  if (!rec?.ok)
    return (
      <Alert variant="warning">
        <CircleAlert />
        <AlertTitle>AI recommendation unavailable</AlertTitle>
        <AlertDescription>
          Follow demo policy DSP-1: confirm the customer didn’t authorise the charge, check they still have the card,
          then submit the dispute below.
        </AlertDescription>
      </Alert>
    );

  return (
    <AiCard title="Recommended next steps" description="Each step cites the records it relies on.">
      <ol className="space-y-3">
        {rec.data.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ai text-[11px] font-semibold text-background tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className="leading-relaxed">{s.text}</p>
              <EvidenceChips ids={s.evidenceIds} />
            </div>
          </li>
        ))}
      </ol>
      <ScriptLines lines={rec.data.scriptLines} />
      {rec.droppedEvidence.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {rec.droppedEvidence.length} citation{rec.droppedEvidence.length > 1 ? "s" : ""} removed because the record
          doesn’t exist.
        </p>
      )}
    </AiCard>
  );
}

function DisputeFormCard({ flow, transaction }: { flow: CallFlow; transaction: Transaction }) {
  const rec = flow.confirmed!.recommendation;
  const prefill = rec?.ok ? rec.data.formPrefill : null;
  // Card possession decides whether the card is treated as compromised (DSP-1.6), so it's never
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
    <Card>
      <CardHeader>
        <CardTitle>Dispute form</CardTitle>
        <CardDescription>
          {prefill ? "Pre-filled from the call. Check and edit before submitting." : "Fill in from the call."}
        </CardDescription>
        {prefill && (
          <CardAction>
            <Badge variant="ai">
              <Sparkles /> Pre-filled
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <div className="rounded-lg border bg-surface p-3">
            <TransactionSummary t={transaction} />
          </div>
          <Field>
            <FieldLabel htmlFor="reason">Reason</FieldLabel>
            <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v as DisputeReason })}>
              <SelectTrigger id="reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={(!statementOk && form.customerStatement.length > 0) || undefined}>
            <FieldLabel htmlFor="statement">Customer statement</FieldLabel>
            <Textarea
              id="statement"
              rows={3}
              value={form.customerStatement}
              onChange={(e) => setForm({ ...form, customerStatement: e.target.value })}
              aria-invalid={!statementOk && form.customerStatement.length > 0}
              className="leading-relaxed"
            />
            <FieldDescription className="flex justify-between text-xs">
              <span>In the customer’s words. At least 10 characters.</span>
              <span className="tabular-nums">{form.customerStatement.trim().length}</span>
            </FieldDescription>
          </Field>
          <Field orientation="horizontal" className="justify-between">
            <FieldLabel>Card still with the customer?</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={form.cardInPossession === null ? "" : form.cardInPossession ? "yes" : "no"}
              onValueChange={(v) => v && setForm({ ...form, cardInPossession: v === "yes" })}
            >
              <ToggleGroupItem value="yes" className={cn("px-4", SEGMENT_ON)}>
                Yes
              </ToggleGroupItem>
              <ToggleGroupItem value="no" className={cn("px-4", SEGMENT_ON)}>
                No
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {compromised && <CompromisedCardAlert />}
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled={!complete} onClick={() => setReviewing(true)}>
          Review and approve <ArrowRight />
        </Button>
      </CardFooter>

      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve dispute</DialogTitle>
            <DialogDescription>
              This opens a dispute case in the bank’s system (simulated). You’re approving it as the agent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-surface p-3">
              <TransactionSummary t={transaction} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
              <dt className="text-muted-foreground">Reason</dt>
              <dd>{reasonLabel}</dd>
              <dt className="text-muted-foreground">Card with customer</dt>
              <dd>{form.cardInPossession ? "Yes" : "No, fraud escalation required"}</dd>
              <dt className="text-muted-foreground">Statement</dt>
              <dd className="leading-relaxed">“{form.customerStatement.trim()}”</dd>
              <dt className="text-muted-foreground">Policy checks</dt>
              <dd className="flex items-center gap-1.5 text-success">
                <CircleCheck className="size-4" /> All passed
              </dd>
            </dl>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(false)}>
              Back
            </Button>
            <Button
              disabled={flow.submitting}
              onClick={async () => {
                if (form.cardInPossession === null) return;
                if (await flow.actions.submitDispute({ ...form, cardInPossession: form.cardInPossession }))
                  setReviewing(false);
              }}
            >
              {flow.submitting ? <Spinner /> : <ShieldCheck />}
              Approve and create case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CompromisedCardAlert() {
  return (
    <Alert variant="warning">
      <CircleAlert />
      <AlertTitle>Treat the card as compromised</AlertTitle>
      <AlertDescription className="space-y-1.5">
        <p>The card isn’t with the customer. Escalate to the fraud team; the case is flagged for fraud review.</p>
        <EvidenceChips ids={["DSP-1.6"]} />
      </AlertDescription>
    </Alert>
  );
}

function CaseCreatedCard({ flow }: { flow: CallFlow }) {
  const c = flow.createdCase!;
  return (
    <Card className="border-success/30">
      <CardHeader>
        <Eyebrow icon={CircleCheck} className="text-success">
          Dispute created
        </Eyebrow>
        <CardTitle className="font-mono text-2xl tracking-tight">{c.reference}</CardTitle>
        <CardDescription>
          {usd(c.amount)} · {c.merchant} · status <span className="capitalize">{c.status}</span>
        </CardDescription>
        <CardAction>
          <EvidenceChips ids={[c.id]} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ScriptLines
          lines={[
            {
              text: `Your dispute reference is ${c.reference}. You’ll hear about a provisional credit within 10 business days, and the investigation can take up to 90 days.`,
              evidenceIds: ["DSP-1.5"],
            },
          ]}
        />
      </CardContent>
      {!flow.wrapUpRequested && (
        <CardFooter>
          <Button className="w-full" onClick={flow.actions.startWrapUp}>
            Wrap up call <ArrowRight />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function NotEligibleCard({ flow }: { flow: CallFlow }) {
  const { eligibility, recommendation } = flow.confirmed!;
  const existing = eligibility.existingCase;
  return (
    <>
      <Alert variant="warning">
        <FolderOpen />
        <AlertTitle>{existing ? `Case ${existing.reference} is already open` : "A dispute can’t be raised"}</AlertTitle>
        <AlertDescription>
          {existing
            ? `Opened ${new Date(existing.createdAt).toLocaleString()} for ${usd(existing.amount)} ${existing.merchant}. A second case won’t be created.`
            : eligibility.checks.find((c) => !c.passed)?.detail}
        </AlertDescription>
      </Alert>
      {recommendation?.ok && (
        <AiCard title="What to do instead">
          <ul className="space-y-3 text-sm">
            {recommendation.data.steps.map((s, i) => (
              <li key={i} className="space-y-1.5">
                <p className="leading-relaxed">{s.text}</p>
                <EvidenceChips ids={s.evidenceIds} />
              </li>
            ))}
          </ul>
          <ScriptLines lines={recommendation.data.scriptLines} />
        </AiCard>
      )}
      {!flow.wrapUpRequested && (
        <Button className="w-full" onClick={flow.actions.startWrapUp}>
          Wrap up call <ArrowRight />
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
    <Card>
      <CardHeader>
        <CardTitle>Wrap-up notes</CardTitle>
        <CardDescription>
          {draft?.ok
            ? "Drafted from the call. Edit before saving."
            : draft
              ? "AI draft unavailable. Write the notes below."
              : "Drafting notes from the call…"}
        </CardDescription>
        {draft?.ok && (
          <CardAction>
            <Badge variant="ai">
              <Sparkles /> AI draft
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!draft ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <Textarea
            aria-label="Wrap-up notes"
            rows={7}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="leading-relaxed"
          />
        )}
        {draft?.ok && draft.data.followUps.length > 0 && (
          <div className="space-y-1.5">
            <Eyebrow>Follow-ups</Eyebrow>
            <ul className="space-y-1 text-sm">
              {draft.data.followUps.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          disabled={!notes.trim() || saving}
          onClick={async () => {
            setSaving(true);
            await flow.actions.saveWrapUp(notes);
            setSaving(false);
          }}
        >
          {saving ? <Spinner /> : <PhoneOff />}
          Save notes and end call
        </Button>
      </CardFooter>
    </Card>
  );
}

function DoneCard({ flow }: { flow: CallFlow }) {
  const existing = flow.confirmed?.eligibility.existingCase;
  return (
    <Card className="border-success/30">
      <CardHeader className="justify-items-center gap-2 text-center">
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-success-soft">
          <CircleCheck className="size-5 text-success" />
        </div>
        <CardTitle className="text-base">Call complete</CardTitle>
        <CardDescription className="max-w-72">
          {flow.createdCase
            ? `Dispute ${flow.createdCase.reference} created, notes saved and every step logged.`
            : existing
              ? `Existing case ${existing.reference} shared with the customer. No duplicate created.`
              : "Notes saved and every step logged."}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full" onClick={flow.actions.newCall}>
          Take next call <ArrowRight />
        </Button>
      </CardFooter>
    </Card>
  );
}
