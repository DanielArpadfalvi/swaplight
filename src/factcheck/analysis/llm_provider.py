"""Vékony LLM absztrakció, hogy a claim_extraction/verification modulok
ne kössék magukat egyetlen SDK-hoz. Jelenleg Anthropic implementáció van,
de a felület (complete_json) más providerrel is megvalósítható.
"""

from __future__ import annotations

import json
from typing import Protocol

from factcheck import config


class LLMProvider(Protocol):
    def complete_json(self, system: str, user: str) -> dict:
        ...


class AnthropicProvider:
    def __init__(self, model: str | None = None):
        try:
            import anthropic
        except ImportError as exc:
            raise RuntimeError(
                "Az 'anthropic' csomag nincs telepítve (pip install anthropic)."
            ) from exc

        api_key = config.anthropic_api_key()
        if not api_key:
            raise RuntimeError("Hiányzik az ANTHROPIC_API_KEY környezeti változó.")

        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model or config.anthropic_model()

    def complete_json(self, system: str, user: str) -> dict:
        response = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        return _extract_json(text)


def _extract_json(text: str) -> dict:
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"Nem található JSON a válaszban: {text[:200]!r}")
    return json.loads(text[start : end + 1])


def get_provider() -> LLMProvider | None:
    """Visszaadja a valódi LLM providert, vagy None-t (mock mód)."""
    if not config.anthropic_api_key():
        return None
    return AnthropicProvider()
