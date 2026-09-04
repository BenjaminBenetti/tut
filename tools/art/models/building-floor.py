"""City kit: interior floor slab, 1x1 u, 0.05 u thick."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_kit_parts import panelled_deck  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Paved trim ring around a concrete centre; colour, not depth, marks the border."""
    panelled_deck("floor", 0.05, "env-sidewalk", "env-concrete")
