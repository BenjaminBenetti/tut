"""City kit: brick wall with an open doorway, metal frame and threshold."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import socket  # noqa: E402
from city_kit_parts import CORNICE_HEIGHT, CORNICE_THICKNESS, WALL_HEIGHT, WALL_LENGTH, door_opening  # noqa: E402
from bpy_kit import bevel, box  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Doorway with the cornice band kept; the plinth is broken by the threshold."""
    cornice = box(
        "cornice",
        (WALL_LENGTH, CORNICE_THICKNESS, CORNICE_HEIGHT),
        (0, 0, WALL_HEIGHT - CORNICE_HEIGHT / 2),
        "env-concrete",
    )
    bevel(cornice, 0.015)
    door_opening()
    socket("door", (0, 0, 0))
