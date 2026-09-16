"""Industrial hardware shelving with a hammer, wrench, saw, paint tins and tools."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from specialist_retail_parts import finish_retail_prop, lidded_tin, silhouette

FOOTPRINT = (1, 1)


def build() -> None:
    """Give the hardware store visible tool shapes and broad paint-can lids."""
    box("tool_board", (0.82, 0.028, 1.025), (0, 0.174, 0.5125), "env-plaster-warm")
    for side in (-1, 1):
        box(f"steel_upright_{side}", (0.04, 0.4, 1.065), (side * 0.425, 0, 0.5325), "env-metal")
    for index, z in enumerate((0.035, 0.365, 0.685, 1.045)):
        box(f"steel_shelf_{index}", (0.85, 0.405, 0.035 if index else 0.07), (0, -0.015, z), "env-metal")
    box("front_tool_pegboard", (0.82, 0.027, 0.32), (0, -0.184, 0.857), "env-rust")
    box("hammer_handle", (0.035, 0.037, 0.24), (-0.295, -0.214, 0.845), "env-bark")
    box("hammer_head", (0.135, 0.052, 0.058), (-0.295, -0.214, 0.947), "env-metal")
    wrench = [(-0.02, -0.16), (0.02, -0.16), (0.02, 0.03), (0.062, 0.061), (0.062, 0.14), (0.02, 0.113), (0, 0.075), (-0.02, 0.113), (-0.062, 0.14), (-0.062, 0.061), (-0.02, 0.03)]
    silhouette("forked_spanner", wrench, 0.024, (-0.07, -0.209, 0.869), "env-metal")
    saw = [(-0.12, 0.05), (-0.12, -0.057), (-0.055, -0.067), (-0.02, -0.085), (0.018, -0.067), (0.06, -0.075), (0.12, -0.035)]
    silhouette("hand_saw_blade", saw, 0.025, (0.213, -0.21, 0.868), "env-metal")
    box("saw_handle", (0.048, 0.038, 0.145), (0.335, -0.216, 0.863), "env-bark")
    for index, (x, token) in enumerate(((-0.24, "env-brick"), (0.19, "env-roof-green"))):
        lidded_tin(f"paint_tin_{index}", 0.073, 0.185, (x, -0.038, 0.1625), token, "env-metal", segments=6)
    box("metal_toolbox", (0.33, 0.235, 0.13), (-0.11, -0.015, 0.45), "env-rust")
    box("toolbox_handle", (0.1, 0.037, 0.034), (-0.11, -0.015, 0.526), "env-metal")
    finish_retail_prop("hardware_shelf")
