"""Infantry squad: rifle kit. See squad_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_parts import build_squad  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Five soldiers on one base, rifle specialist on the left flank."""
    build_squad("rifle")
