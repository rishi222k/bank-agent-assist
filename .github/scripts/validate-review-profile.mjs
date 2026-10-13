#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  console.error(`review-profile: ${message}`);
  process.exitCode = 1;
}

async function loadJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
    return null;
  }
}

function requireText(value, location) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${location} must be a non-empty string`);
    return false;
  }
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function validateProfile(profileFile, repositoryRoot = process.cwd(), options = {}) {
  const absoluteRoot = resolve(repositoryRoot);
  const absoluteProfile = resolve(absoluteRoot, profileFile);
  const profile = await loadJson(absoluteProfile);
  if (!profile) return null;

  if (profile.schemaVersion !== 1) fail("schemaVersion must be 1");
  requireText(profile.profileId, "profileId");
  requireText(profile.reviewSchema, "reviewSchema");
  requireText(profile.heading, "heading");
  if (!Array.isArray(profile.trustedReviewers) || profile.trustedReviewers.length === 0) {
    fail("trustedReviewers must be a non-empty array");
  } else {
    for (const reviewer of profile.trustedReviewers) requireText(reviewer, "trustedReviewers entry");
    if (new Set(profile.trustedReviewers).size !== profile.trustedReviewers.length) {
      fail("trustedReviewers must not contain duplicates");
    }
  }
  const validAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
  if (!Array.isArray(profile.trustedAuthorAssociations)) {
    fail("trustedAuthorAssociations must be an array");
  } else {
    for (const association of profile.trustedAuthorAssociations) {
      if (!validAssociations.has(association)) {
        fail(`trustedAuthorAssociations contains unsupported value ${association}`);
      }
    }
    if (new Set(profile.trustedAuthorAssociations).size !== profile.trustedAuthorAssociations.length) {
      fail("trustedAuthorAssociations must not contain duplicates");
    }
  }
  const verdicts = profile.verdicts ?? ["SHIP", "FIX_FIRST", "REWORK"];
  const requiredVerdicts = ["SHIP", "FIX_FIRST", "REWORK"];
  if (
    !Array.isArray(verdicts) ||
    verdicts.length !== requiredVerdicts.length ||
    requiredVerdicts.some((verdict) => !verdicts.includes(verdict))
  ) {
    fail("verdicts must contain the three software-review verdicts");
  }
  if (options.expectedProfileId && profile.profileId !== options.expectedProfileId) {
    fail(`profileId must be ${options.expectedProfileId}`);
  }

  if (!Array.isArray(profile.sources) || profile.sources.length === 0) {
    fail("sources must be a non-empty array");
  }
  if (!Array.isArray(profile.checklist) || profile.checklist.length === 0) {
    fail("checklist must be a non-empty array");
  }

  const sourceIds = new Set();
  const sourceUse = new Map();

  for (const [index, source] of (profile.sources ?? []).entries()) {
    const location = `sources[${index}]`;
    if (!requireText(source.id, `${location}.id`)) continue;
    if (!/^[A-Z][A-Z0-9-]*$/.test(source.id)) fail(`${location}.id must be a stable uppercase ID`);
    if (sourceIds.has(source.id)) fail(`duplicate source id ${source.id}`);
    sourceIds.add(source.id);
    sourceUse.set(source.id, 0);
    requireText(source.path, `${location}.path`);
    requireText(source.anchor, `${location}.anchor`);
    requireText(source.description, `${location}.description`);

    if (!Array.isArray(source.guards) || source.guards.length === 0) {
      fail(`${location}.guards must be a non-empty array of governing text`);
    } else {
      const uniqueGuards = new Set();
      for (const [guardIndex, guard] of source.guards.entries()) {
        if (!requireText(guard, `${location}.guards[${guardIndex}]`)) continue;
        if (uniqueGuards.has(guard)) fail(`${source.id} repeats a governing-text guard`);
        uniqueGuards.add(guard);
        if (guard === source.anchor) {
          fail(`${source.id} governing-text guard must extend beyond its navigation anchor`);
        }
      }
    }

    if (typeof source.path === "string" && typeof source.anchor === "string") {
      const sourceFile = resolve(absoluteRoot, source.path);
      const sourceRelative = relative(absoluteRoot, sourceFile);
      if (isAbsolute(source.path) || sourceRelative.startsWith("..")) {
        fail(`${source.id} path must stay inside the repository`);
        continue;
      }
      try {
        const contents = await readFile(sourceFile, "utf8");
        if (!contents.includes(source.anchor)) {
          fail(`${source.id} anchor is absent from ${source.path}`);
        }
        for (const guard of Array.isArray(source.guards) ? source.guards : []) {
          if (typeof guard === "string" && guard.trim() !== "" && !contents.includes(guard)) {
            fail(`${source.id} governing text changed or is absent from ${source.path}`);
          }
        }
      } catch (error) {
        fail(`cannot read source ${source.path}: ${error.message}`);
      }
    }
  }

  const checklistIds = new Set();
  for (const [index, row] of (profile.checklist ?? []).entries()) {
    const location = `checklist[${index}]`;
    if (!requireText(row.id, `${location}.id`)) continue;
    if (!/^[A-Z][A-Z0-9-]*$/.test(row.id)) fail(`${location}.id must be a stable uppercase ID`);
    if (checklistIds.has(row.id)) fail(`duplicate checklist id ${row.id}`);
    checklistIds.add(row.id);
    requireText(row.question, `${location}.question`);

    if (!Array.isArray(row.sources) || row.sources.length === 0) {
      fail(`${location}.sources must be a non-empty array`);
      continue;
    }
    if (new Set(row.sources).size !== row.sources.length) {
      fail(`${row.id} repeats a source id`);
    }
    for (const sourceId of row.sources) {
      if (!sourceIds.has(sourceId)) {
        fail(`${row.id} references unknown source ${sourceId}`);
      } else {
        sourceUse.set(sourceId, sourceUse.get(sourceId) + 1);
      }
    }
  }

  for (const [sourceId, uses] of sourceUse) {
    if (uses === 0) fail(`source ${sourceId} is not referenced by any checklist row`);
  }

  if (!process.exitCode) {
    console.log(
      `review-profile: ${profile.profileId} valid (${profile.sources.length} sources, ${profile.checklist.length} checklist rows)`,
    );
  }
  return profile;
}

function parseMetadata(body) {
  const metadata = new Map();
  for (const key of [
    "REVIEW_SCHEMA",
    "PROFILE_ID",
    "HEAD_SHA",
    "REVIEWER",
    "VERDICT",
    "BLOCKERS",
    "CHECKLIST_COVERAGE",
    "COVERAGE_COMPLETE",
  ]) {
    const matches = [...body.matchAll(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "gm"))];
    if (matches.length !== 1) {
      fail(`review body must contain exactly one ${key} field`);
    } else {
      metadata.set(key, matches[0][1]);
    }
  }
  return metadata;
}

function markdownSection(body, heading) {
  const startMatch = new RegExp(`^### ${escapeRegExp(heading)}\\s*$`, "m").exec(body);
  if (!startMatch) {
    fail(`review body is missing ### ${heading}`);
    return "";
  }
  const afterHeading = body.slice(startMatch.index + startMatch[0].length);
  const nextHeading = afterHeading.search(/^###\s+/m);
  return nextHeading < 0 ? afterHeading : afterHeading.slice(0, nextHeading);
}

