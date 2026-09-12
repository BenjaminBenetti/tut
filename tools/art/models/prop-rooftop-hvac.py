"""Reproducible urban life module: prop.rooftop-hvac (#1110)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urban_life_parts import rooftop_hvac  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the module at its documented base or wall pivot."""
    rooftop_hvac()
