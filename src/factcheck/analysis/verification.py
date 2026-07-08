"""Retrieval-augmentált tényellenőrzés:
  1. LLM lekérdezés-tervező -> strukturált Eurostat/KSH lekérdezések
  2. valódi adatok lekérése a hivatalos API-król (orchestrator)
  3. LLM szintézis: állítás + LEKÉRT ADATOK -> verdikt + források

Mock módban (nincs ANTHROPIC_API_KEY) az előre elkészített minta
eredményekkel dolgozik. Éles módban az LLM az 1. és 3. lépést végzi, a
2. lépés determinisztikus API-hívás.
"""

from __future__ import annotations

from factcheck.analysis import retrieval_planner
from factcheck.analysis.llm_provider import LLMProvider
from factcheck.fetch import sample_data
from factcheck.models import Claim, Evidence, FactCheckResult, Verdict
from factcheck.retrieval import orchestrator, websearch
from factcheck.retrieval.models import Observation

SYSTEM_PROMPT = """\
Magyar közéleti állítások tényellenőrzésében segítesz. KIZÁRÓLAG a megadott, \
hivatalos statisztikai adatokra (Eurostat/KSH) támaszkodj - ne találj ki \
számokat vagy forrásokat. Ha a megadott adatok nem elegendők az állítás \
eldöntéséhez, a verdikt legyen "nem ellenőrizhető" vagy "kontextus hiányzik".

Verdikt jelentése:
- "igaz": az adatok egyértelműen alátámasztják az állítást.
- "hamis": az adatok egyértelműen cáfolják.
- "félrevezető": a szám formálisan közel van, de a keretezés/kontextus \
torzít (pl. cherry-picked időszak).
- "nem ellenőrizhető": a megadott adatokból nem dönthető el.
- "kontextus hiányzik": az állítás pontosítás nélkül nem értékelhető.

A "confidence" 0 és 1 közötti szám, azt fejezi ki, mennyire biztos a \
verdikt a megadott adatok alapján. Az "evidences" mezőben CSAK a ténylegesen \
megadott adatpontokra hivatkozz (source_name, url, a konkrét érték a \
snippetben).

Válaszolj KIZÁRÓLAG az alábbi JSON formátumban:
{
  "verdict": "igaz|hamis|félrevezető|nem ellenőrizhető|kontextus hiányzik",
  "explanation": "rövid, közérthető magyarázat konkrét számokkal",
  "confidence": 0.0,
  "evidences": [{"source_name": "...", "url": "...", "snippet": "..."}]
}
"""


def _observations_block(observations: list[Observation]) -> str:
    if not observations:
        return "(A hivatalos adatbázisokból nem sikerült releváns adatot lekérni.)"
    lines = [obs.as_line() for obs in observations]
    return "\n".join(lines)


def build_user_prompt(claim: Claim, observations: list[Observation]) -> str:
    return (
        f"Ellenőrizendő állítás: {claim.text}\n"
        f"Kategória: {claim.category}\n\n"
        f"Lekért hivatalos adatok:\n{_observations_block(observations)}"
    )


def _evidences_from_observations(observations: list[Observation]) -> list[Evidence]:
    """Fallback: ha az LLM nem ad forrást, a lekért adatpontokból építünk."""
    seen: set[str] = set()
    evidences: list[Evidence] = []
    for obs in observations:
        key = f"{obs.source}/{obs.dataset_code}"
        if key in seen:
            continue
        seen.add(key)
        evidences.append(
            Evidence(
                source_name=f"{obs.source} - {obs.dataset_code}",
                url=obs.human_url or obs.api_url,
                snippet=obs.as_line(),
            )
        )
    return evidences


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

    # 1) LLM lekérdezés-terv -> 2) valódi adatok lekérése
    queries = retrieval_planner.plan_queries(claim, provider)
    results = orchestrator.run_plan(queries)
    observations = orchestrator.flatten_observations(results)
    retrieval_errors = [r.error for r in results if r.error]

    # 2b) Ha nincs strukturált adat, opcionális webkeresés-fallback (Tavily)
    if not observations and websearch.available():
        try:
            observations = websearch.search(claim.text)
        except Exception as exc:
            retrieval_errors.append(f"websearch: {exc}")

    # 3) LLM szintézis a lekért adatokból
    data = provider.complete_json(SYSTEM_PROMPT, build_user_prompt(claim, observations))

    evidences = [
        Evidence(
            source_name=e.get("source_name", ""),
            url=e.get("url", ""),
            snippet=e.get("snippet", ""),
        )
        for e in data.get("evidences", [])
    ]
    if not evidences:
        evidences = _evidences_from_observations(observations)

    confidence = float(data.get("confidence", 0.0))
    # Emberi kutatói jóváhagyás akkor is kell, ha: nem jött vissza adat,
    # volt lekérési hiba, vagy alacsony a bizonyosság. Politikai kontextusban
    # a review-queue amúgy is mindig emberi jóváhagyást vár a publikálás előtt.
    needs_human = (
        not observations or bool(retrieval_errors) or confidence < 0.75
    )

    explanation = data.get("explanation", "")
    if retrieval_errors:
        explanation += (
            "\n[Megjegyzés: egyes adatlekérések hibára futottak: "
            + "; ".join(retrieval_errors[:3])
            + "]"
        )

    return FactCheckResult(
        claim_id=claim.id,
        verdict=Verdict(data.get("verdict", Verdict.UNVERIFIABLE.value)),
        explanation=explanation.strip(),
        evidences=evidences,
        confidence=confidence,
        needs_human_research=needs_human,
    )
