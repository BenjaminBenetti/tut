"""Bug: the Hive Assault's hive core below half health. See hive_core_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hive_core_parts import build_hive_core  # noqa: E402

FOOTPRINT = (3, 3)


def build() -> None:
    """Ribs snapped, the membrane torn open at the front, the glow dulled."""
    build_hive_core(damaged=True)
