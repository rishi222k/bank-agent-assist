import type { BriefingSummary, ExtractedFacts, IssueType, Recommendation, Transaction, WrapUp } from "../schemas";
import { normaliseMerchant } from "../domain/matching";
import type { AiProvider, BriefingInput, ExtractInput, RecommendInput, WrapUpInput } from "./provider";

/**
 * Offline stand-in for Gemini so the app runs without credentials.
 * Simple rules only. The UI labels it "Mock AI" so it is never mistaken for Gemini.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly model = null;

  async briefing(input: BriefingInput): Promise<BriefingSummary> {
    const { customer, card, transactions, cases } = input;
    const since = new Date(customer.customerSince).getFullYear();
    const open = cases.filter((c) => c.status === "open");
    const highlights: BriefingSummary["highlights"] = [];

    highlights.push(
      open.length
        ? {
            text: `${open.length} open dispute case${open.length === 1 ? "" : "s"} on file`,
            evidenceIds: open.map((c) => c.id),
          }
        : { text: `Card •• ${card.last4} is ${card.status}, no open cases`, evidenceIds: [card.id] },
    );

    for (const group of recurringCharges(transactions)) {
      const first = group[0]!;
      highlights.push({
        text: `Recurring ${merchantBase(first.merchant)} charge of ${usd(first.amount)}`,
        evidenceIds: group.map((t) => t.id),
      });
    }

    const largestOnline = transactions
      .filter((t) => t.channel === "online" && t.amount > 0 && t.daysAgo <= 30)
      .sort((a, b) => b.amount - a.amount)[0];
    if (largestOnline) {
      highlights.push({
        text: `Largest online charge in 30 days: ${usd(largestOnline.amount)} ${largestOnline.merchant}, ${largestOnline.daysAgo} days ago`,
        evidenceIds: [largestOnline.id],
      });
    }

    return {
      summary: `${customer.name}, ${customer.segment} customer since ${since}. Card •• ${card.last4} is ${card.status} with a balance of ${usd(card.balance)}.`,
      highlights: highlights.slice(0, 4),
    };
  }

  async extractFacts(input: ExtractInput): Promise<ExtractedFacts> {
    const customerLines = input.transcript.filter((t) => t.speaker === "customer").map((t) => t.text);
    const text = customerLines.join(" ").toLowerCase();

    return {
      merchant: findMerchant(text),
      // The first amount the customer mentions is the one they're calling about.
      amount: customerLines.map(findAmount).find((a) => a != null) ?? null,
      approxDaysAgo: findDaysAgo(text),
      customerRecognises: /(don'?t|do not|didn'?t) (recogni[sz]e|make|authori[sz]e)|never/.test(text) ? false : null,
      cardInPossession: /still have (my|the) card|card (is )?with me/.test(text)
        ? true
        : /(lost|stolen|don'?t have) (my|the)? ?card/.test(text)
          ? false
          : null,
      suggestedIssueType: findIssueType(text),
    };
  }

  async recommend(input: RecommendInput): Promise<Recommendation> {
    const { transaction: t, eligibility } = input;
    if (!eligibility.eligible) {
      const failed = eligibility.checks.find((c) => !c.passed)!;
      return {
        steps: [
          { text: `Don't raise a new dispute. ${failed.detail}.`, evidenceIds: [failed.clauseId, t.id] },
          eligibility.existingCase
            ? {
                text: `Share the status of case ${eligibility.existingCase.reference} with the customer.`,
                evidenceIds: [eligibility.existingCase.id, "DSP-1.3"],
              }
            : {
                text: "Explain the reason and offer to escalate to a team lead if the customer disagrees.",
                evidenceIds: [failed.clauseId],
              },
        ],
        scriptLines: [
          eligibility.existingCase
            ? {
                text: `I can see we already have an open dispute for this charge, reference ${eligibility.existingCase.reference}. It's being investigated, so there's nothing more you need to do right now.`,
                evidenceIds: [eligibility.existingCase.id],
              }
            : {
                text: `I'm not able to raise a dispute for this charge yet. ${failed.detail}.`,
                evidenceIds: [failed.clauseId],
              },
        ],
        formPrefill: { reason: "other", customerStatement: "" },
      };
    }

    return {
      steps: [
        {
          text: `Confirm the customer did not make or authorise the ${usd(t.amount)} ${t.merchant} charge.`,
          evidenceIds: ["DSP-1.4", t.id],
        },
        {
          text: "Confirm the card is still in the customer's possession and there are no other unknown charges.",
          evidenceIds: ["DSP-1.6"],
        },
        {
          text: "Review the pre-filled dispute form and submit it for approval.",
          evidenceIds: ["DSP-1.1", "DSP-1.2", "DSP-1.3"],
        },
        { text: "Give the customer the case reference and explain the timelines.", evidenceIds: ["DSP-1.5"] },
      ],
      scriptLines: [
        {
          text: `I can see the ${usd(t.amount)} charge from ${merchantBase(t.merchant)} on ${t.date}. Just to confirm, you didn't make or authorise this purchase?`,
          evidenceIds: [t.id, "DSP-1.4"],
        },
        {
          text: "I'll raise a dispute for you now. You'll hear about a provisional credit within 10 business days, and the full investigation can take up to 90 days.",
          evidenceIds: ["DSP-1.5"],
        },
      ],
      formPrefill: {
        reason: input.facts?.customerRecognises === false ? "not_authorised" : "not_recognised",
        customerStatement: `I don't recognise the ${usd(t.amount)} charge from ${merchantBase(t.merchant)} on ${t.date}. I didn't sign up for or authorise it.`,
      },
    };
  }

  async wrapUp(input: WrapUpInput): Promise<WrapUp> {
    const { customer, card, transaction: t, createdCase, eligibility } = input;
    const lines = [
      `Customer ${customer.name} called about card •• ${card.last4}. Identity verified (DOB + last 4).`,
      t
        ? `Reported an unrecognised charge: ${usd(t.amount)} ${t.merchant} on ${t.date} (${t.id}).`
        : "Issue not confirmed during the call.",
    ];
    if (createdCase) {
      lines.push(
        `Dispute ${createdCase.reference} raised (reason: ${createdCase.reason.replace("_", " ")}). ` +
          (createdCase.cardInPossession
            ? "Card remains with customer."
            : "Card not in customer's possession; treated as compromised (DSP-1.6)."),
      );
      lines.push("Customer told: provisional credit decision within 10 business days, investigation up to 90 days.");
    } else if (eligibility?.existingCase) {
      lines.push(
        `Existing case ${eligibility.existingCase.reference} already open; status shared, no new case raised.`,
      );
    } else {
      lines.push("No action taken.");
    }
    return {
      notes: lines.join("\n"),
      followUps: createdCase
        ? [
            `Disputes team: investigate case ${createdCase.reference}`,
            ...(createdCase.cardInPossession ? [] : ["Fraud team: card not in customer's possession (DSP-1.6)"]),
          ]
        : [],
    };
  }
}

// ---------------------------------------------------------------------------

const usd = (n: number) => `$${Math.abs(n).toFixed(2)}`;

function merchantBase(merchant: string): string {
  const base = merchant.split("*")[0]!.replace(/\d+/g, "").trim();
  return base
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function recurringCharges(transactions: Transaction[]): Transaction[][] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.amount <= 0) continue;
    const key = `${t.merchant}|${t.amount}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()].filter((g) => g.length >= 2 && g[0]!.category.includes("subscription"));
}

const KNOWN_MERCHANTS = [
  "nova digital",
  "harbor coffee",
  "greenleaf grocers",
  "city transit",
  "spark fuel",
  "pagewise books",
  "metro pharmacy",
  "starlight cinemas",
  "lumen electric",
];

function findMerchant(text: string): string | null {
  const normalised = normaliseMerchant(text);
  const hit = KNOWN_MERCHANTS.find((m) => normalised.includes(m));
  return hit ? hit.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** "$129", "129.00", "a hundred and thirty dollars" → number. */
