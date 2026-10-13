import assert from "node:assert/strict";
import test from "node:test";
import { decide, isDocsOnly, SKIP_LABEL } from "./review-gate.mjs";
import { validateProfile } from "./validate-review-profile.mjs";

// Runs against the repository's real profile, from the repository root (as CI does).
const profile = await validateProfile(".github/review/bank-agent-assist-software-review-v1.json", process.cwd(), {
  expectedProfileId: "bank-agent-assist-software",
});
const HEAD = "a".repeat(40);
const AUTHOR = "author-dev";

function reviewBody({ verdict = "SHIP", blockers = 0, sha = HEAD, reviewer = "rishi222k" } = {}) {
  const rows = profile.checklist.map((row) => `| ${row.id} | PASS | checked |`).join("\n");
  const blocking =
    blockers === 0
      ? "None"
      : ["| ID | Finding | Evidence | Required fix |", "|---|---|---|---|"]
          .concat(Array.from({ length: blockers }, (_, i) => `| B${i + 1} | broken | x.ts:1 | fix |`))
          .join("\n");
  return [
    `## ${profile.heading}`,
    `REVIEW_SCHEMA: ${profile.reviewSchema}`,
    `PROFILE_ID: ${profile.profileId}`,
    `HEAD_SHA: ${sha}`,
    `REVIEWER: ${reviewer}`,
    `VERDICT: ${verdict}`,
    `BLOCKERS: ${blockers}`,
    `CHECKLIST_COVERAGE: ${profile.checklist.length}/${profile.checklist.length}`,
    "COVERAGE_COMPLETE: YES",
    "",
    "### Checklist coverage",
    "| ID | Result | Evidence |",
    "|---|---|---|",
    rows,
    "",
    "### Blocking findings",
    blocking,
    "",
    "### Prior-blocker reconciliation",
    "None found",
  ].join("\n");
}

let nextId = 1;
const review = ({
  login = "rishi222k",
  association = "OWNER",
  state = "COMMENTED",
  at = "2026-10-13T10:00:00Z",
  ...rest
}) => ({
  id: nextId++,
  user: { login },
  author_association: association,
  state,
  commit_id: HEAD,
  submitted_at: at,
  ...rest,
});

const base = { headSha: HEAD, author: AUTHOR, reviews: [], files: ["apps/web/lib/api.ts"], skipLabel: null };

