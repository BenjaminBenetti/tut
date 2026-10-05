"""Bug: the Skyfall great pod's core (#1238), standing. See great_pod_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from great_pod_parts import STANDING, build_great_pod_core  # noqa: E402

FOOTPRINT = (3, 3)


def build() -> None:
    """The spore pod grown huge on its 3×3 skirt, standing, its seams glowing and its crown split over the hatch."""
    build_great_pod_core(STANDING)
