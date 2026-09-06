"""One planar three-sided rise for consecutive terrain corners (#848)."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain_slope_parts import build_slope

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the three-sided plane at the shared RISE."""
    build_slope("three-sided")
