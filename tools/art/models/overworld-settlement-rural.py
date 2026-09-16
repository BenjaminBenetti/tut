"""Overworld settlement marker, rural scale (#1152). See settlement_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from settlement_parts import build_settlement  # noqa: E402

FOOTPRINT = (0.6, 0.6)


def build() -> None:
    """Build the rural settlement on its 0.6 u plot, pivot at the base centre."""
    build_settlement("rural")
