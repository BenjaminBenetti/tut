"""Radio squad: bright headsets, compact SMGs and two tall whip aerials."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_parts import build_squad  # noqa: E402

FOOTPRINT = (1, 1)


# ===========================================

def build() -> None:
    """Build five signals soldiers with two radios and a handset operator."""
    build_squad("radio")