test("fails with no evidence, and says what would pass", () => {
  const r = decide(profile, base);
  assert.equal(r.state, "failure");
  assert.match(r.description, /SHIP review, a collaborator's approval, or the skip-review label/);
  assert.ok(r.description.length <= 140);
});

test("a. passes on a trusted SHIP review for the exact head", () => {
  const r = decide(profile, { ...base, reviews: [review({ body: reviewBody() })] });
  assert.deepEqual([r.state, r.path], ["success", "independent-review"]);
});

test("a. does not pass on FIX_FIRST, a stale head, or a malformed body", () => {
  for (const body of [
    reviewBody({ verdict: "FIX_FIRST", blockers: 1 }),
    reviewBody({ sha: "b".repeat(40) }),
    reviewBody().replace("CHECKLIST_COVERAGE", "COVERAGE"),
  ])
    assert.equal(decide(profile, { ...base, reviews: [review({ body })] }).state, "failure");
  const stale = review({ body: reviewBody(), commit_id: "b".repeat(40) });
  assert.equal(decide(profile, { ...base, reviews: [stale] }).state, "failure");
});

test("a. a stranger's newer review can't override a trusted SHIP", () => {
  const reviews = [
    review({ body: reviewBody() }),
    review({
      login: "drive-by",
      association: "NONE",
      at: "2026-10-13T11:00:00Z",
      body: reviewBody({ verdict: "REWORK", blockers: 1, reviewer: "drive-by" }),
    }),
  ];
  assert.equal(decide(profile, { ...base, reviews }).path, "independent-review");
});

test("b. passes on a collaborator's approval of the exact head", () => {
  const r = decide(profile, {
    ...base,
    reviews: [review({ login: "MayankSingh1", association: "COLLABORATOR", state: "APPROVED" })],
  });
  assert.deepEqual([r.state, r.path, r.description], ["success", "approval", "Approved by @MayankSingh1"]);
});

test("b. ignores approvals from strangers, the author, older heads, or later withdrawn", () => {
  const cases = [
    [review({ login: "drive-by", association: "NONE", state: "APPROVED" })],
    [review({ login: AUTHOR, association: "COLLABORATOR", state: "APPROVED" })],
    [review({ login: "MayankSingh1", association: "COLLABORATOR", state: "APPROVED", commit_id: "b".repeat(40) })],
    [
      review({ login: "MayankSingh1", association: "COLLABORATOR", state: "APPROVED" }),
      review({
        login: "MayankSingh1",
        association: "COLLABORATOR",
        state: "CHANGES_REQUESTED",
        at: "2026-10-13T12:00:00Z",
      }),
    ],
  ];
  for (const reviews of cases) assert.equal(decide(profile, { ...base, reviews }).state, "failure");
});

test("c. passes on the skip label from someone with write access, not from anyone else", () => {
  const r = decide(profile, { ...base, skipLabel: { addedBy: "MayankSingh1", permission: "write" } });
  assert.deepEqual([r.state, r.path], ["success", "skip-label"]);
  assert.match(r.description, new RegExp(`@MayankSingh1 \\(${SKIP_LABEL} label\\)`));
  for (const permission of ["triage", "read", "none"])
    assert.equal(decide(profile, { ...base, skipLabel: { addedBy: "x", permission } }).state, "failure");
});

test("d. docs-only changes pass; anything under .github or code does not", () => {
  assert.equal(isDocsOnly(["README.md", "docs/DEPLOY.md", "docs/reference/pitch.pdf"]), true);
  assert.equal(isDocsOnly([".github/review/README.md"]), false);
  assert.equal(isDocsOnly(["README.md", "package.json"]), false);
  assert.equal(isDocsOnly([]), false);
  assert.equal(decide(profile, { ...base, files: ["docs/SCOPE.md"] }).path, "docs-only");
});

test("d. a rename out of the app or a truncated file list is not docs-only", () => {
  const moved = [
    {
      filename: "docs/reference/verify-route.ts",
      previous_filename: "apps/web/app/api/calls/[callId]/verify/route.ts",
    },
  ];
  assert.equal(isDocsOnly(moved), false);
  assert.equal(decide(profile, { ...base, files: moved }).state, "failure");
  assert.equal(isDocsOnly([{ filename: "docs/b.md", previous_filename: "docs/a.md" }]), true);
  assert.equal(isDocsOnly([{ filename: "docs/../apps/x.md" }]), false);
  const listed = [{ filename: "docs/a.md" }];
  assert.equal(decide(profile, { ...base, files: listed, filesTotal: 3001 }).state, "failure");
  assert.equal(decide(profile, { ...base, files: listed, filesTotal: 1 }).path, "docs-only");
});

test("b. a later comment doesn't cancel an approval; a review from a deleted account is ignored", () => {
  const reviews = [
    review({ login: "MayankSingh1", association: "COLLABORATOR", state: "APPROVED" }),
    review({ login: "MayankSingh1", association: "COLLABORATOR", state: "COMMENTED", at: "2026-10-13T12:00:00Z" }),
    {
      id: 999,
      user: null,
      author_association: "NONE",
      state: "APPROVED",
      commit_id: HEAD,
      submitted_at: "2026-10-13T13:00:00Z",
    },
  ];
  assert.equal(decide(profile, { ...base, reviews }).path, "approval");
});

test("d. agent instructions and truncated compare lists are not docs-only", () => {
  assert.equal(isDocsOnly(["AGENTS.md"]), false);
  assert.equal(isDocsOnly(["apps/web/CLAUDE.md"]), false);
  assert.equal(isDocsOnly(["CONTRIBUTING.md"]), true);
  // The workflow passes -1 when the compare API returned a full (possibly truncated) page.
  assert.equal(decide(profile, { ...base, files: [{ filename: "docs/a.md" }], filesTotal: -1 }).state, "failure");
});

test("d. agent configuration anywhere in the tree is never docs", () => {
  for (const file of [
    ".claude/commands/x.md",
    ".cursor/rules/a.md",
    "apps/web/.claude/x.md",
    "GEMINI.md",
    "CLAUDE.local.md",
  ])
    assert.equal(isDocsOnly([file]), false, file);
});

test("d. agent files and folders are matched case-insensitively", () => {
  for (const file of [
    "agents.md",
    "Agents.MD",
    "claude.md",
    "apps/web/Claude.md",
    ".Claude/commands/x.md",
    "AGENT.md",
    ".cursorrules",
    ".Windsurf/rules.md",
    ".GitHub/review/README.md",
    "docs/.agents/x.md",
  ])
    assert.equal(isDocsOnly([file]), false, file);
  assert.equal(isDocsOnly(["docs/agents-overview.md", "README.md", "Docs/Guide.md"]), true);
});

test("d. non-ASCII look-alikes and agent file variants are never docs", () => {
  for (const file of [
    "AGENT\u017f.md",
    "docs/re\u0301sume\u0301.md",
    "AGENTS.override.md",
    "agents.v2.md",
    "docs\\x.md",
    ".roorules",
    ".kiro/steering/a.md",
    "copilot-instructions.md",
  ])
    assert.equal(isDocsOnly([file]), false, file);
  assert.equal(isDocsOnly(["Docs/x.ts"]), false);
  assert.equal(isDocsOnly(["docs/reference/pitch.pdf", "docs/agents-overview.md"]), true);
});
