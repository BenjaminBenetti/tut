"""Lagos: stocky oil palm with an arched crown inside one tile."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lagos_kit_parts import oil_palm  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a grounded, solid-frond palm with the ordinary tree pivot."""
    oil_palm()
