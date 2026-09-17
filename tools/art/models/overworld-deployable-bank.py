"""Bank for the strategic map: squat vault block with a stepped roof and a turning credit sign.

    blender -b --python tools/art/make_model.py -- \\
        --script tools/art/models/overworld-deployable-bank.py \\
        --id overworld.deployable.bank --category props \\
        --file overworld-deployable-bank.glb --max-triangles 300

Animation contract (#1153, #1155): the holographic credit sign (bearing,
frame, panel, emblem) is one child node named ``animated`` under ``base``.
Its origin is the mast top centre, (0, 0, 0.22) in Blender (x 0, y-up 0.22,
z 0 in glTF), so ``rotation.y`` turns the sign about the mast. Everything
else is static.

           ┌────────┐
           │  sign  │  ◄─ animated, turns about the mast's vertical axis
           └───╥────┘
             ┌─╨─┐      upper tier
        ┌────┴───┴────┐ cornice + orange band
     ●  │    vault    │ ● beacon on a roof corner
        │  ┌──┐       │ armoured door with vault wheel (front, -Y)
    ┌───┴──┴──┴───────┴───┐
    │      foundation     │  z = 0
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deployable_parts import (  # noqa: E402
    FOOTPRINT,
    finish_animated,
    finish_base,
    foundation,
    horizontal_cylinder,
    lens,
    marking,
)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder  # noqa: E402

FOOTPRINT = FOOTPRINT

VAULT_W, VAULT_D, VAULT_H = 0.28, 0.24, 0.12
"""Vault block: wider than deep so the door face reads as the front."""

VAULT_TOP_Z = 0.03 + VAULT_H
"""Top of the vault block, where the cornice sits."""

MAST_TOP_Z = 0.22
"""Mast top: the sign's axis origin sits here."""


def build() -> None:
    """Foundation, vault with corner pillars, stepped roof and beacon, then the turning sign."""
    door_y = -VAULT_D / 2
    static = [
        foundation(0.40),
        box("vault", (VAULT_W, VAULT_D, VAULT_H), (0.0, 0.0, 0.03 + VAULT_H / 2), "tdf-grey-mid"),
        box("cornice", (VAULT_W + 0.03, VAULT_D + 0.03, 0.02), (0.0, 0.0, VAULT_TOP_Z + 0.01), "tdf-grey-light"),
        marking("band", (VAULT_W + 0.012, VAULT_D + 0.012, 0.012), (0.0, 0.0, VAULT_TOP_Z - 0.014)),
        box("upper_tier", (0.17, 0.15, 0.03), (0.0, 0.0, VAULT_TOP_Z + 0.035), "tdf-grey-mid"),
        box("upper_cap", (0.10, 0.09, 0.012), (0.0, 0.0, VAULT_TOP_Z + 0.056), "tdf-grey-dark"),
        cylinder("mast", 0.012, 0.016, 0.03, 6, (0.0, 0.0, MAST_TOP_Z - 0.015), "tdf-grey-dark"),
        box("door", (0.08, 0.012, 0.085), (0.0, door_y - 0.004, 0.0725), "tdf-grey-dark"),
        horizontal_cylinder("vault_wheel", 0.024, 0.024, 0.012, 8, (0.0, door_y - 0.014, 0.075), "tdf-grey-light"),
        lens("wheel_hub", (0.012, 0.008, 0.012), (0.0, door_y - 0.022, 0.075)),
        lens("side_slot", (0.012, 0.09, 0.02), (-VAULT_W / 2 - 0.004, 0.02, 0.115)),
        box("beacon_post", (0.014, 0.014, 0.03), (0.125, 0.105, VAULT_TOP_Z + 0.035), "tdf-grey-dark"),
        marking("beacon", (0.028, 0.028, 0.024), (0.125, 0.105, VAULT_TOP_Z + 0.062)),
    ]
    for x in (-VAULT_W / 2, VAULT_W / 2):
        for y in (-VAULT_D / 2, VAULT_D / 2):
            static.append(box(f"pillar_{x:+.2f}_{y:+.2f}", (0.05, 0.05, VAULT_H + 0.03), (x, y, 0.03 + (VAULT_H + 0.03) / 2), "tdf-grey-dark"))
    base = finish_base(static)

    sign_z = MAST_TOP_Z + 0.042
    moving = [
        cylinder("bearing", 0.02, 0.02, 0.016, 6, (0.0, 0.0, MAST_TOP_Z + 0.008), "tdf-grey-light"),
        box("sign_frame", (0.11, 0.008, 0.056), (0.0, 0.0, sign_z), "tdf-grey-dark"),
        lens("sign_panel", (0.094, 0.016, 0.044), (0.0, 0.0, sign_z)),
        marking("emblem", (0.02, 0.024, 0.018), (0.0, 0.0, sign_z)),
    ]
    finish_animated(moving, (0.0, 0.0, MAST_TOP_Z), base)
