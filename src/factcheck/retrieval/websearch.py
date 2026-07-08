"""Opcionális általános webkeresés (Tavily) olyan állításokhoz, amelyek nem
térképezhetők strukturált Eurostat/KSH dataset-re (pl. idézetek, egyedi
események, jogszabály-tartalom). KULCS-GATELT: ha nincs TAVILY_API_KEY,
egyszerűen üres eredményt ad (a pipeline nem áll meg).

Tavily API: https://docs.tavily.com/
"""

from __future__ import annotations

import os

import requests

from factcheck.retrieval.models import Observation

TAVILY_URL = "https://api.tavily.com/search"


def available() -> bool:
    return bool(os.environ.get("TAVILY_API_KEY"))


def search(query_text: str, max_results: int = 4, timeout: int = 20) -> list[Observation]:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return []

    resp = requests.post(
        TAVILY_URL,
        json={
            "api_key": api_key,
            "query": query_text,
            "max_results": max_results,
            "search_depth": "advanced",
            "include_answer": False,
        },
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Tavily API hiba ({resp.status_code}): {resp.text[:200]}")

    observations: list[Observation] = []
    for item in resp.json().get("results", []):
        observations.append(
            Observation(
                source="Web",
                dataset_code="tavily",
                geo="",
                time_period="",
                value=float("nan"),
                unit="",
                dimensions={"title": item.get("title", "")},
                api_url=item.get("url", ""),
                human_url=item.get("url", ""),
                snippet=(item.get("content", "") or "")[:300],
            )
        )
    return observations
