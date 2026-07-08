from __future__ import annotations

from factcheck import config
from factcheck.analysis import claim_extraction, verification
from factcheck.analysis.llm_provider import get_provider
from factcheck.drafting.generator import generate_draft
from factcheck.fetch import instagram
from factcheck.models import Claim, FactCheckResult, Post
from factcheck.review import queue


def run(min_likes: int | None = None, min_confidence: float = 0.4) -> list[str]:
    """Végigfuttatja a teljes pipeline-t, és visszaadja a
    review-queue-ba került (pending) draft-ok ID-listáját.
    """
    config.load_dotenv()
    accounts = config.load_accounts()
    posts = instagram.fetch_all(accounts)

    threshold = min_likes if min_likes is not None else 500
    popular_posts = [p for p in posts if instagram.is_popular(p, threshold)]

    provider = get_provider()
    created_ids: list[str] = []

    for post in popular_posts:
        claims = [c for c in claim_extraction.extract_claims(post, provider) if c.checkable]
        if not claims:
            continue

        claim_results: list[tuple[Claim, FactCheckResult]] = [
            (claim, verification.verify_claim(claim, provider)) for claim in claims
        ]

        draft = generate_draft(post, claim_results, min_confidence=min_confidence)
        if draft is None:
            continue

        queue.save(draft, status="pending")
        created_ids.append(draft.id)

    return created_ids
