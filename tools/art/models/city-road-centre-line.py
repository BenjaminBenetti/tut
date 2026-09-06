"""One dashed centre line along a lane's +Z edge in glTF."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carriageway_parts import build_carriageway

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the lane beside the carriageway centre."""
    build_carriageway("centre")
