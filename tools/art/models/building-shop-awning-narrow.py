"""One-bay retail awning for an entrance beside a ladder or a corner (#960)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from frontage_parts import shop_awning  # noqa: E402

FOOTPRINT = (1, 0.66)


def build() -> None:
    """Build the same fabric and mount at one-bay width, leaving adjacent routes clear."""
    shop_awning(width=1, stripes=4)
