"""Prop: saguaro cactus, 1.3 u tall, one column and two arms."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import cylinder, sphere  # noqa: E402

FOOTPRINT = (1, 1)

HEIGHT = 1.3


def build() -> None:
    """Column plus two arms at different heights, so it is not symmetrical."""
    cylinder("column", 0.11, 0.13, HEIGHT, 8, (0, 0, HEIGHT / 2), "env-foliage")
    sphere("crown", 0.11, (0, 0, HEIGHT), "env-foliage", segments=8, rings=4, scale=(1, 1, 0.6))
    arms = ((-1, 0.52, 0.34), (1, 0.72, 0.28))
    for side, elbow_z, rise in arms:
        name = "l" if side < 0 else "r"
        cylinder(
            f"arm_{name}",
            0.07,
            0.08,
            0.3,
            6,
            (side * 0.17, 0, elbow_z),
            "env-foliage",
            rot=(0, math.radians(90), 0),
        )
        cylinder(
            f"arm_{name}_up",
            0.07,
            0.08,
            rise,
            6,
            (side * 0.3, 0, elbow_z + rise / 2),
            "env-foliage",
        )
        sphere(
            f"arm_{name}_tip",
            0.07,
            (side * 0.3, 0, elbow_z + rise),
            "env-foliage",
            segments=6,
            rings=3,
            scale=(1, 1, 0.6),
        )
