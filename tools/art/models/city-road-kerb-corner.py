"""Outer lane with a continuous kerb turn on +X/+Z in glTF."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carriageway_parts import build_carriageway

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the kerb turn without overlapping top faces."""
    build_carriageway("corner")
