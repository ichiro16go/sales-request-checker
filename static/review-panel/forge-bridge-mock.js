// ローカルプレビュー用 @forge/bridge モック
// vite dev時のみ使用。本番Forge環境では使われない。

const MOCK_REVIEW = {
  verdictEmoji: "🟡",
  verdictLabel: "要確認",
  reason: "背景・目的の記載が不足しています。",
  questions: [
    { label: "背景", question: "この機能が必要になった経緯を教えてください。" },
    { label: "対象ユーザー", question: "この機能は誰が使いますか？" },
    { label: "優先度の根拠", question: "なぜ今対応が必要ですか？" },
  ],
  improvedDescription:
    "## 背景\n（記載してください）\n\n## 要望内容\n現在の検索フィルターが機能しない問題を修正してほしい。\n\n## 期待する動作\n都道府県フィルターで絞り込むと該当顧客が一覧表示される。",
};

export async function invoke(fnName) {
  console.log(`[mock] invoke("${fnName}")`);
  await new Promise((r) => setTimeout(r, 600)); // 疑似レイテンシ
  if (fnName === "postReview") {
    return { ...MOCK_REVIEW, verdictEmoji: "✅", verdictLabel: "投稿済み" };
  }
  return MOCK_REVIEW;
}
