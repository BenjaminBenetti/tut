"""Rocket squad: heavy armour, spare warheads and two launcher operators."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_parts import build_squad  # noqa: E402

FOOTPRINT = (1, 1)


# ===========================================

def build() -> None:
    """Build five armoured soldiers with shoulder and hip-carried launchers."""
    build_squad("rocket")
