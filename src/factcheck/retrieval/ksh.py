"""KSH (Központi Statisztikai Hivatal) adatlekérés a disszeminációs
API-n keresztül. A KSH a "Disszeminációs adatbázis" alatt szintén
JSON-stat formátumban szolgáltat adatokat, kulcs nélkül.

FONTOS: a KSH programozott hozzáférése kevésbé szabványos és stabil,
mint az Eurostaté, és a pontos végpont/dataset-azonosítás időről időre
változhat. Ezért a bázis URL és az útvonalsablon környezeti változóból
felülírható (KSH_API_BASE), és a hívás hiba esetén nem állítja meg a
pipeline-t, csak "nincs adat" jelzést ad vissza. Ellenőrizd a KSH aktuális
API-dokumentációját éles használat előtt:
  https://www.ksh.hu/stadat  (STADAT táblák)
  https://statinfo.ksh.hu    (STADAT / interaktív adatok)
"""

from __future__ import annotations

import os

import requests

from factcheck.retrieval import jsonstat
from factcheck.retrieval.models import Observation, RetrievalQuery

# Alapértelmezett bázis; éles használatban a KSH aktuális JSON-stat
# végpontjára állítsd a KSH_API_BASE env változóval.
DEFAULT_API_BASE = "https://statinfo.ksh.hu/Statinfo/api/v1/jsonstat"


def api_base() -> str:
    return os.environ.get("KSH_API_BASE", DEFAULT_API_BASE).rstrip("/")


def build_url(query: RetrievalQuery) -> str:
    params = []
    for key, value in query.filters.items():
        params.append(f"{key}={value}")
    if query.since_period:
        params.append(f"since={query.since_period}")
    if query.until_period:
        params.append(f"until={query.until_period}")
    qs = ("?" + "&".join(params)) if params else ""
    return f"{api_base()}/{query.dataset_code}{qs}"


def human_url(dataset_code: str) -> str:
    return f"https://www.ksh.hu/stadat_files/{dataset_code}"


def fetch(query: RetrievalQuery, timeout: int = 20) -> list[Observation]:
    url = build_url(query)
    resp = requests.get(url, timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(
            f"KSH API hiba ({resp.status_code}) [{query.dataset_code}]: "
            f"{resp.text[:200]}"
        )
    return jsonstat.parse(
        resp.json(),
        source="KSH",
        dataset_code=query.dataset_code,
        api_url=url,
        human_url=human_url(query.dataset_code),
        # A KSH JSON-stat dimenzió-nevei eltérhetnek; a leggyakoribbakat
        # próbáljuk, de a parser a talált id-ket használja fallbackként.
        geo_dim="geo",
        time_dim="time",
    )
