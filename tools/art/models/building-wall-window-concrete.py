"""City kit: window wall in the concrete family."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_kit_parts import CONCRETE, wall_bands, window_opening  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Plinth and cornice with a glazed opening between them."""
    wall_bands(CONCRETE)
    window_opening(material=CONCRETE)
