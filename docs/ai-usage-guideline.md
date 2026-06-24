# AI 利用ガイドライン（sales-request-checker）

> 作成日: 2026-06-22 / 上長レビュー（AT-79）反映版
> 対象: 本アプリが OpenAI API を呼び出す全経路
> 関連: [`architecture-overview.md`](./architecture-overview.md), [`cost-control.md`](./cost-control.md), [`privacy-policy.md`](./privacy-policy.md)

本ドキュメントは、本アプリで OpenAI API を利用する際の **データ取扱い・機密情報・監査・人による最終判断** に関するルールを定める。コスト制御は `cost-control.md` を、技術構成は `architecture-overview.md` を参照のこと。

---

## 1. OpenAI 側のデータ取扱い

- 本アプリは **OpenAI API（Platform）** を利用し、ChatGPT（一般向け製品）は使わない
- OpenAI 公式ポリシーにより、**API 経由で送信されたデータはモデル学習に使われない**（"API data is not used to train OpenAI models or improve OpenAI's service offerings by default"）。`opt-in` した場合のみ学習対象となるが、本アプリでは opt-in しない
- API 送信データは、不正利用検知の目的で **OpenAI 側に最大 30 日間保持**された後に削除される（Standard API のリテンション）。Zero Data Retention（ZDR）契約を結べば 0 日にできるが、現状は標準契約を前提とする
- データセンターは OpenAI 側で米国リージョンで処理される。EU リージョンへの限定は現状不可
- 本ルールは OpenAI 側ポリシー更新に追従するため、**年1回または重大変更時に本ドキュメントを見直す**

参考: <https://openai.com/policies/business-terms/>, <https://platform.openai.com/docs/models#how-we-use-your-data>

---

## 2. 個人情報・機密情報の取扱い

OpenAI API へ送信してはならない情報を以下に列挙する。

### 2.1 送信禁止カテゴリ

- 個人情報（マイナンバー、生年月日、住所、電話番号、メールアドレス、顧客氏名、口座番号 等）
- 認証情報（パスワード、APIキー、トークン、OAuth secret、社内 SSO クレデンシャル）
- 顧客の店舗識別情報のうち、依頼レビューに不要な部分（例: 店舗詳細住所）
- 社外秘・社内秘扱いの仕様書本文、契約書本文
- ソースコードのうち、社内ロジック・暗号鍵・接続情報を含むもの

### 2.2 送信される情報の範囲（ホワイトリスト）

`src/core/openai-review.js` で OpenAI に渡すペイロードは固定スキーマ:

```js
{
  issue: { key, summary, description, priority, dueDate, attachmentCount, issueLinkCount },
  ruleReview: { verdict, reason, missingItems }
}
```

このスキーマに含まれないフィールド（コメント本文、添付ファイル本体、reporter/assignee の個人名 等）は送らない。

### 2.3 description に混入した機密情報の扱い

依頼者が description に上記禁止カテゴリの情報を書いてしまった場合に備え、以下のガードを段階的に適用する。

- **第1層: 静的マスクパターン**（実装予定）
  送信前に description を走査し、以下のパターンを `[REDACTED]` に置換する:
  - メールアドレス: `[\w.-]+@[\w.-]+\.\w+`
  - 電話番号: `0\d{1,4}-\d{1,4}-\d{4}` / `\+81-\d+-\d+-\d+`
  - APIキー類: `sk-[A-Za-z0-9]{20,}` / `ghp_[A-Za-z0-9]{20,}` / `AIza[A-Za-z0-9_-]{30,}`
  - 8桁以上の連続数字（口座番号等の疑い）
- **第2層: 文字数上限（`cost-control.md` §2.3）**
  8,000 文字超過分は送信しないため、長文に紛れた機密の流出範囲を限定する効果も期待
- **第3層: 依頼者教育・運用啓発**
  Confluence の依頼テンプレートに「個人情報・認証情報を description に書かない」旨を明記。レビューコメント末尾に「※ description は OpenAI API に送信されます。機密情報は記載しないでください。」の注記を表示

