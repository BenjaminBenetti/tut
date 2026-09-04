"""Cover prop: refuse dumpster, 1.0 u tall including its sloped lid."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box, cylinder  # noqa: E402
import math  # noqa: E402

FOOTPRINT = (1, 1)

HEIGHT = 1.0


def build() -> None:
    """Ribbed steel bin on small castors under a lid tilted toward the front."""
    body = box("body", (0.9, 0.66, 0.62), (0, 0, 0.34), "env-metal")
    bevel(body, 0.02)
    for i, x in enumerate((-0.28, 0.0, 0.28)):
        box(f"rib_{i}", (0.05, 0.7, 0.5), (x, 0, 0.36), "env-rust")
    lid = box("lid", (0.94, 0.7, 0.06), (0, 0.02, 0.71), "env-rust", rot=(math.radians(-9), 0, 0))
    bevel(lid, 0.015)
    box("lip", (0.94, 0.06, 0.08), (0, -0.34, 0.68), "env-metal")
    for sx in (-1, 1):
        for sy in (-1, 1):
            cylinder(
                f"castor_{'l' if sx < 0 else 'r'}{'f' if sy < 0 else 'b'}",
                0.05,
                0.05,
                0.05,
                6,
                (sx * 0.36, sy * 0.26, 0.05),
                "env-asphalt",
                rot=(0, math.pi / 2, 0),
            )
