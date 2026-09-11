"""Reproducible urban life module: building.shop-awning-sign (#1110)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from urban_life_parts import shop_sign_awning  # noqa: E402

FOOTPRINT = (3, 0.67)


def build() -> None:
    """Build the module at its documented base or wall pivot."""
    shop_sign_awning()
