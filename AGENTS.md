# Agent guide

Bank Agent Assist: an AI co-pilot for bank card-servicing agents. Read `README.md` for the layout and `docs/SCOPE.md` for what is in scope.

- Run `npm run check` (format, lint, typecheck, unit tests) and `npm run build` before pushing. CI runs the same, plus the review-gate checks.
- Banking rules and the call flow live in `packages/core`; the model never decides eligibility or triggers an action (`docs/SCOPE.md` section 8).
- Reviews follow `.github/review/README.md`. The session that wrote a change never reviews it. `SHIP` on the current head is an absolute stop. Agents never merge, approve, request changes, or bypass branch protection; Rishi merges.
