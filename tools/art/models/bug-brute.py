"""Bug: bug-brute. See brute_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brute_parts import build_brute  # noqa: E402

FOOTPRINT = (2, 2)


def build() -> None:
    """Build the brute at its real two-tile footprint with grounded feet."""
    build_brute()
