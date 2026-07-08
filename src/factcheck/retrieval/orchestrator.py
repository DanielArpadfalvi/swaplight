from __future__ import annotations

from factcheck.retrieval import eurostat, ksh
from factcheck.retrieval.models import Observation, RetrievalQuery, RetrievalResult

_PROVIDERS = {
    "eurostat": eurostat.fetch,
    "ksh": ksh.fetch,
}


def run_query(query: RetrievalQuery) -> RetrievalResult:
    fetch = _PROVIDERS.get(query.source.lower())
    if fetch is None:
        return RetrievalResult(query=query, error=f"Ismeretlen forrás: {query.source}")
    try:
        observations = fetch(query)
        return RetrievalResult(query=query, observations=observations)
    except Exception as exc:  # hálózati/parse hiba ne állítsa meg a pipeline-t
        return RetrievalResult(query=query, error=str(exc))


def run_plan(queries: list[RetrievalQuery]) -> list[RetrievalResult]:
    return [run_query(q) for q in queries]


def flatten_observations(results: list[RetrievalResult]) -> list[Observation]:
    out: list[Observation] = []
    for result in results:
        out.extend(result.observations)
    return out
