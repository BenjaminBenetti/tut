"""Building use detail: shop-awning, mounted against an existing wall (#960)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from frontage_parts import shop_awning  # noqa: E402

FOOTPRINT = (3, 0.66)


def build() -> None:
    """Build the wall-mounted module without changing the shell."""
    shop_awning()
