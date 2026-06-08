"""
sales_request_checker.py — 営業・事業部依頼チケットの情報不足自動チェック

使い方:
  python3 sales_request_checker.py JPREQ-XXXX          # dry-run (CLIのみ出力)
  python3 sales_request_checker.py JPREQ-XXXX --post   # Jiraコメントにも投稿

SKILL.md (sales-request-checker) のチェックロジックをPythonで実装したもの。
GitHub Actions の repository_dispatch から呼び出されることを想定。
"""

import argparse
import sys
from datetime import datetime, timezone, timedelta

import config as cfg
from jira_client import JiraClient

# ---------------------------------------------------------------------------
# 定数・キーワード
# ---------------------------------------------------------------------------

JST = timezone(timedelta(hours=9))
CLOSE_STATUSES = ("Done", "完了", "Close", "Resolved", "解決済", "解決済み", "リリース済み")
MARKER = "[sales-request-checker v1]"

# ① 基本情報
SERVICE_KEYWORDS = [
    "justpass", "faspa", "epark", "グルメ", "画面", "機能", "システム", "サービス",
    "ページ", "管理画面", "アプリ", "サイト", "api",
]
REQUEST_KEYWORDS = [
    "したい", "してほしい", "変更", "追加", "修正", "改善", "対応", "お願い", "要望",
    "してください", "欲しい",
]
DATE_KEYWORDS = [
    "月", "週", "年", "まで", "以内", "期限", "リリース", "deadline", "納期", "希望日",
]

# ② 前提条件（必須4項目）
AS_IS_KEYWORDS = [
    "現状", "現在", "今は", "今の", "as-is", "as is", "今現在", "現時点", "現行", "今まで",
    "これまで", "従来",
]
CONDITION_KEYWORDS = [
    "いつ", "場合", "とき", "時に", "条件", "状況", "発生", "なると", "すると",
    "タイミング", "際に", "ケース", "パターン",
]
SCOPE_KEYWORDS = [
    "対象", "ユーザー", "店舗", "範囲", "全体", "全て", "すべて", "一部", "該当",
    "全店", "全ユーザー", "特定", "限定",
]
BACKGROUND_KEYWORDS = [
    "理由", "背景", "なぜ", "ため", "から", "ので", "目的", "課題", "問題", "要因",
    "経緯", "きっかけ", "依頼", "お客様", "営業", "問い合わせ",
]

# ③ 要件
TOBE_KEYWORDS = [
    "したい", "してほしい", "変更後", "to-be", "to be", "希望", "なってほしい",
    "改善後", "できるように", "になるよう", "表示", "変わる",
]
GOAL_KEYWORDS = [
    "できる", "なる", "期待", "目的", "ゴール", "効果", "改善", "解決", "削減",
    "向上", "防ぐ", "なくなる", "増える",
]


# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------

def _contains_any(text: str, keywords: list[str]) -> bool:
    t = text.lower()
    return any(k.lower() in t for k in keywords)


def _now_jst() -> str:
    return datetime.now(tz=JST).strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------------------
# チェックロジック
# ---------------------------------------------------------------------------

def _check_item(ok: bool | None, label: str, detail: str) -> dict:
    """判定結果を辞書で返す。ok=None は N/A"""
    status = "✅" if ok is True else ("❌" if ok is False else "N/A")
    return {"status": status, "label": label, "detail": detail}


