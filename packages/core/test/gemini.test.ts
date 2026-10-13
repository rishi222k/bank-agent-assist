import { describe, expect, it } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { GeminiProvider, jsonSchemaFor } from "../src/ai/gemini";
import { MemoryStore } from "../src/data/store";
import { BriefingSummary, ExtractedFacts, Recommendation, WrapUp } from "../src/schemas";
import { CallService } from "../src/service";

// These tests exercise the Gemini provider without a key: a fake client stands in for the SDK, so
// the request we build and the way we handle what comes back are checked offline. The live check
// is gemini.live.test.ts, which runs only when GEMINI_API_KEY is set.

type Request = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

function fakeClient(reply: (req: Request) => string | undefined) {
  const requests: Request[] = [];
  const client = {
    models: {
      generateContent: async (req: Request) => {
        requests.push(req);
        return { text: reply(req) };
      },
    },
  } as unknown as Pick<GoogleGenAI, "models">;
  return { client, requests };
}

const FACTS = {
  merchant: "Nova Digital",
  amount: 130,
  approxDaysAgo: 7,
  customerRecognises: false,
  cardInPossession: true,
  suggestedIssueType: "unrecognised_charge",
};

// Gemini's structured output accepts a subset of JSON Schema
// (https://ai.google.dev/gemini-api/docs/structured-output). Keywords outside it may be rejected.
const SUPPORTED_KEYWORDS = new Set([
  "type",
  "title",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "format",
  "minimum",
  "maximum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
]);

function keywords(schema: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => keywords(s, found));
  else if (schema && typeof schema === "object") {
    for (const [key, value] of Object.entries(schema)) {
      found.add(key);
      if (key === "properties") Object.values(value as object).forEach((s) => keywords(s, found));
      else if (key !== "enum" && key !== "required") keywords(value, found);
    }
  }
  return found;
}

describe("Gemini provider (offline)", () => {
  it.each([
    ["BriefingSummary", BriefingSummary],
    ["ExtractedFacts", ExtractedFacts],
    ["Recommendation", Recommendation],
    ["WrapUp", WrapUp],
  ])("sends a %s schema that uses only keywords Gemini documents", (_name, schema) => {
    const json = jsonSchemaFor(schema);
    expect(json).not.toHaveProperty("$schema");
    const unsupported = [...keywords(json)].filter((k) => !SUPPORTED_KEYWORDS.has(k));
    expect(unsupported).toEqual([]);
  });

  it("asks for JSON against the schema, with a system prompt, low temperature and a timeout", async () => {
    const { client, requests } = fakeClient(() => JSON.stringify(FACTS));
    const provider = new GeminiProvider("gemini-test", { client });
    const facts = await provider.extractFacts({
      today: "2026-10-13",
      transcript: [{ speaker: "customer", text: "A charge from Nova Digital I don't recognise" }],
    });

    expect(facts).toEqual(FACTS);
    const req = requests[0]!;
    expect(req.model).toBe("gemini-test");
    expect(req.config?.responseMimeType).toBe("application/json");
    expect(req.config?.responseJsonSchema).toEqual(jsonSchemaFor(ExtractedFacts));
    expect(String(req.config?.systemInstruction)).toMatch(/Never invent transactions/);
    expect(req.config?.temperature).toBeLessThanOrEqual(0.3);
    expect(req.config?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["an empty response", () => undefined, /empty response/],
    ["text that isn't JSON", () => "Sure! Here are the facts", /JSON/],
    ["JSON that breaks the schema", () => JSON.stringify({ ...FACTS, suggestedIssueType: "refund" }), /invalid/i],
  ])("rejects %s", async (_name, reply, error) => {
    const provider = new GeminiProvider("gemini-test", { client: fakeClient(reply).client });
    await expect(provider.extractFacts({ today: "2026-10-13", transcript: [] })).rejects.toThrow(error);
  });

  it("X-06: a bad Gemini response becomes the manual path, not a crash or invented data", async () => {
    const provider = new GeminiProvider("gemini-test", { client: fakeClient(() => "{not json").client });
    const service = new CallService(new MemoryStore(), provider);
    const { callId } = service.startCall("scenario-a", "demo-agent");
    service.verifyCaller(callId, { dob: "1990-04-14", last4: "4242" });

    const briefing = await service.getBriefingSummary(callId);
    expect(briefing).toMatchObject({ ok: false, provider: "gemini", model: "gemini-test" });
    const turn = await service.addTurn(callId, { speaker: "customer", text: "A $129 charge from Nova Digital" });
    expect(turn.analysis).toMatchObject({ ai: { ok: false }, facts: null, matches: [] });
  });
});
