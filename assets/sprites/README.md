# Employee sprite

`employee/` is the Freedoom player sprite (`PLAY*` standing, `PLYC*` crouching)
with a disturbing smiley face painted over the front of the helmet.

`employee_original/` holds the untouched Freedoom source frames.
`employee_preview.png` shows before/after for all eight rotations plus crouch,
pain, death and gib frames.

Regenerate with:

    python3 tools/employee_face.py assets/sprites/employee_original assets/sprites/employee

Face placement is derived from the blue visor and the helmet outline and
projected onto a sphere so the face turns with the head. Frames whose head is
tilted or turned past the visor (firing poses, death, gibs) are hand-tuned in
`tools/employee_face_overrides.json`.
