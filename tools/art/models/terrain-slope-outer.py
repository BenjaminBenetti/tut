"""Terrain slope: convex hip, high corner (+X, +Z) in glTF."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain_slope_parts import build_slope

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the two-plane outer corner."""
    build_slope("outer")
