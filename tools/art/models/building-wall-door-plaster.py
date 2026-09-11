"""Warm rendered masonry with the existing open doorway and door socket."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box, socket  # noqa: E402
from city_kit_parts import CORNICE_HEIGHT, CORNICE_THICKNESS, WALL_HEIGHT, WALL_LENGTH, door_opening  # noqa: E402
from lagos_kit_parts import PLASTER  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Retain the passable opening, cornice and grounded steel threshold."""
    cornice = box("cornice", (WALL_LENGTH, CORNICE_THICKNESS, CORNICE_HEIGHT),
                  (0, 0, WALL_HEIGHT - CORNICE_HEIGHT / 2), PLASTER.band)
    bevel(cornice, 0.015)
    door_opening(material=PLASTER)
    socket("door", (0, 0, 0))
