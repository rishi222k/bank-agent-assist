import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateProfile, validateReviewBody, validateReviewSet } from "./validate-review-profile.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "software-review-profile-"));
  await mkdir(join(root, ".github", "review"), { recursive: true });
  await writeFile(join(root, "source.md"), "# Source\n\nStable anchor\n\nGuarded rule.\n");
  const profile = {
    schemaVersion: 1,
    reviewSchema: "lifeos-software-review-v1",
    profileId: "test-software",
    heading: "Test Software Review",
    trustedReviewers: ["trusted-reviewer"],
    trustedAuthorAssociations: ["OWNER", "MEMBER", "COLLABORATOR"],
    verdicts: ["SHIP", "FIX_FIRST", "REWORK"],
    sources: [{
      id: "SRC",
      path: "source.md",
      anchor: "Stable anchor",
      guards: ["Guarded rule."],
      description: "Fixture source",
    }],
    checklist: [{ id: "TEST-ROW", sources: ["SRC"], question: "Does it work?" }],
  };
  const profileFile = join(root, ".github", "review", "profile.json");
  await writeFile(profileFile, `${JSON.stringify(profile, null, 2)}\n`);
  return { root, profile, profileFile };
}

function body({
  sha = "abc123",
  reviewer = "trusted-reviewer",
  verdict = "SHIP",
  blockers = 0,
  coverage = "1/1",
  complete = "YES",
  result = "PASS",
  heading = "Test Software Review",
} = {}) {
  return [
    `## ${heading}`,
    "REVIEW_SCHEMA: lifeos-software-review-v1",
    "PROFILE_ID: test-software",
    `HEAD_SHA: ${sha}`,
    `REVIEWER: ${reviewer}`,
    `VERDICT: ${verdict}`,
    `BLOCKERS: ${blockers}`,
    `CHECKLIST_COVERAGE: ${coverage}`,
    `COVERAGE_COMPLETE: ${complete}`,
    "",
    "### Checklist coverage",
    "| ID | Result | Evidence |",
    "|---|---|---|",
    `| TEST-ROW | ${result} | verified |`,
    "",
    "### Blocking findings",
    blockers === 0
      ? "None"
      : "| ID | Finding | Evidence | Required fix |\n|---|---|---|---|\n| B1 | Unsafe | fixture | Fix it |",
    "",
    "### Prior-blocker reconciliation",
    "None found",
  ].join("\n");
}

async function reviewFile(root, reviews) {
  const file = join(root, "reviews.json");
  await writeFile(file, `${JSON.stringify([reviews])}\n`);
  return file;
}

async function expectExit(expected, action) {
  process.exitCode = 0;
  await action();
  assert.equal(process.exitCode, expected);
  process.exitCode = 0;
}

test("accepts a complete profile with two-way source parity", async () => {
  const { root } = await fixture();
  await expectExit(0, async () => {
    const profile = await validateProfile(".github/review/profile.json", root);
    assert.equal(profile.profileId, "test-software");
  });
});

test("rejects an unreferenced source", async () => {
  const { root, profileFile } = await fixture();
  const profile = JSON.parse(await readFile(profileFile, "utf8"));
  profile.sources.push({
    id: "ORPHAN",
    path: "source.md",
    anchor: "Stable anchor",
    guards: ["Guarded rule."],
    description: "Not mapped",
  });
  await writeFile(profileFile, `${JSON.stringify(profile)}\n`);
  await expectExit(1, () => validateProfile(".github/review/profile.json", root));
});

test("rejects governing-source drift", async () => {
  const { root } = await fixture();
  await writeFile(join(root, "source.md"), "# Source\n\nStable anchor\n");
  await expectExit(1, () => validateProfile(".github/review/profile.json", root));
});

test("accepts a complete current-head zero-blocker SHIP", async () => {
  const { root, profile } = await fixture();
  const file = join(root, "review.md");
  await writeFile(file, body());
  await expectExit(0, () => validateReviewBody(profile, file, "abc123"));
});

test("rejects SHIP with a blocker", async () => {
  const { root, profile } = await fixture();
  const file = join(root, "review.md");
  await writeFile(file, body({ blockers: 1, result: "BLOCKING" }));
  await expectExit(1, () => validateReviewBody(profile, file, "abc123"));
});

