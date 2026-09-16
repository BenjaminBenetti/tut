"""Tall twin-door grocery chiller with stocked shelves and a vented plinth."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import display_glazing, finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Frame visible groceries with blue glazing and cream refrigerator panels."""
    box("compressor_base", (0.87, 0.53, 0.145), (0, 0, 0.0725), "env-sidewalk")
    box("back", (0.84, 0.075, 0.88), (0, 0.226, 0.59), "env-plaster-warm")
    box("blue_glass_back", (0.78, 0.022, 0.79), (0, 0.176, 0.585), "env-glass")
    for side in (-1, 1):
        box(f"insulated_side_{side}", (0.05, 0.52, 0.88), (side * 0.425, 0, 0.59), "env-plaster-warm")
        box(f"front_frame_{side}", (0.033, 0.04, 0.85), (side * 0.389, -0.257, 0.57), "env-metal")
        box(f"door_pull_{side}", (0.022, 0.045, 0.22), (side * 0.051, -0.287, 0.58), "env-sidewalk")
    box("door_mullion", (0.03, 0.04, 0.85), (0, -0.257, 0.57), "env-metal")
    box("glazed_doors", (0.75, 0.008, 0.80), (0, -0.247, 0.57), "env-glass")
    box("header", (0.90, 0.55, 0.105), (0, 0, 1.0475), "env-plaster-warm")
    box("header_sign", (0.70, 0.015, 0.057), (0, -0.283, 1.05), "env-roof-green")
    box("vent", (0.73, 0.02, 0.072), (0, -0.275, 0.07), "env-roof")
    for index, z in enumerate((0.063, 0.086)):
        box(f"vent_bar_{index}", (0.67, 0.012, 0.009), (0, -0.289, z), "env-metal")
    for row, z in enumerate((0.165, 0.445, 0.725)):
        box(f"cold_shelf_{row}", (0.78, 0.45, 0.028), (0, -0.025, z), "env-sidewalk")
        for side in (-1, 1):
            token = ("env-plaster-warm", "env-roof-green", "env-brick")[(row + (side > 0)) % 3]
            box(f"chilled_stock_{row}_{side}", (0.235, 0.24, 0.155 + row * 0.01), (side * 0.205, -0.025, z + 0.095 + row * 0.005), token)
    display_glazing()
    finish_prop("chilled_display")
