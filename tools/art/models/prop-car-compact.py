"""Cover prop: compact hatchback on one tile, 0.76 u tall."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prop_parts import car_body  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Short body under a long greenhouse: hatchback proportions, 0.76 u roof."""
    car_body(length=0.94, width=0.52, wheel_radius=0.13, cabin_back=0.58, roof=0.76)
