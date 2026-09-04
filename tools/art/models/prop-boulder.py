"""Prop: boulder, 1.05 u tall, two faceted lumps sunk into the ground."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import cut_below, sphere  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """A main mass with one smaller shoulder, both cut flat at ground level.

    Low segment counts are the point: at 64 px per tile a faceted rock reads
    as rock, and a smooth one reads as a balloon.
    """
    main = sphere(
        "rock",
        0.5,
        (0, 0, 0.44),
        "env-rock",
        segments=6,
        rings=4,
        scale=(1.0, 0.88, 0.86),
    )
    main.rotation_euler = (0, math.radians(11), math.radians(24))
    shoulder = sphere(
        "shoulder",
        0.3,
        (0.34, -0.22, 0.2),
        "env-rock",
        segments=6,
        rings=4,
        scale=(1.0, 0.9, 0.78),
    )
    shoulder.rotation_euler = (0, 0, math.radians(-38))
    cut_below(main)
    cut_below(shoulder)
