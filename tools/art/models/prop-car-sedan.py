"""Cover prop: two-tile sedan, 0.82 u tall, pivot at the centre of its 2x1 footprint."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prop_parts import car_body  # noqa: E402

FOOTPRINT = (2, 1)


def build() -> None:
    """Long bonnet and boot around a cabin set back from the front axle."""
    car_body(length=1.8, width=0.58, wheel_radius=0.15, cabin_back=0.86, roof=0.82, boot=True)
