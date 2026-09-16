"""A tall domestic fridge-freezer with inset doors, gaskets and metal handles."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a two-metre fridge that reads as high cover, doors facing -Y."""
    box("recessed_plinth", (0.335, 0.32, 0.035), (0, 0, 0.0175), "env-roof")
    bevel(box("white_enamel_body", (0.39, 0.39, 1.0), (0, 0.01, 0.535), "env-snow"), 0.013)
    box("dark_door_gasket", (0.367, 0.02, 0.958), (0, -0.192, 0.542), "env-roof")
    bevel(box("main_fridge_door", (0.372, 0.045, 0.66), (0, -0.21, 0.395), "env-snow"), 0.01)
    bevel(box("freezer_door", (0.372, 0.045, 0.275), (0, -0.21, 0.8765), "env-snow"), 0.01)
    box("fridge_handle", (0.022, 0.026, 0.19), (-0.137, -0.243, 0.567), "env-metal")
    box("freezer_handle", (0.022, 0.026, 0.13), (-0.137, -0.243, 0.82), "env-metal")
    box("lower_vent", (0.29, 0.014, 0.018), (0, -0.189, 0.043), "env-metal")
    box("note_on_door", (0.068, 0.006, 0.08), (0.095, -0.236, 0.624), "env-plaster-warm")
    box("note_magnet", (0.03, 0.01, 0.018), (0.095, -0.242, 0.66), "env-brick")
    box("rear_heat_exchanger", (0.28, 0.012, 0.7), (0, 0.212, 0.51), "env-roof")
