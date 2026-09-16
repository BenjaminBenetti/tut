"""One-tile shop checkout with conveyor, till, card terminal and bagging bay."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Make a grounded counter with a clearly readable register silhouette."""
    box("toe_kick", (0.84, 0.50, 0.08), (0, 0, 0.04), "env-roof")
    box("counter_body", (0.87, 0.51, 0.40), (0, 0, 0.26), "env-sidewalk")
    box("customer_panel", (0.79, 0.025, 0.27), (0, -0.258, 0.27), "env-roof-green")
    box("countertop", (0.94, 0.57, 0.035), (0, 0, 0.4775), "env-plaster-warm")
    box("belt", (0.39, 0.41, 0.012), (-0.225, 0, 0.501), "env-asphalt")
    box("belt_divider", (0.035, 0.37, 0.027), (-0.115, 0, 0.516), "env-metal")
    box("bagging_platform", (0.22, 0.30, 0.025), (0.32, -0.08, 0.509), "env-metal")
    box("till_base", (0.23, 0.18, 0.055), (0.095, 0.15, 0.523), "env-roof")
    box("cash_drawer", (0.18, 0.012, 0.02), (0.095, 0.246, 0.52), "env-metal")
    box("register_stem", (0.035, 0.035, 0.085), (0.095, 0.13, 0.578), "env-metal")
    box("register_housing", (0.22, 0.040, 0.15), (0.095, 0.127, 0.65), "env-asphalt", rot=(math.radians(-12), 0, 0))
    box("register_screen", (0.182, 0.009, 0.115), (0.095, 0.152, 0.645), "env-glass", rot=(math.radians(-12), 0, 0))
    box("customer_display", (0.12, 0.009, 0.054), (0.095, 0.102, 0.65), "env-glass", rot=(math.radians(-12), 0, 0))
    box("terminal_stand", (0.032, 0.04, 0.064), (0.17, -0.198, 0.522), "env-metal")
    box("card_terminal", (0.12, 0.095, 0.032), (0.17, -0.20, 0.564), "env-asphalt", rot=(math.radians(20), 0, 0))
    box("terminal_screen", (0.075, 0.036, 0.006), (0.17, -0.185, 0.591), "env-glass", rot=(math.radians(20), 0, 0))
    box("paper_bag", (0.14, 0.11, 0.16), (0.325, -0.08, 0.60), "env-sand")
    box("bag_fold", (0.15, 0.12, 0.024), (0.325, -0.08, 0.678), "env-plaster-warm")
    box("grocery_carton", (0.10, 0.12, 0.13), (-0.30, 0.035, 0.57), "env-brick")
    box("carton_label", (0.065, 0.008, 0.046), (-0.30, -0.028, 0.58), "env-plaster-warm")
    finish_prop("checkout")