export function validateReviewBodyText(
  profile,
  body,
  expectedHeadSha,
  expectedReviewer,
  expectedReviewerAuthorized = false,
) {
  if (typeof body !== "string") {
    fail("review body must be text");
    return;
  }

  const heading = `## ${profile.heading}`;
  if (!body.includes(heading)) fail(`review body is missing ${heading}`);
  if (!body.startsWith(`${heading}\n`) && !body.startsWith(`${heading}\r\n`)) {
    fail("review body must start with the profile heading");
  }
  const headerPattern = new RegExp(
    `^${escapeRegExp(heading)}\\r?\\n` +
      "REVIEW_SCHEMA:\\s*.+\\r?\\n" +
      "PROFILE_ID:\\s*.+\\r?\\n" +
      "HEAD_SHA:\\s*.+\\r?\\n" +
      "REVIEWER:\\s*.+\\r?\\n" +
      "VERDICT:\\s*.+\\r?\\n" +
      "BLOCKERS:\\s*.+\\r?\\n" +
      "CHECKLIST_COVERAGE:\\s*.+\\r?\\n" +
      "COVERAGE_COMPLETE:\\s*.+\\s*$",
    "m",
  );
  if (!headerPattern.test(body)) {
    fail("machine-readable fields must be contiguous and immediately follow the review heading");
  }
  const metadata = parseMetadata(body);
  if (metadata.get("REVIEW_SCHEMA") !== profile.reviewSchema) {
    fail("review body schema does not match the profile");
  }
  if (metadata.get("PROFILE_ID") !== profile.profileId) {
    fail("review body PROFILE_ID does not match the profile");
  }
  if (expectedHeadSha && metadata.get("HEAD_SHA") !== expectedHeadSha) {
    fail(`review body HEAD_SHA does not match ${expectedHeadSha}`);
  }
  const reviewer = metadata.get("REVIEWER");
  if (!expectedReviewerAuthorized && !profile.trustedReviewers.includes(reviewer)) {
    fail(`review body REVIEWER ${reviewer} is not trusted`);
  }
  if (expectedReviewer && reviewer !== expectedReviewer) {
    fail(`review body REVIEWER ${reviewer} does not match GitHub author ${expectedReviewer}`);
  }
  const verdicts = profile.verdicts ?? ["SHIP", "FIX_FIRST", "REWORK"];
  if (!verdicts.includes(metadata.get("VERDICT"))) {
    fail("review body VERDICT is invalid");
  }

  const blockers = Number(metadata.get("BLOCKERS"));
  if (!Number.isInteger(blockers) || blockers < 0) fail("BLOCKERS must be a non-negative integer");

  const checklistSection = markdownSection(body, "Checklist coverage");
  const blockingSection = markdownSection(body, "Blocking findings");
  const requiredIds = profile.checklist.map((row) => row.id);
  let covered = 0;
  let blockingResults = 0;
  for (const id of requiredIds) {
    const rowPattern = new RegExp(
      `^\\|\\s*${escapeRegExp(id)}\\s*\\|\\s*(PASS|BLOCKING|NON_BLOCKING|N/A)\\s*\\|`,
      "gm",
    );
    const occurrences = [...checklistSection.matchAll(rowPattern)];
    if (occurrences.length !== 1) {
      fail(`review body must contain checklist row ${id} exactly once`);
    } else {
      covered += 1;
      if (occurrences[0][1] === "BLOCKING") blockingResults += 1;
    }
  }

  const expectedCoverage = `${covered}/${requiredIds.length}`;
  if (metadata.get("CHECKLIST_COVERAGE") !== expectedCoverage) {
    fail(`CHECKLIST_COVERAGE must be ${expectedCoverage}`);
  }
  const complete = covered === requiredIds.length;
  if (metadata.get("COVERAGE_COMPLETE") !== (complete ? "YES" : "NO")) {
    fail(`COVERAGE_COMPLETE must be ${complete ? "YES" : "NO"}`);
  }
  if (!complete) fail("every verdict requires complete checklist coverage");

  const blockingTableLines = blockingSection
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"));
  let reportedBlockingRows = 0;
  if (blockingTableLines.length > 0) {
    if (blockingTableLines.length < 3 || !/^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(blockingTableLines[1])) {
      fail("Blocking findings must be a Markdown table or the word None");
    } else {
      reportedBlockingRows = blockingTableLines.slice(2).filter((line) => line.split("|").length >= 6).length;
    }
  } else if (!/^\s*None\.?\s*$/m.test(blockingSection)) {
    fail("Blocking findings must contain every blocker or the word None");
  }
  if (blockers !== reportedBlockingRows) {
    fail(`BLOCKERS must equal the ${reportedBlockingRows} rows in Blocking findings`);
  }
  if (blockingResults > blockers) {
    fail(`the ${blockingResults} BLOCKING checklist results must be represented in Blocking findings`);
  }

  if (metadata.get("VERDICT") === "SHIP" && blockers !== 0) {
    fail("SHIP requires zero blockers and complete checklist coverage");
  }
  if (metadata.get("VERDICT") === "FIX_FIRST" && blockers === 0) {
    fail("FIX_FIRST requires at least one blocker");
  }
  if (metadata.get("VERDICT") === "REWORK" && blockers === 0) {
    fail("REWORK requires at least one blocker");
  }
}

