"""Reproducible urban life module: building.wall-ac-unit (#1110)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urban_life_parts import wall_ac  # noqa: E402

FOOTPRINT = (0.7, 0.32)


def build() -> None:
    """Build the module at its documented base or wall pivot."""
    wall_ac()
