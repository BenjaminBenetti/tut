"""Mech variant: weapon-back-rotary-cannon. See mech_b_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mech_b_parts import build_rotary_cannon  # noqa: E402

FOOTPRINT = (0, 0)


def build() -> None:
    """Build this part at its pivot."""
    build_rotary_cannon()
