import base64
import json
import urllib.error
import urllib.parse
import urllib.request

import config as cfg


class JiraClient:
    def __init__(self, conf: cfg.Config):
        self.base_url = conf.base_url
        token = base64.b64encode(f"{conf.email}:{conf.api_token}".encode()).decode()
        self.headers = {
            "Authorization": f"Basic {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _request_json(
        self,
        method: str,
        path: str,
        payload: dict | None = None,
        query: dict | None = None,
    ) -> dict:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=self.headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            detail = f"HTTP {e.code} {e.reason}"
            if body:
                detail = f"{detail}: {body}"
            raise RuntimeError(detail) from e
