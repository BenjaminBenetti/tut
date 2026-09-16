"""Espresso bar counter with a two-group coffee machine, grinder and cupware."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box, cylinder
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Keep the whole espresso workstation below one unit with front service access."""
    box("toe_kick", (0.83, 0.48, 0.06), (0, 0, 0.03), "env-roof")
    box("counter", (0.89, 0.52, 0.385), (0, 0, 0.245), "env-bark")
    box("front_panel", (0.80, 0.022, 0.275), (0, -0.27, 0.27), "env-roof-green")
    box("countertop", (0.94, 0.59, 0.035), (0, 0, 0.4525), "env-plaster-warm")
    box("machine", (0.44, 0.25, 0.255), (-0.13, 0.08, 0.61), "env-metal")
    box("machine_top", (0.47, 0.27, 0.035), (-0.13, 0.08, 0.754), "env-brick")
    box("machine_face", (0.39, 0.024, 0.16), (-0.13, -0.056, 0.63), "env-roof")
    box("drip_tray", (0.42, 0.145, 0.025), (-0.13, -0.118, 0.492), "env-metal")
    for index, x in enumerate((-0.235, -0.045)):
        box(f"brew_group_{index}", (0.095, 0.055, 0.062), (x, -0.083, 0.605), "env-sidewalk")
        box(f"filter_handle_{index}", (0.025, 0.115, 0.024), (x, -0.16, 0.577), "env-roof")
    box("steam_wand", (0.018, 0.026, 0.125), (0.075, -0.105, 0.565), "env-sidewalk")
    box("grinder_base", (0.14, 0.18, 0.035), (0.29, 0.12, 0.4875), "env-roof")
    box("grinder_body", (0.105, 0.125, 0.14), (0.29, 0.12, 0.5725), "env-metal")
    cylinder("bean_hopper", 0.065, 0.037, 0.105, 6, (0.29, 0.12, 0.695), "env-glass")
    cylinder("cup", 0.033, 0.026, 0.065, 6, (-0.25, -0.125, 0.5375), "env-plaster-warm")
    cylinder("cup_coffee", 0.026, 0.026, 0.003, 6, (-0.25, -0.125, 0.571), "env-bark")
    box("cup_handle", (0.035, 0.019, 0.023), (-0.21, -0.125, 0.539), "env-plaster-warm")
    cylinder("stacked_cups", 0.044, 0.036, 0.075, 6, (0.28, -0.16, 0.5075), "env-plaster-warm")
    cylinder("saucer", 0.07, 0.07, 0.009, 8, (0.09, -0.22, 0.4745), "env-sidewalk")
    finish_prop("coffee_counter")
