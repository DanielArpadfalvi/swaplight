"""Fájl-alapú (JSON) review queue. Egyszerű, de teljesen elég egy
prototípushoz: minden draft egy JSON fájl a data/review_queue/<status>/
könyvtárban. Ember-a-hurokban jóváhagyás nélkül semmi nem juthat el a
publish lépésig.
"""

from __future__ import annotations

import json

from factcheck import config
from factcheck.models import Claim, Draft, Evidence, FactCheckResult, Post, Verdict

STATUSES = ("pending", "approved", "rejected", "published")


def _dir_for(status: str):
    if status not in STATUSES:
        raise ValueError(f"Ismeretlen státusz: {status}")
    d = config.REVIEW_QUEUE_DIR / status
    d.mkdir(parents=True, exist_ok=True)
    return d


def draft_to_dict(draft: Draft) -> dict:
    post = draft.source_post
    return {
        "id": draft.id,
        "status": draft.status,
        "editor_notes": draft.editor_notes,
        "slides": draft.slides,
        "caption": draft.caption,
        "source_post": {
            "id": post.id,
            "account_username": post.account_username,
            "account_display_name": post.account_display_name,
            "caption": post.caption,
            "permalink": post.permalink,
            "posted_at": post.posted_at,
            "like_count": post.like_count,
            "comment_count": post.comment_count,
            "image_description": post.image_description,
        },
        "claim_results": [
            {
                "claim": {
                    "id": claim.id,
                    "post_id": claim.post_id,
                    "text": claim.text,
                    "category": claim.category,
                    "checkable": claim.checkable,
                },
                "result": {
                    "claim_id": result.claim_id,
                    "verdict": result.verdict.value,
                    "explanation": result.explanation,
                    "confidence": result.confidence,
                    "needs_human_research": result.needs_human_research,
                    "evidences": [
                        {
                            "source_name": e.source_name,
                            "url": e.url,
                            "snippet": e.snippet,
                        }
                        for e in result.evidences
                    ],
                },
            }
            for claim, result in draft.claim_results
        ],
    }


def draft_from_dict(data: dict) -> Draft:
    post_data = data["source_post"]
    post = Post(**post_data)
    claim_results = []
    for item in data["claim_results"]:
        claim = Claim(**item["claim"])
        r = item["result"]
        result = FactCheckResult(
            claim_id=r["claim_id"],
            verdict=Verdict(r["verdict"]),
            explanation=r["explanation"],
            evidences=[Evidence(**e) for e in r["evidences"]],
            confidence=r["confidence"],
            needs_human_research=r["needs_human_research"],
        )
        claim_results.append((claim, result))
    return Draft(
        id=data["id"],
        source_post=post,
        claim_results=claim_results,
        slides=data["slides"],
        caption=data["caption"],
        status=data["status"],
        editor_notes=data.get("editor_notes", ""),
    )


def save(draft: Draft, status: str | None = None) -> None:
    status = status or draft.status
    draft.status = status
    path = _dir_for(status) / f"{draft.id}.json"
    path.write_text(json.dumps(draft_to_dict(draft), ensure_ascii=False, indent=2))


def list_ids(status: str) -> list[str]:
    return sorted(p.stem for p in _dir_for(status).glob("*.json"))


def load(draft_id: str, status: str) -> Draft:
    path = _dir_for(status) / f"{draft_id}.json"
    return draft_from_dict(json.loads(path.read_text()))


def find_status(draft_id: str) -> str | None:
    for status in STATUSES:
        if (_dir_for(status) / f"{draft_id}.json").exists():
            return status
    return None


def move(draft_id: str, to_status: str, editor_notes: str | None = None) -> Draft:
    current_status = find_status(draft_id)
    if current_status is None:
        raise FileNotFoundError(f"Nincs ilyen draft: {draft_id}")
    draft = load(draft_id, current_status)
    (_dir_for(current_status) / f"{draft_id}.json").unlink()
    if editor_notes is not None:
        draft.editor_notes = editor_notes
    draft.status = to_status
    save(draft, to_status)
    return draft
