"""Bug: the Skyfall great pod's core (#1238), damaged. See great_pod_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from great_pod_parts import DAMAGED, build_great_pod_core  # noqa: E402

FOOTPRINT = (3, 3)


def build() -> None:
    """The spore pod grown huge on its 3×3 skirt, below half health: staves snapped off onto the roots, membrane torn, glow guttering."""
    build_great_pod_core(DAMAGED)
