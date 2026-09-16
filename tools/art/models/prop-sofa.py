"""Compact two-seat sage sofa, with inset seat cushions and one cream pillow."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a human-scale upholstered sofa with its open seating facing -Y."""
    for x in (-0.36, 0.36):
        for y in (-0.16, 0.16):
            box(f"foot_{x}_{y}", (0.055, 0.055, 0.07), (x, y, 0.035), "env-bark")
    box("upholstered_base", (0.86, 0.46, 0.105), (0, 0, 0.1125), "env-roof-green")
    box("back_frame", (0.88, 0.08, 0.295), (0, 0.21, 0.2975), "env-roof-green")
    for x in (-0.415, 0.415):
        bevel(box(f"rounded_arm_{x}", (0.105, 0.49, 0.23), (x, 0, 0.25), "env-roof-green"), 0.018)
    for x in (-0.18, 0.18):
        bevel(box(f"seat_cushion_{x}", (0.352, 0.345, 0.085), (x, -0.026, 0.205), "env-sclerophyll-leaf-light"), 0.016)
        box(f"back_cushion_{x}", (0.347, 0.09, 0.19), (x, 0.125, 0.33), "env-sclerophyll-leaf-light", rot=(math.radians(10), 0, 0))
    box("cream_throw_pillow", (0.14, 0.065, 0.14), (-0.245, 0.04, 0.304), "env-plaster-warm", rot=(math.radians(18), math.radians(-12), math.radians(-8)))
