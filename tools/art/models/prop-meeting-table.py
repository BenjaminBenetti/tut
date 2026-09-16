"""Small office meeting table, four upholstered chairs and working papers."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Seat four at a compact table with the chairs safely inside the tile."""
    box("tabletop", (0.80, 0.43, 0.045), (0, 0, 0.405), "env-plaster-warm")
    for side in (-1, 1):
        box(f"table_foot_{side}", (0.12, 0.37, 0.025), (side * 0.255, 0, 0.0125), "env-metal")
        box(f"table_pedestal_{side}", (0.07, 0.22, 0.365), (side * 0.255, 0, 0.2025), "env-roof")
    for column, x in enumerate((-0.235, 0.235)):
        for side in (-1, 1):
            y = side * 0.337
            box(f"chair_foot_{column}_{side}", (0.19, 0.16, 0.025), (x, y, 0.0125), "env-roof")
            box(f"chair_support_{column}_{side}", (0.052, 0.052, 0.245), (x, y, 0.1425), "env-metal")
            box(f"chair_seat_{column}_{side}", (0.24, 0.22, 0.04), (x, y, 0.255), "env-roof-green")
            box(f"chair_back_{column}_{side}", (0.23, 0.04, 0.28), (x, y + side * 0.105, 0.385), "env-roof-green")
    box("meeting_folder", (0.18, 0.125, 0.016), (-0.19, 0.045, 0.4355), "env-brick")
    box("meeting_papers", (0.14, 0.13, 0.008), (0.19, -0.04, 0.4315), "env-sidewalk")
    finish_prop("meeting_table")
