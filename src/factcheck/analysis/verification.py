from __future__ import annotations

from factcheck.analysis.llm_provider import LLMProvider
from factcheck.fetch import sample_data
from factcheck.models import Claim, Evidence, FactCheckResult, Verdict

SYSTEM_PROMPT = """\
Magyar közéleti állítások tényellenőrzésében segítesz. Legyél maximálisan \
konzervatív: csak akkor mondj "hamis" vagy "félrevezető" verdiktet, ha \
nagyon magabiztos vagy, és meg tudsz nevezni konkrét, ellenőrizhető \
forrást (pl. KSH, Eurostat, MNB, ÁSZ, Magyar Közlöny, hivatalos \
statisztikai adatbázis). Ha nem vagy biztos, vagy nincs pontos forrásod, \
válaszolj "nem ellenőrizhető" vagy "kontextus hiányzik" verdikttel, és \
NE találj ki forrást vagy számadatot. Válaszolj KIZÁRÓLAG az alábbi JSON \
formátumban, más szöveg nélkül:
{
  "verdict": "igaz|hamis|félrevezető|nem ellenőrizhető|kontextus hiányzik",
  "explanation": "rövid, közérthető magyarázat",
  "confidence": 0.0,
  "evidences": [{"source_name": "...", "url": "...", "snippet": "..."}]
}
"""


def build_user_prompt(claim: Claim) -> str:
    return f"Ellenőrizendő állítás: {claim.text}\nKategória: {claim.category}"


def verify_claim(claim: Claim, provider: LLMProvider | None) -> FactCheckResult:
    if provider is None:
        cached = sample_data.MOCK_VERIFICATIONS.get(claim.id)
        if cached is not None:
            return cached
        return FactCheckResult(
            claim_id=claim.id,
            verdict=Verdict.UNVERIFIABLE,
            explanation="Nincs mock ellenőrzési adat ehhez az állításhoz.",
            needs_human_research=True,
        )

    data = provider.complete_json(SYSTEM_PROMPT, build_user_prompt(claim))
    evidences = [
        Evidence(
            source_name=e.get("source_name", ""),
            url=e.get("url", ""),
            snippet=e.get("snippet", ""),
        )
        for e in data.get("evidences", [])
    ]
    return FactCheckResult(
        claim_id=claim.id,
        verdict=Verdict(data.get("verdict", Verdict.UNVERIFIABLE.value)),
        explanation=data.get("explanation", ""),
        evidences=evidences,
        confidence=float(data.get("confidence", 0.0)),
        # Az LLM nem végez élő forráskeresést, csak a paraméteres tudására
        # támaszkodik - ezért éles módban MINDIG emberi kutatói jóváhagyás
        # kell a publikálás előtt, függetlenül attól, mit mond a modell.
        needs_human_research=True,
    )
