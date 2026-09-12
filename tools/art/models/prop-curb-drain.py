"""Flush street infrastructure: prop.curb-drain (#1110)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urban_life_parts import curb_drain  # noqa: E402

FOOTPRINT = (0.26, 0.62)


def build() -> None:
    """Build a closed shallow surface detail without simulation collision."""
    curb_drain()
