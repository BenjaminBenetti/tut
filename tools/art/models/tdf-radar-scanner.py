"""Compact field radar: splayed feet, power pack, mast and tilted dish."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a closed, low-poly scanner under one tile wide and one soldier tall."""
    box("foot_x", (0.65, 0.10, 0.06), (0, 0, 0.03), "tdf-grey-dark")
    box("foot_y", (0.10, 0.60, 0.06), (0, 0, 0.03), "tdf-grey-dark")
    box("power_pack", (0.30, 0.27, 0.20), (0, 0, 0.16), "tdf-olive")
    box("status_panel", (0.16, 0.015, 0.06), (0, -0.142, 0.19), "tdf-visor")
    cylinder("mast", 0.04, 0.055, 0.38, 8, (0, 0, 0.44), "tdf-grey-mid")
    cylinder("dish", 0.27, 0.09, 0.10, 12, (0, -0.01, 0.70), "tdf-grey-light", rot=(math.pi / 3, 0, 0))
    cylinder("dish_face", 0.22, 0.22, 0.015, 12, (0, -0.06, 0.735), "tdf-olive-dark", rot=(math.pi / 3, 0, 0))
    box("feed_arm", (0.025, 0.20, 0.025), (0, -0.19, 0.75), "tdf-grey-mid")
    box("feed", (0.065, 0.06, 0.065), (0, -0.28, 0.75), "tdf-orange")
