"""Cream-and-wood bedroom wardrobe with panelled doors and lower drawers."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a domestic high-cover cabinet with doors facing Blender -Y."""
    box("toe_kick", (0.77, 0.43, 0.065), (0, 0, 0.0325), "env-bark")
    box("carcass", (0.82, 0.46, 0.99), (0, 0, 0.55), "env-bark")
    bevel(box("top_cap", (0.88, 0.51, 0.055), (0, 0, 1.0725), "env-sand"), 0.012)
    box("bottom_rail", (0.85, 0.49, 0.045), (0, -0.01, 0.083), "env-sand")
    for side in (-1, 1):
        x = side * 0.195
        box(f"door_{side}", (0.37, 0.028, 0.745), (x, -0.242, 0.6525), "env-plaster-warm")
        box(f"door_panel_{side}", (0.295, 0.014, 0.64), (x, -0.26, 0.6525), "env-sidewalk")
        box(f"panel_insert_{side}", (0.263, 0.008, 0.608), (x, -0.272, 0.6525), "env-plaster-warm")
        box(f"door_handle_{side}", (0.018, 0.035, 0.11), (side * 0.067, -0.292, 0.64), "env-bark")
        box(f"drawer_{side}", (0.37, 0.034, 0.15), (x, -0.245, 0.182), "env-plaster-warm")
        box(f"drawer_handle_{side}", (0.10, 0.034, 0.023), (x, -0.271, 0.202), "env-bark")
    finish_prop("wardrobe")
