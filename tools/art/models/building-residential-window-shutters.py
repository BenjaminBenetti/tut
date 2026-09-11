"""Reproducible urban life module: building.residential-window-shutters (#1110)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urban_life_parts import shutters  # noqa: E402

FOOTPRINT = (1, 0.15)


def build() -> None:
    """Build the module at its documented base or wall pivot."""
    shutters()
