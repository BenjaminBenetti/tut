"""Two timber produce bins, overflowing with red apples and green vegetables."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import faceted_food, finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Make a low market fixture with two clearly separated produce colours."""
    box("plinth", (0.80, 0.46, 0.055), (0, 0, 0.0275), "env-roof")
    box("timber_stand", (0.86, 0.54, 0.27), (0, 0, 0.1775), "env-bark")
    for side in (-1, 1):
        box(f"tray_floor_{side}", (0.39, 0.49, 0.035), (side * 0.22, 0, 0.3325), "env-sand")
        box(f"tray_end_{side}", (0.028, 0.57, 0.125), (side * 0.445, 0, 0.375), "env-bark")
        box(f"price_card_{side}", (0.12, 0.012, 0.065), (side * 0.22, -0.303, 0.385), "env-plaster-warm")
    box("front_board", (0.90, 0.03, 0.11), (0, -0.278, 0.372), "env-sand")
    box("back_board", (0.90, 0.03, 0.11), (0, 0.278, 0.372), "env-sand")
    box("divider", (0.03, 0.54, 0.13), (0, 0, 0.377), "env-bark")
    for side, token in ((-1, "env-brick"), (1, "env-foliage")):
        for index, (dx, y) in enumerate(((-0.08, -0.105), (0.075, -0.09), (-0.07, 0.075), (0.075, 0.105))):
            faceted_food(f"produce_{side}_{index}", (side * 0.22 + dx, y, 0.42), 0.087, token)
    finish_prop("produce_bin")
