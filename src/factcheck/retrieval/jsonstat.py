"""JSON-stat 2.0 parser. Eurostat és a KSH disszeminációs API is ezt a
formátumot adja vissza, így egy közös dekódolóval mindkettő kezelhető.

Spec: https://json-stat.org/full/
"""

from __future__ import annotations

from factcheck.retrieval.models import Observation


def _category_index(dim: dict) -> list[str]:
    """A dimenzió kódjainak listája pozíció szerint (0..size-1)."""
    index = dim.get("category", {}).get("index")
    if index is None:
        return []
    if isinstance(index, list):
        return list(index)
    # dict: {code: position} -> pozíció szerint rendezve
    return [code for code, _ in sorted(index.items(), key=lambda kv: kv[1])]


def _category_labels(dim: dict) -> dict[str, str]:
    return dim.get("category", {}).get("label", {}) or {}


def parse(
    payload: dict,
    *,
    source: str,
    dataset_code: str,
    api_url: str = "",
    human_url: str = "",
    geo_dim: str = "geo",
    time_dim: str = "time",
    max_observations: int = 24,
) -> list[Observation]:
    dim_ids: list[str] = payload.get("id") or list(payload.get("dimension", {}).keys())
    sizes: list[int] = payload.get("size") or [
        len(_category_index(payload["dimension"][d])) for d in dim_ids
    ]
    dimensions = payload.get("dimension", {})

    codes_by_dim = {d: _category_index(dimensions.get(d, {})) for d in dim_ids}
    labels_by_dim = {d: _category_labels(dimensions.get(d, {})) for d in dim_ids}

    unit = ""
    if "unit" in dimensions:
        unit_codes = _category_index(dimensions["unit"])
        if len(unit_codes) == 1:
            unit = labels_by_dim["unit"].get(unit_codes[0], unit_codes[0])

    # Row-major strides
    strides = [1] * len(sizes)
    for i in range(len(sizes) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    values = payload.get("value", {})
    if isinstance(values, list):
        value_items = [(i, v) for i, v in enumerate(values) if v is not None]
    else:
        value_items = [(int(k), v) for k, v in values.items() if v is not None]

    observations: list[Observation] = []
    for flat_index, value in value_items:
        coords: dict[str, str] = {}
        for dim_id, stride, size in zip(dim_ids, strides, sizes):
            pos = (flat_index // stride) % size
            codes = codes_by_dim[dim_id]
            coords[dim_id] = codes[pos] if pos < len(codes) else str(pos)

        geo_code = coords.get(geo_dim, "")
        time_code = coords.get(time_dim, "")

        extra_dims = {
            dim_id: labels_by_dim[dim_id].get(code, code)
            for dim_id, code in coords.items()
            if dim_id not in (geo_dim, time_dim, "unit")
        }

        observations.append(
            Observation(
                source=source,
                dataset_code=dataset_code,
                geo=labels_by_dim.get(geo_dim, {}).get(geo_code, geo_code),
                time_period=time_code,
                value=float(value),
                unit=unit,
                dimensions=extra_dims,
                api_url=api_url,
                human_url=human_url,
            )
        )

    observations.sort(key=lambda o: o.time_period)
    if max_observations and len(observations) > max_observations:
        observations = observations[-max_observations:]
    return observations
