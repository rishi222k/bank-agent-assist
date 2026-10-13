import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/ai/mock";
import type { AiProvider } from "../src/ai";
import { MemoryStore } from "../src/data/store";
import { AppError } from "../src/errors";
import { CallService } from "../src/service";
import { findAmount } from "../src/ai/mock";

const SCENARIO = "scenario-a";
const GOOD = { dob: "1990-04-14", last4: "4242" };

function setup(ai: AiProvider = new MockProvider()) {
  const service = new CallService(new MemoryStore(), ai);
  const { callId, script } = service.startCall(SCENARIO, "demo-agent");
  return { service, callId, script };
}

async function playScript(
  service: CallService,
  callId: string,
  script: { speaker: "agent" | "customer"; text: string }[],
) {
  let last = null;
  for (const turn of script) {
    const r = await service.addTurn(callId, turn);
    if (r.analysis) last = r.analysis;
  }
  return last!;
}

const failingAi: AiProvider = {
  name: "off",
  model: null,
  briefing: async () => {
    throw new Error("down");
  },
  extractFacts: async () => {
    throw new Error("down");
  },
  recommend: async () => {
    throw new Error("down");
  },
  wrapUp: async () => {
    throw new Error("down");
  },
};

describe("M0 scenario A", () => {
  it("runs end to end: verify → brief → match → confirm → dispute → wrap-up", async () => {
    const { service, callId, script } = setup();
    expect(service.verifyCaller(callId, GOOD).verified).toBe(true);

    const briefing = await service.getBriefingSummary(callId);
    expect(briefing.ok).toBe(true);

    const analysis = await playScript(service, callId, script);
    expect(analysis.facts?.suggestedIssueType).toBe("unrecognised_charge");
    // The $129 charge, not the $12.99 basic plan the customer also mentions.
    expect(analysis.matches[0]?.transactionId).toBe("txn_1042");

    const confirmed = await service.confirmIssue(callId, {
      transactionId: "txn_1042",
      issueType: "unrecognised_charge",
    });
    expect(confirmed.eligibility.eligible).toBe(true);
    expect(confirmed.recommendation?.ok).toBe(true);

    const { case: created } = service.createDispute({
      callId,
      idempotencyKey: "key-00000001",
      form: {
        transactionId: "txn_1042",
        reason: "not_authorised",
        customerStatement: "I did not make this purchase.",
        cardInPossession: true,
      },
    });
    expect(created.reference).toMatch(/^DSP-\d{4}-0001$/);

    const draft = await service.getWrapUpDraft(callId);
    expect(draft.ok && draft.data.notes).toContain(created.reference);

    service.saveWrapUp(callId, "Notes");
    const types = service.getAudit(callId).events.map((e) => e.type);
    expect(types).toEqual([
      "call.started",
      "caller.verified",
      "transaction.confirmed",
      "dispute.created",
      "call.wrapped_up",
    ]);
  });
});

