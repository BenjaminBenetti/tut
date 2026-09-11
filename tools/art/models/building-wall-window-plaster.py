"""Warm rendered masonry with the accepted glazed opening."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_kit_parts import wall_bands, window_opening  # noqa: E402
from lagos_kit_parts import PLASTER  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Keep the full window, sill and floor bands at their existing positions."""
    wall_bands(PLASTER)
    window_opening(material=PLASTER)
