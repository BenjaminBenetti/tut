"""Bug: bug-broodmother, the boss egg-layer (#1179). See broodmother_parts.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from broodmother_parts import build_broodmother  # noqa: E402

FOOTPRINT = (3, 3)


def build() -> None:
    """Build the Broodmother at her real three-tile footprint."""
    build_broodmother(scarred=False)
