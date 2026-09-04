"""City kit: brick wall with a glazed opening, sill and metal frame cross."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_kit_parts import wall_bands, window_opening  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Plinth and cornice with a window between them."""
    wall_bands()
    window_opening()
