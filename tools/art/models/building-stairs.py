"""City kit: one-tile staircase rising 1.5 u.

The tallest step is toward -Y in Blender, which the glTF export puts on +Z,
so the flight climbs along the tile's +Z as the style guide (§7) specifies.

    -Y (front, +Z after export)          ##
                                       ####
                                     ######
                                   ########   +Y (back)
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box  # noqa: E402

FOOTPRINT = (1, 1)

#: Steps in one flight, the storey height they cover and the depth of each tread.
STEPS = 8
RISE = 1.5
TREAD = 1.0 / STEPS


#: Sloped side kerb: shorter than the flight's diagonal so its top lands on the
#: last step rather than poking into the storey above (the model stays 1.5 u).
KERB_LENGTH = 1.65
KERB_HEIGHT = 0.12


def build() -> None:
    """Eight solid steps between two sloped kerbs."""
    for i in range(STEPS):
        top = RISE * (i + 1) / STEPS
        y = 0.5 - TREAD * (i + 0.5)
        box(f"step_{i}", (0.86, TREAD, top), (0, y, top / 2), "env-concrete")
    pitch = -math.atan2(RISE, 1.0)
    lift = (KERB_LENGTH / 2) * math.sin(-pitch) + (KERB_HEIGHT / 2) * math.cos(pitch)
    for side in (-1, 1):
        name = "l" if side < 0 else "r"
        box(
            f"kerb_{name}",
            (0.07, KERB_LENGTH, KERB_HEIGHT),
            (side * 0.465, 0, RISE - lift),
            "env-sidewalk",
            rot=(pitch, 0, 0),
        )
