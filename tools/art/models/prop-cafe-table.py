"""An intimate two-seat cafe table with a coffee cup and folded napkin."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box, cylinder
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Pair a round bistro table with two distinct four-legged wood chairs."""
    cylinder("table_foot", 0.125, 0.145, 0.028, 6, (0, 0, 0.014), "env-roof")
    cylinder("table_column", 0.029, 0.033, 0.375, 6, (0, 0, 0.2125), "env-metal")
    cylinder("round_top", 0.245, 0.245, 0.035, 8, (0, 0, 0.415), "env-sand")
    for side in (-1, 1):
        x = side * 0.345
        box(f"chair_seat_{side}", (0.23, 0.245, 0.036), (x, 0, 0.245), "env-bark")
        box(f"chair_back_{side}", (0.032, 0.235, 0.25), (side * 0.458, 0, 0.378), "env-roof-green")
        for index, (dx, y) in enumerate(((-0.085, -0.09), (0.085, -0.09), (-0.085, 0.09), (0.085, 0.09))):
            box(f"chair_leg_{side}_{index}", (0.027, 0.027, 0.228), (x + dx, y, 0.114), "env-bark")
    cylinder("coffee_cup", 0.032, 0.026, 0.063, 6, (-0.105, -0.035, 0.464), "env-plaster-warm")
    cylinder("coffee", 0.025, 0.025, 0.003, 6, (-0.105, -0.035, 0.497), "env-bark")
    box("napkin", (0.075, 0.105, 0.007), (0.105, 0.025, 0.436), "env-plaster-warm")
    finish_prop("cafe_table")
