"""Prop: fire hydrant, 0.6 u tall."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box, cylinder, sphere  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Flanged base, barrel, bonnet and two side caps.

    Painted `env-rust` rather than a warning colour: `tdf-orange` is the
    selection and line-of-sight colour on the tactical plane (style guide
    §12.2), so no piece of scenery may wear it.
    """
    cylinder("flange", 0.17, 0.19, 0.05, 8, (0, 0, 0.025), "env-metal")
    cylinder("barrel", 0.11, 0.13, 0.38, 8, (0, 0, 0.24), "env-rust")
    cylinder("collar", 0.14, 0.14, 0.04, 8, (0, 0, 0.45), "env-metal")
    sphere("bonnet", 0.12, (0, 0, 0.5), "env-rust", segments=8, rings=4, scale=(1, 1, 0.8))
    box("nut", (0.06, 0.06, 0.05), (0, 0, 0.585), "env-metal")
    for side in (-1, 1):
        cylinder(
            f"cap_{'l' if side < 0 else 'r'}",
            0.05,
            0.06,
            0.07,
            6,
            (side * 0.14, 0, 0.29),
            "env-metal",
            rot=(0, math.radians(90), 0),
        )