def analyze(issue: dict) -> dict:
    """
    Jiraチケット情報を受け取り、各カテゴリのチェック結果を返す。
    返り値: {"cat1": [...], "cat2": [...], ..., "verdict": str, "reason": str}
    """
    fields = issue.get("fields", {})
    summary = fields.get("summary", "") or ""
    description = fields.get("description") or ""
    # ADF (Atlassian Document Format) の場合はテキストを抽出
    if isinstance(description, dict):
        description = _extract_adf_text(description)
    full_text = f"{summary}\n{description}"

    reporter = (fields.get("reporter") or {}).get("displayName", "")
    priority_name = (fields.get("priority") or {}).get("name", "")
    duedate = fields.get("duedate") or ""
    attachments = fields.get("attachment") or []
    issue_links = fields.get("issuelinks") or []

    # ── ① 基本情報 ──────────────────────────────────────────
    cat1 = [
        _check_item(
            bool(reporter),
            "依頼者・部署",
            f"reporter = {reporter}" if reporter else "reporterが未設定",
        ),
        _check_item(
            _contains_any(full_text, SERVICE_KEYWORDS),
            "対象サービス・機能",
            "サービス名または機能名の記載あり" if _contains_any(full_text, SERVICE_KEYWORDS)
            else "対象サービス・機能名の記載なし",
        ),
        _check_item(
            _contains_any(description, REQUEST_KEYWORDS),
            "依頼概要（何をしたいか）",
            "依頼内容の記載あり" if _contains_any(description, REQUEST_KEYWORDS)
            else "何をしたいかが読み取れない",
        ),
        _check_item(
            bool(duedate) or _contains_any(description, DATE_KEYWORDS),
            "対応期限",
            f"duedate = {duedate}" if duedate
            else ("本文に期日の記載あり" if _contains_any(description, DATE_KEYWORDS)
                  else "期限・時期の記載なし"),
        ),
    ]
    # 対応期限は「急ぎ」のみ → ⚠️
    if not duedate and _contains_any(description, ["急ぎ", "早急", "なるべく早く", "asap"]):
        cat1[3] = {"status": "⚠️", "label": "対応期限", "detail": "「急ぎ」とあるが具体的な日付なし"}

    # ── ② 前提条件（必須4項目） ──────────────────────────────
    has_asis = _contains_any(description, AS_IS_KEYWORDS)
    has_condition = _contains_any(description, CONDITION_KEYWORDS)
    has_scope = _contains_any(description, SCOPE_KEYWORDS)
    has_background = _contains_any(description, BACKGROUND_KEYWORDS)
    has_links = bool(issue_links) or _contains_any(description, ["jpreq-", "epgprd-", "justpass-", "関連チケット", "依存"])

    cat2 = [
        _check_item(has_asis, "現状（As-Is）",
                    "現状の記載あり" if has_asis else "現状の記載なし"),
        _check_item(has_condition, "発生条件",
                    "発生条件の記載あり" if has_condition else "「いつ/どんな状況で」が読み取れない"),
        _check_item(has_scope, "対象範囲",
                    "対象範囲の記載あり" if has_scope else "対象ユーザー・店舗・期間の記載なし"),
        _check_item(has_background, "背景・理由",
                    "背景・理由の記載あり" if has_background else "なぜ今この依頼が必要かの記載なし"),
        {"status": "✅" if has_links else "N/A",
         "label": "他機能への依存",
         "detail": "issuelinksまたは本文に依存関係の言及あり" if has_links else "依存関係の言及なし（N/A）"},
    ]

    # ── ③ 要件・希望内容 ────────────────────────────────────
    has_tobe = _contains_any(description, TOBE_KEYWORDS)
    has_goal = _contains_any(description, GOAL_KEYWORDS)
    cat3 = [
        _check_item(has_tobe, "変更後（To-Be）",
                    "To-Beの記載あり" if has_tobe else "どうなってほしいかの記載なし"),
        _check_item(bool(priority_name), "優先度",
                    f"priority = {priority_name}" if priority_name else "priorityフィールド未設定"),
        _check_item(has_goal, "ゴール・期待成果",
                    "期待成果の記載あり" if has_goal else "ゴール・期待成果の記載なし"),
    ]

    # ── ④ 確認推奨項目（任意） ─────────────────────────────
    cat4 = [
        {"status": "✅" if attachments else "❌",
         "label": "スクリーンショット・資料",
         "detail": f"{len(attachments)}件の添付あり" if attachments else "添付なし"},
        {"status": "✅" if issue_links else "N/A",
         "label": "類似・関連チケット番号",
         "detail": f"{len(issue_links)}件のリンクあり" if issue_links else "issuelinksなし（N/A）"},
        {"status": "N/A", "label": "影響範囲の規模感", "detail": "自動判定不可"},
        {"status": "N/A", "label": "関係者・承認者", "detail": "自動判定不可"},
    ]

    # ── 最終判定 ─────────────────────────────────────────
    # ②必須4項目（As-Is・発生条件・対象範囲・背景）のうち1つでも❌ → 🔴
    required_cat2 = [cat2[0], cat2[1], cat2[2], cat2[3]]
    cat2_ng = [item for item in required_cat2 if item["status"] == "❌"]

    # ①③の必須項目の過半数（2項目以上）が❌ → 🔴
    required_cat1 = cat1  # 4項目
    required_cat3 = cat3  # 3項目
    cat13_ng = [item for item in required_cat1 + required_cat3 if item["status"] == "❌"]

    has_warnings = any(
        item["status"] == "⚠️"
        for items in [cat1, cat2, cat3]
        for item in items
    )

    if cat2_ng:
        verdict = "🔴"
        reason = f"②前提条件の必須項目（{'・'.join(i['label'] for i in cat2_ng)}）に記載なし"
    elif len(cat13_ng) >= 2:
        verdict = "🔴"
        reason = f"①③の必須項目（{'・'.join(i['label'] for i in cat13_ng)}）が複数不足"
    elif has_warnings:
        verdict = "🟡"
        reason = "必須項目はそろっているが⚠️の項目あり（確認推奨）"
    else:
        verdict = "🟢"
        reason = "①〜③の全必須項目に記載あり"

    return {
        "cat1": cat1,
        "cat2": cat2,
        "cat3": cat3,
        "cat4": cat4,
        "verdict": verdict,
        "reason": reason,
        "missing_labels": [i["label"] for i in cat2_ng] + [i["label"] for i in cat13_ng],
    }