export function findAmount(line: string): number | null {
  const digits = line.match(/\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks)/i);
  if (digits) return Number(digits[1] ?? digits[2]);

  const words = line
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/);
  let total = 0;
  let current = 0;
  let seen = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (w in UNITS) {
      current += UNITS[w]!;
      seen = true;
    } else if (w in TENS) {
      current += TENS[w]!;
      seen = true;
    } else if (w === "hundred") {
      current = (current || 1) * 100;
      seen = true;
    } else if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else if (w === "a" && (words[i + 1] === "hundred" || words[i + 1] === "thousand")) continue;
    else if (w === "and" && seen) continue;
    else if (seen) break;
  }
  return seen ? total + current : null;
}

function findDaysAgo(text: string): number | null {
  if (/\btoday\b/.test(text)) return 0;
  if (/\byesterday\b/.test(text)) return 1;
  const n = text.match(/(\d+) days ago/);
  if (n) return Number(n[1]);
  if (/last week|a week ago/.test(text)) return 7;
  if (/two weeks|couple of weeks/.test(text)) return 14;
  if (/last month|a month ago/.test(text)) return 30;
  return null;
}

function findIssueType(text: string): IssueType {
  if (/recogni[sz]e|didn'?t make|not mine|unknown charge/.test(text)) return "unrecognised_charge";
  if (/failed|declined|didn'?t go through|merchant says.*(not|never) (paid|received)/.test(text))
    return "failed_transaction";
  if (/\bfees?\b|late fee|annual fee|interest/.test(text)) return "fee_query";
  return "unknown";
}
