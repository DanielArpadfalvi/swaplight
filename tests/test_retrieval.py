import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from factcheck.retrieval import jsonstat  # noqa: E402
from factcheck.retrieval.eurostat import build_url, human_url  # noqa: E402
from factcheck.retrieval.models import RetrievalQuery  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "eurostat_une_rt_m.json"


def test_jsonstat_parses_eurostat_fixture():
    payload = json.loads(FIXTURE.read_text())
    observations = jsonstat.parse(
        payload,
        source="Eurostat",
        dataset_code="une_rt_m",
        human_url="https://example/une_rt_m",
    )

    assert len(observations) == 4
    # Idő szerint rendezve, az utolsó a legfrissebb
    assert observations[0].time_period == "2024-01"
    assert observations[-1].time_period == "2024-04"
    assert observations[-1].value == 4.2

    obs = observations[0]
    assert obs.value == 4.1
    assert obs.geo == "Hungary"
    assert "Percentage" in obs.unit
    assert obs.dimensions.get("sex") == "Total"
    assert obs.dataset_code == "une_rt_m"


def test_eurostat_url_builder():
    query = RetrievalQuery(
        source="eurostat",
        dataset_code="une_rt_m",
        filters={"geo": "HU", "sex": "T", "unit": "PC_ACT"},
        since_period="2024-01",
    )
    url = build_url(query)
    assert url.startswith(
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?"
    )
    assert "geo=HU" in url
    assert "sex=T" in url
    assert "sinceTimePeriod=2024-01" in url
    assert human_url("une_rt_m").endswith("/une_rt_m/default/table")


def test_max_observations_keeps_latest():
    payload = json.loads(FIXTURE.read_text())
    observations = jsonstat.parse(
        payload, source="Eurostat", dataset_code="une_rt_m", max_observations=2
    )
    assert len(observations) == 2
    assert observations[0].time_period == "2024-03"
    assert observations[1].time_period == "2024-04"
