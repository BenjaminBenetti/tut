"""Mech A assembled reference: every part placed at its socket. See mech_a_parts.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mech_a_parts import build_assembled  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the whole mech standing on the ground."""
    build_assembled()
