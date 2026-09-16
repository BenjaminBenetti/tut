"""Overworld settlement marker, one style at one scale (#1152, #1155).

Run through make_model.py with the style and scale as build arguments:

    blender -b --python tools/art/make_model.py -- \
      --script tools/art/models/overworld-settlement.py \
      --build-arg style=east-asian --build-arg scale=city \
      --id overworld.settlement.east-asian.city --category props \
      --file overworld-settlement-east-asian-city.glb --no-textured

`tools/art/build-settlements.sh` runs every style × scale. See
settlement_parts.py (templates and builders) and settlement_styles.py
(the ten regional families).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from settlement_parts import build_settlement  # noqa: E402
from settlement_styles import STYLES  # noqa: E402

FOOTPRINT = (0.6, 0.6)


def build(style: str = "north-american", scale: str = "city") -> None:
    """Build the settlement of ``style`` at ``scale`` on its 0.6 u plot, pivot at the base centre."""
    build_settlement(STYLES[style], scale)
