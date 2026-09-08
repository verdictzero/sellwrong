#!/bin/sh
# =====================================================================
# SELLWRONG — assemble the deployable site into public/
# =====================================================================
#
#   tools/build-site.sh [outdir]
#
# There is no build step in the sense of compiling anything: every
# texture, sprite and level is generated in the page at start-up. This
# is a COPY, and the only reason it exists is that the repository holds
# things the site does not need — the untouched Freedoom frames the
# apron is painted onto, the source PNGs for art already baked into
# js/art-data.js, the tools, the README. Publishing the repo wholesale
# would ship about a megabyte of source nobody downloads.
#
# It is a script rather than a list in a CI file so that the two CI
# files and a person checking the deploy locally all assemble exactly
# the same site.
set -eu

OUT="${1:-public}"
cd "$(dirname "$0")/.."

rm -rf "$OUT"
mkdir -p "$OUT/assets/sprites"

cp index.html "$OUT/"
# The two files a phone reads before the game: what to call it and what
# to draw on the home screen.
cp manifest.webmanifest icon.png "$OUT/"
cp -r css js vendor "$OUT/"

# The staff are loaded at run time rather than generated, so the frames
# go and the originals they were painted over do not. So are the wood,
# the sky and the gun: art that came from outside and stays as files.
cp -r assets/sprites/employee "$OUT/assets/sprites/"
cp -r assets/forest assets/sky assets/models assets/fonts "$OUT/assets/"

printf 'built %s: ' "$OUT"
find "$OUT" -type f | wc -l | tr -d ' '
printf ' files, '
du -sh "$OUT" | cut -f1
