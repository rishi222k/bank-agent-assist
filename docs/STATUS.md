# Status

What is built against [SCOPE.md](SCOPE.md), and what to do next. **Update this file in the same PR when you finish or change a scope item.**

Last updated: 13 Oct 2026. M0 is complete; work is on **M1** (all Must items, scenarios A/B/C, deployed).

Legend: ✅ done · 🟡 partial · ⬜ not started

## Must

| ID | Item | Status | Notes |
|---|---|---|---|
| M-01 | Caller identity check | ✅ | DOB + last 4. Three failures in 15 minutes lock the customer across calls. No simulated OTP. |
| M-02 | Agent sign-in, one-click demo login | ⬜ | Actions are attributed to `demo-agent`. Each visitor gets an isolated demo sandbox (cookie), which is not sign-in. |
| M-03 | Profile, cards, transactions, cases in one view | ✅ | |
| M-04 | Gemini briefing with evidence | ✅ | Not yet run against live Gemini (`npm run smoke:gemini` once a key exists). |
| M-05 | Risk flags in code | ⬜ | |
| M-06 | Scripted call simulator | ✅ | Transcript streams word by word, with speaker bands; play, pause, step. |
| M-07 | Issue type, AI pre-selected, agent picks | ✅ | Only the unrecognised-charge playbook exists; the others show as unavailable. |
| M-08 | Transaction matching | ✅ | |
| M-09 | Evidence references, verified by the backend | ✅ | |
| M-10 | Deterministic eligibility engine | ✅ | Demo policy DSP-1. |
| M-11 | Pre-filled, editable, server-validated dispute form | ✅ | |
| M-12 | Approval gate | ✅ | |
| M-13 | Create dispute with idempotency and duplicate check | ✅ | |
| M-14 | Block card (simulated) | ⬜ | Needed for scenario C. |
| M-15 | Audit log | 🟡 | Actor, type, evidence IDs, result, time, and refused attempts. Missing: request ID, AI suggestion ID. |
| M-16 | AI-drafted wrap-up notes, agent edits | ✅ | Saved notes always keep the case reference. |
| X-01 | Caller fails verification | ✅ | |
| X-02 | Dispute already exists | ✅ | |
| X-03 | Ambiguous transaction | 🟡 | Other matches are listed and the agent picks; scenario A doesn't yet include two similar charges. |
| X-04 | Transaction ineligible | 🟡 | Pending and out-of-window charges are refused with the reason; "next allowed step" comes only from the AI recommendation. |
| X-05 | Possible account compromise | 🟡 | "Card not with customer" flags fraud escalation (DSP-1.6) in the form, audit and notes; no card block yet. |
| X-06 | Gemini error, timeout or invalid JSON | ✅ | Tested offline against the real provider with a fake client. |
| X-07 | Action fails or times out | ⬜ | No pending or failed state for actions yet. |
| D-01 | Seed data for 3 customers | 🟡 | 1 of 3 (Maya Chen). |
| D-02 | Scripted calls A, B, C | 🟡 | A only. |
| P-01 | Deployed (Cloud Run) | 🟡 | `Dockerfile` and [DEPLOY.md](DEPLOY.md); not deployed. |
| P-02 | Secrets server-side; Vertex AI | 🟡 | Supported in code; not deployed. |
| P-03 | Tests for the 8 validation cases | 🟡 | Covered: unknown charge, unverified caller, duplicate, duplicate submission, validated input, editable notes. Missing: unsupported AI action rejected, backend action failure. |
| P-04 | README with setup, architecture, demo script | 🟡 | No architecture diagram yet. |

## Should

| ID | Item | Status | Notes |
|---|---|---|---|
| S-05 | Live microphone mode | 🟡 | Browser speech recognition (Chrome, free, no key), with the agent picking the speaker. Not Cloud Speech-to-Text. |
| S-01 – S-04, S-06 – S-11 | | ⬜ | |

## Next, in order

1. **Live Gemini check:** add a key and run `npm run smoke:gemini`. Fix anything slow or invalid.
2. **Scenarios B and C:**
   - Add customers 2 and 3 (D-01).
   - Script B: an existing case (X-02).
   - Script C: compromise, with small test charges and the card not in the customer's possession (X-05).
   - Give scenario A two similar charges (X-03).
3. **Risk and actions:** risk flags in code (M-05); a block-card action that is approved, idempotent and audited (M-14); X-05 end to end.
4. **Deploy** to Cloud Run (P-01, P-02) and add the demo sign-in (M-02).
5. **Honest action states** (X-04 next step, X-07 pending/failed), **audit fields** (M-15), the remaining **P-03 tests**, and the **architecture diagram** (P-04).
6. Then Should items, by demo value: S-02 timed comparison, S-04 masking, S-06 policy excerpts.

## Known follow-ups (non-blocking review notes)

- Requests without a cookie create sandboxes, so a flood of them can evict other visitors' demos (`apps/web/lib/server/handler.ts`).
- Confirming a transaction that isn't on the card is refused without an audit entry.
- `npm test` runs the live Gemini test if `apps/web/.env.local` has a key.
- If the microphone is blocked, the call stays in mic mode until reset.
- The web app has no automated tests.
