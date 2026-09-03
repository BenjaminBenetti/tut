"""Prop: table (``prop.table``), interior low cover placed by mapgen in halls and rooms (#213).

Waist-height workshop table on one tile: plank top with a metal edge frame, four
legs and a lower shelf. Flat colours (no atlas cell for ``env-*`` tokens).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """0.9 × 0.5 u top at 0.5 u, legs at the corners, shelf at 0.15 u."""
    bevel(box("top", (0.9, 0.5, 0.06), (0, 0, 0.47), "env-bark"), 0.01)
    box("frame", (0.86, 0.46, 0.05), (0, 0, 0.415), "env-metal")
    for i, (x, y) in enumerate([(-0.4, -0.2), (0.4, -0.2), (-0.4, 0.2), (0.4, 0.2)]):
        box(f"leg_{i}", (0.05, 0.05, 0.4), (x, y, 0.2), "env-metal")
    box("shelf", (0.8, 0.4, 0.03), (0, 0, 0.15), "env-bark")
    box("crate", (0.24, 0.2, 0.16), (-0.2, 0.05, 0.245), "env-bark")
    box("tin", (0.1, 0.1, 0.12), (0.3, -0.1, 0.225), "env-rust")
