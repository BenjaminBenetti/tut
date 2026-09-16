"""Egg-infestation overlay for the rural settlement marker (#1152).

Stacks on overworld-settlement-rural.glb: same plot, same pivot, no plate.
See settlement_parts.py; run through make_model.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from settlement_parts import build_settlement_eggs  # noqa: E402

FOOTPRINT = (0.6, 0.6)


def build() -> None:
    """Build the egg clusters and webbing over the rural layout."""
    build_settlement_eggs("rural")
