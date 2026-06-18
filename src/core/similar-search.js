import api, { route } from "@forge/api";

/**
 * チケットの summary + description からキーワードを抽出し、
 * JQL で類似チケットを検索する
 */

// 除外するストップワード（一般的すぎて検索ノイズになる語）
const STOP_WORDS = new Set([
  "お願い", "します", "したい", "ください", "について", "こと", "もの", "ため",
  "する", "ある", "いる", "なる", "できる", "思う", "行う", "確認", "対応",
  "依頼", "お願いします", "よろしく", "以下", "上記", "下記", "添付",
  "the", "is", "are", "was", "were", "be", "been", "have", "has", "had",
]);

// 意味のあるキーワードを抽出する
export function extractKeywords(text, maxKeywords = 5) {
  if (!text) return [];

  // 英数字の技術用語・サービス名を優先抽出
  const techTerms = [];
  const techPattern = /[A-Za-z][A-Za-z0-9_\-]{2,}/g;
  let match;
  while ((match = techPattern.exec(text)) !== null) {
    const term = match[0].toLowerCase();
    if (!STOP_WORDS.has(term) && term.length >= 3) {
      techTerms.push(match[0]);
    }
  }

  // 日本語の名詞的なフレーズを抽出（カタカナ語、漢字2文字以上の連続）
  const jaTerms = [];
  const katakana = text.match(/[\u30A0-\u30FF]{3,}/g) || [];
  const kanji = text.match(/[\u4E00-\u9FFF]{2,}/g) || [];
  for (const term of [...katakana, ...kanji]) {
    if (!STOP_WORDS.has(term)) jaTerms.push(term);
  }

  // 重複除去して優先度順に返す
  const seen = new Set();
  const result = [];
  for (const term of [...techTerms, ...jaTerms]) {
    const key = term.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(term);
    }
    if (result.length >= maxKeywords) break;
  }
  return result;
}

// キーワードから JQL text 検索クエリを生成
export function buildSimilarJql(issueKey, keywords, projectKey = "JPREQ") {
  if (!keywords.length) return null;
  const textQuery = keywords.map((k) => `"${k}"`).join(" OR ");
  return `project = ${projectKey} AND key != ${issueKey} AND (summary ~ (${textQuery}) OR description ~ (${textQuery})) ORDER BY updated DESC`;
}

// Forge API でチケットを検索
export async function searchSimilarIssues(issueKey, snapshot, options = {}) {
  const maxResults = options.maxResults || 5;
  const projectKey = options.projectKey || "JPREQ";
  const text = `${snapshot.summary || ""} ${snapshot.description || ""}`;
  const keywords = extractKeywords(text);

  if (!keywords.length) {
    return { keywords: [], issues: [], jql: null };
  }

  const jql = buildSimilarJql(issueKey, keywords, projectKey);
  const response = await api.asApp().requestJira(
    route`/rest/api/3/search?jql=${jql}&maxResults=${maxResults}&fields=summary,status,updated,assignee`,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira search failed ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = JSON.parse(await response.text());
  const issues = (data.issues || []).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary || "",
    status: issue.fields?.status?.name || "",
    updated: issue.fields?.updated?.slice(0, 10) || "",
    assignee: issue.fields?.assignee?.displayName || "未割当",
  }));

  return { keywords, issues, jql };
}
