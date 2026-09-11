"""Perth: low grass tree with a dark trunk and arching grey-green leaves."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from perth_kit_parts import grass_tree  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the low tuft with closed, flat-shaded leaves."""
    grass_tree()
