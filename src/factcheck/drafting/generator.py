from __future__ import annotations

import uuid

from factcheck.models import Claim, Draft, FactCheckResult, Post, Verdict

CORRECTABLE_VERDICTS = {Verdict.FALSE, Verdict.MISLEADING}


def should_draft(result: FactCheckResult, min_confidence: float) -> bool:
    return result.verdict in CORRECTABLE_VERDICTS and result.confidence >= min_confidence


def generate_draft(
    post: Post,
    claim_results: list[tuple[Claim, FactCheckResult]],
    min_confidence: float = 0.4,
) -> Draft | None:
    correctable = [
        (claim, result)
        for claim, result in claim_results
        if should_draft(result, min_confidence)
    ]
    if not correctable:
        return None

    slides = [_hook_slide(post, correctable)]
    for claim, result in correctable:
        slides.append(_verdict_slide(claim, result))
    slides.append(_sources_slide(correctable))

    caption = _build_caption(post, correctable)

    return Draft(
        id=f"draft_{uuid.uuid4().hex[:10]}",
        source_post=post,
        claim_results=claim_results,
        slides=slides,
        caption=caption,
    )


def _hook_slide(post: Post, correctable: list[tuple[Claim, FactCheckResult]]) -> str:
    lines = [
        "🔍 TÉNYELLENŐRZÉS",
        f"{post.account_display_name} posztja kapcsán",
        "",
    ]
    for claim, _ in correctable:
        lines.append(f"„{claim.text}”")
    lines.append("")
    lines.append(f"Eredeti poszt: {post.permalink}")
    return "\n".join(lines)


def _verdict_slide(claim: Claim, result: FactCheckResult) -> str:
    badge = {
        Verdict.FALSE: "❌ HAMIS",
        Verdict.MISLEADING: "⚠️ FÉLREVEZETŐ",
    }[result.verdict]
    return f"{badge}\n\nÁllítás: {claim.text}\n\n{result.explanation}"


def _sources_slide(correctable: list[tuple[Claim, FactCheckResult]]) -> str:
    lines = ["📚 FORRÁSOK"]
    for _, result in correctable:
        for evidence in result.evidences:
            lines.append(f"• {evidence.source_name}: {evidence.url}")
    if len(lines) == 1:
        lines.append("(Nincs megadott forrás - publikálás előtt pótlandó!)")
    return "\n".join(lines)


def _build_caption(post: Post, correctable: list[tuple[Claim, FactCheckResult]]) -> str:
    verdict_labels = ", ".join(sorted({r.verdict.value for _, r in correctable}))
    return (
        f"Tényellenőrzés: {post.account_display_name} egyik népszerű posztjában "
        f"található állítás(oka)t vizsgáltuk meg. Eredmény: {verdict_labels}. "
        "Minden állításunkat forrásokkal dokumentáljuk (lásd a carousel utolsó "
        "diáján és a kommentekben). Ez a tartalom AI-asszisztált kutatás alapján "
        "készült, szerkesztői jóváhagyással.\n\n"
        "#tényellenőrzés #factcheck #magyarpolitika"
    )
