"""Cover prop: jersey barrier, 0.9 u long, 0.5 u tall, tapered profile."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box  # noqa: E402

FOOTPRINT = (1, 1)

LENGTH = 0.9
HEIGHT = 0.5


def build() -> None:
    """Three stacked bands narrowing upward, with a hazard stripe on each face."""
    bands = (
        ("foot", 0.34, 0.0, 0.1),
        ("skirt", 0.26, 0.1, 0.28),
        ("stem", 0.17, 0.28, HEIGHT),
    )
    for name, depth, z0, z1 in bands:
        ob = box(name, (LENGTH, depth, z1 - z0), (0, 0, (z0 + z1) / 2), "env-concrete")
        bevel(ob, 0.015)
    for side in (-1, 1):
        box(
            f"stripe_{'f' if side < 0 else 'b'}",
            (0.26, 0.02, 0.12),
            (0, side * 0.09, 0.38),
            "tdf-orange-dim",
        )
