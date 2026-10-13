# Bank Agent Assist review contract

This directory is the repository-owned policy for independent software reviews
of Bank Agent Assist. It is an AI co-pilot that sits beside a bank's card-servicing agent and ends calls in
banking actions (disputes, card blocks), so the risks are an AI that decides
or acts on its own, an action without a verified caller or explicit approval,
account data shown too early, and claims that cite records that don't exist.
Its checklist is written for
those risks; it is not a copy of another repository's checklist.

## Loop contract

- Review the exact current PR head and every stable checklist row.
- Only a concrete `BLOCKING` finding prevents `SHIP`; useful suggestions are
  `NON_BLOCKING` and do not create a fixer round.
- Fix the complete blocker set in one push and reconcile every prior blocker.
- `SHIP` on the current head is an absolute stop.
- After three substantive reviewed revisions without convergence, stop and
  escalate the underlying design or process problem to Rishi.
- A reviewer never merges, closes, approves, requests changes, or bypasses
  branch protection. Collaborators decide merges.

`BLOCKING` means merging would create a material security, privacy, data-loss,
data-integrity, correctness or contract failure. A real risk that no checklist
row covers is still `BLOCKING — off-checklist`. Nits, taste and anything the
linters already enforce are never blocking.

## What Bank Agent Assist must protect

- **The model never decides or acts.** Eligibility, allowed actions and anything
  touching money are decided by deterministic code in `packages/core/src/domain`
  and `service.ts`. AI output is advice: it is never the input that triggers an
  action endpoint.
- **Every action needs a verified caller and the agent's explicit approval.**
  The server re-checks verification, call state, the confirmed transaction and
  eligibility before it executes, whatever the client sent.
- **Actions are idempotent and never report a false success.** A retry returns
  the original result, a duplicate case is refused, and a failed or pending
  action is shown as failed or pending.
- **Account data stays masked until the caller is verified.** No endpoint
  returns customer, card, transaction or case data for an unverified call.
- **Evidence or it didn't happen.** Every AI claim shown to the agent carries
  record IDs, and the backend drops any ID that doesn't exist for this call.
- **Every state change is audited.** Who, what, when, the evidence IDs and the
  result are recorded, including refused attempts.
- **An AI failure degrades, never blocks.** Every AI response is validated
  against a schema; on failure the agent gets the manual path and the call
  continues.
- **Everything is fictional and secrets stay on the server.** No real customer
  data, and no API key or credential in the client bundle, logs, docs, CI or a
  PR.
- **A refactor must not remove a demo path or change what appears on screen
  unless the PR says it opts in.** Scenarios and exception paths (X-01..X-07)
  keep working.

## Evidence contract

A formal review starts with the following contiguous block:

```text
## Bank Agent Assist Software Review
REVIEW_SCHEMA: bank-agent-assist-software-review-v1
PROFILE_ID: bank-agent-assist-software
HEAD_SHA: <full commit SHA>
REVIEWER: <GitHub login>
VERDICT: SHIP | FIX_FIRST | REWORK
BLOCKERS: <integer>
CHECKLIST_COVERAGE: <covered>/<required>
COVERAGE_COMPLETE: YES | NO
```

It then contains `### Checklist coverage`, `### Blocking findings`, and
`### Prior-blocker reconciliation`. Every checklist row appears exactly once.
The gate validates structure, exact-head identity, and reviewer authorization;
it does not care which model, editor, or human produced the analysis. Evidence
may come from Claude, Codex, Cursor, a collaborator, or Rishi directly, provided
the submitted GitHub review is authored by an explicitly trusted login or an
owner/member/collaborator. `REVIEWER` records the GitHub identity that attests
to the evidence, not the tool.

## Checks

| Check | What it proves | Required on `main` |
| --- | --- | --- |
| `ci` | Review-gate tests and profile, format, lint, typecheck, unit tests, build and production dependency audit (`npm run check` plus build and audit) | Yes |
| `secrets` | No credential in the PR's history | Yes |
| `review-required` | Review evidence for the exact head, by any path below | Yes |
| `Remote Independent Review` | Claude produced a review (one possible producer) | No — producer health only |

### How `review-required` passes

Collaborators choose how much review a change needs, so nobody is locked out.
`.github/scripts/review-gate.mjs` passes the PR on **any one** of:

1. **Independent review:** the newest review in the evidence format above from
   a trusted login or collaborator, for the exact head, with `VERDICT: SHIP`.
   A `FIX_FIRST` or `REWORK` review does not pass. Reviews from anyone else
   are ignored, so on a public repository a stranger can neither pass nor
   block the gate.
2. **Approval:** a GitHub "Approve" on the exact head from a collaborator who
   isn't the PR author (their latest review on that head).
3. **`skip-review` label:** added by someone with write access. The status
   names who skipped review, so the choice is visible.
4. **Docs only:** every file changed by the exact head commit (old and new
   paths) is Markdown or under `docs/`, nothing is under `.github/`, and no
   agent-instruction file (`AGENTS.md`, `CLAUDE.md`) changes.

The Claude reviewer runs automatically on ready pull requests from branches in
this repository and can be dispatched by hand. It refuses fork PRs, because it
installs the PR's dependencies on the runner that holds its credential. It
never becomes a required check, so its quota or credentials can never block a
merge. `review-required` runs on `pull_request_target` so it can publish a
status on fork PRs too; it never checks out or runs PR code.

## Maintenance

Stable checklist IDs are an interface. Change one only as an intentional
schema migration. The profile is governed from current `main`, so a PR cannot
weaken the policy used to review itself.

Run:

```sh
node --test .github/scripts/validate-review-profile.test.mjs .github/scripts/review-gate.test.mjs
node .github/scripts/validate-review-profile.mjs \
  .github/review/bank-agent-assist-software-review-v1.json \
  --profile-id bank-agent-assist-software
```
