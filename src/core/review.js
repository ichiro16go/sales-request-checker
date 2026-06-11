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
  const fallbackImprovedDescription = buildFallbackImprovedDescription(snapshot, fallbackQuestions, ruleReview.requestType);

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
    requestType: ruleReview.requestType,
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

const REQUEST_TYPE_LABEL = { bug: "不具合", investigation: "調査", "data-extraction": "データ抽出", feature: "要望" };

export function formatReviewComment(review) {
  const typeLabel = REQUEST_TYPE_LABEL[review.requestType] || "依頼";
  const lines = [
    `${review.marker} ${review.reviewedAt}`,
    "",
    `## ${review.verdictEmoji} ${review.verdictLabel}（${typeLabel}）`,
    review.reason,
    "",
  ];

  // 改善案を最優先で表示（コピペ可能なコードブロック）
  if (review.improvedDescription) {
    lines.push("## 📝 依頼文の改善案（そのままコピーしてJiraに貼れます）");
    lines.push("```");
    lines.push(review.improvedDescription);
    lines.push("```");
    lines.push("");
  }

  // 不足情報の質問
  if (review.questions.length) {
    lines.push("## ❓ 追記してほしい情報");
    for (const row of review.questions) {
      lines.push(`- **${row.label}**: ${row.question}`);
    }
    lines.push("");
  }

  // チェック詳細は折りたたみ
  lines.push("<details><summary>チェック詳細</summary>");
  lines.push("");
  for (const category of review.categories) {
    lines.push(`### ${category.title}`);
    for (const row of category.items) {
      lines.push(`- ${statusMark(row.status)} **${row.label}**: ${row.detail}`);
    }
    lines.push("");
  }
  lines.push("</details>");
  lines.push("");

  lines.push("---");
  lines.push(`promptVersion: ${review.ai.promptVersion || PROMPT_VERSION}`);
  lines.push(`aiProvider: ${review.ai.provider || "none"}${review.ai.enabled ? "" : " (fallback)"}`);
  return lines.join("\n");
}
