import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from factcheck import pipeline  # noqa: E402
from factcheck.models import Verdict  # noqa: E402
from factcheck.review import queue  # noqa: E402


def test_mock_pipeline_creates_drafts_for_false_and_misleading_claims():
    created_ids = pipeline.run(min_likes=0, min_confidence=0.4)

    assert created_ids, "A mock adatokkal legalább egy draftot kellene generálni."

    for draft_id in created_ids:
        draft = queue.load(draft_id, "pending")
        verdicts = {result.verdict for _, result in draft.claim_results if result}
        assert verdicts & {Verdict.FALSE, Verdict.MISLEADING}
        assert draft.slides
        assert draft.caption

        # cleanup
        (queue._dir_for("pending") / f"{draft_id}.json").unlink()
