import { randomUUID } from "node:crypto";
import type { AiProvider } from "./ai";
import { createAiProvider } from "./ai";
import type { AuditEvent, CallSession, Store } from "./data/store";
import { MemoryStore } from "./data/store";
import { checkDisputeEligibility, type EligibilityResult } from "./domain/eligibility";
import {
  buildEvidenceIndex,
  resolveEvidence,
  verifyEvidence,
  type EvidenceIndex,
  type EvidenceRef,
} from "./domain/evidence";
import { matchTransactions, mergeFacts, type TransactionMatch } from "./domain/matching";
import { AppError } from "./errors";
import type {
  BriefingSummary,
  Card,
  Customer,
  DisputeCase,
  DisputeForm,
  ExtractedFacts,
  IssueType,
  Recommendation,
  ScriptTurn,
  Transaction,
  WrapUp,
} from "./schemas";

const MAX_VERIFY_ATTEMPTS = 3;
const DISPUTE_POLICY_ID = "DSP-1";

// ---------------------------------------------------------------------------
// Response types (what the API returns to the workspace)
// ---------------------------------------------------------------------------

export type AiMeta = { provider: AiProvider["name"]; model: string | null; ms: number };

/** Every AI result says where it came from and whether it worked. Failures fall back in the UI (X-06). */
export type AiResult<T> =
  ({ ok: true; data: T; droppedEvidence: string[] } & AiMeta) | ({ ok: false; error: string } & AiMeta);

export type CallStarted = {
  callId: string;
  scenario: { id: string; title: string; summary: string };
  caller: { phone: string; maskedName: string; maskedCard: string };
  script: ScriptTurn[];
  ai: { provider: AiProvider["name"]; model: string | null };
};

export type VerifyResult = { verified: boolean; attemptsLeft: number; locked: boolean };

export type CallContext = {
  customer: Customer;
  card: Card;
  transactions: Transaction[];
  cases: DisputeCase[];
  evidence: EvidenceRef[];
};

export type TurnResult = {
  turn: ScriptTurn & { at: string };
  analysis: {
    ai: AiResult<ExtractedFacts>;
    facts: ExtractedFacts | null;
    matches: TransactionMatch[];
  } | null;
};

export type ConfirmResult = {
  transaction: Transaction;
  issueType: IssueType;
  eligibility: EligibilityResult;
  recommendation: AiResult<Recommendation> | null;
};

export type DisputeCreated = { case: DisputeCase; replayed: boolean };

export type ScenarioSummary = { id: string; title: string; summary: string };

// ---------------------------------------------------------------------------

