# 営業依頼チケット 情報不足チェック

JPREQ の営業・事業部依頼チケットについて、開発着手前に必要な情報が揃っているかをチェックするツールです。

ブラウザで使うWeb UIと、Jira Automation / GitHub Actions から呼び出すCLIの両方を提供します。

## 機能

- JPREQチケットのsummary / description / reporter / priority / due date / attachment / issue linkを取得
- 基本情報、前提条件、要件、確認推奨項目をキーワードベースで評価
- 🔴 要問い直し / 🟡 要確認 / 🟢 問題なし の3段階で判定
- 不足項目に応じた問い直し文面を生成
- 任意でJiraコメントに結果を投稿
- 直近コメントに `[sales-request-checker v1]` がある場合は重複投稿をスキップ

## セットアップ

```bash
cp .env.example .env
```

`.env` にJira接続情報を設定します。

```bash
JIRA_BASE_URL=https://epark-tech.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token-here
```

## Web UI

```bash
python3 sales_request_web.py
```

起動後、ブラウザで `http://127.0.0.1:8080` を開きます。

他の端末から使う場合:

```bash
python3 sales_request_web.py --host 0.0.0.0 --port 8080
```

社内向けに公開する場合は、このPythonサーバーの前段に社内認証・HTTPS・アクセス制限を置いてください。

## CLI

```bash
# チェックのみ
python3 sales_request_checker.py JPREQ-1234

# Jiraコメントにも投稿
python3 sales_request_checker.py JPREQ-1234 --post
```

## GitHub Actions

`.github/workflows/sales-request-checker.yml` は次の2つの起動方法に対応しています。

- `workflow_dispatch`: GitHub UIから手動実行
- `repository_dispatch`: Jira Automationから起票時に呼び出し

GitHub Actions secrets:

| Secret | 用途 |
| --- | --- |
| `JIRA_BASE_URL` | JiraサイトURL |
| `JIRA_EMAIL` | Atlassianアカウントのメールアドレス |
| `JIRA_API_TOKEN` | Jira APIトークン |

Jira Automation のSend web request例:

- URL: `https://api.github.com/repos/{owner}/{repo}/dispatches`
- Method: `POST`
- Body:

```json
{"event_type": "jira-ticket-check", "client_payload": {"ticket_key": "{{issue.key}}"}}
```

リポジトリを分けた後は、Jira Automation の送信先URLをこのリポジトリのActions APIに変更してください。

## ファイル構成

```text
.
├── .env.example
├── .github/workflows/sales-request-checker.yml
├── config.py
├── jira_client.py
├── sales_request_checker.py
└── sales_request_web.py
```
# sales-request-checker