def _extract_adf_text(adf: dict) -> str:
    """Atlassian Document Format (ADF) からプレーンテキストを抽出"""
    texts = []
    if isinstance(adf, dict):
        if adf.get("type") == "text":
            texts.append(adf.get("text", ""))
        for child in adf.get("content", []):
            texts.append(_extract_adf_text(child))
    return " ".join(texts)


# ---------------------------------------------------------------------------
# 問い直しテキスト生成
# ---------------------------------------------------------------------------

def _build_requery_text(result: dict) -> str:
    missing = result["missing_labels"]
    if not missing:
        return ""
    lines = [
        "お疲れ様です。いただいた依頼について、開発チームへの起票に必要な情報を確認させてください。",
        "",
    ]
    label_to_question = {
        "現状（As-Is）": "▶ 現状について\n現在どのような状態・動作になっていますか？（スクリーンショットがあると助かります）",
        "発生条件": "▶ 発生条件について\nこの問題・要望はいつ/どのような状況で発生しますか？",
        "対象範囲": "▶ 対象範囲について\n対象はどのユーザー・店舗・期間ですか？全体ですか、特定の条件がありますか？",
        "背景・理由": "▶ 背景・理由について\nなぜ今この対応が必要ですか？（問い合わせ増加・業務影響など）",
        "変更後（To-Be）": "▶ 変更後の状態について\n対応後にどのような状態になっていてほしいですか？",
        "ゴール・期待成果": "▶ 期待成果について\nこの対応によってどのような効果・改善を期待していますか？",
        "対応期限": "▶ 対応期限について\n希望時期を具体的に教えてください。（例：〇月中、〇月〇日まで）",
        "対象サービス・機能": "▶ 対象について\nどのサービス・画面・機能についての依頼ですか？",
    }
    for label in missing:
        if label in label_to_question:
            lines.append(label_to_question[label])
            lines.append("")
    lines.append("以上、よろしくお願いします。")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# フォーマット
# ---------------------------------------------------------------------------

def _format_items(items: list[dict]) -> list[str]:
    lines = []
    for item in items:
        s = item["status"]
        label = item["label"].ljust(20)
        lines.append(f"  {s} {label}: {item['detail']}")
    return lines


def format_cli(issue_key: str, title: str, result: dict) -> str:
    now = _now_jst()
    requery = _build_requery_text(result)
    lines = [
        "━" * 55,
        "📋 情報不足チェック結果",
        "━" * 55,
        f"チケット : {issue_key}  {title}",
        f"チェック : {now} by GitHub Copilot",
        "",
        "① 基本情報（必須）",
    ]
    lines += _format_items(result["cat1"])
    lines += ["", "② 前提条件（必須・要注意）"]
    lines += _format_items(result["cat2"])
    lines += ["", "③ 要件・希望内容（必須）"]
    lines += _format_items(result["cat3"])
    lines += ["", "④ 確認推奨項目（任意）"]
    lines += _format_items(result["cat4"])
    lines += [
        "",
        "━" * 55,
        f"判定: {result['verdict']}  {'要問い直し' if result['verdict'] == '🔴' else '要確認' if result['verdict'] == '🟡' else '問題なし'}",
        f"理由: {result['reason']}",
        "━" * 55,
    ]
    if requery:
        lines += ["", "💬 問い直し推奨テキスト:", "---", requery, "---"]
    lines.append("")
    lines.append("[dry-run] --post を付けると上記の結果をJiraコメントに投稿します。")
    return "\n".join(lines)


