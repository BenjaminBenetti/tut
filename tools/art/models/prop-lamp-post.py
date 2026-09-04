"""Prop: street lamp, 2.65 u tall, with a cantilevered head."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box, cylinder  # noqa: E402

FOOTPRINT = (1, 1)

HEIGHT = 2.65


def build() -> None:
    """Plinth, tapered column, arm and lamp head.

    The head hangs off one side: a symmetrical lamp reads as a pole from
    overhead, and the arm is what says "street".
    """
    plinth = box("plinth", (0.2, 0.2, 0.1), (0, 0, 0.05), "env-concrete")
    bevel(plinth, 0.015)
    # Thicker than a real lamp post on purpose: at 64 px per tile a scale
    # column disappears, and a prop that cannot be seen cannot be cover.
    cylinder("column", 0.07, 0.1, HEIGHT - 0.12, 8, (0, 0, (HEIGHT - 0.12) / 2 + 0.1), "env-metal")
    box("arm", (0.36, 0.08, 0.08), (0.18, 0, HEIGHT - 0.1), "env-metal", rot=(0, math.radians(-8), 0))
    head = box("head", (0.32, 0.2, 0.11), (0.38, 0, HEIGHT - 0.17), "env-metal")
    bevel(head, 0.02)
    box("lens", (0.26, 0.15, 0.04), (0.38, 0, HEIGHT - 0.23), "env-glass")
