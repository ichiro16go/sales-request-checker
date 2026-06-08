"""
sales_request_web.py — 営業依頼チケット情報不足チェックのWeb UI

使い方:
  python3 sales_request_web.py
  python3 sales_request_web.py --host 0.0.0.0 --port 8080
"""

import argparse
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from sales_request_checker import check_ticket


ROOT = Path(__file__).resolve().parent
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8080


def load_dotenv(path: Path = ROOT / ".env") -> None:
    """python-dotenvを入れずにローカルの.envだけ読む。既存環境変数を優先する。"""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def verdict_label(verdict: str) -> str:
    if verdict == "🔴":
        return "要問い直し"
    if verdict == "🟡":
        return "要確認"
    return "問題なし"


def public_payload(checked: dict) -> dict:
    result = checked["result"]
    return {
        **checked,
        "verdict_label": verdict_label(result["verdict"]),
        "categories": [
            {"title": "基本情報", "items": result["cat1"]},
            {"title": "前提条件", "items": result["cat2"]},
            {"title": "要件・希望内容", "items": result["cat3"]},
            {"title": "確認推奨項目", "items": result["cat4"]},
        ],
    }


INDEX_HTML = """<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>営業依頼 情報不足チェック</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --line: #d9dee7;
      --text: #1e2329;
      --muted: #626b78;
      --blue: #2463eb;
      --red: #c9342e;
      --yellow: #b7791f;
      --green: #14804a;
      --shadow: 0 12px 32px rgba(33, 41, 54, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      background: #ffffff;
      border-bottom: 1px solid var(--line);
    }
    .wrap {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }
    .top {
      min-height: 76px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 720;
      letter-spacing: 0;
    }
    .sub {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }
    main {
      padding: 24px 0 44px;
    }
    .search {
      display: grid;
      grid-template-columns: minmax(180px, 280px) auto max-content;
      gap: 12px;
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 16px;
    }
    input[type="text"] {
      width: 100%;
      height: 44px;
      border: 1px solid #bfc7d3;
      border-radius: 6px;
      padding: 0 12px;
      font-size: 16px;
      letter-spacing: 0;
      text-transform: uppercase;
      background: #fff;
    }
    label.check {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 14px;
      min-height: 44px;
    }
    button {
      height: 44px;
      border: 0;
      border-radius: 6px;
      background: var(--blue);
      color: white;
      padding: 0 18px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    button:disabled {
      opacity: 0.55;
      cursor: wait;
    }
    .message {
      margin-top: 14px;
      min-height: 22px;
      color: var(--muted);
      font-size: 14px;
    }
    .message.error { color: var(--red); }
    .result {
      display: none;
      margin-top: 18px;
      gap: 16px;
      grid-template-columns: minmax(0, 1fr) 360px;
      align-items: start;
    }
    .result.show { display: grid; }
    .summary, .side {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .summary-head {
      padding: 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }
    .ticket {
      min-width: 0;
    }
    .ticket a {
      display: inline-block;
      color: var(--blue);
      font-weight: 760;
      text-decoration: none;
      margin-bottom: 6px;
      overflow-wrap: anywhere;
    }
    .ticket-title {
      font-size: 18px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .meta {
      margin-top: 7px;
      color: var(--muted);
      font-size: 13px;
    }
    .badge {
      min-width: 132px;
      text-align: center;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 15px;
      font-weight: 800;
      border: 1px solid var(--line);
      background: #f8fafc;
    }
    .badge.red { color: var(--red); border-color: #f0bab6; background: #fff3f2; }
    .badge.yellow { color: var(--yellow); border-color: #f0d59b; background: #fff8e6; }
    .badge.green { color: var(--green); border-color: #a8ddb8; background: #effaf3; }
    .reason {
      padding: 12px 18px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 14px;
    }
    .categories {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0;
    }
    .category {
      padding: 18px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      min-width: 0;
    }
    .category:nth-child(2n) { border-right: 0; }
    .category h2 {
      margin: 0 0 12px;
      font-size: 15px;
      letter-spacing: 0;
    }
    .item {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr);
      gap: 8px;
      padding: 9px 0;
      border-top: 1px solid #edf0f5;
    }
    .item:first-of-type { border-top: 0; }
    .status {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 6px;
      background: #f2f4f8;
      font-size: 14px;
    }
    .label {
      font-weight: 680;
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .detail {
      color: var(--muted);
      font-size: 13px;
      margin-top: 2px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .side {
      padding: 16px;
      position: sticky;
      top: 16px;
    }
    .side h2 {
      margin: 0 0 10px;
      font-size: 15px;
    }
    textarea {
      width: 100%;
      min-height: 300px;
      resize: vertical;
      border: 1px solid #c8d0dc;
      border-radius: 6px;
      padding: 12px;
      font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--text);
      background: #fbfcfe;
    }
    .post-note {
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    @media (max-width: 860px) {
      .search, .result, .categories {
        grid-template-columns: 1fr;
      }
      .summary-head {
        display: block;
      }
      .badge {
        width: 100%;
        margin-top: 14px;
      }
      .category {
        border-right: 0;
      }
      .side {
        position: static;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap top">
      <div>
        <h1>営業依頼 情報不足チェック</h1>
        <div class="sub">JPREQチケットの記載状況を確認し、不足項目と問い直し文面を表示します。</div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <form class="search" id="form">
      <input id="ticket" type="text" inputmode="latin" autocomplete="off" placeholder="JPREQ-1234" aria-label="チケットキー">
      <label class="check"><input id="post" type="checkbox"> Jiraにコメント投稿する</label>
      <button id="run" type="submit">チェック実行</button>
    </form>
    <div id="message" class="message"></div>
    <section id="result" class="result" aria-live="polite">
      <div class="summary">
        <div class="summary-head">
          <div class="ticket">
            <a id="jiraLink" href="#" target="_blank" rel="noreferrer"></a>
            <div id="title" class="ticket-title"></div>
            <div id="meta" class="meta"></div>
          </div>
          <div id="badge" class="badge"></div>
        </div>
        <div id="reason" class="reason"></div>
        <div id="categories" class="categories"></div>
      </div>
      <aside class="side">
        <h2>問い直し文面</h2>
        <textarea id="requery" readonly></textarea>
        <div id="postNote" class="post-note"></div>
      </aside>
    </section>
  </main>
  <script>
    const form = document.querySelector("#form");
    const ticket = document.querySelector("#ticket");
    const post = document.querySelector("#post");
    const run = document.querySelector("#run");
    const message = document.querySelector("#message");
    const result = document.querySelector("#result");
    const categories = document.querySelector("#categories");

    function text(node, value) {
      node.textContent = value || "";
    }

    function badgeClass(verdict) {
      if (verdict === "🔴") return "badge red";
      if (verdict === "🟡") return "badge yellow";
      return "badge green";
    }

    function render(data) {
      const jiraLink = document.querySelector("#jiraLink");
      const res = data.result;
      jiraLink.href = data.jira_url;
      text(jiraLink, data.issue_key);
      text(document.querySelector("#title"), data.title);
      text(document.querySelector("#meta"), `ステータス: ${data.status || "未設定"} / チェック: ${data.checked_at}`);
      const badge = document.querySelector("#badge");
      badge.className = badgeClass(res.verdict);
      text(badge, `${res.verdict} ${data.verdict_label}`);
      text(document.querySelector("#reason"), res.reason);
      text(document.querySelector("#requery"), data.requery_text || "不足項目はありません。");

      categories.innerHTML = "";
      for (const category of data.categories) {
        const section = document.createElement("section");
        section.className = "category";
        const heading = document.createElement("h2");
        heading.textContent = category.title;
        section.appendChild(heading);
        for (const item of category.items) {
          const row = document.createElement("div");
          row.className = "item";
          row.innerHTML = `<div class="status"></div><div><div class="label"></div><div class="detail"></div></div>`;
          row.querySelector(".status").textContent = item.status;
          row.querySelector(".label").textContent = item.label;
          row.querySelector(".detail").textContent = item.detail;
          section.appendChild(row);
        }
        categories.appendChild(section);
      }

      const note = data.posted
        ? "Jiraコメントを投稿しました。"
        : data.post_skipped_reason
          ? `Jiraコメントは投稿していません。${data.post_skipped_reason}`
          : post.checked
            ? "Jiraコメントは投稿していません。"
            : "投稿チェックを入れると、同じ内容をJiraコメントに投稿できます。";
      text(document.querySelector("#postNote"), note);
      result.classList.add("show");
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.className = "message";
      text(message, "確認しています...");
      run.disabled = true;
      try {
        const response = await fetch("/api/check", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ticket: ticket.value, post: post.checked})
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "チェックに失敗しました。");
        }
        render(data);
        text(message, "");
      } catch (error) {
        message.className = "message error";
        text(message, error.message);
      } finally {
        run.disabled = false;
      }
    });
  </script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "SalesRequestChecker/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def write_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/" or self.path.startswith("/?"):
            body = INDEX_HTML.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/healthz":
            self.write_json(HTTPStatus.OK, {"ok": True})
            return
        self.write_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_HEAD(self) -> None:
        if self.path == "/" or self.path.startswith("/?"):
            body = INDEX_HTML.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return
        if self.path == "/healthz":
            body = json.dumps({"ok": True}).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return
        self.send_response(HTTPStatus.NOT_FOUND)
        self.end_headers()

    def do_POST(self) -> None:
        if self.path != "/api/check":
            self.write_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            ticket = str(payload.get("ticket", "")).strip()
            post = bool(payload.get("post", False))
            if not ticket:
                raise ValueError("チケットキーを入力してください。")
            checked = check_ticket(ticket, post=post)
            self.write_json(HTTPStatus.OK, public_payload(checked))
        except ValueError as exc:
            self.write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except EnvironmentError as exc:
            self.write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"設定エラー: {exc}"})
        except Exception as exc:
            self.write_json(HTTPStatus.BAD_GATEWAY, {"error": f"Jira APIエラー: {exc}"})


def main() -> None:
    parser = argparse.ArgumentParser(description="営業依頼チケット情報不足チェック Web UI")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"listen host (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"listen port (default: {DEFAULT_PORT})")
    args = parser.parse_args()

    load_dotenv()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Serving on http://{args.host}:{args.port}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
