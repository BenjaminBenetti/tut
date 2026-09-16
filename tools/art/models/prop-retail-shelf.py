"""Stocked grocery shelving: three product rows, price rails and a cream frame.

Front is Blender -Y / glTF +Z. All geometry stays within one tile.
The muted product colours reuse the environment palette without terrain UVs.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a 2 m tall shop gondola with shelves visibly carrying stock."""
    box("plinth", (0.88, 0.44, 0.08), (0, 0, 0.04), "env-roof")
    box("back_panel", (0.83, 0.035, 0.82), (0, 0.18, 0.49), "env-plaster-warm")
    for side in (-1, 1):
        box(f"end_{side}", (0.045, 0.42, 0.82), (side * 0.4225, 0, 0.49), "env-sidewalk")
    box("header", (0.88, 0.10, 0.085), (0, 0.13, 0.8775), "env-roof-green")
    products = (
        ((-0.28, 0.17, "env-brick"), (-0.025, 0.21, "env-sand"), (0.245, 0.16, "env-roof-green")),
        ((-0.28, 0.18, "env-glass"), (-0.015, 0.13, "env-brick"), (0.255, 0.205, "env-sand")),
        ((-0.27, 0.17, "env-roof-green"), (-0.02, 0.19, "env-glass"), (0.24, 0.145, "env-brick")),
    )
    for row, base in enumerate((0.10, 0.36, 0.62)):
        box(f"shelf_{row}", (0.83, 0.40, 0.028), (0, -0.015, base), "env-sidewalk")
        box(f"price_rail_{row}", (0.83, 0.028, 0.038), (0, -0.211, base + 0.012), "env-plaster-warm")
        for column, (x, height, token) in enumerate(products[row]):
            box(f"stock_{row}_{column}", (0.18, 0.245, height), (x, -0.01, base + 0.014 + height / 2), token)
        # A broad label block reads as retail packaging at tactical distance.
        x, height, _ = products[row][row]
        box(f"pack_label_{row}", (0.125, 0.008, 0.045), (x, -0.135, base + 0.05 + height / 2), "env-plaster-warm")
    finish_prop("retail_shelf", height=1.02)
