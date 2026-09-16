"""Warm domestic bookcase with three shelves of varied, muted book spines."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Fit readable books and a wood frame into a one-tile high-cover cabinet."""
    box("plinth", (0.82, 0.38, 0.07), (0, 0, 0.035), "env-bark")
    box("back_panel", (0.76, 0.025, 0.94), (0, 0.1675, 0.53), "env-sand")
    for side in (-1, 1):
        box(f"side_{side}", (0.04, 0.345, 0.94), (side * 0.38, 0, 0.53), "env-bark")
    box("cornice", (0.83, 0.38, 0.045), (0, 0, 1.0175), "env-bark")
    rows = (
        ((-0.285, 0.235, "env-roof-green"), (-0.155, 0.26, "env-brick"), (-0.02, 0.215, "env-plaster-warm"), (0.105, 0.24, "env-glass"), (0.25, 0.255, "env-brick")),
        ((-0.275, 0.22, "env-brick"), (-0.12, 0.25, "env-glass"), (0.075, 0.205, "env-roof-green"), (0.23, 0.245, "env-plaster-warm")),
        ((-0.285, 0.25, "env-glass"), (-0.15, 0.205, "env-plaster-warm"), (-0.015, 0.23, "env-brick"), (0.115, 0.25, "env-roof-green"), (0.26, 0.225, "env-glass")),
    )
    for row, base in enumerate((0.08, 0.39, 0.70)):
        box(f"shelf_{row}", (0.755, 0.335, 0.028), (0, 0, base), "env-bark")
        for column, (x, height, token) in enumerate(rows[row]):
            width = 0.085 if column % 2 == 0 else 0.105
            box(f"book_{row}_{column}", (width, 0.255, height), (x, -0.026, base + 0.014 + height / 2), token)
        x, height, _ = rows[row][row]
        box(f"spine_label_{row}", (0.06, 0.007, 0.07), (x, -0.157, base + 0.08 + height / 2), "env-plaster-warm")
    finish_prop("bookcase")
