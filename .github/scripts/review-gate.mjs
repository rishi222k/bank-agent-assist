#!/usr/bin/env node
// Decides the `review-required` status for one pull request. A PR passes on ANY of these paths,
// so a collaborator is never stuck waiting on one kind of review:
//
//   a. independent-review  a trusted, complete Software Review with VERDICT: SHIP for the exact head
//   b. approval            a GitHub "Approve" on the exact head from a collaborator who isn't the author
//   c. skip-label          the `skip-review` label, added by someone with write access
//   d. docs-only           every changed file is documentation (Markdown or docs/), outside .github/
//
// Input is a JSON file the workflow assembles from the GitHub API; this script never sees PR code.
// It writes {"state","path","description"} to --output (or stdout) and exits 0 unless its own
// input is unusable.

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateProfile, validateReviewBodyText } from "./validate-review-profile.mjs";

export const SKIP_LABEL = "skip-review";
const WRITE_PERMISSIONS = new Set(["admin", "maintain", "write"]);

/** Runs the strict review-body parser without letting its failures end the process. */
function isValidReviewBody(profile, body, headSha, author) {
  const before = process.exitCode;
  process.exitCode = 0;
  validateReviewBodyText(profile, body, headSha, author, true);
  const ok = !process.exitCode;
  process.exitCode = before;
  return ok;
}

const trusted = (profile, review) =>
  profile.trustedReviewers.includes(review?.user?.login) ||
  profile.trustedAuthorAssociations.includes(review?.author_association);

const newestFirst = (left, right) =>
  String(right.submitted_at ?? "").localeCompare(String(left.submitted_at ?? "")) ||
  Number(right.id ?? 0) - Number(left.id ?? 0);

const isDocPath = (path) =>
  typeof path === "string" &&
  !path.startsWith(".github/") &&
  !path.split("/").includes("..") &&
  (path.startsWith("docs/") || /\.md$/i.test(path));

/**
 * True when every changed file is documentation. A rename counts only if both its old and new
 * paths are docs (moving code into docs/ deletes it from the app), and a truncated file list
 * (GitHub stops listing at 3000 files) never counts as docs-only.
 * @param files [{filename, previous_filename?}] (plain path strings are accepted too)
 * @param total the PR's changed-file count, when known
 */
export function isDocsOnly(files, total = files.length) {
  return (
    files.length > 0 &&
    files.length === total &&
    files.every((f) => {
      const file = typeof f === "string" ? { filename: f } : (f ?? {});
      return isDocPath(file.filename) && (file.previous_filename == null || isDocPath(file.previous_filename));
    })
  );
}

/**
 * @param profile the governing review profile (from main)
 * @param input {headSha, author, reviews, files, filesTotal, skipLabel: {addedBy, permission} | null}
 */
export function decide(profile, input) {
  const { headSha, author } = input;
  // A review from a deleted account has no user; it can't attest to anything.
  const reviews = (input.reviews ?? [])
    .flat(Infinity)
    .filter((r) => r?.commit_id === headSha && typeof r?.user?.login === "string");

  // a. Only trusted reviewers' structured reviews are considered, so a stranger posting a body
  //    with the heading can neither pass nor block the gate.
  const heading = `## ${profile.heading}`;
  const structured = reviews
    .filter((r) => r.state !== "DISMISSED" && typeof r.body === "string" && r.body.includes(heading))
    .filter((r) => trusted(profile, r))
    .sort(newestFirst)[0];
  if (structured) {
    const verdict = /^VERDICT:\s*(\S+)\s*$/m.exec(structured.body)?.[1];
    if (verdict === "SHIP" && isValidReviewBody(profile, structured.body, headSha, structured.user.login))
      return pass("independent-review", `Independent review: SHIP by @${structured.user.login}`);
  }

  // b. Each person's latest decisive review on this head counts, as on GitHub: an approval later
  //    changed to "request changes" (or dismissed) no longer does, but a plain comment doesn't undo it.
  const latestByUser = new Map();
  for (const r of [...reviews].sort(newestFirst)) {
    if (r.state === "COMMENTED" || r.state === "PENDING") continue;
    if (!latestByUser.has(r.user.login)) latestByUser.set(r.user.login, r);
  }
  const approver = [...latestByUser.values()].find(
    (r) => r.state === "APPROVED" && r.user.login !== author && trusted(profile, r),
  );
  if (approver) return pass("approval", `Approved by @${approver.user.login}`);

  // c. The label is a deliberate, visible choice by someone who could merge anyway.
  const skip = input.skipLabel;
  if (skip && WRITE_PERMISSIONS.has(skip.permission))
    return pass("skip-label", `Review skipped by @${skip.addedBy} (${SKIP_LABEL} label)`);

  // d. Documentation can't change what the app does.
  const files = input.files ?? [];
  if (isDocsOnly(files, input.filesTotal ?? files.length)) return pass("docs-only", "Docs-only change");

  const verdictNote = structured ? " (latest independent review is not SHIP)" : "";
  return {
    state: "failure",
    path: null,
    description: `Needs a SHIP review, a collaborator's approval, or the ${SKIP_LABEL} label${verdictNote}`.slice(
      0,
      140,
    ),
  };
}

function pass(path, description) {
  return { state: "success", path, description: description.slice(0, 140) };
}

async function main() {
  const [profileFile, ...args] = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  const idIndex = args.indexOf("--profile-id");
  if (!profileFile || inputIndex < 0 || !args[inputIndex + 1]) {
    console.error("usage: review-gate.mjs PROFILE --input FILE [--output FILE] [--profile-id ID]");
    process.exitCode = 2;
    return;
  }
  const profile = await validateProfile(profileFile, process.cwd(), {
    expectedProfileId: idIndex >= 0 ? args[idIndex + 1] : undefined,
  });
  if (!profile || process.exitCode) {
    console.error("review-gate: the governing profile is invalid");
    process.exitCode = 2;
    return;
  }
  const input = JSON.parse(await readFile(args[inputIndex + 1], "utf8"));
  const result = JSON.stringify(decide(profile, input));
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0 && args[outputIndex + 1]) await writeFile(args[outputIndex + 1], `${result}\n`);
  else console.log(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
