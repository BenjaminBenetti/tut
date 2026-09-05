"""City kit: half-height wall (0.5 u) in concrete — the civic parapet (#766).

The same mesh as ``building-wall-half.py`` with the body on the concrete
swatch instead of brick. It is what a ``half`` wall belonging to no
building draws: the lip along a viaduct or a raised park, which in brick
read as a low brick building the road sat on (#748).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import bevel, box  # noqa: E402

FOOTPRINT = (1, 0)


def build() -> None:
    """Concrete body under the same proud concrete coping cap."""
    box("body", (1.0, 0.12, 0.42), (0, 0, 0.21), "env-concrete", uv_rot=90)
    coping = box("coping", (1.0, 0.18, 0.08), (0, 0, 0.46), "env-concrete")
    bevel(coping, 0.02)
