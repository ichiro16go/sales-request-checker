import test from "node:test";
import assert from "node:assert/strict";
import { analyzeIssue, detectRequestType } from "../src/core/checker.js";
import { formatReviewComment } from "../src/core/review.js";

// ---------------------------------------------------------------------------
// detectRequestType
// ---------------------------------------------------------------------------

test("detectRequestType: バグ issueType → bug", () => {
  assert.equal(detectRequestType({ summary: "検索が壊れた", issueType: "バグ" }), "bug");
});

test("detectRequestType: 【不具合】タイトル → bug", () => {
  assert.equal(detectRequestType({ summary: "【不具合】JustPass: 検索が壊れた", issueType: "タスク" }), "bug");
});

test("detectRequestType: 調査 issueType → investigation", () => {
  assert.equal(detectRequestType({ summary: "なんか遅い", issueType: "調査" }), "investigation");
});

test("detectRequestType: 【調査】タイトル → investigation", () => {
  assert.equal(detectRequestType({ summary: "【調査】特定店舗でエラーが発生している件", issueType: "タスク" }), "investigation");
});

test("detectRequestType: 通常タイトル → feature", () => {
  assert.equal(detectRequestType({ summary: "【要望】JustPass: 定休日を表示してほしい", issueType: "タスク" }), "feature");
});

// ---------------------------------------------------------------------------
// 不具合（bug）: 発生条件が必須、To-Be は N/A
// ---------------------------------------------------------------------------

test("bug: 発生条件なし → red", () => {
  const snapshot = {
    key: "JPREQ-10",
    summary: "【不具合】JustPass: 検索が0件になる",
    issueType: "バグ",
    // 再現手順・現象・期待動作のキーワードなし
    description: "現在、管理画面で東京都を選ぶと結果が出ない。対象は全店舗。問い合わせが増えているため対応してほしい。",
    reporter: "営業 太郎",
    priority: "High",
    dueDate: "2026-07-01",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "bug");
  assert.equal(result.verdict, "red");
  assert.ok(result.missingItems.some((l) => l === "再現手順"), "再現手順が不足として検出されること");
});

test("bug: 必須4項目あり → green", () => {
  const snapshot = {
    key: "JPREQ-11",
    summary: "【不具合】JustPass: 検索が0件になる",
    issueType: "バグ",
    description: [
      "再現頻度: 毎回",
      "再現手順: 1. 管理画面を開く 2. 都道府県フィルターで東京都を選択 3. 検索ボタンを押す",
      "現象: 検索結果が0件になる",
      "期待動作: 東京都の店舗一覧が表示される",
    ].join("\n"),
    reporter: "営業 太郎",
    priority: "High",
    dueDate: "2026-07-01",
    attachmentCount: 1,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "bug");
  assert.equal(result.verdict, "green");
});

test("bug: To-Be は N/A 扱いで green を妨げない", () => {
  const snapshot = {
    key: "JPREQ-12",
    summary: "【不具合】JustPass: 検索が0件になる",
    issueType: "バグ",
    // To-Be・ゴールのキーワードなし。不具合なので任意
    description: [
      "再現頻度: 時々",
      "再現手順: 1. 管理画面を開く 2. 東京都を選択 3. 検索",
      "現象: 0件表示になる",
      "期待動作: 正常時は東京都の店舗が表示される",
    ].join("\n"),
    reporter: "営業 太郎",
    priority: "Medium",
    dueDate: "2026-07-01",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "bug");
  assert.equal(result.verdict, "green", "To-Beなしでも不具合はgreenになるべき");
});

// ---------------------------------------------------------------------------
// 調査（investigation）: 背景・対象範囲・現状が必須（先頭3項目）
// ---------------------------------------------------------------------------

test("investigation: 背景なし → red", () => {
  const snapshot = {
    key: "JPREQ-20",
    summary: "【調査】特定店舗でエラーが多発している件",
    issueType: "調査",
    description: "現在、A店舗でエラーが出ている。対象はA店舗のユーザー。調査してほしい。",
    reporter: "営業 花子",
    priority: "Medium",
    dueDate: "2026-07-15",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "investigation");
  assert.equal(result.verdict, "red");
  assert.ok(result.missingItems.some((l) => l.includes("背景")));
});

