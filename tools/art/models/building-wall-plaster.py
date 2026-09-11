"""Warm rendered masonry; ordinary wall footprint, bands and openings."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_kit_parts import BRICK_TOP, PLINTH_HEIGHT, WALL_LENGTH, wall_bands, wall_panel  # noqa: E402
from lagos_kit_parts import PLASTER  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Use the accepted wall geometry with a warm plaster field."""
    wall_bands(PLASTER)
    wall_panel("field", WALL_LENGTH, PLINTH_HEIGHT, BRICK_TOP, material=PLASTER)
