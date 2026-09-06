"""A repeatable wall-mounted steel ladder section, one shared elevation RISE high.

Each section adds five evenly spaced rungs at today's RISE. Repeating sections
fits any integer layer span without stretching the rung spacing or thickness.
The rails face glTF -Z, with brackets reaching the supporting wall at +Z.
Pivot at the centre of the base footprint; the consumer places the back plates
against the facade and chooses brushed or weathered steel from the env atlas.
"""

import os
import sys

from bpy_kit import box, join

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain_slope_parts import RISE

FOOTPRINT = (0.35, 0.16)
RUNG_PITCH = 0.15


def build() -> None:
    """Build continuous side rails, square rungs, stand-offs and wall plates."""
    parts = []
    for x in (-0.145, 0.145):
        parts.append(box("ladder-rail", (0.03, 0.04, RISE),
                         (x, 0.06, RISE / 2), "env-metal"))
        parts.append(box("ladder-stand-off", (0.035, 0.12, 0.04),
                         (x, 0, RISE / 2), "env-metal"))
        parts.append(box("ladder-wall-plate", (0.06, 0.02, 0.10),
                         (x, -0.07, RISE / 2), "env-metal"))
    count = max(1, round(RISE / RUNG_PITCH))
    for i in range(count):
        parts.append(box("ladder-rung", (0.29, 0.035, 0.025),
                         (0, 0.06, (i + 0.5) * RISE / count), "env-metal"))
    join(parts, "ladder-section")