describe("exception paths", () => {
  it("X-01: keeps data locked until the caller is verified, and locks after 3 failures", async () => {
    const { service, callId } = setup();
    expect(() => service.getContext(callId)).toThrowError(AppError);
    const bad = { dob: "1990-01-01", last4: "4242" };
    expect(service.verifyCaller(callId, bad)).toMatchObject({ verified: false, attemptsLeft: 2 });
    service.verifyCaller(callId, bad);
    expect(service.verifyCaller(callId, bad)).toMatchObject({ verified: false, locked: true });
    expect(() => service.verifyCaller(callId, GOOD)).toThrowError(/Too many failed attempts/);
    expect(() => service.getContext(callId)).toThrowError(/Verify the caller/);
  });

  it("X-02: a second call about the same charge shows the existing case and can't create another", async () => {
    const store = new MemoryStore();
    const service = new CallService(store, new MockProvider());
    const form = {
      transactionId: "txn_1042",
      reason: "not_authorised" as const,
      customerStatement: "I did not make this.",
      cardInPossession: true,
    };

    const first = service.startCall(SCENARIO, "demo-agent").callId;
    service.verifyCaller(first, GOOD);
    await service.confirmIssue(first, { transactionId: "txn_1042", issueType: "unrecognised_charge" });
    const created = service.createDispute({ callId: first, idempotencyKey: "key-first-1", form }).case;

    const second = service.startCall(SCENARIO, "demo-agent").callId;
    service.verifyCaller(second, GOOD);
    const confirmed = await service.confirmIssue(second, {
      transactionId: "txn_1042",
      issueType: "unrecognised_charge",
    });
    expect(confirmed.eligibility.eligible).toBe(false);
    expect(confirmed.eligibility.existingCase?.reference).toBe(created.reference);
    expect(() => service.createDispute({ callId: second, idempotencyKey: "key-second-1", form })).toThrowError(
      /already open/,
    );
  });

  it("is idempotent: the same submission twice creates one case", async () => {
    const { service, callId } = setup();
    service.verifyCaller(callId, GOOD);
    await service.confirmIssue(callId, { transactionId: "txn_1042", issueType: "unrecognised_charge" });
    const form = {
      transactionId: "txn_1042",
      reason: "not_authorised" as const,
      customerStatement: "Not me at all.",
      cardInPossession: true,
    };
    const a = service.createDispute({ callId, idempotencyKey: "same-key-1", form });
    const b = service.createDispute({ callId, idempotencyKey: "same-key-1", form });
    expect(b.replayed).toBe(true);
    expect(b.case.id).toBe(a.case.id);
  });

  it("refuses to dispute a transaction the agent hasn't confirmed", async () => {
    const { service, callId } = setup();
    service.verifyCaller(callId, GOOD);
    await service.confirmIssue(callId, { transactionId: "txn_1042", issueType: "unrecognised_charge" });
    const form = {
      transactionId: "txn_1038",
      reason: "other" as const,
      customerStatement: "Some statement here.",
      cardInPossession: true,
    };
    expect(() => service.createDispute({ callId, idempotencyKey: "k-unconfirmed", form })).toThrowError(
      /Confirm the transaction/,
    );
  });

  it("refuses pending transactions (DSP-1.1)", async () => {
    const { service, callId } = setup();
    service.verifyCaller(callId, GOOD);
    const r = await service.confirmIssue(callId, { transactionId: "txn_1061", issueType: "unrecognised_charge" });
    expect(r.eligibility.eligible).toBe(false);
    expect(r.eligibility.checks.find((c) => c.clauseId === "DSP-1.1")?.passed).toBe(false);
  });

  it("X-06: when the AI fails, the call still works and nothing is invented", async () => {
    const { service, callId, script } = setup(failingAi);
    service.verifyCaller(callId, GOOD);
    expect((await service.getBriefingSummary(callId)).ok).toBe(false);
    const analysis = await playScript(service, callId, script);
    expect(analysis.ai.ok).toBe(false);
    expect(analysis.matches).toEqual([]);
    // Agent picks the transaction manually; the rules engine still works.
    const r = await service.confirmIssue(callId, { transactionId: "txn_1042", issueType: "unrecognised_charge" });
    expect(r.eligibility.eligible).toBe(true);
    expect(r.recommendation?.ok).toBe(false);
  });

  it("strips evidence IDs that don't exist", async () => {
    const lying: AiProvider = {
      ...new MockProvider(),
      name: "mock",
      model: null,
      briefing: async () => ({ summary: "x", highlights: [{ text: "y", evidenceIds: ["txn_1042", "txn_9999"] }] }),
      extractFacts: new MockProvider().extractFacts,
      recommend: new MockProvider().recommend,
      wrapUp: new MockProvider().wrapUp,
    };
    const { service, callId } = setup(lying);
    service.verifyCaller(callId, GOOD);
    const r = await service.getBriefingSummary(callId);
    expect(r.ok && r.data.highlights[0]?.evidenceIds).toEqual(["txn_1042"]);
    expect(r.ok && r.droppedEvidence).toEqual(["txn_9999"]);
  });
});

