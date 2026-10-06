#!/usr/bin/env bash
# Copy the public web site (docs/site/*, the source of truth) into a checkout of the public
# DanielArpadfalvi/swaplight-site repo, which GitHub Pages serves from its default branch root.
# Usage: scripts/publish-site.sh <path-to-swaplight-site-checkout>
# Only copies; review, commit and push in the target repo yourself (see docs/RELEASE.md 6.3).
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <swaplight-site checkout dir>" >&2
  exit 2
fi

src="$(cd "$(dirname "$0")/.." && pwd)/docs/site"
dest="$1"

if [ ! -d "$dest" ]; then
  echo "error: target directory '$dest' does not exist (clone swaplight-site first)" >&2
  exit 1
fi
if [ ! -d "$dest/.git" ]; then
  echo "warning: '$dest' is not a git checkout root" >&2
fi

cp -R "$src"/. "$dest"/
# Serve the files as-is (no Jekyll processing on GitHub Pages).
touch "$dest/.nojekyll"

echo "Copied $(find "$src" -type f | wc -l) file(s) from docs/site to $dest"
echo "Next: cd \"$dest\" && git add -A && git commit -m 'Update site' && git push"
