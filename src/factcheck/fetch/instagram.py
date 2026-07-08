"""Poszt-figyelés az Instagram Graph API Business Discovery végpontján
keresztül, mock (mintaadatos) visszaeséssel, ha nincs beállítva token.

FONTOS - mire NEM alkalmas ez a modul:
  - Nem scrapel, nem használ nem-hivatalos/privát API-kat.
  - A Business Discovery API kizárólag NYILVÁNOS, business/creator típusú
    IG-fiókok alap statisztikáit és médiáit adja vissza, felhasználónév
    alapján, a SAJÁT business/creator fiókodhoz tartozó access tokennel.
  - Ha a figyelt politikus fiókja nem business/creator típusú, az API
    nem fogja visszaadni - ilyenkor kézi/beküldéses figyelésre van
    szükség (ld. README "Korlátok" szakasz).
"""

from __future__ import annotations

import requests

from factcheck import config
from factcheck.fetch import sample_data
from factcheck.models import Post

GRAPH_API_VERSION = "v19.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class InstagramFetchError(RuntimeError):
    pass


def fetch_recent_posts(username: str, limit: int = 5) -> list[Post]:
    """Egy figyelt fiók legutóbbi nyilvános posztjainak lekérése.

    Ha nincs beállítva IG_ACCESS_TOKEN/IG_BUSINESS_ACCOUNT_ID, mock módra
    esik vissza és a sample_data-ból adja vissza az adott felhasználóhoz
    tartozó mintaposztokat (demó célra).
    """
    access_token, business_account_id = config.ig_credentials()
    if not access_token or not business_account_id:
        return [p for p in sample_data.SAMPLE_POSTS if p.account_username == username]

    fields = (
        f"business_discovery.username({username})"
        f"{{username,media.limit({limit})"
        f"{{id,caption,permalink,timestamp,like_count,comments_count}}}}"
    )
    resp = requests.get(
        f"{GRAPH_API_BASE}/{business_account_id}",
        params={"fields": fields, "access_token": access_token},
        timeout=15,
    )
    if resp.status_code != 200:
        raise InstagramFetchError(
            f"Business Discovery API hiba ({resp.status_code}): {resp.text[:300]}"
        )

    data = resp.json().get("business_discovery", {})
    display_name = data.get("username", username)
    posts: list[Post] = []
    for media in data.get("media", {}).get("data", []):
        posts.append(
            Post(
                id=media["id"],
                account_username=username,
                account_display_name=display_name,
                caption=media.get("caption", ""),
                permalink=media.get("permalink", ""),
                posted_at=media.get("timestamp", ""),
                like_count=media.get("like_count", 0),
                comment_count=media.get("comments_count", 0),
            )
        )
    return posts


def fetch_all(accounts: list[dict], limit_per_account: int = 5) -> list[Post]:
    all_posts: list[Post] = []
    for account in accounts:
        all_posts.extend(fetch_recent_posts(account["username"], limit_per_account))
    if not accounts:
        all_posts.extend(sample_data.SAMPLE_POSTS)
    return all_posts


def is_popular(post: Post, min_likes: int = 500) -> bool:
    return post.like_count >= min_likes
