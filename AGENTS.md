# Agent guide

Bank Agent Assist: an AI co-pilot for bank card-servicing agents. Read `README.md` for the layout and `docs/SCOPE.md` for what is in scope.

- Run `npm run check` (format, lint, typecheck, unit tests) and `npm run build` before pushing. CI runs the same, plus the review-gate checks.
- Banking rules and the call flow live in `packages/core`; the model never decides eligibility or triggers an action (`docs/SCOPE.md` section 8).
- Reviews follow `.github/review/README.md`. The session that wrote a change never reviews it. `SHIP` on the current head is an absolute stop. A reviewing agent never merges, approves, requests changes, or bypasses branch protection.
- Getting a PR in: see `CONTRIBUTING.md`. An agent merges only when a collaborator has told it to, and only once `ci`, `secrets` and `review-required` are green on the current head. It never adds the `skip-review` label on its own.
