"""Small timber dining setting with two pulled-out chairs and cream plates."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a readable two-person table without hiding the open leg spaces."""
    box("timber_tabletop", (0.59, 0.44, 0.042), (0, 0, 0.39), "env-plaster-warm")
    for x in (-0.235, 0.235):
        for y in (-0.15, 0.15):
            box(f"table_leg_{x}_{y}", (0.045, 0.045, 0.369), (x, y, 0.1845), "env-bark")
    for side in (-1, 1):
        centre_y = side * 0.328
        box(f"chair_seat_{side}", (0.245, 0.245, 0.035), (0, centre_y, 0.216), "env-bark")
        box(f"seat_pad_{side}", (0.222, 0.21, 0.024), (0, centre_y - side * 0.01, 0.245), "env-roof-green")
        for x in (-0.087, 0.087):
            for offset_y in (-0.088, 0.088):
                box(f"chair_leg_{side}_{x}_{offset_y}", (0.034, 0.034, 0.199), (x, centre_y + offset_y, 0.0995), "env-bark")
        box(f"chair_back_{side}", (0.235, 0.037, 0.24), (0, centre_y + side * 0.105, 0.342), "env-roof-green")
        cylinder(f"place_setting_{side}", 0.076, 0.072, 0.008, 8, (0, side * 0.12, 0.415), "env-snow")
