"""Sensor array for the strategic map: flat-roofed picket hut with a radar dish on a mast.

    blender -b --python tools/art/make_model.py -- \
        --script tools/art/models/overworld-deployable-sensor-array.py \
        --id overworld.deployable.sensor-array --category props \
        --file overworld-deployable-sensor-array.glb --max-triangles 300

Animation contract (#1153): the dish (bearing, dish, face, feed) is one
child node named ``animated`` under ``base``. Its origin is the mast top
centre, (0.15, -0.06, 0.17) in Blender (x 0.15, y-up 0.17, z 0.06 in glTF),
so ``rotation.y`` spins the dish about the mast. Everything else is static.

              ◜◝
             ◟dish◞  ◄─ animated, spins about the mast's vertical axis
    ┌──────┐   ║
    │ hut  │   ║ mast
    │      │   ║
    ┴──────┴───╨──┐
    │ foundation  │  z = 0
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deployable_parts import (  # noqa: E402
    FOOTPRINT,
    finish_animated,
    finish_base,
    foundation,
    lens,
    marking,
)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder  # noqa: E402

FOOTPRINT = FOOTPRINT

MAST_X, MAST_Y = 0.15, -0.06
"""Mast centre on the ground plane; the dish spins about this point."""

MAST_TOP_Z = 0.17
"""Mast top: the dish's axis origin sits here."""

DISH_TILT = (math.pi / 3, 0.0, 0.0)
"""Dish tilted 60° from the horizontal, facing the front (-Y) and up."""


def build() -> None:
    """Hut, mast and sensor pickets, then the spinning dish."""
    hut_x, hut_y = -0.07, 0.03
    static = [
        foundation(0.40, 0.02),
        box("hut", (0.24, 0.22, 0.10), (hut_x, hut_y, 0.07), "tdf-grey-mid"),
        box("roof", (0.26, 0.24, 0.02), (hut_x, hut_y, 0.13), "tdf-grey-light"),
        box("door", (0.06, 0.012, 0.07), (hut_x, hut_y - 0.113, 0.055), "tdf-grey-dark"),
        marking("door_stripe", (0.06, 0.014, 0.012), (hut_x, hut_y - 0.113, 0.098)),
        box("vent", (0.05, 0.05, 0.025), (hut_x - 0.07, hut_y + 0.05, 0.15), "tdf-grey-dark"),
        lens("window", (0.012, 0.08, 0.025), (hut_x - 0.123, hut_y, 0.09)),
        box("mast_foot", (0.09, 0.09, 0.025), (MAST_X, MAST_Y, 0.0325), "tdf-grey-dark"),
        cylinder("mast", 0.018, 0.024, 0.13, 6, (MAST_X, MAST_Y, 0.105), "tdf-grey-mid"),
        cylinder("picket", 0.008, 0.012, 0.09, 6, (0.16, 0.14, 0.065), "tdf-grey-dark"),
        lens("picket_light", (0.02, 0.02, 0.02), (0.16, 0.14, 0.12)),
    ]
    base = finish_base(static)

    dish_at = (MAST_X, MAST_Y - 0.02, MAST_TOP_Z + 0.035)
    face_at = (MAST_X, MAST_Y - 0.02 - 0.03 * math.sin(math.pi / 3), MAST_TOP_Z + 0.035 + 0.03 * math.cos(math.pi / 3))
    moving = [
        cylinder("bearing", 0.03, 0.03, 0.03, 6, (MAST_X, MAST_Y, MAST_TOP_Z + 0.015), "tdf-grey-dark"),
        cylinder("dish", 0.085, 0.035, 0.035, 12, dish_at, "tdf-grey-light", rot=DISH_TILT),
        cylinder("dish_face", 0.07, 0.07, 0.008, 12, face_at, "tdf-grey-dark", rot=DISH_TILT),
        box("feed_arm", (0.012, 0.07, 0.012), (MAST_X, MAST_Y - 0.075, MAST_TOP_Z + 0.07), "tdf-grey-mid"),
        lens("feed", (0.028, 0.028, 0.028), (MAST_X, MAST_Y - 0.105, MAST_TOP_Z + 0.085)),
        marking("dish_tag", (0.03, 0.006, 0.02), (MAST_X + 0.052, MAST_Y - 0.02, MAST_TOP_Z + 0.027)),
    ]
    finish_animated(moving, (MAST_X, MAST_Y, MAST_TOP_Z), base)
