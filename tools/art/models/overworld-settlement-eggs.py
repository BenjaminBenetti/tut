"""Egg-infestation overlay for one settlement style at one scale (#1152, #1155).

Stacks on overworld-settlement-<style>-<scale>.glb: same plot, same pivot,
same dressed layout, so the clusters land on that model's roofs and in its
gaps. Run through make_model.py with `--build-arg style=... --build-arg
scale=...`; `tools/art/build-settlements.sh` runs every pair.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from settlement_parts import build_settlement_eggs  # noqa: E402
from settlement_styles import STYLES  # noqa: E402

FOOTPRINT = (0.6, 0.6)


def build(style: str = "north-american", scale: str = "city") -> None:
    """Build the egg clusters and webbing over the ``style`` layout at ``scale``."""
    build_settlement_eggs(STYLES[style], scale)
