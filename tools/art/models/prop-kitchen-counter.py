"""Domestic fitted counter with a recessed sink, two-ring hob and cabinetry."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder

FOOTPRINT = (1, 1)


def build() -> None:
    """Build one fitted kitchen run; the cupboard doors face the aisle at -Y."""
    box("recessed_plinth", (0.85, 0.34, 0.06), (0, 0.015, 0.03), "env-bark")
    box("cabinet_carcass", (0.91, 0.4, 0.375), (0, 0, 0.2375), "env-plaster-warm")
    for x in (-0.3, 0):
        box(f"cupboard_door_{x}", (0.278, 0.018, 0.33), (x, -0.21, 0.246), "env-snow")
        box(f"door_pull_{x}", (0.06, 0.018, 0.018), (x + 0.075, -0.229, 0.355), "env-metal")
    box("oven_front", (0.276, 0.02, 0.33), (0.3, -0.212, 0.246), "env-roof")
    box("oven_window", (0.21, 0.012, 0.19), (0.3, -0.228, 0.225), "env-glass")
    box("oven_handle", (0.21, 0.035, 0.023), (0.3, -0.242, 0.362), "env-metal")
    # Four slabs leave a real rectangular sink opening in the worktop.
    for name, size, at in (
        ("left", (0.1, 0.44, 0.035), (-0.42, 0, 0.4425)),
        ("right", (0.51, 0.44, 0.035), (0.215, 0, 0.4425)),
        ("front", (0.33, 0.09, 0.035), (-0.205, -0.175, 0.4425)),
        ("back", (0.33, 0.09, 0.035), (-0.205, 0.175, 0.4425)),
    ):
        box(f"counter_{name}", size, at, "env-concrete")
    box("sink_recess", (0.325, 0.255, 0.013), (-0.205, 0, 0.432), "env-roof")
    box("sink_basin", (0.26, 0.19, 0.006), (-0.205, 0, 0.44), "env-metal")
    box("tap_upright", (0.024, 0.025, 0.12), (-0.205, 0.151, 0.516), "env-metal")
    box("tap_spout", (0.024, 0.085, 0.022), (-0.205, 0.121, 0.575), "env-metal")
    box("black_hob", (0.31, 0.32, 0.015), (0.277, 0, 0.468), "env-roof")
    for y in (-0.088, 0.088):
        cylinder(f"burner_{y}", 0.063, 0.063, 0.008, 8, (0.277, y, 0.48), "env-metal")
    box("backsplash", (0.93, 0.025, 0.13), (0, 0.213, 0.5025), "env-snow")
