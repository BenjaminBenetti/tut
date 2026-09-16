"""A low pastry display with two bread trays, blue glass and a timber cabinet."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import display_glazing, faceted_food, finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Show two rows of golden loaves through a framed shop display front."""
    box("plinth", (0.83, 0.48, 0.055), (0, 0, 0.0275), "env-roof")
    box("cabinet", (0.87, 0.52, 0.255), (0, 0, 0.1725), "env-bark")
    box("front_inset", (0.76, 0.024, 0.17), (0, -0.27, 0.18), "env-sand")
    box("lower_tray", (0.88, 0.53, 0.028), (0, 0, 0.324), "env-metal")
    box("upper_tray", (0.84, 0.31, 0.023), (0, 0.09, 0.512), "env-metal")
    box("back_glass", (0.87, 0.022, 0.36), (0, 0.25, 0.53), "env-glass")
    box("glass_top", (0.92, 0.55, 0.028), (0, 0, 0.724), "env-glass")
    for side in (-1, 1):
        box(f"side_glass_{side}", (0.021, 0.515, 0.36), (side * 0.435, 0, 0.53), "env-glass")
        box(f"front_post_{side}", (0.024, 0.026, 0.365), (side * 0.425, -0.257, 0.526), "env-metal")
        box(f"tray_label_{side}", (0.10, 0.014, 0.04), (side * 0.245, -0.275, 0.33), "env-plaster-warm")
    box("front_top_rail", (0.87, 0.024, 0.023), (0, -0.26, 0.704), "env-metal")
    box("front_glass", (0.82, 0.009, 0.33), (0, -0.256, 0.526), "env-glass")
    for row, z in enumerate((0.385, 0.568)):
        for column, x in enumerate((-0.27, 0, 0.27)):
            faceted_food(f"bread_{row}_{column}", (x, -0.105 if row == 0 else 0.045, z), 0.08, "env-sand" if row == 0 else "env-plaster-warm", scale=(1.30, 0.80, 0.65))
    display_glazing()
    finish_prop("bakery_case")
