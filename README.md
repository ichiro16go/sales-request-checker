# Sales Request Assistant

営業・事業部がJiraに起票した依頼をAIでレビューし、開発に必要な情報が揃うように支援するアシスタントです。

目的は「別ツールを使わせること」ではなく、営業部が今まで通りJiraに起票したあと、Jira内で不足情報・質問・改善案を受け取れる状態を作ることです。

## 方針

- 本命: Forge appとしてJira内に導入する
- 保険: Jira AutomationからHTTP/APIまたはGitHub Actionsを呼ぶ
- 共通: レビュー本体は `src/core` に集約し、Forge/Webhook/CLIで共有する
- UI: 別Web画面は主導線にしない。Jira issue panelを使う

## MVPの動き

```text
JiraでJPREQ起票
↓
Forge Trigger または Jira Automation
↓
src/core で依頼レビュー
↓
Jiraコメントにレビュー結果を投稿
↓
Forge Issue Panelで再レビュー・コメント投稿
```

レビュー結果には次を含めます。

- 🔴 要問い直し / 🟡 要確認 / 🟢 問題なし
- 不足している項目
- 営業がそのまま答えられる質問
- Jira依頼文の改善案
- ルールベース判定結果
- LLM provider / prompt version

## セットアップ

```bash
cp .env.example .env
```

`.env`:

```bash
JIRA_BASE_URL=https://epark-tech.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token-here
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-5.2
WEBHOOK_SHARED_SECRET=change-me
ALLOWED_PROJECT_KEYS=JPREQ
# コスト制御（任意。指定しない場合は既定値を使用）
MAX_REVIEWS_PER_ISSUE_PER_DAY=5      # 1 issue あたりの AI レビュー上限/日（既定: 5）
MAX_DESCRIPTION_CHARS=8000           # OpenAI に送る description の文字数上限（既定: 8000、許容範囲: 4000〜8000）
```

現時点では暫定運用として個人アカウントのJira API tokenを利用してよい。ただし、正式運用前にサービスアカウントへ切り替えること。

## ローカル検証

### Custom UI のローカルプレビュー

`@forge/bridge` をモックしてブラウザでパネルのUIを確認できます。

```bash
npm run dev:panel
# → http://localhost:5173
```

Forge環境なしでレイアウト・スタイルを確認したいときに使います。

### coreテスト

依存なしでcoreテストを実行できます。

```bash
npm test
```

Jiraチケットをレビューする場合:

```bash
npm run review:issue -- JPREQ-1234
npm run review:issue -- JPREQ-1234 --post
```

`OPENAI_API_KEY` がない場合は、ルールベースの質問・改善案にフォールバックします。

## 本命: Forge

Forge CLIと依存関係を入れます。

```bash
npm install
npx forge login
npx forge register
npm run build:panel
npx forge deploy -e development
npx forge install --site https://epark-tech.atlassian.net --product jira -e development
```

OpenAI API keyはForge環境変数として設定します。

```bash
npx forge variables set OPENAI_API_KEY --encrypt
npx forge variables set OPENAI_MODEL gpt-5.2
npx forge variables set ALLOWED_PROJECT_KEYS JPREQ
# コスト制御（任意。既定値で運用したい場合は省略可）
npx forge variables set MAX_REVIEWS_PER_ISSUE_PER_DAY 5
npx forge variables set MAX_DESCRIPTION_CHARS 8000
```

### Linux GUIなし環境での `forge login` / `forge deploy` エラー対処

WSL / headless Linux では keytar が Secret Service に接続できず以下のエラーが出る場合があります。

```
Keytar error detected: The name org.freedesktop.secrets was not provided by any .service files
```

**回避策**: `FORGE_EMAIL` と `FORGE_API_TOKEN` 環境変数を設定すると keytar を使わずに認証できます。

```bash
export FORGE_EMAIL=your-email@example.com
export FORGE_API_TOKEN=your-atlassian-api-token   # https://id.atlassian.com/manage-profile/security/api-tokens で発行
npx forge deploy -e development
```

毎回入力が面倒な場合は `.env` に追加して `source .env` するか、`~/.bashrc` / `~/.zshrc` に書いてください。
`FORGE_API_TOKEN` はシークレットなので git にコミットしないよう注意してください（`.gitignore` 済み）。

本番化:

```bash
npm run build:panel
npx forge deploy -e production
npx forge install --upgrade --site https://your-site.atlassian.net --product jira -e production
```

Forgeで使う機能:

- `trigger`: Jira issue createdで自動レビュー
- `jira:issuePanel`: Jiraチケット内にAI依頼レビュー画面を表示
- `read:jira-work` / `write:jira-work`: チケット取得・コメント投稿
- `storage:app`: 1 issue あたりの日次レビュー回数カウンタを Forge storage に保持（`MAX_REVIEWS_PER_ISSUE_PER_DAY`）
- external egress: OpenAI API呼び出し

## コスト制御

詳細は [`docs/cost-control.md`](./docs/cost-control.md) を参照。主要な制御ノブは Forge variable で制御できる:

| 変数 | 既定 | 範囲 | 説明 |
|------|------|------|------|
| `ALLOWED_PROJECT_KEYS` | `JPREQ` | カンマ区切り | レビュー対象の Jira プロジェクトキー |
| `OPENAI_MODEL` | `gpt-5.2` | OpenAI モデル名 | コスト/品質トレードオフを切替 |
| `MAX_REVIEWS_PER_ISSUE_PER_DAY` | `5` | 正の整数 | 同一 issue への AI レビュー上限（JST 日次でリセット） |
| `MAX_DESCRIPTION_CHARS` | `8000` | 4000〜8000 | OpenAI に送る description の文字数上限。超過分は truncate + 警告 |

