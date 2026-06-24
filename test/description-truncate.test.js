import test from "node:test";
import assert from "node:assert/strict";
import {
  getMaxDescriptionChars,
  truncateDescription,
  runOpenAiReview,
} from "../src/core/openai-review.js";
import { formatReviewComment } from "../src/core/review.js";

test("default max is 8000 chars", () => {
  assert.equal(getMaxDescriptionChars({}), 8000);
});

test("env override accepts values within [4000, 8000]", () => {
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "4000" }), 4000);
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "6000" }), 6000);
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "8000" }), 8000);
});

test("env override clamps below 4000 to 4000", () => {
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "1000" }), 4000);
});

test("env override clamps above 8000 to 8000", () => {
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "20000" }), 8000);
});

test("env override falls back to default on invalid values", () => {
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "abc" }), 8000);
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "0" }), 8000);
  assert.equal(getMaxDescriptionChars({ MAX_DESCRIPTION_CHARS: "" }), 8000);
});

test("truncateDescription keeps short text unchanged", () => {
  const r = truncateDescription("hello", 8000);
  assert.equal(r.text, "hello");
  assert.equal(r.truncated, false);
  assert.equal(r.originalLength, 5);
});

test("truncateDescription cuts long text to maxChars", () => {
  const long = "あ".repeat(10000);
  const r = truncateDescription(long, 8000);
  assert.equal(r.text.length, 8000);
  assert.equal(r.truncated, true);
  assert.equal(r.originalLength, 10000);
});

test("truncateDescription handles non-string input", () => {
  const r = truncateDescription(undefined, 8000);
  assert.equal(r.text, "");
  assert.equal(r.truncated, false);
});

test("runOpenAiReview returns disabled when no API key (no truncation flag)", async () => {
  const snapshot = { key: "JPREQ-1", description: "x".repeat(10000) };
  const result = await runOpenAiReview(snapshot, { verdict: "red", reason: "", missingItems: [] }, {});
  assert.equal(result.enabled, false);
  assert.equal(result.descriptionTruncated, undefined);
});

test("runOpenAiReview truncates description and reports flag (mocked fetch)", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      async text() { return ""; },
      async json() {
        return {
          output_text: JSON.stringify({
            questions: [{ label: "現状", question: "現状を教えてください" }],
            improvedDescription: "改善案",
            reviewSummary: "ok",
            confidence: 0.9,
          }),
        };
      },
    };
  };
  try {
    const snapshot = {
      key: "JPREQ-1",
      summary: "test",
      description: "あ".repeat(10000),
      priority: "",
      dueDate: "",
      attachmentCount: 0,
      issueLinkCount: 0,
    };
    const result = await runOpenAiReview(
      snapshot,
      { verdict: "yellow", reason: "", missingItems: [] },
      { OPENAI_API_KEY: "sk-test" },
    );
    assert.equal(result.enabled, true);
    assert.equal(result.descriptionTruncated, true);
    assert.equal(result.originalDescriptionLength, 10000);
    assert.equal(result.maxDescriptionChars, 8000);
    const sent = JSON.parse(capturedBody.input);
    assert.equal(sent.issue.description.length, 8000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runOpenAiReview honors MAX_DESCRIPTION_CHARS env override", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async text() { return ""; },
    async json() {
      return { output_text: JSON.stringify({ questions: [], improvedDescription: "", reviewSummary: "", confidence: 1 }) };
    },
  });
  try {
    const snapshot = {
      key: "JPREQ-1",
      summary: "test",
      description: "あ".repeat(6000),
      priority: "",
      dueDate: "",
      attachmentCount: 0,
      issueLinkCount: 0,
    };
    const result = await runOpenAiReview(
      snapshot,
      { verdict: "yellow", reason: "", missingItems: [] },
      { OPENAI_API_KEY: "sk-test", MAX_DESCRIPTION_CHARS: "4000" },
    );
    assert.equal(result.maxDescriptionChars, 4000);
    assert.equal(result.descriptionTruncated, true);
    assert.equal(result.originalDescriptionLength, 6000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("formatReviewComment appends truncation warning when flagged", () => {
  const review = {
    marker: "[sales-request-assistant v1]",
    reviewedAt: "2026-06-24T00:00:00.000Z",
    issueKey: "JPREQ-1",
    requestType: "feature",
    verdict: "yellow",
    verdictEmoji: "🟡",
    verdictLabel: "要確認",
    reason: "テスト",
    missingItems: [],
    questions: [],
    improvedDescription: "",
    categories: [],
    ai: { provider: "openai", enabled: true, promptVersion: "v1" },
    descriptionTruncated: true,
    maxDescriptionChars: 8000,
    originalDescriptionLength: 12000,
  };
  const comment = formatReviewComment(review);
  assert.match(comment, /description が上限（8,000 文字）/);
});

test("formatReviewComment does not append truncation warning when not flagged", () => {
  const review = {
    marker: "[sales-request-assistant v1]",
    reviewedAt: "2026-06-24T00:00:00.000Z",
    issueKey: "JPREQ-1",
    requestType: "feature",
    verdict: "green",
    verdictEmoji: "🟢",
    verdictLabel: "問題なし",
    reason: "テスト",
    missingItems: [],
    questions: [],
    improvedDescription: "",
    categories: [],
    ai: { provider: "openai", enabled: true, promptVersion: "v1" },
    descriptionTruncated: false,
  };
  const comment = formatReviewComment(review);
  assert.doesNotMatch(comment, /description が上限/);
});
