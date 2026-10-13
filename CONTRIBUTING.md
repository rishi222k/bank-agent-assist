# Contributing

Thanks for helping. This page is everything you need to get a change into `main`.

## The short version

1. Work on a branch and open a pull request to `main`.
2. Wait for **`ci`** and **`secrets`** to go green. Run `npm run check` and `npm run build` locally first to save a round trip.
3. Get **`review-required`** to green in **any one** of these ways. Pick whichever suits the change:

| Way | How | Good for |
| --- | --- | --- |
| **Independent review** | The Claude reviewer posts one automatically on ready PRs from this repository. You can also ask an agent session that didn't write the change to review it, or write one yourself with the template in [`.github/review/README.md`](.github/review/README.md). It must say `VERDICT: SHIP` for the latest commit. | Changes that touch banking rules, actions, AI or data |
| **A collaborator's approval** | Another collaborator opens the PR → **Files changed** → **Review changes** → **Approve**. | Most changes, when someone else is around |
| **The `skip-review` label** | Any collaborator adds the `skip-review` label to the PR. The status records who skipped it. | Typos, small or urgent fixes, or whenever you decide a review isn't worth it |
| **Docs only** | Nothing to do: changes that only touch Markdown or `docs/` (outside `.github/`) pass automatically. | Documentation |

4. Merge. Any collaborator can merge once the three checks are green; no one else's sign-off is needed.

A new push changes the latest commit, so an independent review or an approval has to be for that commit. The `skip-review` label stays until someone removes it.

## Good to know

- **The checks:** `ci` runs format, lint, typecheck, unit tests, build and a dependency audit. `secrets` scans the PR for leaked credentials. `review-required` is described above.
- **If `review-required` looks stuck:** after adding the label or an approval it updates within a minute. To re-run it by hand, go to **Actions → Review Required → Run workflow** and enter the PR number.
- **Fork PRs (people outside the repo):** CI waits for a collaborator to approve the run. The Claude reviewer never runs on forks (it would run their code next to our credentials), so a collaborator reviews or approves them by hand.
- **Never commit secrets.** Keys go in `apps/web/.env.local`, which git ignores. All customer and transaction data in this repo is fictional.
- **Product rules** that reviews check against are in [`docs/SCOPE.md`](docs/SCOPE.md) (section 8) and [`.github/review/README.md`](.github/review/README.md). The big one: the AI recommends, code decides, and the agent approves every action.
