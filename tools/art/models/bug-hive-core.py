"""Bug: the Hive Assault's hive core, whole. See hive_core_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hive_core_parts import build_hive_core  # noqa: E402

FOOTPRINT = (3, 3)


def build() -> None:
    """The heart in its crown of ribs, its windows glowing, on its 3×3 floor."""
    build_hive_core(damaged=False)
