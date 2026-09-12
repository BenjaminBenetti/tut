"""Light municipal delivery vehicle on the two occupied tiles."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vehicle_variants import build_vehicle  # noqa: E402

FOOTPRINT = (1, 2)


def build() -> None:
    """A pale enclosed cargo body distinguishes service vehicles at map zoom."""
    build_vehicle("env-plaster-warm", utility=True)
