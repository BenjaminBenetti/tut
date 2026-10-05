"""Bug: the Skyfall great pod's core (#1238), ripe. See great_pod_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from great_pod_parts import RIPE, build_great_pod_core  # noqa: E402

FOOTPRINT = (3, 3)


def build() -> None:
    """The spore pod grown huge on its 3×3 skirt, split open into petals round its bright orb, about to burst."""
    build_great_pod_core(RIPE)