def format_jira_comment(issue_key: str, title: str, result: dict) -> str:
    now = _now_jst()
    requery = _build_requery_text(result)

    def items_md(items: list[dict]) -> str:
        return "\n".join(
            f"* {i['status']} **{i['label']}**: {i['detail']}"
            for i in items
        )

    verdict_label = "要問い直し" if result["verdict"] == "🔴" else "要確認" if result["verdict"] == "🟡" else "問題なし"

    sections = [
        f"{MARKER} {now} 自動評価",
        "",
        f"## 判定サマリー",
        f"{result['verdict']} {verdict_label} | {result['reason']}",
        "",
        "## チェック結果",
        "",
        "### ① 基本情報",
        items_md(result["cat1"]),
        "",
        "### ② 前提条件（必須・要注意）",
        items_md(result["cat2"]),
        "",
        "### ③ 要件・希望内容",
        items_md(result["cat3"]),
        "",
        "### ④ 確認推奨項目（任意）",
        items_md(result["cat4"]),
    ]
    if requery:
        sections += [
            "",
            "## 不足項目と問い直しテキスト",
            "```",
            requery,
            "```",
        ]
    sections += [
        "",
        "---",
        "*このコメントはGitHub Actions (sales-request-checker) により自動生成されました。*",
        "*判定は記載内容のキーワードベースです。実態と異なる場合は手動で修正してください。*",
    ]
    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Jira操作
# ---------------------------------------------------------------------------

def get_issue(client: JiraClient, key: str) -> dict:
    fields = [
        "summary", "description", "reporter", "priority", "duedate",
        "status", "issuelinks", "attachment",
    ]
    payload = {"jql": f"key = {key}", "fields": fields, "maxResults": 1}
    data = client._request_json("POST", "/rest/api/3/search/jql", payload=payload)
    issues = data.get("issues", [])
    if not issues:
        raise ValueError(f"チケット {key} が見つかりません")
    return issues[0]


def has_recent_marker(client: JiraClient, key: str) -> bool:
    """直近のコメントに既にマーカーがあるか確認"""
    data = client._request_json(
        "GET", f"/rest/api/3/issue/{key}/comment",
        query={"maxResults": 5, "orderBy": "-created"},
    )
    for comment in data.get("comments", []):
        body = comment.get("body", "")
        if isinstance(body, dict):
            body = _extract_adf_text(body)
        if MARKER in body:
            return True
    return False


def post_comment(client: JiraClient, key: str, comment_text: str) -> None:
    payload = {
        "body": {
            "type": "doc",
            "version": 1,
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": comment_text}],
                }
            ],
        }
    }
    client._request_json("POST", f"/rest/api/3/issue/{key}/comment", payload=payload)


def check_ticket(ticket: str, post: bool = False) -> dict:
    """チケットを評価し、CLI/Webの両方で扱いやすい構造化結果を返す。"""
    key = ticket.strip().upper()
    if not key.startswith("JPREQ-"):
        raise ValueError(f"対象は JPREQ-* チケットのみです（指定: {key}）")

    conf = cfg.load()
    client = JiraClient(conf)
    issue = get_issue(client, key)

    fields = issue.get("fields", {})
    title = fields.get("summary", "（タイトルなし）")
    status_name = (fields.get("status") or {}).get("name", "")
    is_closed = status_name in CLOSE_STATUSES

    result = analyze(issue)
    response = {
        "issue_key": key,
        "title": title,
        "status": status_name,
        "is_closed": is_closed,
        "checked_at": _now_jst(),
        "result": result,
        "requery_text": _build_requery_text(result),
        "jira_url": f"{conf.base_url}/browse/{key}",
        "posted": False,
        "post_skipped_reason": "",
    }

    if not post:
        return response

    if is_closed:
        response["post_skipped_reason"] = f"ステータスが '{status_name}' のためコメントは投稿しません。"
        return response

    try:
        if has_recent_marker(client, key):
            response["post_skipped_reason"] = f"直近のコメントに既に {MARKER} があります。"
            return response
    except Exception:
        pass

    post_comment(client, key, format_jira_comment(key, title, result))
    response["posted"] = True
    return response


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="営業依頼チケットの情報不足チェック")
    parser.add_argument("ticket", help="チケットキー（例: JPREQ-1234）")
    parser.add_argument("--post", action="store_true", help="Jiraコメントに結果を投稿する")
    args = parser.parse_args()

    try:
        checked = check_ticket(args.ticket, post=args.post)
    except ValueError as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)
    except EnvironmentError as e:
        print(f"❌ 設定エラー: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ APIエラー: {e}", file=sys.stderr)
        sys.exit(1)

    print(format_cli(checked["issue_key"], checked["title"], checked["result"]))

    if not args.post:
        return

    if checked["posted"]:
        print(f"✅ {checked['issue_key']} にコメントを投稿しました。")
    elif checked["post_skipped_reason"]:
        print(f"⚠️ {checked['post_skipped_reason']} スキップします。")


if __name__ == "__main__":
    main()
