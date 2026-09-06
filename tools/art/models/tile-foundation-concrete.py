"""One concrete foundation course below a building, sharing the terrain kit's RISE."""
import os
import sys

from bpy_kit import box

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain_slope_parts import RISE

FOOTPRINT = (1, 1)


def build() -> None:
    """A closed base-centred block; repeated courses retain concrete texture scale."""
    box("foundation-concrete", (1, 1, RISE), (0, 0, RISE / 2), "env-concrete")
