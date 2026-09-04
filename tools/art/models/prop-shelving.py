"""Prop: warehouse shelving, 1.0 u tall, three decks with a little stock."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box  # noqa: E402

FOOTPRINT = (1, 1)

HEIGHT = 1.0
DECKS = 3


def build() -> None:
    """Four uprights, three decks, and two crates so the unit is not empty."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(
                f"upright_{'l' if sx < 0 else 'r'}{'f' if sy < 0 else 'b'}",
                (0.06, 0.06, HEIGHT),
                (sx * 0.4, sy * 0.19, HEIGHT / 2),
                "env-metal",
            )
    for i in range(DECKS):
        z = 0.06 + (HEIGHT - 0.12) * i / (DECKS - 1)
        box(f"deck_{i}", (0.86, 0.44, 0.04), (0, 0, z), "env-metal")
    box("crate_a", (0.24, 0.28, 0.2), (-0.22, 0, 0.62), "env-bark")
    box("crate_b", (0.2, 0.24, 0.16), (0.24, 0.04, 0.6), "env-bark")
