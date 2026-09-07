#!/bin/sh
# Rebuild assets/sprites/employee from the untouched Freedoom frames:
#   1. paint the smiley face over the helmet
#   2. dress the torso in the blue SellWrong apron
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
python3 tools/employee_face.py  assets/sprites/employee_original "$TMP" > /dev/null
python3 tools/employee_apron.py "$TMP" assets/sprites/employee > /dev/null
rm -rf "$TMP"
echo "rebuilt $(ls assets/sprites/employee/*.png | wc -l) frames"
