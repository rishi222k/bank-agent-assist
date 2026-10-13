import type {
  BriefingSummary,
  Card,
  Customer,
  DisputeCase,
  ExtractedFacts,
  IssueType,
  Policy,
  Scenario,
  ScriptTurn,
  Transaction,
} from "../schemas";
import type { EligibilityResult } from "../domain/eligibility";
import { loadFixtures } from "./fixtures";

export type TranscriptTurn = ScriptTurn & { at: string };

export type CallSession = {
  id: string;
  scenarioId: string;
  customerId: string;
  cardId: string;
  agentId: string;
  startedAt: string;
  endedAt: string | null;
  verified: boolean;
  verifyAttempts: number;
  transcript: TranscriptTurn[];
  facts: ExtractedFacts | null;
  briefing: BriefingSummary | null;
  confirmed: { transactionId: string; issueType: IssueType } | null;
  eligibility: EligibilityResult | null;
  caseId: string | null;
  notes: string | null;
  /** Set when the wrap-up draft is first requested; no new actions after that. */
  wrapUpStartedAt: string | null;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  callId: string | null;
  type: string;
  summary: string;
  evidenceIds: string[];
  result: "ok" | "rejected" | "failed";
  data?: Record<string, unknown>;
};

export type IdempotentRecord = { callId: string; caseId: string };

/**
 * Data access used by the call service. M0 keeps everything in memory;
 * M1 swaps in a Firestore implementation behind the same interface.
 */
export interface Store {
  getScenario(id: string): Scenario | undefined;
  listScenarios(): Scenario[];
  getCustomer(id: string): Customer | undefined;
  getCard(id: string): Card | undefined;
  cardsForCustomer(customerId: string): Card[];
  transactionsForCard(cardId: string): Transaction[];
  getTransaction(id: string): Transaction | undefined;
  casesForCustomer(customerId: string): DisputeCase[];
  openCaseForTransaction(transactionId: string): DisputeCase | undefined;
  getCase(id: string): DisputeCase | undefined;
  insertCase(c: Omit<DisputeCase, "id" | "reference">): DisputeCase;
  getPolicy(id: string): Policy | undefined;

  getCall(id: string): CallSession | undefined;
  insertCall(call: CallSession): void;

  /** The case an idempotency key created, and the call it was used on. */
  idempotent(key: string): IdempotentRecord | undefined;
  rememberIdempotent(key: string, record: IdempotentRecord): void;

  appendAudit(e: Omit<AuditEvent, "id" | "at">): AuditEvent;
  audit(callId?: string): AuditEvent[];

  reset(): void;
}

export class MemoryStore implements Store {
  private data = loadFixtures();
  private calls = new Map<string, CallSession>();
  private idem = new Map<string, IdempotentRecord>();
  private events: AuditEvent[] = [];
  private seq = { case: 0, event: 0 };

  getScenario(id: string) {
    return this.data.scenarios.find((s) => s.id === id);
  }
  listScenarios() {
    return this.data.scenarios;
  }
  getCustomer(id: string) {
    return this.data.customers.find((c) => c.id === id);
  }
  getCard(id: string) {
    return this.data.cards.find((c) => c.id === id);
  }
  cardsForCustomer(customerId: string) {
    return this.data.cards.filter((c) => c.customerId === customerId);
  }
  transactionsForCard(cardId: string) {
    return this.data.transactions.filter((t) => t.cardId === cardId).sort((a, b) => a.daysAgo - b.daysAgo);
  }
  getTransaction(id: string) {
    return this.data.transactions.find((t) => t.id === id);
  }
  casesForCustomer(customerId: string) {
    return this.data.cases.filter((c) => c.customerId === customerId);
  }
  openCaseForTransaction(transactionId: string) {
    return this.data.cases.find((c) => c.transactionId === transactionId && c.status === "open");
  }
  getCase(id: string) {
    return this.data.cases.find((c) => c.id === id);
  }
  insertCase(c: Omit<DisputeCase, "id" | "reference">) {
    const n = ++this.seq.case;
    const year = new Date(c.createdAt).getUTCFullYear();
    const created: DisputeCase = { ...c, id: `case_${n}`, reference: `DSP-${year}-${String(n).padStart(4, "0")}` };
    this.data.cases.push(created);
    return created;
  }
  getPolicy(id: string) {
    return this.data.policies.find((p) => p.id === id);
  }

  getCall(id: string) {
    return this.calls.get(id);
  }
  insertCall(call: CallSession) {
    this.calls.set(call.id, call);
  }

  idempotent(key: string) {
    return this.idem.get(key);
  }
  rememberIdempotent(key: string, record: IdempotentRecord) {
    this.idem.set(key, record);
  }

  appendAudit(e: Omit<AuditEvent, "id" | "at">) {
    const event: AuditEvent = { ...e, id: `evt_${++this.seq.event}`, at: new Date().toISOString() };
    this.events.push(event);
    return event;
  }
  audit(callId?: string) {
    return callId ? this.events.filter((e) => e.callId === callId) : [...this.events];
  }

  reset() {
    this.data = loadFixtures();
    this.calls.clear();
    this.idem.clear();
    this.events = [];
    this.seq = { case: 0, event: 0 };
  }
}
