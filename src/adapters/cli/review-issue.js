#!/usr/bin/env node
import { normalizeIssue } from "../../core/checker.js";
import { isAllowedIssueKey } from "../../core/project-filter.js";
import { formatReviewComment, reviewIssueSnapshot } from "../../core/review.js";
import { loadDotenv } from "./env.js";
import { JiraBasicClient } from "../webhook/jira-basic-client.js";

loadDotenv();

const key = process.argv[2]?.trim().toUpperCase();
const shouldPost = process.argv.includes("--post");
const noAi = process.argv.includes("--no-ai");

if (!key) {
  console.error("Usage: node src/adapters/cli/review-issue.js JPREQ-1234 [--post] [--no-ai]");
  process.exit(1);
}
if (!isAllowedIssueKey(key)) {
  console.error(`Unsupported issue key: ${key}. Set ALLOWED_PROJECT_KEYS to allow additional projects.`);
  process.exit(1);
}

try {
  const client = new JiraBasicClient();
  const issue = await client.getIssue(key);
  const snapshot = normalizeIssue(issue);
  const review = await reviewIssueSnapshot(snapshot, { useAi: !noAi });
  const comment = formatReviewComment(review);
  console.log(comment);
  if (shouldPost) {
    await client.addComment(key, comment);
    console.log(`\nPosted review comment to ${key}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
