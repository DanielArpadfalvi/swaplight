"""Egyszerű PNG-slide renderelés a Draft szövegéből, hogy a review-ban
és a demóban lásd, nagyjából hogy nézne ki a carousel. Nem grafikai
tervező eszköz - production-ben ezt egy rendes design sablon váltaná fel.
"""

from __future__ import annotations

import re
from pathlib import Path

from factcheck import config
from factcheck.models import Draft

SLIDE_SIZE = (1080, 1350)  # Instagram portrait
MARGIN = 80

# A DejaVuSans nem tartalmaz emoji glyphokat (üres négyzetként jelenne meg
# a renderelt PNG-n) - a képre renderelés előtt kiszűrjük őket, a
# szöveges caption/CLI-kimenetben viszont megmaradnak.
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]+"
)


def _strip_emoji(text: str) -> str:
    return _EMOJI_RE.sub("", text).strip()


def render_slides(draft: Draft) -> list[Path]:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return []

    out_dir = config.GENERATED_IMAGES_DIR / draft.id
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        font_title = ImageFont.truetype("DejaVuSans-Bold.ttf", 54)
        font_body = ImageFont.truetype("DejaVuSans.ttf", 38)
    except OSError:
        font_title = ImageFont.load_default()
        font_body = ImageFont.load_default()

    paths = []
    for idx, slide_text in enumerate(draft.slides, start=1):
        img = Image.new("RGB", SLIDE_SIZE, color=(18, 18, 20))
        drawer = ImageDraw.Draw(img)

        lines = slide_text.split("\n")
        title, *body_lines = lines
        y = MARGIN
        drawer.text((MARGIN, y), _strip_emoji(title), font=font_title, fill=(255, 255, 255))
        y += 90

        for line in body_lines:
            wrapped = _wrap(_strip_emoji(line), font_body, SLIDE_SIZE[0] - 2 * MARGIN, drawer)
            for wline in wrapped:
                drawer.text((MARGIN, y), wline, font=font_body, fill=(220, 220, 220))
                y += 50

        path = out_dir / f"slide_{idx}.png"
        img.save(path)
        paths.append(path)
    return paths


def _wrap(text: str, font, max_width: int, drawer) -> list[str]:
    if not text:
        return [""]
    words = text.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if drawer.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines
