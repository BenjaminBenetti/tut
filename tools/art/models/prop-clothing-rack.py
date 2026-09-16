"""Open metal clothing display with three hanging garments and shoeboxes."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box, cylinder
from specialist_retail_parts import finish_retail_prop, silhouette

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a front-facing fashion rail with unmistakable sleeves and trouser legs."""
    for x in (-0.405, 0.405):
        box(f"rack_foot_{x}", (0.075, 0.42, 0.04), (x, 0, 0.02), "env-roof")
        cylinder(f"upright_{x}", 0.018, 0.018, 1.015, 6, (x, 0.075, 0.5275), "env-metal")
    cylinder("horizontal_rail", 0.021, 0.021, 0.85, 6, (0, 0.075, 1.035), "env-metal", rot=(0, math.pi / 2, 0))
    shirt = [(-0.031, 0), (-0.08, -0.012), (-0.13, -0.065), (-0.09, -0.12), (-0.069, -0.092), (-0.06, -0.36), (0.06, -0.36), (0.069, -0.092), (0.09, -0.12), (0.13, -0.065), (0.08, -0.012), (0.031, 0)]
    trousers = [(-0.065, 0), (-0.085, -0.47), (-0.014, -0.47), (0, -0.185), (0.014, -0.47), (0.085, -0.47), (0.065, 0)]
    for i, (x, token) in enumerate(((-0.265, "env-brick"), (0, "env-glass"), (0.265, "env-roof-green"))):
        silhouette(f"hanger_{i}", [(-0.085, 0), (0.085, 0), (0, 0.077)], 0.017, (x, 0.05, 0.951), "env-bark")
        silhouette(f"garment_{i}", trousers if i == 1 else shirt, 0.047, (x, 0.018, 0.954), token)
    box("left_shoe_box", (0.235, 0.25, 0.075), (-0.245, -0.018, 0.0375), "env-plaster-warm")
    box("right_shoe_box", (0.225, 0.25, 0.075), (0.245, -0.018, 0.0375), "env-roof-green")
    box("box_lid_left", (0.242, 0.257, 0.018), (-0.245, -0.018, 0.084), "env-snow")
    box("box_lid_right", (0.232, 0.257, 0.018), (0.245, -0.018, 0.084), "env-plaster-warm")
    finish_retail_prop("clothing_rack")
