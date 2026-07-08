from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Observation:
    """Egyetlen adatpont egy hivatalos statisztikai adatbázisból, vagy egy
    webkeresés-találat (nem numerikus, value=NaN)."""

    source: str  # "Eurostat" | "KSH" | "Web"
    dataset_code: str
    geo: str
    time_period: str
    value: float
    unit: str = ""
    dimensions: dict[str, str] = field(default_factory=dict)  # dim_id -> humán címke
    api_url: str = ""
    human_url: str = ""
    snippet: str = ""

    def is_numeric(self) -> bool:
        return not math.isnan(self.value)

    def as_line(self) -> str:
        if not self.is_numeric():
            title = self.dimensions.get("title", "")
            return f"{self.source} | {title} | {self.human_url} {self.snippet}".strip()
        dims = ", ".join(f"{k}={v}" for k, v in self.dimensions.items())
        extra = f" [{dims}]" if dims else ""
        return (
            f"{self.source}/{self.dataset_code} | {self.geo} | {self.time_period} "
            f"| {self.value} {self.unit}{extra}"
        )


@dataclass
class RetrievalQuery:
    """Egy strukturált lekérdezés terve (LLM állítja elő vagy kézzel adott)."""

    source: str  # "eurostat" | "ksh"
    dataset_code: str
    filters: dict[str, str] = field(default_factory=dict)
    since_period: str | None = None
    until_period: str | None = None
    note: str = ""


@dataclass
class RetrievalResult:
    query: RetrievalQuery
    observations: list[Observation] = field(default_factory=list)
    error: str | None = None
