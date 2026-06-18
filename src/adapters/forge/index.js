import { makeResolver } from "@forge/resolver";
import api, { route } from "@forge/api";
import { normalizeIssue } from "../../core/checker.js";
import { textToAdf } from "../../core/adf.js";
import { isAllowedIssueKey } from "../../core/project-filter.js";
import { formatReviewComment, reviewIssueSnapshot } from "../../core/review.js";
import { searchSimilarIssues } from "../../core/similar-search.js";

async function readJsonResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`Jira API ${response.status}: ${text.slice(0, 500)}`);
  return data;
}

async function getIssueByIdOrKey(issueIdOrKey) {
  const fields = "summary,description,reporter,priority,duedate,status,issuelinks,attachment";
  const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueIdOrKey}?fields=${fields}`);
  return readJsonResponse(response);
}

async function postComment(issueKey, commentText) {
  const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: textToAdf(commentText) }),
  });
  return readJsonResponse(response);
}

async function runReview(issueIdOrKey, { post = false } = {}) {
  const issue = await getIssueByIdOrKey(issueIdOrKey);
  const snapshot = normalizeIssue(issue);
  if (!isAllowedIssueKey(snapshot.key, { ALLOWED_PROJECT_KEYS: process.env.ALLOWED_PROJECT_KEYS })) {
    return {
      snapshot,
      review: {
        skipped: true,
        verdict: "skipped",
        verdictEmoji: "⚪",
        verdictLabel: "対象外",
        reason: `対象プロジェクト外のためレビューしません: ${snapshot.key}`,
        questions: [],
        improvedDescription: "",
        categories: [],
        ai: { provider: "none" },
      },
      comment: "",
      posted: false,
    };
  }
  const review = await reviewIssueSnapshot(snapshot, {
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    },
  });
  const comment = formatReviewComment(review);
  if (post) await postComment(snapshot.key, comment);
  return { snapshot, review, comment, posted: post };
}

export async function onIssueCreated(event) {
  const issueId = event?.issue?.id || event?.issueId || event?.issue?.key;
  if (!issueId) {
    console.log("No issue id in event", JSON.stringify(event));
    return;
  }
  const result = await runReview(issueId, { post: true });
  console.log(`Reviewed ${result.snapshot.key}: ${result.review.verdict}`);
}

export const handler = makeResolver({
  getReview: async ({ context }) => {
    const issueId = context?.extension?.issue?.id || context?.extension?.issue?.key;
    if (!issueId) throw new Error("No issue context");
    const result = await runReview(issueId, { post: false });
    return result.review;
  },
  postReview: async ({ context }) => {
    const issueId = context?.extension?.issue?.id || context?.extension?.issue?.key;
    if (!issueId) throw new Error("No issue context");
    const result = await runReview(issueId, { post: true });
    return result.review;
  },
  getSimilarIssues: async ({ context }) => {
    const issueId = context?.extension?.issue?.id || context?.extension?.issue?.key;
    if (!issueId) throw new Error("No issue context");
    const issue = await getIssueByIdOrKey(issueId);
    const snapshot = normalizeIssue(issue);
    return await searchSimilarIssues(snapshot.key, snapshot, {
      projectKey: (process.env.ALLOWED_PROJECT_KEYS || "JPREQ").split(",")[0].trim(),
    });
  },
});