export class CallService {
  constructor(
    private readonly store: Store,
    private readonly ai: AiProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get aiInfo() {
    return { provider: this.ai.name, model: this.ai.model };
  }

  listScenarios(): ScenarioSummary[] {
    return this.store.listScenarios().map(({ id, title, summary }) => ({ id, title, summary }));
  }

  startCall(scenarioId: string, agentId: string): CallStarted {
    const scenario = this.store.getScenario(scenarioId);
    if (!scenario) throw new AppError("not_found", `Unknown scenario ${scenarioId}`);
    const customer = this.mustCustomer(scenario.customerId);
    const card = this.store.cardsForCustomer(customer.id)[0];
    if (!card) throw new AppError("not_found", "Customer has no card");

    const call: CallSession = {
      id: `call_${randomUUID().slice(0, 8)}`,
      scenarioId,
      customerId: customer.id,
      cardId: card.id,
      agentId,
      startedAt: this.now().toISOString(),
      endedAt: null,
      verified: false,
      verifyAttempts: 0,
      transcript: [],
      facts: null,
      briefing: null,
      confirmed: null,
      eligibility: null,
      caseId: null,
      notes: null,
      wrapUpStartedAt: null,
    };
    this.store.insertCall(call);
    this.audit(call, "call.started", `Incoming call from ${scenario.callerPhone}`);

    return {
      callId: call.id,
      scenario: { id: scenario.id, title: scenario.title, summary: scenario.summary },
      caller: {
        phone: scenario.callerPhone,
        maskedName: maskName(customer.name),
        maskedCard: `•••• ${card.last4.slice(-2).padStart(4, "•")}`,
      },
      script: scenario.turns,
      ai: this.aiInfo,
    };
  }

  verifyCaller(callId: string, answer: { dob: string; last4: string }): VerifyResult {
    const call = this.mustCall(callId);
    if (call.verified)
      return { verified: true, attemptsLeft: MAX_VERIFY_ATTEMPTS - call.verifyAttempts, locked: false };
    if (call.verifyAttempts >= MAX_VERIFY_ATTEMPTS)
      throw new AppError("verification_locked", "Too many failed attempts. Escalate to a team lead.");

    const customer = this.mustCustomer(call.customerId);
    const card = this.mustCard(call.cardId);
    call.verifyAttempts++;
    const ok = answer.dob === customer.dob && answer.last4 === card.last4;
    const attemptsLeft = MAX_VERIFY_ATTEMPTS - call.verifyAttempts;

    if (ok) {
      call.verified = true;
      this.audit(call, "caller.verified", "Caller verified with date of birth and last 4 digits", [
        customer.id,
        card.id,
      ]);
    } else {
      this.audit(
        call,
        "caller.verification_failed",
        `Verification failed (${attemptsLeft} attempts left)`,
        [],
        "rejected",
      );
    }
    return { verified: ok, attemptsLeft, locked: !ok && attemptsLeft === 0 };
  }

  getContext(callId: string): CallContext {
    const call = this.mustVerifiedCall(callId);
    const ctx = this.loadContext(call);
    return { ...ctx, evidence: [...this.evidenceIndex(call).values()] };
  }

  async getBriefingSummary(callId: string): Promise<AiResult<BriefingSummary>> {
    const call = this.mustVerifiedCall(callId);
    const ctx = this.loadContext(call);
    const result = await this.runAi(
      () => this.ai.briefing({ today: this.today(), ...ctx }),
      (data) => {
        const { items, dropped } = verifyEvidence(data.highlights, this.evidenceIndex(call));
        return { data: { ...data, highlights: items }, dropped };
      },
    );
    if (result.ok) call.briefing = result.data;
    return result;
  }

  async addTurn(callId: string, turn: ScriptTurn): Promise<TurnResult> {
    const call = this.mustActiveCall(callId);
    const stored = { ...turn, at: this.now().toISOString() };
    call.transcript.push(stored);
    if (turn.speaker !== "customer") return { turn: stored, analysis: null };

    const ai = await this.runAi(
      () => this.ai.extractFacts({ today: this.today(), transcript: call.transcript }),
      (data) => ({ data, dropped: [] }),
    );
    if (ai.ok) call.facts = mergeFacts(call.facts, ai.data);
    const matches = call.facts ? matchTransactions(call.facts, this.store.transactionsForCard(call.cardId)) : [];
    return { turn: stored, analysis: { ai, facts: call.facts, matches } };
  }

  async confirmIssue(callId: string, input: { transactionId: string; issueType: IssueType }): Promise<ConfirmResult> {
    const call = this.mustActiveCall(callId);
    if (input.issueType !== "unrecognised_charge")
      throw new AppError("bad_request", "Only the unrecognised-charge playbook is available in M0");
    // One case per call in M0. Re-confirming would detach the case from what the notes describe.
    if (call.caseId) throw new AppError("conflict", "A case has already been raised on this call");
    this.assertNotWrappingUp(call);
    const transaction = this.mustOwnTransaction(call, input.transactionId);
    const eligibility = this.eligibilityFor(transaction);

    call.confirmed = { transactionId: transaction.id, issueType: input.issueType };
    call.eligibility = eligibility;
    this.audit(
      call,
      "transaction.confirmed",
      `Agent confirmed ${usd(transaction.amount)} ${transaction.merchant}; ${eligibility.eligible ? "eligible for dispute" : "not eligible"}`,
      [transaction.id, ...eligibility.checks.map((c) => c.clauseId)],
    );

    const customer = this.mustCustomer(call.customerId);
    const card = this.mustCard(call.cardId);
    const policy = this.store.getPolicy(DISPUTE_POLICY_ID)!;
    const recommendation = await this.runAi(
      () =>
        this.ai.recommend({
          today: this.today(),
          customer,
          card,
          transaction,
          facts: call.facts,
          eligibility,
          policy,
          transcript: call.transcript,
        }),
      (data) => {
        const index = this.evidenceIndex(call);
        const steps = verifyEvidence(data.steps, index);
        const lines = verifyEvidence(data.scriptLines, index);
        return {
          data: { ...data, steps: steps.items, scriptLines: lines.items },
          dropped: [...steps.dropped, ...lines.dropped],
        };
      },
    );

    return { transaction, issueType: input.issueType, eligibility, recommendation };
  }

  /** The only path that creates a case. Re-checks everything server-side; never driven by AI output. */
  createDispute(input: { callId: string; idempotencyKey: string; form: DisputeForm }): DisputeCreated {
    const call = this.mustVerifiedCall(input.callId);

    // A retry of a request that already succeeded returns the same case, even after the call ended.
    // The key only replays for the same call and transaction; anything else is a client bug.
    const replay = this.store.idempotent(input.idempotencyKey);
    if (replay) {
      const existing = this.store.getCase(replay.caseId);
      if (!existing || replay.callId !== call.id || existing.transactionId !== input.form.transactionId)
        throw new AppError("conflict", "This idempotency key was already used for a different request");
      return { case: existing, replayed: true };
    }
    this.assertActive(call);
    this.assertNotWrappingUp(call);

    if (!call.confirmed || call.confirmed.transactionId !== input.form.transactionId)
      throw new AppError("conflict", "Confirm the transaction with the customer before raising a dispute");

    const transaction = this.mustOwnTransaction(call, input.form.transactionId);
    const eligibility = this.eligibilityFor(transaction);
    if (eligibility.existingCase) {
      this.audit(
        call,
        "dispute.rejected",
        `Duplicate blocked: case ${eligibility.existingCase.reference} already open`,
        [eligibility.existingCase.id],
        "rejected",
      );
      throw new AppError(
        "duplicate_case",
        `Case ${eligibility.existingCase.reference} is already open for this transaction`,
        {
          case: eligibility.existingCase,
        },
      );
    }
    if (!eligibility.eligible) {
      const failed = eligibility.checks.filter((c) => !c.passed);
      this.audit(
        call,
        "dispute.rejected",
        `Not eligible: ${failed.map((c) => c.label).join(", ")}`,
        failed.map((c) => c.clauseId),
        "rejected",
      );
      throw new AppError("not_eligible", "This transaction isn't eligible for a dispute", { checks: failed });
    }

    const created = this.store.insertCase({
      customerId: call.customerId,
      cardId: call.cardId,
      transactionId: transaction.id,
      amount: transaction.amount,
      merchant: transaction.merchant,
      reason: input.form.reason,
      customerStatement: input.form.customerStatement,
      cardInPossession: input.form.cardInPossession,
      status: "open",
      createdAt: this.now().toISOString(),
      createdBy: call.agentId,
      callId: call.id,
    });
    this.store.rememberIdempotent(input.idempotencyKey, { callId: call.id, caseId: created.id });
    call.caseId = created.id;
    // DSP-1.6: a card that isn't with the cardholder is treated as compromised.
    const compromised = !input.form.cardInPossession;
    this.audit(
      call,
      "dispute.created",
      `Dispute ${created.reference} raised for ${usd(transaction.amount)} ${transaction.merchant}` +
        (compromised ? "; card not in customer's possession, flagged for fraud escalation" : ""),
      [transaction.id, created.id, ...eligibility.checks.map((c) => c.clauseId), ...(compromised ? ["DSP-1.6"] : [])],
      "ok",
      {
        reference: created.reference,
        reason: created.reason,
        idempotencyKey: input.idempotencyKey,
        fraudEscalation: compromised,
      },
    );
    return { case: created, replayed: false };
  }

  async getWrapUpDraft(callId: string): Promise<AiResult<WrapUp>> {
    const call = this.mustVerifiedCall(callId);
    // From here the notes describe the call, so no new action may change what they describe.
    if (!call.endedAt) call.wrapUpStartedAt ??= this.now().toISOString();
    const createdCase = call.caseId ? (this.store.getCase(call.caseId) ?? null) : null;
    const transaction = call.confirmed ? (this.store.getTransaction(call.confirmed.transactionId) ?? null) : null;
    return this.runAi(
      () =>
        this.ai.wrapUp({
          today: this.today(),
          customer: this.mustCustomer(call.customerId),
          card: this.mustCard(call.cardId),
          transaction,
          transcript: call.transcript,
          eligibility: call.eligibility,
          createdCase,
        }),
      (data) => {
        // The notes must carry the real case reference, whatever the model wrote.
        if (createdCase && !data.notes.includes(createdCase.reference))
          return { data: { ...data, notes: `Case ${createdCase.reference}.\n${data.notes}` }, dropped: [] };
        return { data, dropped: [] };
      },
    );
  }

  saveWrapUp(callId: string, notes: string): { endedAt: string } {
    const call = this.mustActiveCall(callId);
    // The saved notes always carry the case reference, even if the agent edited it out.
    const createdCase = call.caseId ? this.store.getCase(call.caseId) : undefined;
    call.notes =
      createdCase && !notes.includes(createdCase.reference) ? `Case ${createdCase.reference}.\n${notes}` : notes;
    call.endedAt = this.now().toISOString();
    const evidence = [call.confirmed?.transactionId, call.caseId].filter((x): x is string => Boolean(x));
    this.audit(call, "call.wrapped_up", "Call notes saved and call ended", evidence);
    return { endedAt: call.endedAt };
  }

  getAudit(callId: string): { events: AuditEvent[]; evidence: EvidenceRef[] } {
    const call = this.mustCall(callId);
    const events = this.store.audit(callId);
    const index = this.evidenceIndex(call);
    return {
      events,
      evidence: resolveEvidence(
        events.flatMap((e) => e.evidenceIds),
        index,
      ),
    };
  }

  reset() {
    this.store.reset();
  }

  // -------------------------------------------------------------------------

  private async runAi<T>(
    call: () => Promise<T>,
    check: (data: T) => { data: T; dropped: string[] },
  ): Promise<AiResult<T>> {
    const started = Date.now();
    const meta = () => ({ provider: this.ai.name, model: this.ai.model, ms: Date.now() - started });
    try {
      const { data, dropped } = check(await call());
      return { ok: true, data, droppedEvidence: dropped, ...meta() };
    } catch (err) {
      console.error(`[ai:${this.ai.name}]`, err);
      return { ok: false, error: err instanceof Error ? err.message : "AI request failed", ...meta() };
    }
  }

  private eligibilityFor(transaction: Transaction): EligibilityResult {
    return checkDisputeEligibility({
      transaction,
      openCase: this.store.openCaseForTransaction(transaction.id),
      policy: this.store.getPolicy(DISPUTE_POLICY_ID)!,
    });
  }

  private loadContext(call: CallSession) {
    return {
      customer: this.mustCustomer(call.customerId),
      card: this.mustCard(call.cardId),
      transactions: this.store.transactionsForCard(call.cardId),
      cases: this.store.casesForCustomer(call.customerId),
    };
  }

  private evidenceIndex(call: CallSession): EvidenceIndex {
    const ctx = this.loadContext(call);
    return buildEvidenceIndex({
      customer: ctx.customer,
      cards: [ctx.card],
      transactions: ctx.transactions,
      cases: ctx.cases,
      policies: [this.store.getPolicy(DISPUTE_POLICY_ID)!],
    });
  }

  private audit(
    call: CallSession,
    type: string,
    summary: string,
    evidenceIds: string[] = [],
    result: AuditEvent["result"] = "ok",
    data?: Record<string, unknown>,
  ) {
    this.store.appendAudit({ actor: call.agentId, callId: call.id, type, summary, evidenceIds, result, data });
  }

  private today() {
    return this.now().toISOString().slice(0, 10);
  }

  private mustCall(id: string) {
    const call = this.store.getCall(id);
    if (!call) throw new AppError("not_found", "Call not found");
    return call;
  }
  private mustVerifiedCall(id: string) {
    const call = this.mustCall(id);
    if (!call.verified) throw new AppError("not_verified", "Verify the caller before accessing account data");
    return call;
  }
  /** A verified call that hasn't ended. Everything that changes state goes through this. */
  private mustActiveCall(id: string) {
    const call = this.mustVerifiedCall(id);
    this.assertActive(call);
    return call;
  }
  private assertNotWrappingUp(call: CallSession) {
    if (call.wrapUpStartedAt)
      throw new AppError("conflict", "Wrap-up has started on this call. Start a new call to raise a case");
  }
  private assertActive(call: CallSession) {
    if (call.endedAt) throw new AppError("call_ended", "This call has ended. Start a new call to make changes");
  }
  private mustCustomer(id: string) {
    const c = this.store.getCustomer(id);
    if (!c) throw new AppError("not_found", "Customer not found");
    return c;
  }
  private mustCard(id: string) {
    const c = this.store.getCard(id);
    if (!c) throw new AppError("not_found", "Card not found");
    return c;
  }
  private mustOwnTransaction(call: CallSession, id: string) {
    const t = this.store.getTransaction(id);
    if (!t || t.cardId !== call.cardId) throw new AppError("not_found", "Transaction not found on this card");
    return t;
  }
}

const usd = (n: number) => `$${Math.abs(n).toFixed(2)}`;

function maskName(name: string) {
  return name
    .split(" ")
    .map((part) => part.charAt(0) + "•".repeat(Math.max(part.length - 1, 2)))
    .join(" ");
}

// One service per server process. Kept on globalThis so dev hot-reloads don't wipe the demo state.
const g = globalThis as unknown as { __baaService?: CallService };
export function getCallService(): CallService {
  g.__baaService ??= new CallService(new MemoryStore(), createAiProvider());
  return g.__baaService;
}
