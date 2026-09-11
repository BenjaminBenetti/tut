"""Perth: weathered limestone mass with an irregular shoulder and toe."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from perth_kit_parts import limestone_outcrop  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a closed grounded rock, retaining the ordinary boulder height class."""
    limestone_outcrop()
