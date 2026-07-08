"""Eurostat statisztikai adatok lekérése a hivatalos, KULCS NÉLKÜLI
REST API-n keresztül (JSON-stat 2.0 formátum).

Dokumentáció:
  https://ec.europa.eu/eurostat/web/main/data/web-services

Példa dataset kódok:
  une_rt_m       - munkanélküliségi ráta (havi)
  prc_hicp_manr  - HICP infláció (éves változás, havi)
  nama_10_gdp    - GDP
  tepsr_wc310    - reál GDP növekedés
"""

from __future__ import annotations

import requests

from factcheck.retrieval import jsonstat
from factcheck.retrieval.models import Observation, RetrievalQuery

API_BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
BROWSER_BASE = "https://ec.europa.eu/eurostat/databrowser/view"


def build_url(query: RetrievalQuery) -> str:
    params = ["format=JSON", "lang=EN"]
    for key, value in query.filters.items():
        params.append(f"{key}={value}")
    if query.since_period:
        params.append(f"sinceTimePeriod={query.since_period}")
    if query.until_period:
        params.append(f"untilTimePeriod={query.until_period}")
    return f"{API_BASE}/{query.dataset_code}?{'&'.join(params)}"


def human_url(dataset_code: str) -> str:
    return f"{BROWSER_BASE}/{dataset_code}/default/table"


def fetch(query: RetrievalQuery, timeout: int = 20) -> list[Observation]:
    url = build_url(query)
    resp = requests.get(url, timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(
            f"Eurostat API hiba ({resp.status_code}) [{query.dataset_code}]: "
            f"{resp.text[:200]}"
        )
    return jsonstat.parse(
        resp.json(),
        source="Eurostat",
        dataset_code=query.dataset_code,
        api_url=url,
        human_url=human_url(query.dataset_code),
    )
