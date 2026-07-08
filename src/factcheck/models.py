from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Verdict(str, Enum):
    TRUE = "igaz"
    FALSE = "hamis"
    MISLEADING = "félrevezető"
    UNVERIFIABLE = "nem ellenőrizhető"
    NEEDS_CONTEXT = "kontextus hiányzik"


@dataclass
class Post:
    id: str
    account_username: str
    account_display_name: str
    caption: str
    permalink: str
    posted_at: str
    like_count: int = 0
    comment_count: int = 0
    image_description: str = ""


@dataclass
class Claim:
    id: str
    post_id: str
    text: str
    category: str
    checkable: bool = True


@dataclass
class Evidence:
    source_name: str
    url: str
    snippet: str


@dataclass
class FactCheckResult:
    claim_id: str
    verdict: Verdict
    explanation: str
    evidences: list[Evidence] = field(default_factory=list)
    confidence: float = 0.0
    needs_human_research: bool = False


@dataclass
class Draft:
    id: str
    source_post: Post
    claim_results: list[tuple[Claim, FactCheckResult]]
    slides: list[str]
    caption: str
    status: str = "pending"
    editor_notes: str = ""
