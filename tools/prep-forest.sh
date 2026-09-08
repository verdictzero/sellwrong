#!/bin/sh
# =====================================================================
# Bring the forest's art over from the golf project
# =====================================================================
#
#   tools/prep-forest.sh /path/to/golf
#
# The trees, bushes, ferns and ground come from github.com/verdictzero/
# golf, where they were painted, crunched to 128 and 256 pixels and given
# BURN MAPS by tools/TOOL_gen_burn_maps.py there. The burn map is the
# clever part and the reason there is no second set of charred art: one
# RGBA texture per sprite says, per texel, where the coals sit (R), how
# black it ends up (G), WHEN it burns (B, the fire front climbing the
# plant) and how leafy it is (A). js/forest.js sweeps one number across
# it. This copies the crunched sizes and their maps, renamed to what the
# game calls them, and touches nothing inside the files.
set -eu

SRC="${1:?usage: prep-forest.sh /path/to/golf}"
cd "$(dirname "$0")/.."
OUT=assets/forest
mkdir -p "$OUT"

V="$SRC/sprites/vegetation"
T="$SRC/textures"

pair() {   # <golf sprite stem> <our name>
  cp "$V/SPRITE_$1.png"      "$OUT/$2.png"
  cp "$V/SPRITE_$1_burn.png" "$OUT/$2_burn.png"
}
pair tall_fir_1_256      fir_tall_1
pair tall_fir_2_256      fir_tall_2
pair medium_fir_1_256    fir_medium
pair juvenile_fir_1_256  fir_young
pair large_bush_1_128    bush_large_1
pair large_bush_4_128    bush_large_2
pair small_bush_1_128    bush_small_1
pair small_bush_2_128    bush_small_2
pair fern_1_128          fern
pair grass_6_128         grass

cp "$T/TEX_forest_ground_01_albedo_128.png" "$OUT/ground.png"
cp "$T/TEX_crater_char_albedo_128.png"      "$OUT/ground_burnt.png"

printf 'assets/forest: '
ls "$OUT" | wc -l | tr -d ' '
printf ' files, '
du -sh "$OUT" | cut -f1
