# Bank Agent Assist

An AI co-pilot for bank card-servicing agents. Entry for the **Google AI Builder Cup 2026**, BFSI track (Intelligent Risk, Fraud & Financial Experiences).

**AI recommends. Agents decide. Banking systems execute.**

When a customer calls, the assistant verifies the caller, briefs the agent, follows the conversation, matches the issue to the right transaction, and recommends a policy-backed resolution with evidence. The agent approves every action, and each one is logged for audit.

![M0 workspace](docs/screenshots/m0-recommendation.png)

<sub>Light and [dark](docs/screenshots/m0-dark.png) themes follow your OS. More: [match](docs/screenshots/m0-match.png) · [case created](docs/screenshots/m0-case-created.png) · [audit log](docs/screenshots/m0-audit.png) · [case already open](docs/screenshots/m0-existing-case.png)</sub>

## Status: M0 prototype

Scenario A runs end to end: a customer calls about a $129 charge she doesn't recognise, and the call ends in a dispute case. See [docs/M0.md](docs/M0.md).

## Run it

Requires Node 20+ (CI uses the version in [`.nvmrc`](.nvmrc)).

```bash
npm install
npm run dev          # http://localhost:3000
```

With no configuration the app uses **Mock AI** (simple offline rules, labelled in the header) so the flow always works. To use Gemini, create `apps/web/.env.local` from [`apps/web/.env.example`](apps/web/.env.example):

```bash
GEMINI_API_KEY=...                # from Google AI Studio
# or Vertex AI:
# GOOGLE_GENAI_USE_VERTEXAI=true
# GOOGLE_CLOUD_PROJECT=your-project
# GOOGLE_CLOUD_LOCATION=global
```

Each visitor gets their own in-memory demo sandbox (calls, cases, audit log), so one person's **Reset demo data** never touches another's. Sandboxes survive hot reloads, so restart `npm run dev` after changing `packages/core`. Deploying: [docs/DEPLOY.md](docs/DEPLOY.md).

**Demo:** Start call → verify with `1990-04-14` and `4242` (or click **Fill in**) → Play call → Customer confirmed this charge → Review and approve → Wrap up call. Run it again without resetting to see the "case already open" path. **Reset demo data** (in the ⋮ menu) clears all cases. The theme follows your OS; the sun/moon button overrides it.

## Repo layout

```
apps/web/          Next.js app: agent workspace UI (shadcn/ui) + API route handlers
packages/core/     Call flow, rules (eligibility, matching, evidence), Gemini + mock AI, data store, tests
data/              Fictional seed data, demo dispute policy, scripted calls
docs/              Scope, M0 flow, brainstorm, references, screenshots
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm test` | Unit tests for `packages/core` |
| `npm run smoke:gemini` | Scenario A against live Gemini, with per-call latency (needs `GEMINI_API_KEY` in `apps/web/.env.local` or Vertex AI; skipped otherwise) |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | ESLint (Next.js, React hooks, accessibility, TypeScript rules) |
| `npm run format` | Format everything with Prettier (Tailwind classes sorted) |
| `npm run check` | Format check, lint, typecheck and tests: run before pushing |
| `npm run build` | Production build |

## Contributing

Work on a branch and open a pull request to `main`. Three checks must pass: `ci`, `secrets` and `review-required`. The review check can be satisfied by an independent review, another collaborator's approval, or the `skip-review` label: see **[CONTRIBUTING.md](CONTRIBUTING.md)**. Dependabot opens weekly grouped dependency updates. Branch protection: [.github/rulesets](.github/rulesets/README.md).

## Docs

- [docs/SCOPE.md](docs/SCOPE.md): domain, problem statement, proposal and boundaries; Must / Should / Could buckets, milestones, Google services by feature
- [docs/M0.md](docs/M0.md): the M0 flow, step by step, and the code map
- [docs/BRAINSTORM.md](docs/BRAINSTORM.md): the original idea, assessment and architecture options
- [docs/reference/](docs/reference/): original pitch PDF and the ChatGPT session export

All customers, transactions and policies in this repo are fictional.
