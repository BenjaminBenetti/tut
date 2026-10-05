"""Building: the Skyfall great pod's hull seam (#1238). See great_pod_hull_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from great_pod_hull_parts import build_seam  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """The straight module split down the middle, magenta tissue bulging through: the soft spot."""
    build_seam()
