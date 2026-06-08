import { extractAdfText } from "./adf.js";

export const CLOSE_STATUSES = ["Done", "完了", "Close", "Resolved", "解決済", "解決済み", "リリース済み"];

const SERVICE_KEYWORDS = [
  "justpass", "faspa", "epark", "グルメ", "画面", "機能", "システム", "サービス",
  "ページ", "管理画面", "アプリ", "サイト", "api",
];
const REQUEST_KEYWORDS = [
  "したい", "してほしい", "変更", "追加", "修正", "改善", "対応", "お願い", "要望",
  "してください", "欲しい",
];
const DATE_KEYWORDS = ["月", "週", "年", "まで", "以内", "期限", "リリース", "deadline", "納期", "希望日"];
const AS_IS_KEYWORDS = [
  "現状", "現在", "今は", "今の", "as-is", "as is", "今現在", "現時点", "現行", "今まで",
  "これまで", "従来",
];
const CONDITION_KEYWORDS = ["いつ", "場合", "とき", "時に", "条件", "状況", "発生", "なると", "すると", "タイミング", "際に", "ケース", "パターン"];
const SCOPE_KEYWORDS = ["対象", "ユーザー", "店舗", "範囲", "全体", "全て", "すべて", "一部", "該当", "全店", "全ユーザー", "特定", "限定"];
const BACKGROUND_KEYWORDS = ["理由", "背景", "なぜ", "ため", "から", "ので", "目的", "課題", "問題", "要因", "経緯", "きっかけ", "依頼", "お客様", "営業", "問い合わせ"];
const TOBE_KEYWORDS = ["したい", "してほしい", "変更後", "to-be", "to be", "希望", "なってほしい", "改善後", "できるように", "になるよう", "表示", "変わる"];
const GOAL_KEYWORDS = ["できる", "なる", "期待", "目的", "ゴール", "効果", "改善", "解決", "削減", "向上", "防ぐ", "なくなる", "増える"];

