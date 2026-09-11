"""Flush street infrastructure: prop.manhole (#1110)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urban_life_parts import manhole  # noqa: E402

FOOTPRINT = (0.56, 0.56)


def build() -> None:
    """Build a closed shallow surface detail without simulation collision."""
    manhole()
