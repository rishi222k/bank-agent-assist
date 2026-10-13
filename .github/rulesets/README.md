# Branch protection

`main.json` protects the default branch:

- Changes land through a pull request. No approval count is required: review evidence is the `review-required` check instead, which a collaborator can satisfy several ways (see [CONTRIBUTING.md](../../CONTRIBUTING.md))
- Required checks: **`ci`** (format, lint, typecheck, unit tests, build, production dependency audit), **`secrets`** (gitleaks) and **`review-required`**
- No force pushes, no branch deletion
- Repository admins can bypass via a pull request in an emergency

## Apply it (repo admin)

**Web UI:** Settings → Rules → Rulesets → New ruleset → **Import a ruleset** → choose `main.json` → Create.

**CLI:**

```bash
# First time
gh api repos/rishi222k/bank-agent-assist/rulesets --method POST --input .github/rulesets/main.json
# Update the existing "Protect main" ruleset
id=$(gh api repos/rishi222k/bank-agent-assist/rulesets --jq '.[] | select(.name == "Protect main") | .id')
gh api "repos/rishi222k/bank-agent-assist/rulesets/$id" --method PUT --input .github/rulesets/main.json
```

Run the CLI command from a shell signed in to the account that owns the repo (`gh api user --jq .login` should print `rishi222k`).

A required check must have a workflow producing it on `main`, or every PR waits forever: `ci` comes from `ci.yml`, `secrets` from `secrets.yml`, `review-required` from `review-required.yml`.

Rulesets are enforced on public repositories on every plan, and on private repositories only with GitHub Pro, Team or Enterprise.
