import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractKeywords, buildSimilarJql } from "../src/core/similar-search.js";

describe("extractKeywords", () => {
  it("extracts technical terms from text", () => {
    const text = "EPARK グルメの予約画面でエラーが発生しています。justpassのAPI連携が原因の可能性があります。";
    const keywords = extractKeywords(text);
    assert.ok(keywords.length > 0);
    assert.ok(keywords.some((k) => k.toLowerCase() === "epark" || k.toLowerCase() === "justpass"));
  });

  it("extracts katakana terms", () => {
    const text = "ユーザーがログイン画面でエラーになる。ステータスコードが500です。";
    const keywords = extractKeywords(text);
    assert.ok(keywords.some((k) => k === "ユーザー" || k === "ステータス" || k === "ログイン"));
  });

  it("returns empty array for empty text", () => {
    assert.deepEqual(extractKeywords(""), []);
    assert.deepEqual(extractKeywords(null), []);
  });

  it("respects maxKeywords limit", () => {
    const text = "EPARK justpass faspa grume API webhook endpoint function handler resolver";
    const keywords = extractKeywords(text, 3);
    assert.ok(keywords.length <= 3);
  });

  it("excludes stop words", () => {
    const text = "確認してください。対応お願いします。the system is running.";
    const keywords = extractKeywords(text);
    assert.ok(!keywords.some((k) => k.toLowerCase() === "the" || k === "確認" || k === "対応"));
  });
});

describe("buildSimilarJql", () => {
  it("builds valid JQL with keywords", () => {
    const jql = buildSimilarJql("JPREQ-100", ["EPARK", "予約画面"]);
    assert.ok(jql.includes("project = JPREQ"));
    assert.ok(jql.includes("key != JPREQ-100"));
    assert.ok(jql.includes('"EPARK"'));
    assert.ok(jql.includes('"予約画面"'));
  });

  it("returns null for empty keywords", () => {
    assert.strictEqual(buildSimilarJql("JPREQ-100", []), null);
  });

  it("uses specified project key", () => {
    const jql = buildSimilarJql("EPGPRD-1", ["test"], "EPGPRD");
    assert.ok(jql.includes("project = EPGPRD"));
  });
});
