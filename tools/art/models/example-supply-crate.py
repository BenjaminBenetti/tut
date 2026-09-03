"""Example model script for the art-blender skill: a strapped supply crate.

    blender -b --python tools/art/make_model.py -- --script tools/art/models/example-supply-crate.py \
        --id prop.supply-crate --category props --file supply-crate.glb --quality final

Keep feet on z = 0 and the front facing -Y. Sizes are in tiles (1 u = 2 m).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder, socket  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """A 0.7 u crate with two metal straps, a lid lip and a lift socket on top."""
    box("crate", (0.7, 0.7, 0.6), (0, 0, 0.3), "env-bark")
    box("lid", (0.74, 0.74, 0.06), (0, 0, 0.63), "env-bark")
    box("strap_x", (0.76, 0.06, 0.62), (0, 0, 0.31), "env-metal")
    box("strap_y", (0.06, 0.76, 0.62), (0, 0, 0.31), "env-metal")
    box("marking", (0.3, 0.02, 0.16), (0, -0.36, 0.36), "tdf-orange")
    for x in (-0.25, 0.25):
        cylinder(f"foot_{x:+.2f}", 0.05, 0.06, 0.06, 6, (x, 0, 0.03), "env-metal")
    socket("lift", (0, 0, 0.66))
