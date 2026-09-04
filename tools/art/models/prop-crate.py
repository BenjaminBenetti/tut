"""Cover prop: shipping crate, 0.7 u square, 0.6 u tall."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box  # noqa: E402

FOOTPRINT = (1, 1)

SIDE = 0.7
HEIGHT = 0.6


def build() -> None:
    """Boarded body with corner posts, a lid lip and one hazard stripe."""
    body = box("body", (SIDE, SIDE, HEIGHT - 0.06), (0, 0, (HEIGHT - 0.06) / 2), "env-bark")
    bevel(body, 0.02)
    lid = box("lid", (SIDE + 0.04, SIDE + 0.04, 0.06), (0, 0, HEIGHT - 0.03), "env-bark")
    bevel(lid, 0.015)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(
                f"post_{'l' if sx < 0 else 'r'}{'f' if sy < 0 else 'b'}",
                (0.07, 0.07, HEIGHT - 0.06),
                (sx * (SIDE / 2 - 0.03), sy * (SIDE / 2 - 0.03), (HEIGHT - 0.06) / 2),
                "env-rust",
            )
    box("stripe", (0.3, 0.02, 0.09), (0, -SIDE / 2 - 0.005, HEIGHT * 0.55), "tdf-orange-dim")
