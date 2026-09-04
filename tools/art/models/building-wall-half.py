"""City kit: half-height wall (0.5 u), low cover, brick with a concrete coping."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Brick body under a proud concrete coping cap."""
    box("body", (1.0, 0.12, 0.42), (0, 0, 0.21), "env-brick", uv_rot=90)
    coping = box("coping", (1.0, 0.18, 0.08), (0, 0, 0.46), "env-concrete")
    bevel(coping, 0.02)
