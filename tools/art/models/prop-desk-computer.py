"""Compact occupied workstation, including monitor, keyboard and office chair."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Keep the tucked office chair and the whole desk within a single tile."""
    box("desktop", (0.90, 0.47, 0.035), (0, 0.105, 0.4075), "env-plaster-warm")
    box("pedestal", (0.22, 0.395, 0.39), (-0.295, 0.12, 0.195), "env-roof")
    box("end_panel", (0.055, 0.40, 0.39), (0.385, 0.12, 0.195), "env-metal")
    for index, z in enumerate((0.14, 0.29)):
        box(f"drawer_{index}", (0.192, 0.016, 0.135), (-0.295, -0.083, z), "env-sidewalk")
        box(f"drawer_pull_{index}", (0.085, 0.018, 0.019), (-0.295, -0.095, z + 0.037), "env-roof")
    box("monitor_foot", (0.17, 0.10, 0.018), (0.005, 0.205, 0.434), "env-asphalt")
    box("monitor_stand", (0.04, 0.035, 0.09), (0.005, 0.22, 0.475), "env-metal")
    box("monitor", (0.325, 0.038, 0.225), (0.005, 0.22, 0.6025), "env-asphalt")
    box("screen", (0.287, 0.008, 0.183), (0.005, 0.197, 0.607), "env-glass")
    box("screen_document", (0.12, 0.006, 0.135), (0.063, 0.191, 0.611), "env-plaster-warm")
    box("keyboard", (0.23, 0.098, 0.014), (0.015, 0.015, 0.432), "env-metal")
    box("keyboard_keys", (0.195, 0.067, 0.004), (0.015, 0.019, 0.440), "env-sidewalk")
    box("mouse", (0.043, 0.063, 0.019), (0.19, 0.014, 0.4345), "env-asphalt")
    box("folder", (0.145, 0.19, 0.014), (-0.30, 0.13, 0.432), "env-roof-green")
    box("paper", (0.12, 0.15, 0.006), (-0.291, 0.124, 0.442), "env-plaster-warm")
    box("tower", (0.11, 0.245, 0.245), (0.285, 0.19, 0.1225), "env-asphalt")
    box("tower_face", (0.07, 0.008, 0.12), (0.285, 0.063, 0.145), "env-metal")
    box("chair_cross_x", (0.30, 0.05, 0.026), (0.005, -0.30, 0.013), "env-asphalt")
    box("chair_cross_y", (0.048, 0.29, 0.026), (0.005, -0.30, 0.017), "env-asphalt")
    box("chair_post", (0.045, 0.045, 0.21), (0.005, -0.30, 0.13), "env-metal")
    box("chair_seat", (0.265, 0.245, 0.045), (0.005, -0.285, 0.245), "env-roof-green")
    box("chair_back_support", (0.055, 0.035, 0.225), (0.005, -0.413, 0.3275), "env-metal")
    box("chair_back", (0.26, 0.055, 0.20), (0.005, -0.42, 0.43), "env-roof-green")
    finish_prop("desk_computer")