test("investigation: 先頭3項目あり → green", () => {
  const snapshot = {
    key: "JPREQ-21",
    summary: "【調査】特定店舗でエラーが多発している件",
    issueType: "調査",
    description: [
      "現在、A店舗で500エラーが頻発しており、業務に支障が出ている。",
      "お客様からの問い合わせが増えているため原因を調査してほしい。",
      "対象はA店舗の全ユーザー。",
    ].join("\n"),
    reporter: "営業 花子",
    priority: "Medium",
    dueDate: "2026-07-15",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "investigation");
  assert.equal(result.verdict, "green");
});

// ---------------------------------------------------------------------------
// 要望（feature）: 現状・背景・対象範囲が必須（先頭3項目）、発生条件は任意
// ---------------------------------------------------------------------------

test("feature: 対象範囲なし → red", () => {
  const snapshot = {
    key: "JPREQ-30",
    summary: "【要望】JustPass: 定休日を臨時設定カレンダーに表示してほしい",
    issueType: "タスク",
    description: [
      "現在はファスパでは定休日が表示されていたが、JustPassでは表示されない。",
      "誤った設定をするリスクがあるため、同様に表示してほしい。",
      // 対象範囲キーワードなし
    ].join("\n"),
    reporter: "営業 次郎",
    priority: "Medium",
    dueDate: "2026-07-31",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "feature");
  assert.equal(result.verdict, "red");
  assert.ok(result.missingItems.some((l) => l.includes("対象範囲")));
});

test("feature: 発生条件なくても必須3項目あり → green", () => {
  const snapshot = {
    key: "JPREQ-31",
    summary: "【要望】JustPass: 定休日を臨時設定カレンダーに表示してほしい",
    issueType: "タスク",
    description: [
      "現在はファスパでは定休日が表示されていたが、JustPassでは表示されない。",
      "誤った設定をするリスクがあるため対応してほしい。",
      "対象は定休日設定がある全店舗。",
      // 発生条件のキーワードなし（任意なので green になるべき）
    ].join("\n"),
    reporter: "営業 次郎",
    priority: "Medium",
    dueDate: "2026-07-31",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "feature");
  assert.equal(result.verdict, "green", "発生条件なしでも要望はgreenになるべき");
});

// ---------------------------------------------------------------------------
// formatReviewComment: 出力順の確認
// ---------------------------------------------------------------------------

