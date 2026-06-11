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

// 不具合専用キーワード（Jira必須フィールドに対応）
const BUG_FREQUENCY_KEYWORDS = ["再現頻度", "毎回", "常に", "必ず", "時々", "たまに", "稀に", "ほぼ毎回", "再現率", "発生頻度"];
const BUG_STEPS_KEYWORDS = ["再現手順", "操作手順", "以下の手順", "手順:", "手順：", "ステップ", "step"];
const BUG_SYMPTOM_KEYWORDS = ["現象", "症状", "実際の結果", "実際の動作", "エラー内容", "エラーメッセージ", "発生内容"];
const BUG_EXPECTED_KEYWORDS = ["期待動作", "期待結果", "正常", "正しい動作", "本来の動作", "あるべき", "正常時"];

// データ抽出専用キーワード
const EXTRACTION_DETECT_KEYWORDS = ["抽出", "データ出力", "csv", "エクスポート", "出力依頼", "データ取得", "リスト出力", "一覧出力"];
const EXTRACTION_CONDITION_KEYWORDS = ["条件", "where", "フィルタ", "絞り込み", "対象データ", "該当する", "以下の条件", "ステータスが", "期間が"];
const EXTRACTION_PERIOD_KEYWORDS = ["期間", "年", "月", "日", "から", "まで", "以降", "以前", "直近", "過去", "当月", "前月", "年度", "四半期"];
const EXTRACTION_FORMAT_KEYWORDS = ["csv", "tsv", "excel", "xlsx", "スプレッドシート", "フォーマット", "形式", "カラム", "列", "項目"];
const EXTRACTION_DELIVERY_KEYWORDS = ["共有", "送付", "メール", "ドライブ", "slack", "アップロード", "格納", "納品", "受け渡し", "backlog"];

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
    issueType: fields.issuetype?.name || "",
    reporter: fields.reporter?.displayName || "",
    priority: fields.priority?.name || "",
    dueDate: fields.duedate || "",
    status: fields.status?.name || "",
    attachmentCount: Array.isArray(fields.attachment) ? fields.attachment.length : 0,
    issueLinkCount: Array.isArray(fields.issuelinks) ? fields.issuelinks.length : 0,
  };
}

/** チケット種別を判定する: "bug" | "investigation" | "data-extraction" | "feature" */
export function detectRequestType(snapshot) {
  const summary = (snapshot.summary || "").toLowerCase();
  const description = (snapshot.description || "").toLowerCase();
  const issueType = (snapshot.issueType || "").toLowerCase();
  if (issueType.includes("バグ") || issueType.includes("bug") || summary.includes("【不具合】")) return "bug";
  if (issueType.includes("調査") || summary.includes("【調査】") || summary.includes("【調査依頼】")) return "investigation";
  if (summary.includes("【抽出依頼】") || summary.includes("【抽出】") || summary.includes("【データ抽出】")) return "data-extraction";
  if (includesAny(summary, EXTRACTION_DETECT_KEYWORDS) && !includesAny(summary, ["調査", "不具合"])) {
    if (includesAny(description, EXTRACTION_CONDITION_KEYWORDS) || includesAny(description, EXTRACTION_FORMAT_KEYWORDS)) {
      return "data-extraction";
    }
  }
  return "feature";
}

