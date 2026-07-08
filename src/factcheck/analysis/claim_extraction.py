from __future__ import annotations

from factcheck.analysis.llm_provider import LLMProvider
from factcheck.fetch import sample_data
from factcheck.models import Claim, Post

SYSTEM_PROMPT = """\
Politikai kommunikációs posztokból ellenőrizhető ténybeli állításokat \
nyersz ki. Csak azokat az állításokat vedd fel checkable=true jelöléssel, \
amelyek konkrét, adatokkal vagy dokumentumokkal cáfolható/igazolható \
tényt fogalmaznak meg (pl. statisztika, dátum, jogszabályi tartalom). \
Vélemények, értékítéletek, szitkozódás, jövőre vonatkozó ígéretek \
checkable=false jelölést kapjanak. Válaszolj KIZÁRÓLAG az alábbi JSON \
formátumban, más szöveg nélkül:
{"claims": [{"text": "...", "category": "...", "checkable": true}]}
"""


def build_user_prompt(post: Post) -> str:
    return (
        f"Politikus: {post.account_display_name}\n"
        f"Poszt szövege: {post.caption}\n"
        f"Kép leírása (ha van): {post.image_description or '(nincs)'}\n"
    )


def extract_claims(post: Post, provider: LLMProvider | None) -> list[Claim]:
    if provider is None:
        return list(sample_data.MOCK_CLAIMS.get(post.id, []))

    data = provider.complete_json(SYSTEM_PROMPT, build_user_prompt(post))
    claims: list[Claim] = []
    for idx, item in enumerate(data.get("claims", []), start=1):
        claims.append(
            Claim(
                id=f"{post.id}_llm_{idx}",
                post_id=post.id,
                text=item["text"],
                category=item.get("category", "egyéb"),
                checkable=bool(item.get("checkable", True)),
            )
        )
    return claims
