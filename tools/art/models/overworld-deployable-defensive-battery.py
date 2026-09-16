"""Defensive battery for the strategic map: squat armoured emplacement, twin-barrel mount on top.

    blender -b --python tools/art/make_model.py -- \
        --script tools/art/models/overworld-deployable-defensive-battery.py \
        --id overworld.deployable.defensive-battery --category props \
        --file overworld-deployable-defensive-battery.glb --max-triangles 300

Animation contract (#1153): the gun mount (ring, housing, barrels, optic) is
one child node named ``animated`` under ``base``. Its origin is the vertical
axis through the mount's centre at the bunker roof, (0, 0, 0.16) in Blender
(x, y-up 0.16, z 0 in glTF), so ``rotation.y`` traverses the barrels.
Everything else is static.

        ═╦═══╦═  barrels (front, -Y)
        ┌┴───┴┐
        │mount│ ◄─ animated, yaws about the vertical centre axis
      ┌─┴─────┴─┐
      │ bunker  │
    ┌─┴─────────┴─┐
    │   plinth    │  z = 0
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deployable_parts import (  # noqa: E402
    FOOTPRINT,
    finish_animated,
    finish_base,
    horizontal_cylinder,
    lens,
    marking,
)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder  # noqa: E402

FOOTPRINT = FOOTPRINT

MOUNT_Z = 0.16
"""Bunker roof height: the mount's axis origin sits here."""


def build() -> None:
    """Octagonal plinth and bunker, then the yawing twin-barrel mount."""
    static = [
        cylinder("plinth", 0.215, 0.225, 0.05, 8, (0, 0, 0.025), "tdf-grey-dark"),
        cylinder("bunker", 0.165, 0.19, 0.11, 8, (0, 0, 0.105), "tdf-grey-mid"),
        marking("stripe_front", (0.10, 0.012, 0.03), (0, -0.183, 0.08)),
        marking("stripe_back", (0.10, 0.012, 0.03), (0, 0.183, 0.08)),
        box("hatch", (0.07, 0.05, 0.015), (0.10, 0.0, MOUNT_Z + 0.005), "tdf-grey-light"),
    ]
    base = finish_base(static)

    moving = [
        cylinder("ring", 0.105, 0.115, 0.04, 8, (0, 0, MOUNT_Z + 0.02), "tdf-grey-light"),
        box("housing", (0.17, 0.15, 0.075), (0, 0.01, MOUNT_Z + 0.075), "tdf-grey-mid"),
        box("housing_cap", (0.12, 0.10, 0.02), (0, 0.02, MOUNT_Z + 0.12), "tdf-grey-dark"),
        lens("optic", (0.04, 0.012, 0.02), (0, -0.07, MOUNT_Z + 0.09)),
    ]
    for x in (-0.04, 0.04):
        moving.append(horizontal_cylinder(f"barrel_{x:+.2f}", 0.014, 0.017, 0.17, 6, (x, -0.135, MOUNT_Z + 0.06), "tdf-grey-dark"))
        moving.append(horizontal_cylinder(f"muzzle_{x:+.2f}", 0.02, 0.02, 0.02, 6, (x, -0.21, MOUNT_Z + 0.06), "tdf-orange"))
    finish_animated(moving, (0.0, 0.0, MOUNT_Z), base)
