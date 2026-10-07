"""Building: the Skyfall great pod's hull curve (#1238). See great_pod_hull_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from great_pod_hull_parts import build_curve  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """A hull corner joining east and north, its armour on the convex south-west side."""
    build_curve()
