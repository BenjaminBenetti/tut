"""Low electronics demo island with monitors, a tablet and a handset."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from specialist_retail_parts import finish_retail_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a retail plinth with several screen silhouettes and no office chair."""
    box("black_kickboard", (0.83, 0.40, 0.035), (0, 0, 0.0175), "env-roof")
    box("display_cabinet", (0.9, 0.46, 0.325), (0, 0, 0.1975), "env-snow")
    box("dark_demo_top", (0.94, 0.5, 0.035), (0, 0, 0.3775), "env-roof")
    box("blue_front_inset", (0.72, 0.012, 0.075), (0, -0.236, 0.2625), "env-glass")
    for index, (x, width, height) in enumerate(((-0.26, 0.29, 0.2), (0.1, 0.32, 0.225))):
        box(f"monitor_foot_{index}", (0.115, 0.115, 0.014), (x, 0.07, 0.402), "env-metal")
        box(f"monitor_stand_{index}", (0.034, 0.037, 0.115), (x, 0.082, 0.4645), "env-metal")
        box(f"monitor_frame_{index}", (width, 0.042, height), (x, 0.091, 0.57), "env-roof")
        box(f"monitor_screen_{index}", (width - 0.034, 0.009, height - 0.034), (x, 0.065, 0.57), "env-glass")
        box(f"keyboard_{index}", (0.15, 0.075, 0.009), (x, -0.098, 0.401), "env-metal")
    tilt = math.radians(-21)
    box("tablet_body", (0.098, 0.018, 0.135), (0.347, -0.1, 0.467), "env-roof", rot=(tilt, 0, 0))
    box("tablet_screen", (0.079, 0.008, 0.111), (0.347, -0.113, 0.472), "env-water-shallow", rot=(tilt, 0, 0))
    box("tablet_support", (0.058, 0.065, 0.05), (0.347, -0.063, 0.42), "env-metal")
    box("phone_body", (0.05, 0.09, 0.011), (-0.015, -0.147, 0.401), "env-roof")
    box("phone_screen", (0.038, 0.066, 0.005), (-0.015, -0.147, 0.409), "env-water-deep")
    box("boxed_accessory", (0.088, 0.10, 0.086), (0.36, 0.119, 0.438), "env-plaster-warm")
    box("accessory_pack_face", (0.06, 0.006, 0.049), (0.36, 0.065, 0.438), "env-roof-green")
    finish_retail_prop("electronics_display")
