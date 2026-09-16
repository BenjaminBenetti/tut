"""Cream bathroom sink vanity with recessed basin, cabinet and framed mirror."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box

FOOTPRINT = (1, 1)


def build() -> None:
    """Build an integrated splashback and mirror above a compact storage sink."""
    box("recessed_plinth", (0.48, 0.29, 0.055), (0, 0.025, 0.0275), "env-bark")
    box("cabinet_carcass", (0.56, 0.36, 0.375), (0, 0, 0.2425), "env-plaster-warm")
    for x in (-0.135, 0.135):
        box(f"cabinet_door_{x}", (0.252, 0.02, 0.33), (x, -0.19, 0.251), "env-snow")
        box(f"door_pull_{x}", (0.026, 0.024, 0.075), (x * 0.24, -0.214, 0.292), "env-metal")
    box("basin_recess", (0.48, 0.29, 0.019), (0, -0.015, 0.442), "env-metal")
    box("basin_bottom", (0.325, 0.185, 0.013), (0, -0.025, 0.452), "env-snow")
    for x in (-0.26, 0.26):
        box(f"sink_side_{x}", (0.08, 0.405, 0.046), (x, 0, 0.469), "env-snow")
    for y in (-0.175, 0.153):
        box(f"sink_rim_{y}", (0.44, 0.055, 0.046), (0, y, 0.469), "env-snow")
    box("tap_stem", (0.023, 0.025, 0.1), (0, 0.147, 0.535), "env-metal")
    box("tap_spout", (0.024, 0.08, 0.022), (0, 0.12, 0.584), "env-metal")
    box("tile_splashback", (0.56, 0.035, 0.445), (0, 0.183, 0.6825), "env-plaster-warm")
    box("mirror_frame", (0.43, 0.038, 0.335), (0, 0.154, 0.75), "env-bark")
    box("blue_grey_mirror", (0.383, 0.013, 0.289), (0, 0.128, 0.75), "env-glass")