describe("call lifecycle and action safety", () => {
  const form = {
    transactionId: "txn_1042",
    reason: "not_authorised" as const,
    customerStatement: "I did not make this purchase.",
    cardInPossession: true,
  };

  async function confirmedCall(service: CallService) {
    const { callId } = service.startCall(SCENARIO, "demo-agent");
    service.verifyCaller(callId, GOOD);
    await service.confirmIssue(callId, { transactionId: "txn_1042", issueType: "unrecognised_charge" });
    return callId;
  }

  it("rejects changes once the call has ended, but still replays a create that already succeeded", async () => {
    const service = new CallService(new MemoryStore(), new MockProvider());
    const callId = await confirmedCall(service);
    const created = service.createDispute({ callId, idempotencyKey: "key-ended-1", form }).case;
    service.saveWrapUp(callId, "Notes");

    await expect(service.addTurn(callId, { speaker: "customer", text: "One more thing" })).rejects.toThrowError(
      /call has ended/,
    );
    await expect(
      service.confirmIssue(callId, { transactionId: "txn_1038", issueType: "unrecognised_charge" }),
    ).rejects.toThrowError(/call has ended/);
    expect(() =>
      service.createDispute({
        callId,
        idempotencyKey: "key-ended-2",
        form: { ...form, transactionId: "txn_1038" },
      }),
    ).toThrowError(/call has ended/);
    expect(() => service.saveWrapUp(callId, "Changed notes")).toThrowError(/call has ended/);

    const retry = service.createDispute({ callId, idempotencyKey: "key-ended-1", form });
    expect(retry).toMatchObject({ replayed: true, case: { id: created.id } });
  });

  it("doesn't replay an idempotency key on a different call or transaction", async () => {
    const service = new CallService(new MemoryStore(), new MockProvider());
    const first = await confirmedCall(service);
    service.createDispute({ callId: first, idempotencyKey: "shared-key-1", form });

    const second = service.startCall(SCENARIO, "demo-agent").callId;
    service.verifyCaller(second, GOOD);
    expect(() => service.createDispute({ callId: second, idempotencyKey: "shared-key-1", form })).toThrowError(
      /already used for a different request/,
    );
    expect(() =>
      service.createDispute({
        callId: first,
        idempotencyKey: "shared-key-1",
        form: { ...form, transactionId: "txn_1038" },
      }),
    ).toThrowError(/already used for a different request/);
  });

  it("won't re-confirm a different transaction after a case was raised on the call", async () => {
    const service = new CallService(new MemoryStore(), new MockProvider());
    const callId = await confirmedCall(service);
    service.createDispute({ callId, idempotencyKey: "key-reconfirm-1", form });
    await expect(
      service.confirmIssue(callId, { transactionId: "txn_1038", issueType: "unrecognised_charge" }),
    ).rejects.toThrowError(/already been raised/);
  });

  it("DSP-1.6: a card not in the customer's possession is flagged for fraud escalation", async () => {
    const service = new CallService(new MemoryStore(), new MockProvider());
    const callId = await confirmedCall(service);
    const created = service.createDispute({
      callId,
      idempotencyKey: "key-compromised-1",
      form: { ...form, cardInPossession: false },
    }).case;

    const event = service.getAudit(callId).events.find((e) => e.type === "dispute.created")!;
    expect(event.evidenceIds).toContain("DSP-1.6");
    expect(event.data).toMatchObject({ fraudEscalation: true });

    const draft = await service.getWrapUpDraft(callId);
    expect(draft.ok && draft.data.notes).toContain(created.reference);
    expect(draft.ok && draft.data.notes).not.toContain("Card remains with customer");
    expect(draft.ok && draft.data.followUps.join(" ")).toMatch(/Fraud team/);
  });
});

describe("mock amount parsing", () => {
  it.each([
    ["It's about a hundred and thirty dollars", 130],
    ["that's like thirteen dollars a month", 13],
    ["it was $129.00", 129],
    ["around 45 dollars", 45],
    ["no amount here", null],
  ])("%s → %s", (text, expected) => {
    expect(findAmount(text)).toBe(expected);
  });
});
