"""LLM-alapú lekérdezés-tervező: egy ellenőrizendő állításból strukturált
Eurostat/KSH lekérdezéseket állít elő, hogy a verification lépés valódi
hivatalos adatokból dolgozhasson (ne csak az LLM emlékezetéből).
"""

from __future__ import annotations

from factcheck.analysis.llm_provider import LLMProvider
from factcheck.models import Claim
from factcheck.retrieval.models import RetrievalQuery

SYSTEM_PROMPT = """\
Magyar közéleti tényállítások ellenőrzéséhez tervezel adat-lekérdezéseket \
hivatalos statisztikai adatbázisokból. Egy állításhoz add meg azokat a \
konkrét Eurostat és/vagy KSH lekérdezéseket, amelyekkel az állítás \
számszerűen ellenőrizhető.

Eurostat esetén használj valós dataset kódokat és dimenzió-szűrőket, pl.:
- Munkanélküliségi ráta: dataset "une_rt_m", filters {"geo":"HU","sex":"T",\
"age":"TOTAL","s_adj":"SA","unit":"PC_ACT"}
- HICP infláció (éves változás): dataset "prc_hicp_manr", filters \
{"geo":"HU","coicop":"CP00","unit":"RCH_A"}
- Reál GDP növekedés: dataset "namq_10_gdp" megfelelő szűrőkkel.

A geo kód Magyarországra "HU". Az időszakot a "since_period" mezővel \
szűkítsd (pl. "2021" vagy "2021-01"). Ha egy állítás nem ellenőrizhető \
statisztikai adatbázisból (pl. jogszabály tartalma, egyedi esemény), adj \
vissza üres "queries" listát.

Válaszolj KIZÁRÓLAG az alábbi JSON formátumban, más szöveg nélkül:
{
  "queries": [
    {
      "source": "eurostat",
      "dataset_code": "une_rt_m",
      "filters": {"geo": "HU", "sex": "T", "age": "TOTAL", "s_adj": "SA", "unit": "PC_ACT"},
      "since_period": "2021-01",
      "note": "Munkanélküliségi ráta Magyarország"
    }
  ]
}
"""


def build_user_prompt(claim: Claim) -> str:
    return f"Ellenőrizendő állítás: {claim.text}\nKategória: {claim.category}"


def plan_queries(claim: Claim, provider: LLMProvider | None) -> list[RetrievalQuery]:
    if provider is None:
        return []
    data = provider.complete_json(SYSTEM_PROMPT, build_user_prompt(claim))
    queries: list[RetrievalQuery] = []
    for item in data.get("queries", []):
        queries.append(
            RetrievalQuery(
                source=item.get("source", "eurostat"),
                dataset_code=item["dataset_code"],
                filters=item.get("filters", {}) or {},
                since_period=item.get("since_period"),
                until_period=item.get("until_period"),
                note=item.get("note", ""),
            )
        )
    return queries