export function analyzeIssue(snapshot) {
  const requestType = detectRequestType(snapshot);
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

  // 種別ごとに前提条件の必須項目を変える
  // bug: 再現頻度・再現手順・現象・期待動作 が必須。To-Be は自明なので任意
  // investigation: 背景・対象範囲・現状 が必須。発生条件は任意
  // data-extraction: 抽出条件・対象期間・出力形式 が必須。受渡方法は任意
  // feature (default): 現状・背景・対象範囲 が必須。発生条件は任意
  const hasAsIs = includesAny(description, AS_IS_KEYWORDS);
  const hasCondition = includesAny(description, CONDITION_KEYWORDS);
  const hasScope = includesAny(description, SCOPE_KEYWORDS);
  const hasBackground = includesAny(description, BACKGROUND_KEYWORDS);

  let cat2;
  if (requestType === "bug") {
    // 不具合の必須4項目: 再現頻度・再現手順・現象・期待動作
    const hasFrequency = includesAny(description, BUG_FREQUENCY_KEYWORDS);
    const hasSteps = includesAny(description, BUG_STEPS_KEYWORDS);
    const hasSymptom = includesAny(description, BUG_SYMPTOM_KEYWORDS);
    const hasExpected = includesAny(description, BUG_EXPECTED_KEYWORDS);
    cat2 = [
      item(hasFrequency, "再現頻度", hasFrequency ? "再現頻度の記載あり" : "毎回/時々/稀に など再現頻度の記載なし"),
      item(hasSteps, "再現手順", hasSteps ? "再現手順の記載あり" : "操作手順・再現手順の記載なし"),
      item(hasSymptom, "現象", hasSymptom ? "現象の記載あり" : "実際に起きている現象・エラー内容の記載なし"),
      item(hasExpected, "期待動作", hasExpected ? "期待動作の記載あり" : "正常時の動作・期待結果の記載なし"),
      item(hasScope, "対象範囲", hasScope ? "対象範囲の記載あり" : "対象ユーザー・店舗・環境の記載なし（任意）"),
    ];
  } else if (requestType === "investigation") {
    cat2 = [
      item(hasBackground, "調査背景・理由", hasBackground ? "背景・理由の記載あり" : "なぜこの調査が必要かの記載なし"),
      item(hasScope, "調査対象範囲", hasScope ? "調査対象の記載あり" : "調査対象のユーザー・店舗・期間が不明"),
      item(hasAsIs, "現状・事象", hasAsIs ? "現状事象の記載あり" : "何が起きているか/何を調べたいかの記載なし"),
      item(hasCondition, "発生条件", hasCondition ? "発生条件の記載あり" : "「いつ/どんな状況で」の記載なし（任意）"),
      { status: hasLinks ? "ok" : "na", label: "関連チケット", detail: hasLinks ? "関連チケットの言及あり" : "関連チケットの言及なし（N/A）" },
    ];
  } else if (requestType === "data-extraction") {
    const hasExtractionCondition = includesAny(description, EXTRACTION_CONDITION_KEYWORDS);
    const hasExtractionPeriod = includesAny(description, EXTRACTION_PERIOD_KEYWORDS);
    const hasExtractionFormat = includesAny(description, EXTRACTION_FORMAT_KEYWORDS);
    const hasExtractionDelivery = includesAny(description, EXTRACTION_DELIVERY_KEYWORDS);
    cat2 = [
      item(hasExtractionCondition, "抽出条件", hasExtractionCondition ? "抽出条件の記載あり" : "どのデータを抽出するかの条件記載なし"),
      item(hasExtractionPeriod, "対象期間", hasExtractionPeriod ? "対象期間の記載あり" : "抽出対象の期間・日付の記載なし"),
      item(hasExtractionFormat, "出力形式", hasExtractionFormat ? "出力形式の記載あり" : "CSV/Excel等の出力形式・必要カラムの記載なし"),
      item(hasExtractionDelivery, "受渡方法", hasExtractionDelivery ? "受渡方法の記載あり" : "データの受渡方法の記載なし（任意）"),
      item(hasBackground, "背景・利用目的", hasBackground ? "利用目的の記載あり" : "抽出データの利用目的の記載なし（任意）"),
    ];
  } else {
    // feature
    cat2 = [
      item(hasAsIs, "現状（As-Is）", hasAsIs ? "現状の記載あり" : "現状の記載なし"),
      item(hasScope, "対象範囲", hasScope ? "対象範囲の記載あり" : "対象ユーザー・店舗・期間の記載なし"),
      item(hasBackground, "背景・理由", hasBackground ? "背景・理由の記載あり" : "なぜ今この依頼が必要かの記載なし"),
      item(hasCondition, "発生条件", hasCondition ? "発生条件の記載あり" : "「いつ/どんな状況で」の記載なし（任意）"),
      { status: hasLinks ? "ok" : "na", label: "関連チケット", detail: hasLinks ? "関連チケットの言及あり" : "関連チケットの言及なし（N/A）" },
    ];
  }

  // 種別ごとに要件カテゴリも調整
  // bug: To-Be は「正常動作に戻る」が自明のため任意扱い
  // data-extraction: To-Be / ゴールは「データを受け取る」が自明のため任意
  const hasToBe = includesAny(description, TOBE_KEYWORDS);
  const hasGoal = includesAny(description, GOAL_KEYWORDS);
  let cat3;
  if (requestType === "bug") {
    cat3 = [
      item(Boolean(snapshot.priority), "優先度", snapshot.priority ? `priority = ${snapshot.priority}` : "priorityフィールド未設定"),
      { status: hasToBe ? "ok" : "na", label: "変更後（To-Be）", detail: hasToBe ? "To-Beの記載あり" : "不具合修正のため任意（N/A）" },
      { status: hasGoal ? "ok" : "na", label: "ゴール・期待成果", detail: hasGoal ? "期待成果の記載あり" : "不具合修正のため任意（N/A）" },
    ];
  } else if (requestType === "investigation") {
    cat3 = [
      item(Boolean(snapshot.priority), "優先度", snapshot.priority ? `priority = ${snapshot.priority}` : "priorityフィールド未設定"),
      item(hasToBe || hasGoal, "調査後の期待成果", hasToBe || hasGoal ? "期待成果・アウトプットの記載あり" : "調査後に何を得たいかの記載なし"),
      { status: "na", label: "変更後（To-Be）", detail: "調査依頼のため任意（N/A）" },
    ];
  } else if (requestType === "data-extraction") {
    cat3 = [
      item(Boolean(snapshot.priority), "優先度", snapshot.priority ? `priority = ${snapshot.priority}` : "priorityフィールド未設定"),
      item(Boolean(snapshot.dueDate) || includesAny(description, DATE_KEYWORDS), "希望納期", snapshot.dueDate ? `duedate = ${snapshot.dueDate}` : includesAny(description, DATE_KEYWORDS) ? "本文に希望日の記載あり" : "データの希望納期の記載なし"),
      { status: hasGoal ? "ok" : "na", label: "ゴール・期待成果", detail: hasGoal ? "利用目的の記載あり" : "データ抽出のため任意（N/A）" },
    ];
  } else {
    cat3 = [
      item(hasToBe, "変更後（To-Be）", hasToBe ? "To-Beの記載あり" : "どうなってほしいかの記載なし"),
      item(Boolean(snapshot.priority), "優先度", snapshot.priority ? `priority = ${snapshot.priority}` : "priorityフィールド未設定"),
      item(hasGoal, "ゴール・期待成果", hasGoal ? "期待成果の記載あり" : "ゴール・期待成果の記載なし"),
    ];
  }

  const cat4 = [
    { status: snapshot.attachmentCount > 0 ? "ok" : "ng", label: "スクリーンショット・資料", detail: snapshot.attachmentCount > 0 ? `${snapshot.attachmentCount}件の添付あり` : "添付なし" },
    { status: snapshot.issueLinkCount > 0 ? "ok" : "na", label: "類似・関連チケット番号", detail: snapshot.issueLinkCount > 0 ? `${snapshot.issueLinkCount}件のリンクあり` : "issuelinksなし（N/A）" },
    { status: "na", label: "影響範囲の規模感", detail: "自動判定不可" },
    { status: "na", label: "関係者・承認者", detail: "自動判定不可" },
  ];

  // 必須項目の判定: 種別によって cat2 の何番目までが必須かを変える
  // bug: 先頭4項目が必須 / investigation: 先頭3項目が必須 / data-extraction: 先頭3項目が必須 / feature: 先頭3項目が必須
  const requiredCat2Count = requestType === "bug" ? 4 : 3;
  const cat2Ng = cat2.slice(0, requiredCat2Count).filter((row) => row.status === "ng");
  const cat13Ng = [...cat1, ...cat3].filter((row) => row.status === "ng");
  const hasWarnings = [...cat1, ...cat2, ...cat3].some((row) => row.status === "warn");

  let verdict = "green";
  let reason = "①〜③の全必須項目に記載あり";
  if (cat2Ng.length) {
    verdict = "red";
    reason = `前提条件の必須項目（${cat2Ng.map((row) => row.label).join("・")}）に記載なし`;
  } else if (cat13Ng.length >= 2) {
    verdict = "red";
    reason = `基本情報・要件の必須項目（${cat13Ng.map((row) => row.label).join("・")}）が複数不足`;
  } else if (hasWarnings) {
    verdict = "yellow";
    reason = "必須項目はそろっているが確認推奨の項目あり";
  }

  return {
    requestType,
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
