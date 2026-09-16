"""Compact pictogram clothing frontage canopy and sign."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from business_sign_parts import build_business_sign

FOOTPRINT = (1, 0.66)


def build() -> None:
    """Build the clothing identity with a rear facade pivot and an opaque fascia."""
    build_business_sign("clothing", compact=True)