test("rejects incomplete coverage for every verdict", async () => {
  const { root, profile } = await fixture();
  const file = join(root, "review.md");
  await writeFile(file, body({
    verdict: "FIX_FIRST",
    blockers: 1,
    coverage: "0/1",
    complete: "NO",
    result: "OMITTED",
  }));
  await expectExit(1, () => validateReviewBody(profile, file, "abc123"));
});

test("rejects a structurally valid review attached to an older SHA", async () => {
  const { root, profile } = await fixture();
  const file = await reviewFile(root, [{
    id: 1,
    user: { login: "trusted-reviewer" },
    commit_id: "old456",
    submitted_at: "2026-08-27T10:00:00Z",
    body: body({ sha: "old456" }),
  }]);
  await expectExit(1, () => validateReviewSet(profile, file, "abc123"));
});

test("rejects dismissed exact-head evidence", async () => {
  const { root, profile } = await fixture();
  const file = await reviewFile(root, [{
    id: 1,
    user: { login: "trusted-reviewer" },
    author_association: "NONE",
    state: "DISMISSED",
    commit_id: "abc123",
    submitted_at: "2026-08-27T10:00:00Z",
    body: body(),
  }]);
  await expectExit(1, () => validateReviewSet(profile, file, "abc123"));
});

test("rejects an untrusted GitHub review author", async () => {
  const { root, profile } = await fixture();
  const file = await reviewFile(root, [{
    id: 1,
    user: { login: "unknown-reviewer" },
    author_association: "NONE",
    commit_id: "abc123",
    submitted_at: "2026-08-27T10:00:00Z",
    body: body(),
  }]);
  await expectExit(1, () => validateReviewSet(profile, file, "abc123"));
});

test("ignores a stranger's newer look-alike review", async () => {
  const { root, profile } = await fixture();
  const file = await reviewFile(root, [
    {
      id: 1,
      user: { login: "repository-collaborator" },
      author_association: "COLLABORATOR",
      commit_id: "abc123",
      submitted_at: "2026-08-27T10:00:00Z",
      body: body({ reviewer: "repository-collaborator" }),
    },
    {
      id: 2,
      user: { login: "drive-by" },
      author_association: "NONE",
      commit_id: "abc123",
      submitted_at: "2026-08-27T11:00:00Z",
      body: "## Test Software Review\nnot a real review",
    },
  ]);
  await expectExit(0, () => validateReviewSet(profile, file, "abc123"));
});

test("accepts an authorized collaborator independent of review producer", async () => {
  const { root, profile } = await fixture();
  const file = await reviewFile(root, [{
    id: 1,
    user: { login: "repository-collaborator" },
    author_association: "COLLABORATOR",
    commit_id: "abc123",
    submitted_at: "2026-08-27T10:00:00Z",
    body: body({ reviewer: "repository-collaborator" }),
  }]);
  await expectExit(0, () => validateReviewSet(profile, file, "abc123"));
});

test("rejects a REVIEWER field that does not match the GitHub author", async () => {
  const { root, profile } = await fixture();
  profile.trustedReviewers.push("other-trusted-reviewer");
  const file = await reviewFile(root, [{
    id: 1,
    user: { login: "other-trusted-reviewer" },
    commit_id: "abc123",
    submitted_at: "2026-08-27T10:00:00Z",
    body: body(),
  }]);
  await expectExit(1, () => validateReviewSet(profile, file, "abc123"));
});

test("a malformed newer review cannot hide behind an older valid review", async () => {
  const { root, profile } = await fixture();
  const file = await reviewFile(root, [
    {
      id: 1,
      user: { login: "trusted-reviewer" },
      commit_id: "abc123",
      submitted_at: "2026-08-27T10:00:00Z",
      body: body(),
    },
    {
      id: 2,
      user: { login: "trusted-reviewer" },
      commit_id: "abc123",
      submitted_at: "2026-08-27T11:00:00Z",
      body: "## Test Software Review\nLooks good.",
    },
  ]);
  await expectExit(1, () => validateReviewSet(profile, file, "abc123"));
});