export async function validateReviewBody(profile, reviewBodyFile, expectedHeadSha) {
  let body;
  try {
    body = await readFile(reviewBodyFile, "utf8");
  } catch (error) {
    fail(`cannot read review body ${reviewBodyFile}: ${error.message}`);
    return;
  }

  validateReviewBodyText(profile, body, expectedHeadSha);
}

export async function validateReviewSet(profile, reviewsFile, expectedHeadSha) {
  let payload;
  try {
    payload = JSON.parse(await readFile(reviewsFile, "utf8"));
  } catch (error) {
    fail(`cannot read reviews ${reviewsFile}: ${error.message}`);
    return;
  }
  const reviews = (Array.isArray(payload) ? payload : []).flat(Infinity);
  const heading = `## ${profile.heading}`;
  // Only trusted authors' reviews are candidates, so on a public repository a stranger's
  // look-alike review can't become "the latest" and turn a valid result invalid.
  const isTrusted = (review) =>
    profile.trustedReviewers.includes(review?.user?.login) ||
    profile.trustedAuthorAssociations.includes(review?.author_association);
  const candidates = reviews
    .filter((review) => review?.commit_id === expectedHeadSha)
    .filter((review) => review?.state !== "DISMISSED")
    .filter(isTrusted)
    // A body that purports to be this profile's review must not evade the
    // strict parser merely by placing text before the heading.
    .filter((review) => typeof review?.body === "string" && review.body.includes(heading))
    .sort((left, right) => {
      const timeOrder = String(right.submitted_at ?? "").localeCompare(String(left.submitted_at ?? ""));
      return timeOrder || Number(right.id ?? 0) - Number(left.id ?? 0);
    });
  if (candidates.length === 0) {
    fail(`no ${profile.heading} review exists for ${expectedHeadSha}`);
    return;
  }
  const latest = candidates[0];
  const githubAuthor = latest?.user?.login;
  if (!githubAuthor) {
    fail("latest matching review has no GitHub author");
    return;
  }
  const authorAssociation = latest?.author_association;
  const trustedByLogin = profile.trustedReviewers.includes(githubAuthor);
  const trustedByAssociation = profile.trustedAuthorAssociations.includes(authorAssociation);
  if (!trustedByLogin && !trustedByAssociation) {
    fail(`GitHub review author ${githubAuthor} (${authorAssociation ?? "UNKNOWN"}) is not trusted`);
    return;
  }
  validateReviewBodyText(profile, latest.body, expectedHeadSha, githubAuthor, true);
}

