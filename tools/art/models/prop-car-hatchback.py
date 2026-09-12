"""Muted red civilian hatchback, inside the two-tile high-cover envelope."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vehicle_variants import build_vehicle  # noqa: E402

FOOTPRINT = (1, 2)


def build() -> None:
    """Sloping glazing, red body, dark bumpers and exposed road wheels."""
    build_vehicle("env-brick")
