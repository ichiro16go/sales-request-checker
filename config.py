import os
from dataclasses import dataclass


@dataclass
class Config:
    base_url: str
    email: str
    api_token: str


def load() -> Config:
    base_url = os.environ.get("JIRA_BASE_URL", "").rstrip("/")
    email = os.environ.get("JIRA_EMAIL", "")
    api_token = os.environ.get("JIRA_API_TOKEN", "")

    missing = [k for k, v in [
        ("JIRA_BASE_URL", base_url),
        ("JIRA_EMAIL", email),
        ("JIRA_API_TOKEN", api_token),
    ] if not v]

    if missing:
        raise EnvironmentError(f"必須の環境変数が未設定です: {', '.join(missing)}")

    return Config(base_url=base_url, email=email, api_token=api_token)
