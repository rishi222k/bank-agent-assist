# Agent guide

How an AI coding agent (Claude Code, Codex, Cursor or any other) works in this repository. Humans: the same rules apply; [CONTRIBUTING.md](CONTRIBUTING.md) is the short version.

## What this is

Bank Agent Assist is an AI co-pilot for a bank's card-servicing call agent, built for the Google AI Builder Cup 2026 (BFSI track). It verifies the caller, follows the call, matches the transaction the customer describes, and recommends a policy-backed action that the human agent approves. All customers, transactions and policies are **fictional**; actions are simulated.

**Product principle: AI recommends. Agents decide. Banking systems execute.**

Before changing behaviour, read:

- [docs/SCOPE.md](docs/SCOPE.md): scope, guardrails (section 8) and feature IDs (`M-01`, `X-02`, `S-05`, …). Reference these IDs in PRs.
- [docs/STATUS.md](docs/STATUS.md): what is built and what is next.
- [docs/M0.md](docs/M0.md): the call flow step by step, and the code map.

## Setup and commands

Node 22 (see `.nvmrc`; 20+ works). npm workspaces.

```bash
npm install
npm run dev            # http://localhost:3000, Mock AI unless a key is configured
npm run check          # format check, lint, typecheck, unit tests: run before every push
npm run build          # production build: run before every push
npm run format         # fix formatting (Prettier, Tailwind classes sorted)
npm run smoke:gemini   # scenario A against live Gemini (needs a key; otherwise reported as skipped)
```

- **Demo caller:** date of birth `1990-04-14`, card last 4 `4242` (or click **Fill in**).
- **Gemini:** put `GEMINI_API_KEY` (or Vertex AI settings) in `apps/web/.env.local`, copied from `apps/web/.env.example`. Never commit it. Without a key the app runs **Mock AI**, labelled in the header; `AI_PROVIDER=off` forces the AI-failure path (X-06).
- **Restart `npm run dev` after editing `packages/core`.** The call service lives in per-visitor in-memory sandboxes that survive hot reloads, so they keep running the old code.
- The microphone mode uses the browser's Web Speech API and needs Google Chrome.

## Where things live

| Area | Path |
|---|---|
| Call flow, sandboxes, audit | `packages/core/src/service.ts` |
| Deterministic rules | `packages/core/src/domain/` (`eligibility.ts`, `matching.ts`, `evidence.ts`) |
| Shared schemas (AI outputs + API requests) | `packages/core/src/schemas.ts` (Zod) |
| AI providers and prompts | `packages/core/src/ai/` (`gemini.ts`, `mock.ts`, `prompts.ts`) |
| In-memory data store | `packages/core/src/data/store.ts`, seeded from `data/` |
| Tests | `packages/core/test/` (Vitest) |
| API routes (thin wrappers) | `apps/web/app/api/**/route.ts`, through `apps/web/lib/server/handler.ts` |
| Workspace state and API client | `apps/web/lib/use-call-flow.ts`, `apps/web/lib/api.ts`, `apps/web/lib/use-speech-input.ts` |
| Workspace UI | `apps/web/components/workspace/` (shadcn/ui components in `components/ui/`) |
| Demo data | `data/seed`, `data/policies`, `data/calls` |
| CI and review gate | `.github/workflows/`, `.github/review/`, `.github/scripts/` |

## Rules you must not break

These are what reviews check (from `docs/SCOPE.md` section 8 and [.github/review/README.md](.github/review/README.md)):

1. **The model never decides or acts.** Eligibility, allowed actions and anything touching money are deterministic code in `packages/core`. AI output is advice; it never triggers an action endpoint.
2. **Every action is re-checked on the server:** verified and still-active call, agent-confirmed transaction, eligibility, wrap-up state, idempotency key. Never trust the client.
3. **No false success.** A failed or pending action shows as failed or pending.
4. **Account data stays masked until the caller is verified.**
5. **Evidence or it didn't happen.** AI claims carry record IDs; the backend drops IDs that don't exist.
6. **Every state change and every refused attempt is audited** (`service.ts` `audit()` / `refuse()`).
7. **AI failure degrades, never blocks.** Validate every AI response with its Zod schema; on failure the manual path works.
8. **Fictional data only, secrets server-side only.** No real customer data, no keys in code, logs, docs, CI or PRs.
9. **Don't remove a feature or change what appears on screen** unless the PR says it does.

## How to write code here

- TypeScript everywhere. Banking logic goes in `packages/core` (no framework imports there); API routes stay thin.
- Add or change a shared shape in `schemas.ts` first; the API and the AI provider both use it.
- New behaviour in `packages/core` gets a test in `packages/core/test/`. Tests use `MockProvider` and `MemoryStore`; never call real Gemini in `npm test` (the live test is `gemini.live.test.ts` and skips without a key).
- UI: use the components in `apps/web/components/ui/` and the workspace kit (`components/workspace/kit.tsx`). Keep it keyboard-accessible, labelled, readable in light and dark themes, and usable from phone width.
- Match the surrounding style: comment the *why*, not the what; plain English in UI copy.
- Don't add a dependency without saying why in the PR.

## Getting a change into `main`

1. Branch from `main` (`fix/…`, `feat/…`, `docs/…`, `ci/…`). One logical change per PR.
2. Run `npm run check` and `npm run build`. Both must pass.
3. Open a PR to `main` using the template: what changed and why (with scope IDs), how to check it, and what you could not verify. Be honest about anything you didn't run.
4. Three required checks: `ci`, `secrets`, `review-required`. `review-required` passes on **any one** of:
   - an **independent review** with `VERDICT: SHIP` for the latest commit (the Claude reviewer posts one automatically on ready PRs from this repository; or follow [.github/review/REVIEWER.md](.github/review/REVIEWER.md) in a **separate, fresh session**),
   - a GitHub **Approve** from a collaborator who isn't the PR author,
   - the **`skip-review`** label, added by a collaborator,
   - a **docs-only** change (Markdown or `docs/` only; not `.github/`, `AGENTS.md` or `CLAUDE.md`).
5. When a review says `FIX_FIRST`: collect **all** blockers, check each one is real, fix them, run the checks, **push once**, and comment on the PR with 1–4 bullets on what changed. Then get a fresh review of the new commit.
6. **`SHIP` on the latest commit is an absolute stop:** no more pushes, no "while I'm here" changes. Report that the PR is ready.
7. **Three reviewed commits without `SHIP`: stop** and tell the person you work for what's left, with one recommendation (merge as-is, split, or shelve).

### What an agent must never do

- **Review its own work.** The session that wrote a change never writes its review; a reviewer starts fresh with no memory of the authoring session.
- **Add the `skip-review` label, approve, or request changes.** Those are a collaborator's decisions.
- **Merge, unless a collaborator told it to** in this session. Then only when `ci`, `secrets` and `review-required` are green on the current head; use a merge commit (`gh pr merge <n> --merge --match-head-commit <sha>`). Use `--admin` only if the owner explicitly asked for it.
- **Force-push to `main`, delete branches others use, or change repository settings** (rulesets, secrets, collaborators) without being asked.
- **Commit secrets** or real personal data.

### Stacked PRs

If PR B is based on PR A's branch, merge A first, then **retarget B to `main` before deleting A's branch**. Deleting a base branch closes every PR based on it.

## Keeping docs current

When you complete or change a scope item, update [docs/STATUS.md](docs/STATUS.md) in the same PR. If you change how contributors or agents work, update this file, [CONTRIBUTING.md](CONTRIBUTING.md) and, for the review gate, [.github/review/README.md](.github/review/README.md).
