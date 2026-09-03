"""Mech A: weapon-back-missile-pod. See mech_a_parts.py for the design; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mech_a_parts import build_missile_pod  # noqa: E402

FOOTPRINT = (0, 0)


def build() -> None:
    """Build this part at its pivot."""
    build_missile_pod()
