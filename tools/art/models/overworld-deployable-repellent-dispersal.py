"""Repellent dispersal for the strategic map: pheromone tank beside a tower with a spray nozzle head.

    blender -b --python tools/art/make_model.py -- \
        --script tools/art/models/overworld-deployable-repellent-dispersal.py \
        --id overworld.deployable.repellent-dispersal --category props \
        --file overworld-deployable-repellent-dispersal.glb --max-triangles 300

Animation contract (#1153): the nozzle head (hub, head block, spout, light)
is one child node named ``animated`` under ``base``. Its origin is the
vertical axis of the tower top, (0.12, -0.08, 0.20) in Blender
(x 0.12, y-up 0.20, z 0.08 in glTF), so ``rotation.y`` sweeps the spout
around the tower. Everything else is static.

              ▄▄▄
             ╱nozzle╲  ◄─ animated, yaws about the tower's vertical axis
      ┌───┐   ┃tower┃
      │tank├──┫     ┃  pipe
      │   │   ┃     ┃
    ┌─┴───┴───┴─────┴─┐
    │   foundation    │  z = 0
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deployable_parts import (  # noqa: E402
    FOOTPRINT,
    finish_animated,
    finish_base,
    foundation,
    horizontal_cylinder,
    lens,
    marking,
)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder  # noqa: E402

FOOTPRINT = FOOTPRINT

TOWER_X, TOWER_Y = 0.12, -0.08
"""Tower centre on the ground plane; the nozzle head yaws about this point."""

TOWER_TOP_Z = 0.20
"""Tower top: the nozzle head's axis origin sits here."""


def build() -> None:
    """Fat tank, pedestal and slim tower with feed pipe, then the yawing nozzle head."""
    tank_x, tank_y = -0.10, 0.06
    static = [
        foundation(0.40),
        cylinder("tank", 0.10, 0.10, 0.13, 8, (tank_x, tank_y, 0.095), "tdf-grey-mid"),
        cylinder("tank_band", 0.104, 0.104, 0.022, 8, (tank_x, tank_y, 0.085), "tdf-orange"),
        cylinder("tank_cap", 0.06, 0.085, 0.025, 8, (tank_x, tank_y, 0.1725), "tdf-grey-light"),
        lens("tank_gauge", (0.03, 0.03, 0.012), (tank_x, tank_y, 0.19)),
        box("pedestal", (0.11, 0.11, 0.07), (TOWER_X, TOWER_Y, 0.065), "tdf-grey-mid"),
        lens("pedestal_panel", (0.05, 0.012, 0.025), (TOWER_X, TOWER_Y - 0.056, 0.075)),
        box("tower", (0.06, 0.06, 0.10), (TOWER_X, TOWER_Y, 0.15), "tdf-grey-light"),
        box("tower_rib", (0.075, 0.018, 0.09), (TOWER_X, TOWER_Y, 0.15), "tdf-grey-dark"),
        box("pipe", (0.16, 0.026, 0.026), ((tank_x + TOWER_X) / 2, tank_y - 0.02, 0.12), "tdf-grey-dark"),
        box("pipe_elbow", (0.026, 0.12, 0.026), (TOWER_X - 0.02, (tank_y + TOWER_Y) / 2 - 0.02, 0.12), "tdf-grey-dark"),
        marking("hazard", (0.05, 0.012, 0.012), (TOWER_X, TOWER_Y - 0.056, 0.04)),
    ]
    base = finish_base(static)

    head_z = TOWER_TOP_Z + 0.055
    moving = [
        cylinder("hub", 0.04, 0.046, 0.02, 6, (TOWER_X, TOWER_Y, TOWER_TOP_Z + 0.01), "tdf-grey-dark"),
        box("neck", (0.03, 0.03, 0.03), (TOWER_X, TOWER_Y, TOWER_TOP_Z + 0.03), "tdf-grey-mid"),
        horizontal_cylinder("head", 0.028, 0.028, 0.11, 6, (TOWER_X, TOWER_Y - 0.03, head_z), "tdf-grey-mid"),
        horizontal_cylinder("head_band", 0.031, 0.031, 0.016, 6, (TOWER_X, TOWER_Y - 0.03, head_z), "tdf-orange"),
        horizontal_cylinder("spout", 0.024, 0.02, 0.02, 6, (TOWER_X, TOWER_Y - 0.094, head_z), "tdf-grey-dark"),
        lens("spray_face", (0.026, 0.006, 0.026), (TOWER_X, TOWER_Y - 0.106, head_z)),
    ]
    finish_animated(moving, (TOWER_X, TOWER_Y, TOWER_TOP_Z), base)
