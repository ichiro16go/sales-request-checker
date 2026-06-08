import test from "node:test";
import assert from "node:assert/strict";
import { analyzeIssue } from "../src/core/checker.js";
import { reviewIssueSnapshot } from "../src/core/review.js";

test("marks missing context as red and asks concrete questions", async () => {
  const snapshot = {
    key: "JPREQ-1",
    summary: "画面を変更してほしい",
    description: "急ぎで対応お願いします。",
    reporter: "営業 太郎",
    priority: "",
    dueDate: "",
    status: "Open",
    attachmentCount: 0,
    issueLinkCount: 0,
  };

  const ruleReview = analyzeIssue(snapshot);
  assert.equal(ruleReview.verdict, "red");
  assert.ok(ruleReview.missingItems.includes("現状（As-Is）"));
  assert.ok(ruleReview.missingItems.includes("対象範囲"));

  const review = await reviewIssueSnapshot(snapshot, { useAi: false });
  assert.equal(review.verdict, "red");
  assert.ok(review.questions.length >= 2);
  assert.match(review.improvedDescription, /確認したいこと/);
});

test("keeps sufficient request green", () => {
  const snapshot = {
    key: "JPREQ-2",
    summary: "グルメ管理画面の店舗検索を改善したい",
    description: [
      "現状、管理画面で店舗検索をすると一部の店舗名で検索結果が出ません。",
      "営業がお客様から問い合わせを受けており、対象は全店舗です。",
      "店舗名に旧字体が含まれる場合に発生します。",
      "変更後は旧字体でも検索できるようにしたいです。",
      "問い合わせ削減を期待しています。6月中に対応希望です。",
    ].join("\n"),
    reporter: "営業 花子",
    priority: "Medium",
    dueDate: "2026-06-30",
    status: "Open",
    attachmentCount: 1,
    issueLinkCount: 0,
  };

  const review = analyzeIssue(snapshot);
  assert.equal(review.verdict, "green");
});