緊急停止は `OPENAI_API_KEY` を unset（数分でルールベースに自動降格）または `ALLOWED_PROJECT_KEYS=""` で全停止。

### 実Jiraでdevelopment版だけを検証する手順

production環境へ反映せず、実際に使っているJiraサイトへForgeのdevelopment版だけを入れて検証できます。

推奨は、Jira側に検証用Projectを用意して、そのProjectだけをレビュー対象にする方法です。例では `JPREQTEST` とします。

1. 検証用Projectを用意する

   ```text
   Project key: JPREQTEST
   ```

   既存の本番 `JPREQ` ではなく、検証用Projectで試すのが安全です。

2. 依存関係を入れる

   ```bash
   npm install
   ```

3. Forgeにログインする

   ```bash
   npx forge login
   ```

4. 初回だけForge appを登録する

   ```bash
   npx forge register
   ```

5. development環境の変数を設定する

   ```bash
   npx forge variables set OPENAI_API_KEY --encrypt -e development
   npx forge variables set OPENAI_MODEL gpt-5.2 -e development
   npx forge variables set ALLOWED_PROJECT_KEYS JPREQTEST -e development
   ```

   `ALLOWED_PROJECT_KEYS` により、TriggerやPanelの実処理は `JPREQTEST-*` 以外を対象外にします。

6. Issue Panelの表示も検証Projectに絞る

   `manifest.yml` の `jira:issuePanel` に一時的に `displayConditions` を追加します。

   ```yaml
   jira:issuePanel:
     - key: sales-request-review-panel
       resource: review-panel
       resolver:
         function: review-resolver
       title: AI依頼レビュー
       icon: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg
       displayConditions:
         projectKey: JPREQTEST
   ```

   `displayConditions` はUI表示制御です。実処理の制御は `ALLOWED_PROJECT_KEYS` 側で行います。

7. Custom UIをビルドする

   ```bash
   npm run build:panel
   ```

8. development環境へdeployする

   ```bash
   npx forge deploy -e development
   ```

9. 実Jiraサイトへdevelopment版としてinstallする

   ```bash
   npx forge install --site https://your-site.atlassian.net --product jira -e development
   ```

   この時点でproduction版ではなく、development版のForge appが実Jiraサイトに入ります。Jira上ではアプリ名に `(DEVELOPMENT)` が付きます。

10. 検証用チケットを作る

   ```text
   JPREQTEST-1
   ```

   起票後、Forge Triggerによりレビューコメントが投稿されることを確認します。Triggerイベントは即時ではなく、数分遅れることがあります。

11. Issue Panelを確認する

   `JPREQTEST-*` のチケットを開き、`AI依頼レビュー` パネルを開きます。

   - `再レビュー`: コメント投稿せずレビュー結果を表示
   - `コメント投稿`: レビュー結果をJiraコメントへ投稿

12. 検証後にdevelopment版を外す場合

   ```bash
   npx forge uninstall --site https://your-site.atlassian.net --product jira -e development
   ```

本番 `JPREQ` で試すのは、development版で動作確認し、コメント文面・対象Project・権限のレビューが終わってからにしてください。

## 保険A: Webhook adapter

Forge承認が通らない場合、Jira AutomationのSend web requestからHTTP APIを呼びます。

```bash
npm run start:webhook
```

エンドポイント:

```text
POST /jira-automation/review
Header: x-sales-request-secret: {WEBHOOK_SHARED_SECRET}
Body: Jira AutomationのIssue payload、または {"key":"JPREQ-1234"}
```

このルートはJira API tokenが必要です。正式運用時はサービスアカウントを使います。

## 保険B: GitHub Actions

`.github/workflows/sales-request-checker.yml` は `repository_dispatch` と `workflow_dispatch` に対応しています。

GitHub Secrets:

| Secret           | 用途                       |
| ---------------- | -------------------------- |
| `JIRA_BASE_URL`  | JiraサイトURL              |
| `JIRA_EMAIL`     | Jira API tokenのアカウント |
| `JIRA_API_TOKEN` | Jira API token             |
| `OPENAI_API_KEY` | LLMレビュー用              |

GitHub Variables:

| Variable       | 用途               |
| -------------- | ------------------ |
| `OPENAI_MODEL` | 省略時は `gpt-5.2` |

Jira AutomationのSend web request例:

```json
{
    "event_type": "jira-ticket-check",
    "client_payload": { "ticket_key": "{{issue.key}}" }
}
```

## 残タスク

- [ ] Jiraサービスアカウントの作成承認を取る
- [ ] `JIRA_EMAIL` / `JIRA_API_TOKEN` を個人アカウントからサービスアカウントへ切り替える
- [ ] サービスアカウントのJira権限をJPREQの閲覧・コメント投稿に絞る
- [ ] Forge導入承認を取る
- [ ] Forge production installの管理者を決める
- [ ] 投稿ログに操作ユーザーを残せる設計にする
- [ ] 過去チケットのfixtureを増やし、プロンプト変更時の回帰テストを作る

## ファイル構成

```text
.
├── manifest.yml                         # Forge app定義
├── package.json
├── src/
│   ├── core/                            # 共通レビュー本体
│   └── adapters/
│       ├── forge/                       # Forge trigger / issue panel resolver
│       ├── webhook/                     # Jira Automation webhook保険
│       └── cli/                         # ローカル/Actions検証
├── static/review-panel/                 # Forge Custom UI
├── test/
└── sales_request_checker.py             # legacy Python checker
```
