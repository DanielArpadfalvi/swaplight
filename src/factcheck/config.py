from __future__ import annotations

import os
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
REVIEW_QUEUE_DIR = DATA_DIR / "review_queue"
GENERATED_IMAGES_DIR = DATA_DIR / "generated_images"
ACCOUNTS_FILE = REPO_ROOT / "config" / "accounts.yaml"


def load_dotenv(path: Path | None = None) -> None:
    """Minimal .env loader (nincs külső 'python-dotenv' függőség)."""
    env_path = path or (REPO_ROOT / ".env")
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def load_accounts() -> list[dict]:
    if not ACCOUNTS_FILE.exists():
        return []
    data = yaml.safe_load(ACCOUNTS_FILE.read_text()) or {}
    return data.get("accounts", [])


def anthropic_api_key() -> str | None:
    return os.environ.get("ANTHROPIC_API_KEY") or None


def anthropic_model() -> str:
    return os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")


def ig_credentials() -> tuple[str | None, str | None]:
    return os.environ.get("IG_ACCESS_TOKEN"), os.environ.get("IG_BUSINESS_ACCOUNT_ID")
