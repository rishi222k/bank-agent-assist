import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createAiProvider } from "../src/ai";
import { MemoryStore } from "../src/data/store";
import { CallService } from "../src/service";

// Live smoke test: scenario A end to end against real Gemini. Skipped (and reported as skipped)
// unless a key is configured. Run it with `npm run smoke:gemini` after adding GEMINI_API_KEY to
// apps/web/.env.local, or with GOOGLE_GENAI_USE_VERTEXAI=true for Vertex AI.
const envFile = resolve(import.meta.dirname, "../../../apps/web/.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const configured = Boolean(process.env.GEMINI_API_KEY) || process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";

describe.skipIf(!configured)("live Gemini: scenario A", () => {
  it("briefs, matches the $129 charge, recommends with valid evidence and drafts notes", async () => {
    const ai = createAiProvider({ ...process.env, AI_PROVIDER: "gemini" });
    const service = new CallService(new MemoryStore(), ai);
    const { callId, script } = service.startCall("scenario-a", "smoke-test");
    service.verifyCaller(callId, { dob: "1990-04-14", last4: "4242" });
    const timings: Record<string, number> = {};

    const briefing = await service.getBriefingSummary(callId);
    timings.briefing = briefing.ms;
    expect(briefing.ok, briefing.ok ? "" : briefing.error).toBe(true);

    let analysis = null;
    for (const [i, turn] of script.entries()) {
      const r = await service.addTurn(callId, turn);
      if (r.analysis) {
        analysis = r.analysis;
        timings[`turn ${i + 1}`] = r.analysis.ai.ms;
        expect(r.analysis.ai.ok, r.analysis.ai.ok ? "" : r.analysis.ai.error).toBe(true);
      }
    }
    expect(analysis?.facts?.suggestedIssueType).toBe("unrecognised_charge");
    expect(analysis?.matches[0]?.transactionId).toBe("txn_1042");

    const confirmed = await service.confirmIssue(callId, {
      transactionId: "txn_1042",
      issueType: "unrecognised_charge",
    });
    timings.recommendation = confirmed.recommendation?.ms ?? 0;
    expect(confirmed.recommendation?.ok).toBe(true);
    if (confirmed.recommendation?.ok) expect(confirmed.recommendation.droppedEvidence).toEqual([]);

    const draft = await service.getWrapUpDraft(callId);
    timings.wrapUp = draft.ms;
    expect(draft.ok).toBe(true);

    console.table(timings);
  }, 120_000);
});
