# Employee sprite

`employee/` is the Freedoom player sprite (`PLAY*` standing, `PLYC*` crouching)
with a disturbing smiley face painted over the front of the helmet and a blue
SellWrong apron (bib with the logo, waist tie with a bow at the back, skirt
over the hips) painted onto the torso armour.

`employee_original/` holds the untouched Freedoom source frames.
`employee_preview.png` shows before/after for all eight rotations plus crouch,
pain, death and gib frames.

Regenerate with:

    tools/build_employee.sh

which runs `tools/employee_face.py` (helmet face) and then
`tools/employee_apron.py` (apron) over the original frames.

Face placement is derived from the blue visor and the helmet outline and
projected onto a sphere so the face turns with the head. Frames whose head is
tilted or turned past the visor (firing poses, death, gibs) are hand-tuned in
`tools/employee_face_overrides.json`.

The apron treats the chest and hips as cylinders, so the bib and logo
foreshorten with rotation, the skirt covers the front 200 degrees, and only the
tie and bow show from behind. Lying-down death frames are forced to the back
view in `tools/employee_apron_overrides.json`.