第1層は OpenAI 呼び出しの直前（`src/core/openai-review.js`）で `redactSensitive(text)` ユーティリティとして実装する。

---

## 3. ログ管理 / 監査

- 各 OpenAI 呼び出しに対し、以下を Forge ログ（CloudWatch相当）に記録する:
  - `issueKey` / `triggerType`（auto / panel-review / panel-comment）/ `actorAccountId`（パネル操作時）/ `timestamp`（JST）/ `promptVersion` / `aiProvider` / `model` / `inputTokens` / `outputTokens` / `redactionsApplied`
- 「誰が、いつ、どの issue で実行したか」を追跡可能とする
- ログは Forge の標準保持期間（30日）で運用。長期保持が必要になった時点で、Forge `storage` または Atlassian Analytics への転送を検討
- レビューコメント末尾にも `aiProvider` / `promptVersion` を残しているため、Jira 側からも事後追跡できる
- **個人情報や description 本文そのものはログに残さない**（メタ情報のみ）

---

## 4. AI 出力の扱い

- AI が出力するレビュー結果（質問・改善提案・改善後 description 案）は **あくまで補助情報** である
- **最終判断（依頼の受理／差し戻し／優先度確定／実装方針決定）は必ず人が行う**
- レビューコメント冒頭に「🤖 AI による自動レビューです。最終判断は依頼者・受け手で行ってください。」と明記する
- AI が `verdict: NEEDS_INFO` を返しても、人間が「十分」と判断すれば着手して構わない。逆も同様
- AI 出力に明らかな誤りや有害な内容が含まれた場合、Forge variable `OPENAI_API_KEY` を一時 unset し（kill switch）、原因調査の上で復旧する

---

## 5. データ保持リスク

| 場所 | 保持期間 | 削除可否 |
|------|---------|----------|
| Jira（自社） | Atlassian の標準保持 | 通常の issue 削除で消える |
| Forge ログ | 30 日 | 自動削除 |
| OpenAI API ログ（abuse monitoring 用） | 最大 30 日 | OpenAI 側で自動削除（標準契約） |
| OpenAI モデル学習 | 利用しない | — |

OpenAI 側の 30 日保持は、不正利用検知のために OpenAI 社内の限られた担当者がアクセスし得る。**機密情報を送らない（§2）** が一次防衛線である理由はここにある。

---

## 6. 本番・検証環境のデータ分離

- **development 環境**: Forge tunnel または ローカル単体テストでは、本番 Jira の顧客情報を含む実 issue を送信しない
  - 検証は dummy データ（`tests/fixtures/`）か、社内専用テスト project（後日作成予定）の issue で行う
- **production 環境**: `ALLOWED_PROJECT_KEYS=JPREQ` でホワイトリスト制御。本番デプロイ後も他 project の issue は OpenAI に送らない
- `manifest.yml` の `environment` で dev / staging / production を分離。`OPENAI_API_KEY` も環境ごとに別キーを使う

---

## 7. ガイドライン更新ルール

- 本ドキュメントは **OpenAI 公式ポリシー / Atlassian Forge 仕様 / 社内コンプライアンス基準** のいずれかが変わった時点で見直す
- 重大変更時は AT-79 系列のチケット（または後継のセキュリティレビューチケット）に変更履歴を残す
- 年1回（毎年4月）に定期レビューを実施

---

## 8. チェックリスト（運用開始前）

- [ ] §2.3 第1層マスク処理を `src/core/openai-review.js` に実装
- [ ] レビューコメント末尾に「※ description は OpenAI API に送信されます」の注記を追加
- [ ] レビューコメント冒頭に「🤖 AI による自動レビュー / 最終判断は人」の注記を追加
- [ ] Forge ログに §3 の項目を出力していることを確認
- [ ] Confluence 依頼テンプレートに「機密情報を書かない」旨を追記
- [ ] development 環境用 `OPENAI_API_KEY` を本番と分離発行
- [ ] 本ドキュメントを Confluence の運用保守スペースにも転載（社内検索性のため）
