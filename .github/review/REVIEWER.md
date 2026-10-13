# Doing an independent review

Instructions for an agent (or person) asked to review a pull request in this repository. The result is one GitHub review in a fixed format that the `review-required` check can read. The Claude reviewer in CI follows the same contract (`.github/workflows/remote-independent-review.yml`).

**You must not have written the change.** Start a fresh session with no memory of the session that wrote it. Re-derive everything: don't trust the PR description, commit messages, code comments or earlier reviews.

## 1. Set up

```bash
gh pr view <PR> --json headRefOid,baseRefName,state     # pin this head SHA; review exactly it
git fetch origin
git worktree add --detach ../review-pr<PR> <SHA>          # your own checkout; never edit the author's
cd ../review-pr<PR> && npm ci
```

Policy always comes from **`main`**, even if the PR changes it: read `.github/review/README.md` (what this repo must protect) and `.github/review/bank-agent-assist-software-review-v1.json` (the checklist) from `origin/main`. Also read `docs/SCOPE.md` sections 8–9.

## 2. Phase A: fresh pass (don't read earlier reviews yet)

- `git diff origin/<base>...<SHA>` for scope, then read whole files, callers and callees, not just hunks.
- Trace each changed path end to end: workspace action (`apps/web/lib/use-call-flow.ts`) → `apps/web/lib/api.ts` → route in `apps/web/app/api` → `CallService` (`packages/core/src/service.ts`) → store and audit → UI.
- Lenses, most irreversible first:
  1. **Actions:** can anything create a case without a verified, active call, an agent-confirmed transaction and eligibility, all re-checked on the server? Idempotency? Any false success?
  2. **The model's reach:** can AI output reach eligibility or an action? Is every AI response schema-validated, with a working manual path (X-06)?
  3. **Data exposure:** account data before verification; anything non-fictional in prompts or logs; secrets.
  4. **Evidence and audit:** evidence IDs verified; every state change and refusal audited.
  5. **Demo paths and UI:** scenarios and exception paths still work; accessibility, themes, phone width.
- **Run the checks** that apply: `npm run check`, `npm run build`, and for `.github` changes `node --test .github/scripts/*.test.mjs`. Prefer reproducing a suspicion (dev server, curl, a small test) over reasoning about it. Never report a check you didn't run as passed.
- Evaluate **every checklist row exactly once**: `PASS`, `BLOCKING`, `NON_BLOCKING` or `N/A`, with evidence.

**Severity.** Only a concrete security, privacy, data-loss, data-integrity, correctness or contract failure is **BLOCKING**. Everything else is **NON_BLOCKING** and never holds the verdict. Each finding needs `file:line` and a concrete failing input or sequence. "No blocking issues" is a valid result; don't manufacture findings. Don't re-argue decisions the PR records as the owner's call.

## 3. Phase B: reconcile (after Phase A is written down)

Read earlier reviews (`gh api --paginate repos/rishi222k/bank-agent-assist/pulls/<PR>/reviews`) and PR comments. Mark every earlier **BLOCKING** finding *Fixed*, *Still open* or *Regressed*, re-running its reproduction. Earlier non-blocking items don't become blockers by repetition. If this is the third reviewed commit and blockers remain, say the loop must stop and recommend merge as-is, split, or shelve.

## 4. Post the review

Write the body to a file. It must **start** with this contiguous block (no blank lines inside):

```text
## Bank Agent Assist Software Review
REVIEW_SCHEMA: bank-agent-assist-software-review-v1
PROFILE_ID: bank-agent-assist-software
HEAD_SHA: <full pinned SHA>
REVIEWER: <the GitHub login that will post this review>
VERDICT: SHIP | FIX_FIRST | REWORK
BLOCKERS: <integer>
CHECKLIST_COVERAGE: <covered>/<required>
COVERAGE_COMPLETE: YES | NO
```

Then a line saying who produced it (e.g. "Produced by a fresh-context Claude session"), then these sections:

- `### Changes in this PR`: `| # | Change | Remark |`, remark 15 words or fewer
- `### Checklist coverage`: `| ID | Result | Evidence |`, every checklist ID exactly once
- `### Verification run`: one line, what you ran and the results
- `### Blocking findings`: `| ID | Finding | Evidence | Required fix |`, or the word `None`
- `### Prior-blocker reconciliation`: `| Prior finding | Status | Evidence |`, or `None found`
- `### Non-blocking follow-ups`: or `None`

`SHIP` needs complete coverage and `BLOCKERS: 0`. `FIX_FIRST` (keep the approach) and `REWORK` (the approach is wrong) need at least one blocker, and `BLOCKERS` equals the rows in the blocking table.

Check the body before posting, from a checkout of `main`:

```bash
# reviews.json: [[{"id":1,"user":{"login":"<login>"},"author_association":"COLLABORATOR","state":"COMMENTED","commit_id":"<SHA>","body":<body as a JSON string>,"submitted_at":"2026-01-01T00:00:00Z"}]]
node .github/scripts/validate-review-profile.mjs .github/review/bank-agent-assist-software-review-v1.json \
  --profile-id bank-agent-assist-software --reviews-json reviews.json --head-sha <SHA>
```

Then post **one** review, comment-only:

```bash
gh pr review <PR> --comment --body-file review.md
```

Never `--approve` or `--request-changes`, never push to the PR, never merge or close it. Remove your worktree when done (`git worktree remove ../review-pr<PR>`).

Only a `SHIP` on the latest commit from a collaborator (or a trusted login) turns `review-required` green; a new push needs a new review.
