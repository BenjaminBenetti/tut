"""Perth: compact branching tuart for the existing one-tile tree footprint."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from perth_kit_parts import tuart  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Make the grounded grey-green tree and open branching crown."""
    tuart()
