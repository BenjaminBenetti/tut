"""City kit: flat roof deck, 1x1 u, 0.05 u thick."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """One gravel deck, edge to edge.

    Roof tiles cover whole rooftops, so any border would draw a grid over the
    building; the parapet piece is what edges a roof. The gravel cell carries
    the surface detail (env atlas, style guide 7).
    """
    box("deck", (1.0, 1.0, 0.05), (0, 0, 0.025), "env-roof")
