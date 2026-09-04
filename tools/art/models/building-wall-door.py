"""City kit: brick wall with an open doorway, metal threshold and a door socket."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box, socket  # noqa: E402
from city_kit_parts import BRICK, CORNICE_HEIGHT, CORNICE_THICKNESS, WALL_HEIGHT, WALL_LENGTH, door_opening  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Doorway with the cornice band kept; the plinth is broken by the threshold."""
    cornice = box(
        "cornice",
        (WALL_LENGTH, CORNICE_THICKNESS, CORNICE_HEIGHT),
        (0, 0, WALL_HEIGHT - CORNICE_HEIGHT / 2),
        BRICK.band,
    )
    bevel(cornice, 0.015)
    door_opening(material=BRICK)
    socket("door", (0, 0, 0))