function includesAny(text, keywords) {
  const lower = String(text || "").toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function item(ok, label, detail) {
  return { status: ok === true ? "ok" : ok === false ? "ng" : "na", label, detail };
}

export function normalizeIssue(issue) {
  const fields = issue?.fields || {};
  const description = extractAdfText(fields.description || "");
  return {
    id: issue?.id || "",
    key: issue?.key || "",
    summary: fields.summary || "",
    description,
    reporter: fields.reporter?.displayName || "",
    priority: fields.priority?.name || "",
    dueDate: fields.duedate || "",
    status: fields.status?.name || "",
    attachmentCount: Array.isArray(fields.attachment) ? fields.attachment.length : 0,
    issueLinkCount: Array.isArray(fields.issuelinks) ? fields.issuelinks.length : 0,
  };
}

export function analyzeIssue(snapshot) {
  const summary = snapshot.summary || "";
  const description = snapshot.description || "";
  const fullText = `${summary}\n${description}`;
  const hasLinks = snapshot.issueLinkCount > 0 || includesAny(description, ["jpreq-", "epgprd-", "justpass-", "関連チケット", "依存"]);

  const cat1 = [
    item(Boolean(snapshot.reporter), "依頼者・部署", snapshot.reporter ? `reporter = ${snapshot.reporter}` : "reporterが未設定"),
    item(includesAny(fullText, SERVICE_KEYWORDS), "対象サービス・機能", includesAny(fullText, SERVICE_KEYWORDS) ? "サービス名または機能名の記載あり" : "対象サービス・機能名の記載なし"),
    item(includesAny(description, REQUEST_KEYWORDS), "依頼概要（何をしたいか）", includesAny(description, REQUEST_KEYWORDS) ? "依頼内容の記載あり" : "何をしたいかが読み取れない"),
    item(Boolean(snapshot.dueDate) || includesAny(description, DATE_KEYWORDS), "対応期限", snapshot.dueDate ? `duedate = ${snapshot.dueDate}` : includesAny(description, DATE_KEYWORDS) ? "本文に期日の記載あり" : "期限・時期の記載なし"),
  ];
  if (!snapshot.dueDate && includesAny(description, ["急ぎ", "早急", "なるべく早く", "asap"])) {
    cat1[3] = { status: "warn", label: "対応期限", detail: "「急ぎ」とあるが具体的な日付なし" };
  }

  const cat2 = [
    item(includesAny(description, AS_IS_KEYWORDS), "現状（As-Is）", includesAny(description, AS_IS_KEYWORDS) ? "現状の記載あり" : "現状の記載なし"),
    item(includesAny(description, CONDITION_KEYWORDS), "発生条件", includesAny(description, CONDITION_KEYWORDS) ? "発生条件の記載あり" : "「いつ/どんな状況で」が読み取れない"),
    item(includesAny(description, SCOPE_KEYWORDS), "対象範囲", includesAny(description, SCOPE_KEYWORDS) ? "対象範囲の記載あり" : "対象ユーザー・店舗・期間の記載なし"),
    item(includesAny(description, BACKGROUND_KEYWORDS), "背景・理由", includesAny(description, BACKGROUND_KEYWORDS) ? "背景・理由の記載あり" : "なぜ今この依頼が必要かの記載なし"),
    { status: hasLinks ? "ok" : "na", label: "他機能への依存", detail: hasLinks ? "issuelinksまたは本文に依存関係の言及あり" : "依存関係の言及なし（N/A）" },
  ];

  const cat3 = [
    item(includesAny(description, TOBE_KEYWORDS), "変更後（To-Be）", includesAny(description, TOBE_KEYWORDS) ? "To-Beの記載あり" : "どうなってほしいかの記載なし"),
    item(Boolean(snapshot.priority), "優先度", snapshot.priority ? `priority = ${snapshot.priority}` : "priorityフィールド未設定"),
    item(includesAny(description, GOAL_KEYWORDS), "ゴール・期待成果", includesAny(description, GOAL_KEYWORDS) ? "期待成果の記載あり" : "ゴール・期待成果の記載なし"),
  ];

  const cat4 = [
    { status: snapshot.attachmentCount > 0 ? "ok" : "ng", label: "スクリーンショット・資料", detail: snapshot.attachmentCount > 0 ? `${snapshot.attachmentCount}件の添付あり` : "添付なし" },
    { status: snapshot.issueLinkCount > 0 ? "ok" : "na", label: "類似・関連チケット番号", detail: snapshot.issueLinkCount > 0 ? `${snapshot.issueLinkCount}件のリンクあり` : "issuelinksなし（N/A）" },
    { status: "na", label: "影響範囲の規模感", detail: "自動判定不可" },
    { status: "na", label: "関係者・承認者", detail: "自動判定不可" },
  ];

  const cat2Ng = cat2.slice(0, 4).filter((row) => row.status === "ng");
  const cat13Ng = [...cat1, ...cat3].filter((row) => row.status === "ng");
  const hasWarnings = [...cat1, ...cat2, ...cat3].some((row) => row.status === "warn");

  let verdict = "green";
  let reason = "①〜③の全必須項目に記載あり";
  if (cat2Ng.length) {
    verdict = "red";
    reason = `②前提条件の必須項目（${cat2Ng.map((row) => row.label).join("・")}）に記載なし`;
  } else if (cat13Ng.length >= 2) {
    verdict = "red";
    reason = `①③の必須項目（${cat13Ng.map((row) => row.label).join("・")}）が複数不足`;
  } else if (hasWarnings) {
    verdict = "yellow";
    reason = "必須項目はそろっているが確認推奨の項目あり";
  }

  return {
    categories: [
      { key: "basic", title: "基本情報", items: cat1 },
      { key: "context", title: "前提条件", items: cat2 },
      { key: "requirements", title: "要件・希望内容", items: cat3 },
      { key: "optional", title: "確認推奨項目", items: cat4 },
    ],
    verdict,
    reason,
    missingItems: [...cat2Ng, ...cat13Ng].map((row) => row.label),
  };
}
