"""Cream dispensary shelving with medicine cartons, pill bottles and a green cross."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from specialist_retail_parts import finish_retail_prop, lidded_tin

FOOTPRINT = (1, 1)


def build() -> None:
    """Keep medicine packs light and orderly beneath a visible pharmacy marker."""
    box("cream_back", (0.79, 0.027, 1.045), (0, 0.17, 0.5225), "env-plaster-warm")
    for side in (-1, 1):
        box(f"white_upright_{side}", (0.04, 0.365, 1.07), (side * 0.4075, 0, 0.535), "env-snow")
    for index, z in enumerate((0.03, 0.3525, 0.6725, 1.05)):
        box(f"clean_shelf_{index}", (0.8, 0.37, 0.035 if index else 0.06), (0, -0.015, z), "env-snow")
    box("pharmacy_sign", (0.30, 0.033, 0.235), (0.20, -0.187, 1.0075), "env-snow")
    box("green_cross_vertical", (0.046, 0.013, 0.16), (0.20, -0.209, 1.0075), "env-foliage")
    box("green_cross_horizontal", (0.16, 0.015, 0.046), (0.20, -0.211, 1.0075), "env-foliage")
    cartons = (
        (-0.27, 0.06, 0.135, 0.19, "env-snow"),
        (-0.07, 0.06, 0.15, 0.23, "env-glass"),
        (-0.29, 0.37, 0.115, 0.205, "env-roof-green"),
        (-0.135, 0.37, 0.12, 0.235, "env-snow"),
        (0.025, 0.37, 0.10, 0.19, "env-snow"),
        (-0.29, 0.69, 0.11, 0.25, "env-snow"),
        (-0.135, 0.69, 0.12, 0.21, "env-glass"),
        (0.035, 0.69, 0.14, 0.24, "env-snow"),
    )
    for index, (x, base, width, height, token) in enumerate(cartons):
        box(f"medicine_carton_{index}", (width, 0.205, height), (x, -0.075, base + height / 2), token)
    for index, (x, z, token) in enumerate(((-0.27, 0.175, "env-roof-green"), (-0.135, 0.50, "env-glass"), (-0.29, 0.83, "env-rust"))):
        box(f"medicine_pack_label_{index}", (0.08, 0.009, 0.048), (x, -0.18, z), token)
    lidded_tin("pill_bottle_lower", 0.052, 0.165, (0.292, -0.105, 0.1425), "env-plaster-warm", "env-snow", segments=6)
    finish_retail_prop("pharmacy_shelf")
