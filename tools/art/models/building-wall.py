"""City kit: solid brick wall, 1 u long, 1.5 u tall, pivot at the base midpoint."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_kit_parts import BRICK, BRICK_TOP, PLINTH_HEIGHT, WALL_LENGTH, wall_bands, wall_panel  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Plinth, one brick field, cornice."""
    wall_bands(BRICK)
    wall_panel("field", WALL_LENGTH, PLINTH_HEIGHT, BRICK_TOP, material=BRICK)
