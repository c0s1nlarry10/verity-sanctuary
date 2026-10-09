#!/bin/bash
# Copies the current game into versions/v<version> so it stays playable for reference.
# Each archived copy gets its own save slot, so it never touches your main save.
# usage: versions/archive.sh <version> "<title>"     e.g. versions/archive.sh 1.2 "Night Market"
set -e
V="$1"; TITLE="${2:-Version $1}"
[ -z "$V" ] && { echo "usage: $0 <version> \"<title>\""; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/versions/v$V"
rm -rf "$DEST"; mkdir -p "$DEST"
cp -R "$ROOT/index.html" "$ROOT/style.css" "$ROOT/js" "$DEST/"
sed -i '' "s/const SAVE_KEY = \"verity-sanctuary-save\";/const SAVE_KEY = \"verity-sanctuary-save-archive-v$V\";/" "$DEST/js/data.js"
sed -i '' 's#href="versions/index.html"#href="../index.html"#' "$DEST/index.html"
grep -q "archive-v$V" "$DEST/js/data.js" || { echo "Could not set the save slot"; exit 1; }
LIST="$ROOT/versions/list.js"
if ! grep -q "v: \"$V\"" "$LIST"; then
  sed -i '' "s#^];#  { v: \"$V\", title: \"$TITLE\", date: \"$(date +%Y-%m-%d)\" },\\
];#" "$LIST"
fi
echo "Archived v$V to versions/v$V"
