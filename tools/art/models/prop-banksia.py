"""Perth: compact Banksia crown with upright flower spikes."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from perth_kit_parts import banksia  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Make a small irregular woodland tree inside one tile."""
    banksia()
