"""City kit: roof parapet edge, 1 u long, 0.15 u tall, pivot at the base midpoint."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Concrete upstand with a lighter coping, matching the wall cornice profile."""
    box("upstand", (1.0, 0.12, 0.11), (0, 0, 0.055), "env-concrete")
    coping = box("coping", (1.0, 0.16, 0.04), (0, 0, 0.13), "env-sidewalk")
    bevel(coping, 0.012)
