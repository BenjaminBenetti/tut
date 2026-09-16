"""Readable bookshop storefront canopy with embedded printed fascia."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from business_sign_parts import build_business_sign  # noqa: E402

FOOTPRINT = (1, 0.66)


def build() -> None:
    """Build the door-clearing canopy, mounted 1.08 units above the floor."""
    build_business_sign("bookshop", compact=True)