test("formatReviewComment: 改善案がチェック詳細より前に出力される", async () => {
  const { reviewIssueSnapshot } = await import("../src/core/review.js");
  const snapshot = {
    key: "JPREQ-99",
    summary: "画面を変更してほしい",
    issueType: "タスク",
    description: "急ぎでお願いします。",
    reporter: "営業 三郎",
    priority: "",
    dueDate: "",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const review = await reviewIssueSnapshot(snapshot, { useAi: false });
  const comment = formatReviewComment(review);

  const improvedPos = comment.indexOf("依頼文の改善案");
  const detailPos = comment.indexOf("チェック詳細");
  assert.ok(improvedPos !== -1, "改善案セクションが存在すること");
  assert.ok(detailPos !== -1, "チェック詳細セクションが存在すること");
  assert.ok(improvedPos < detailPos, "改善案がチェック詳細より前にあること");
});

test("formatReviewComment: コードブロックに改善案が含まれる", async () => {
  const { reviewIssueSnapshot } = await import("../src/core/review.js");
  const snapshot = {
    key: "JPREQ-98",
    summary: "画面を変更してほしい",
    issueType: "タスク",
    description: "急ぎでお願いします。",
    reporter: "営業 三郎",
    priority: "",
    dueDate: "",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const review = await reviewIssueSnapshot(snapshot, { useAi: false });
  const comment = formatReviewComment(review);
  assert.ok(comment.includes("```"), "コードブロックが含まれること");
});

// ---------------------------------------------------------------------------
// データ抽出（data-extraction）: 抽出条件・対象期間・出力形式が必須（先頭3項目）
// ---------------------------------------------------------------------------

test("detectRequestType: 【抽出依頼】タイトル → data-extraction", () => {
  assert.equal(detectRequestType({ summary: "【抽出依頼】予約データ一覧の出力", issueType: "タスク" }), "data-extraction");
});

test("detectRequestType: 【データ抽出】タイトル → data-extraction", () => {
  assert.equal(detectRequestType({ summary: "【データ抽出】2026年Q1会員データ", issueType: "タスク" }), "data-extraction");
});

test("detectRequestType: 抽出キーワード + 条件あり → data-extraction", () => {
  assert.equal(detectRequestType({
    summary: "会員データ抽出のお願い",
    issueType: "タスク",
    description: "以下の条件で抽出してほしいです。ステータスが有効の会員。",
  }), "data-extraction");
});

test("detectRequestType: 抽出キーワードあるが調査タイトル → investigation優先", () => {
  assert.equal(detectRequestType({
    summary: "【調査】データ抽出結果の不整合",
    issueType: "タスク",
    description: "条件を指定して抽出した結果がおかしい",
  }), "investigation");
});

test("data-extraction: 条件・期間・形式なし → red", () => {
  const snapshot = {
    key: "JPREQ-40",
    summary: "【抽出依頼】予約データの出力",
    issueType: "タスク",
    description: "予約データを抽出してください。急ぎでお願いします。",
    reporter: "営業 太郎",
    priority: "Medium",
    dueDate: "",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "data-extraction");
  assert.equal(result.verdict, "red");
  assert.ok(result.missingItems.some((l) => l === "抽出条件"), "抽出条件が不足として検出されること");
  assert.ok(result.missingItems.some((l) => l === "対象期間"), "対象期間が不足として検出されること");
  assert.ok(result.missingItems.some((l) => l === "出力形式"), "出力形式が不足として検出されること");
});

test("data-extraction: 必須3項目あり → green", () => {
  const snapshot = {
    key: "JPREQ-41",
    summary: "【抽出依頼】予約データの出力",
    issueType: "タスク",
    description: [
      "以下の条件で予約データを抽出してほしいです。",
      "条件: ステータスが「完了」の予約",
      "期間: 2026年1月〜3月",
      "出力形式: CSV、カラムはユーザーID・店舗名・予約日時・ステータス",
    ].join("\n"),
    reporter: "営業 太郎",
    priority: "Medium",
    dueDate: "2026-06-20",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "data-extraction");
  assert.equal(result.verdict, "green");
});

test("data-extraction: 受渡方法なしでも必須3項目あれば green", () => {
  const snapshot = {
    key: "JPREQ-42",
    summary: "【抽出依頼】会員一覧",
    issueType: "タスク",
    description: [
      "会員管理システムから退会済み会員を抽出してほしいです。",
      "対象データ: 退会済み会員",
      "期間: 直近3ヶ月",
      "Excel形式で、カラムは会員ID・退会日・退会理由",
    ].join("\n"),
    reporter: "営業 花子",
    priority: "Low",
    dueDate: "2026-07-01",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const result = analyzeIssue(snapshot);
  assert.equal(result.requestType, "data-extraction");
  assert.equal(result.verdict, "green", "受渡方法なしでもgreenになるべき");
});

test("data-extraction: formatReviewComment にデータ抽出ラベルが表示される", async () => {
  const { reviewIssueSnapshot } = await import("../src/core/review.js");
  const snapshot = {
    key: "JPREQ-43",
    summary: "【抽出依頼】予約データ",
    issueType: "タスク",
    description: "予約データをお願いします。",
    reporter: "営業 三郎",
    priority: "",
    dueDate: "",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const review = await reviewIssueSnapshot(snapshot, { useAi: false });
  const comment = formatReviewComment(review);
  assert.ok(comment.includes("データ抽出"), "コメントに「データ抽出」ラベルが含まれること");
});

test("data-extraction: fallback改善案に抽出テンプレートが使われる", async () => {
  const { reviewIssueSnapshot } = await import("../src/core/review.js");
  const snapshot = {
    key: "JPREQ-44",
    summary: "【抽出依頼】店舗データ",
    issueType: "タスク",
    description: "店舗データの抽出をお願いします。",
    reporter: "営業 太郎",
    priority: "",
    dueDate: "",
    attachmentCount: 0,
    issueLinkCount: 0,
  };
  const review = await reviewIssueSnapshot(snapshot, { useAi: false });
  assert.ok(review.improvedDescription.includes("抽出条件"), "改善案に抽出条件セクションが含まれること");
  assert.ok(review.improvedDescription.includes("出力形式"), "改善案に出力形式セクションが含まれること");
});