async function main() {
  const args = process.argv.slice(2);
  const profileFile = args.shift();
  if (!profileFile) {
    fail("usage: validate-review-profile.mjs PROFILE [--profile-id ID] [--review-body FILE | --reviews-json FILE] [--head-sha SHA]");
    return;
  }

  let reviewBodyFile;
  let reviewsJsonFile;
  let expectedHeadSha;
  let expectedProfileId;
  while (args.length) {
    const option = args.shift();
    if (option === "--profile-id") {
      expectedProfileId = args.shift();
      if (!expectedProfileId) fail("--profile-id requires an ID");
    } else if (option === "--review-body") {
      reviewBodyFile = args.shift();
      if (!reviewBodyFile) fail("--review-body requires a file");
    } else if (option === "--reviews-json") {
      reviewsJsonFile = args.shift();
      if (!reviewsJsonFile) fail("--reviews-json requires a file");
    } else if (option === "--head-sha") {
      expectedHeadSha = args.shift();
      if (!expectedHeadSha) fail("--head-sha requires a SHA");
    }
    else fail(`unknown option ${option}`);
  }

  if (reviewBodyFile && reviewsJsonFile) fail("use only one of --review-body or --reviews-json");
  if (reviewsJsonFile && !expectedHeadSha) fail("--reviews-json requires --head-sha");

  const profile = await validateProfile(profileFile, process.cwd(), { expectedProfileId });
  if (profile && reviewBodyFile) {
    await validateReviewBody(profile, resolve(process.cwd(), reviewBodyFile), expectedHeadSha);
  }
  if (profile && reviewsJsonFile) {
    await validateReviewSet(profile, resolve(process.cwd(), reviewsJsonFile), expectedHeadSha);
  }
}

// pathToFileURL: a plain `file://${path}` comparison never matches a path with spaces, which
// silently skipped validation and exited 0.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
