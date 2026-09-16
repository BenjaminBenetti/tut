"""Timber bed with layered bedding, two chamfered pillows and a folded cover."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a compact double bed with the headboard toward the back wall."""
    for x in (-0.285, 0.285):
        for y in (-0.385, 0.385):
            box(f"timber_foot_{x}_{y}", (0.06, 0.06, 0.105), (x, y, 0.0525), "env-bark")
    box("bed_frame", (0.72, 0.94, 0.095), (0, 0, 0.135), "env-bark")
    box("headboard", (0.74, 0.05, 0.42), (0, 0.46, 0.29), "env-bark")
    box("headboard_inset", (0.63, 0.017, 0.22), (0, 0.428, 0.365), "env-plaster-warm")
    bevel(box("cream_mattress", (0.66, 0.875, 0.12), (0, -0.015, 0.23), "env-snow"), 0.025)
    box("sage_cover", (0.68, 0.59, 0.065), (0, -0.155, 0.274), "env-roof-green")
    box("folded_cover_edge", (0.684, 0.105, 0.027), (0, 0.0875, 0.318), "env-sclerophyll-leaf-light")
    box("blanket_foot_hem", (0.686, 0.035, 0.06), (0, -0.433, 0.268), "env-sclerophyll-leaf-light")
    for x in (-0.165, 0.165):
        bevel(box(f"pillow_{x}", (0.27, 0.185, 0.07), (x, 0.298, 0.315), "env-plaster-warm"), 0.022)
