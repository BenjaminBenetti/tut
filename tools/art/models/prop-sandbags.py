"""Cover prop: sandbag emplacement, four staggered courses, 0.48 u tall."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prop_parts import sandbag  # noqa: E402

FOOTPRINT = (1, 1)

COURSES = 4
COURSE_HEIGHT = 0.12
TOKENS = ("env-dirt", "env-sand", "env-dirt", "env-sand")
#: Yaw per bag, in degrees, so no two courses line up.
TILTS = (-4, 3, -2, 5, -3)


def build() -> None:
    """Four courses of three bags, every other course offset by half a bag."""
    for course in range(COURSES):
        z = COURSE_HEIGHT * (course + 0.5) - 0.005 * course
        offset = 0.12 if course % 2 else 0.0
        width = 0.92 - 0.06 * course
        bag = width / 3
        for i in range(2 if course == COURSES - 1 else 3):
            x = -width / 2 + bag * (i + 0.5) + offset - 0.06 + (bag / 2 if course == COURSES - 1 else 0)
            sandbag(
                f"bag_{course}_{i}",
                (x, 0, z),
                bag * 0.98,
                TOKENS[course],
                math.radians(TILTS[(course + i) % len(TILTS)]),
                soft=course == COURSES - 1,
            )
