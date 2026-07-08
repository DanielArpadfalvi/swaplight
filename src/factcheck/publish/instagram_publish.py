"""Publikálás a SAJÁT Instagram business/creator fiókra a Content
Publishing API-n keresztül. Ez teljesen ToS-kompatibilis - a saját
tartalmadat teszed közzé, nem másokét.

FONTOS KORLÁT: a Graph API carousel-posztokhoz publikusan elérhető
image_url-t vár képenként (nem fájlfeltöltést) - éles használatban a
renderelt slide-okat előbb fel kell tölteni egy publikus tárhelyre
(pl. S3 + CloudFront), és az így kapott URL-eket kell átadni ennek a
függvénynek. Ez a prototípus emiatt access token/URL hiányában mindig
"dry run" módban fut, és csak leírja, milyen API-hívásokat tenne meg.
"""

from __future__ import annotations

import requests

from factcheck import config
from factcheck.models import Draft

GRAPH_API_VERSION = "v19.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class PublishError(RuntimeError):
    pass


def publish_draft(draft: Draft, image_urls: list[str] | None = None) -> dict:
    if draft.status != "approved":
        raise PublishError(
            f"Csak 'approved' státuszú draft publikálható (jelenlegi: {draft.status})."
        )

    access_token, business_account_id = config.ig_credentials()
    if not access_token or not business_account_id or not image_urls:
        return _dry_run(draft, image_urls)

    child_ids = []
    for url in image_urls:
        resp = requests.post(
            f"{GRAPH_API_BASE}/{business_account_id}/media",
            data={
                "image_url": url,
                "is_carousel_item": "true",
                "access_token": access_token,
            },
            timeout=30,
        )
        _raise_for_graph_error(resp)
        child_ids.append(resp.json()["id"])

    carousel_resp = requests.post(
        f"{GRAPH_API_BASE}/{business_account_id}/media",
        data={
            "media_type": "CAROUSEL",
            "caption": draft.caption,
            "children": ",".join(child_ids),
            "access_token": access_token,
        },
        timeout=30,
    )
    _raise_for_graph_error(carousel_resp)
    container_id = carousel_resp.json()["id"]

    publish_resp = requests.post(
        f"{GRAPH_API_BASE}/{business_account_id}/media_publish",
        data={"creation_id": container_id, "access_token": access_token},
        timeout=30,
    )
    _raise_for_graph_error(publish_resp)
    return publish_resp.json()


def _raise_for_graph_error(resp: requests.Response) -> None:
    if resp.status_code != 200:
        raise PublishError(f"Graph API hiba ({resp.status_code}): {resp.text[:300]}")


def _dry_run(draft: Draft, image_urls: list[str] | None) -> dict:
    print("=== DRY RUN: nincs IG_ACCESS_TOKEN/IG_BUSINESS_ACCOUNT_ID vagy image_urls ===")
    print(f"Draft: {draft.id}  (forrás poszt: {draft.source_post.permalink})")
    print(f"Caption:\n{draft.caption}\n")
    print(f"Slide-ok száma: {len(draft.slides)}")
    for idx, slide in enumerate(draft.slides, start=1):
        print(f"--- Slide {idx} ---\n{slide}\n")
    if image_urls:
        print(f"Képek (publikáláshoz felhasználva lennének): {image_urls}")
    else:
        print(
            "Nincs publikus image_url a slide-okhoz - tölts fel egy publikus "
            "tárhelyre (S3/CloudFront) és add át image_urls=[...] paraméterként."
        )
    return {"dry_run": True, "draft_id": draft.id}
