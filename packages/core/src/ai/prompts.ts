import type { BriefingInput, ExtractInput, RecommendInput, WrapUpInput } from "./provider";
import type { ScriptTurn } from "../schemas";

export const SYSTEM_BASE = `You assist a human bank card-servicing agent during a live customer call.
Rules:
- Use only the facts supplied in the input. Never invent transactions, cases, policies or outcomes.
- Every statement that relies on a record must list that record's ID in evidenceIds (e.g. txn_1042, card_4242, cus_maya, DSP-1.2). Only use IDs that appear in the input.
- You recommend; the agent decides. Never claim an action has been completed unless the input says so.
- Eligibility has already been decided by the bank's rules engine. Do not override it.
- Be concise and plain. Use US dollars with two decimals.
- All data is fictional demo data.`;

const transcriptText = (turns: ScriptTurn[]) =>
  turns.map((t) => `${t.speaker === "agent" ? "Agent" : "Customer"}: ${t.text}`).join("\n");

export function briefingPrompt(input: BriefingInput) {
  return {
    system: `${SYSTEM_BASE}
Task: brief the agent at the start of the call, before the customer explains why they called.
Summarise who the customer is and what stands out in recent activity (recurring charges, unusually large or new online charges, open cases, card status). Do not guess the reason for the call.`,
    user: JSON.stringify({
      today: input.today,
      customer: input.customer,
      card: input.card,
      transactions: input.transactions,
      openAndRecentCases: input.cases,
    }),
  };
}

export function extractPrompt(input: ExtractInput) {
  return {
    system: `${SYSTEM_BASE}
Task: from the call transcript so far, extract the details of the charge the customer is calling about.
- merchant: the merchant name as the customer said it, or null.
- amount: the approximate dollar amount of the charge they are disputing (not other amounts they mention for comparison), or null.
- approxDaysAgo: how many days ago it happened relative to today (e.g. "last week" = 7), or null.
- customerRecognises: false if they say they did not make or don't recognise it; true if they say they did; otherwise null.
- cardInPossession: whether they say they still have the card, or null.
- suggestedIssueType: unrecognised_charge, failed_transaction, fee_query, or unknown if unclear.`,
    user: JSON.stringify({ today: input.today, transcript: transcriptText(input.transcript) }),
  };
}

export function recommendPrompt(input: RecommendInput) {
  return {
    system: `${SYSTEM_BASE}
Task: the agent has confirmed which transaction the customer is calling about, and the rules engine has checked dispute eligibility.
Recommend the next steps for the agent (cite policy clauses and the transaction), 1-3 sentences the agent can say to the customer, and a pre-fill for the dispute form.
If the transaction is not eligible, recommend the permitted next step instead of a dispute and explain why using the failed check.
customerStatement must be written in the first person from the customer's point of view, based only on the transcript.
If the customer says the card is not in their possession, include escalating to the fraud team as a step (cite DSP-1.6).`,
    user: JSON.stringify({
      today: input.today,
      customer: { id: input.customer.id, name: input.customer.name },
      card: input.card,
      transaction: input.transaction,
      extractedFacts: input.facts,
      eligibility: input.eligibility,
      policy: input.policy,
      transcript: transcriptText(input.transcript),
    }),
  };
}

export function wrapUpPrompt(input: WrapUpInput) {
  return {
    system: `${SYSTEM_BASE}
Task: write after-call notes for the case file. Include: why the customer called, what was verified, the transaction discussed, the outcome (quote the case reference exactly if a case was created), and what the customer was told.
followUps: concrete next actions with owners, if any. If createdCase.cardInPossession is false, add a fraud-team follow-up (policy DSP-1.6).`,
    user: JSON.stringify({
      today: input.today,
      customer: { id: input.customer.id, name: input.customer.name },
      card: { id: input.card.id, last4: input.card.last4 },
      transaction: input.transaction,
      eligibility: input.eligibility,
      createdCase: input.createdCase,
      transcript: transcriptText(input.transcript),
    }),
  };
}
