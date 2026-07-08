#!/usr/bin/env python3
"""Instagram politikai tényellenőrző - prototípus CLI.

Használat:
  python cli.py run                    # pipeline futtatása, új draft-ok a review-queue-ba
  python cli.py list [status]          # draft-ok listázása (pending/approved/rejected/published)
  python cli.py show <draft_id>        # draft részletei
  python cli.py approve <draft_id>     # jóváhagyás -> approved
  python cli.py reject <draft_id> --reason "..."
  python cli.py render <draft_id>      # PNG slide-ok renderelése (data/generated_images/)
  python cli.py publish <draft_id>     # publikálás (dry-run, ha nincs IG token/kép URL)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from factcheck import config, pipeline  # noqa: E402
from factcheck.drafting.slide_renderer import render_slides  # noqa: E402
from factcheck.publish.instagram_publish import publish_draft  # noqa: E402
from factcheck.review import queue  # noqa: E402


def cmd_run(args: argparse.Namespace) -> None:
    ids = pipeline.run(min_likes=args.min_likes, min_confidence=args.min_confidence)
    if not ids:
        print("Nem keletkezett új draft (nincs népszerű poszt korrigálandó állítással).")
        return
    print(f"{len(ids)} új draft került a 'pending' review-queue-ba:")
    for draft_id in ids:
        print(f"  - {draft_id}")
    print("\nNézd át: python cli.py show <draft_id>")


def cmd_list(args: argparse.Namespace) -> None:
    ids = queue.list_ids(args.status)
    if not ids:
        print(f"Nincs draft '{args.status}' státuszban.")
        return
    for draft_id in ids:
        draft = queue.load(draft_id, args.status)
        verdicts = ", ".join(r.verdict.value for _, r in draft.claim_results if r)
        print(f"{draft_id}  |  {draft.source_post.account_display_name}  |  {verdicts}")


def cmd_show(args: argparse.Namespace) -> None:
    status = queue.find_status(args.draft_id)
    if status is None:
        print(f"Nincs ilyen draft: {args.draft_id}")
        return
    draft = queue.load(args.draft_id, status)
    post = draft.source_post

    print(f"Draft ID: {draft.id}  (státusz: {draft.status})")
    print(f"Politikus: {post.account_display_name} (@{post.account_username})")
    print(f"Eredeti poszt: {post.permalink}")
    print(f"Poszt szövege: {post.caption}")
    print(f"Kedvelések: {post.like_count}  Kommentek: {post.comment_count}")
    print("\n--- Ellenőrzött állítások ---")
    for claim, result in draft.claim_results:
        print(f"\n[{result.verdict.value}] (bizonyosság: {result.confidence:.0%})")
        print(f"Állítás: {claim.text}")
        print(f"Magyarázat: {result.explanation}")
        if result.needs_human_research:
            print("⚠️  Emberi forrásellenőrzés szükséges publikálás előtt!")
        for evidence in result.evidences:
            print(f"  forrás: {evidence.source_name} - {evidence.url}")

    print("\n--- Carousel draft slide-ok ---")
    for idx, slide in enumerate(draft.slides, start=1):
        print(f"\n[Slide {idx}]\n{slide}")

    print(f"\n--- Caption ---\n{draft.caption}")
    if draft.editor_notes:
        print(f"\n--- Szerkesztői megjegyzés ---\n{draft.editor_notes}")


def cmd_approve(args: argparse.Namespace) -> None:
    draft = queue.move(args.draft_id, "approved", editor_notes=args.notes)
    print(f"Jóváhagyva: {draft.id}")


def cmd_reject(args: argparse.Namespace) -> None:
    draft = queue.move(args.draft_id, "rejected", editor_notes=args.reason)
    print(f"Elutasítva: {draft.id}")


def cmd_render(args: argparse.Namespace) -> None:
    status = queue.find_status(args.draft_id)
    if status is None:
        print(f"Nincs ilyen draft: {args.draft_id}")
        return
    draft = queue.load(args.draft_id, status)
    paths = render_slides(draft)
    if not paths:
        print("A Pillow csomag nincs telepítve (pip install Pillow) - nincs kép renderelve.")
        return
    print(f"{len(paths)} slide kép elkészült:")
    for path in paths:
        print(f"  - {path}")


def cmd_publish(args: argparse.Namespace) -> None:
    status = queue.find_status(args.draft_id)
    if status is None:
        print(f"Nincs ilyen draft: {args.draft_id}")
        return
    draft = queue.load(args.draft_id, status)
    result = publish_draft(draft, image_urls=args.image_url or None)
    if not result.get("dry_run"):
        queue.move(args.draft_id, "published")
        print(f"Publikálva: {draft.id}")
    print(result)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_run = sub.add_parser("run", help="Pipeline futtatása")
    p_run.add_argument("--min-likes", type=int, default=None)
    p_run.add_argument("--min-confidence", type=float, default=0.4)
    p_run.set_defaults(func=cmd_run)

    p_list = sub.add_parser("list", help="Draft-ok listázása")
    p_list.add_argument("status", nargs="?", default="pending", choices=queue.STATUSES)
    p_list.set_defaults(func=cmd_list)

    p_show = sub.add_parser("show", help="Draft részletei")
    p_show.add_argument("draft_id")
    p_show.set_defaults(func=cmd_show)

    p_approve = sub.add_parser("approve", help="Draft jóváhagyása")
    p_approve.add_argument("draft_id")
    p_approve.add_argument("--notes", default=None)
    p_approve.set_defaults(func=cmd_approve)

    p_reject = sub.add_parser("reject", help="Draft elutasítása")
    p_reject.add_argument("draft_id")
    p_reject.add_argument("--reason", default=None)
    p_reject.set_defaults(func=cmd_reject)

    p_render = sub.add_parser("render", help="Slide PNG-k renderelése")
    p_render.add_argument("draft_id")
    p_render.set_defaults(func=cmd_render)

    p_publish = sub.add_parser("publish", help="Jóváhagyott draft publikálása")
    p_publish.add_argument("draft_id")
    p_publish.add_argument("--image-url", action="append", default=[])
    p_publish.set_defaults(func=cmd_publish)

    return parser


def main() -> None:
    config.load_dotenv()
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
