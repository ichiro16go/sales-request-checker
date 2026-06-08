import { analyzeIssue } from "./checker.js";
import { buildFallbackImprovedDescription, buildQuestions } from "./questions.js";
import { PROMPT_VERSION, runOpenAiReview } from "./openai-review.js";

export const REVIEW_MARKER = "[sales-request-assistant v1]";

export function verdictEmoji(verdict) {
  if (verdict === "red") return "🔴";
  if (verdict === "yellow") return "🟡";
  return "🟢";
}

export function verdictLabel(verdict) {
  if (verdict === "red") return "要問い直し";
  if (verdict === "yellow") return "要確認";
  return "問題なし";
}

export async function reviewIssueSnapshot(snapshot, options = {}) {
  const ruleReview = analyzeIssue(snapshot);
  const fallbackQuestions = buildQuestions(ruleReview.missingItems);
  const fallbackImprovedDescription = buildFallbackImprovedDescription(snapshot, fallbackQuestions);

  let ai = { enabled: false, provider: "none", promptVersion: PROMPT_VERSION };
  if (options.useAi !== false) {
    try {
      ai = await runOpenAiReview(snapshot, ruleReview, options.env || process.env);
    } catch (error) {
      ai = {
        enabled: false,
        provider: "openai",
        promptVersion: PROMPT_VERSION,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const questions = ai.enabled && ai.questions?.length ? ai.questions : fallbackQuestions;
  const improvedDescription = ai.enabled && ai.improvedDescription
    ? ai.improvedDescription
    : fallbackImprovedDescription;

  return {
    marker: REVIEW_MARKER,
    reviewedAt: new Date().toISOString(),
    issueKey: snapshot.key,
    verdict: ruleReview.verdict,
    verdictEmoji: verdictEmoji(ruleReview.verdict),
    verdictLabel: verdictLabel(ruleReview.verdict),
    reason: ruleReview.reason,
    missingItems: ruleReview.missingItems,
    questions,
    improvedDescription,
    categories: ruleReview.categories,
    ai,
  };
}

function statusMark(status) {
  if (status === "ok") return "✅";
  if (status === "ng") return "❌";
  if (status === "warn") return "⚠️";
  return "N/A";
}

export function formatReviewComment(review) {
  const lines = [
    `${review.marker} ${review.reviewedAt}`,
    "",
    `## AI依頼レビュー: ${review.verdictEmoji} ${review.verdictLabel}`,
    review.reason,
    "",
  ];

  if (review.questions.length) {
    lines.push("## 追記すると依頼が通りやすくなる情報");
    for (const row of review.questions) {
      lines.push(`- **${row.label}**: ${row.question}`);
    }
    lines.push("");
  }

  lines.push("## チェック結果");
  for (const category of review.categories) {
    lines.push(`### ${category.title}`);
    for (const row of category.items) {
      lines.push(`- ${statusMark(row.status)} **${row.label}**: ${row.detail}`);
    }
    lines.push("");
  }

  if (review.improvedDescription) {
    lines.push("## 依頼文の改善案");
    lines.push(review.improvedDescription);
    lines.push("");
  }

  lines.push("---");
  lines.push(`promptVersion: ${review.ai.promptVersion || PROMPT_VERSION}`);
  lines.push(`aiProvider: ${review.ai.provider || "none"}${review.ai.enabled ? "" : " (fallback)"}`);
  return lines.join("\n");
}
