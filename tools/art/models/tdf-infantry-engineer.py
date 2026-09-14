"""Engineer squad: lamp-equipped hard hats, shotguns and demolition tools."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_parts import build_squad  # noqa: E402

FOOTPRINT = (1, 1)


# ===========================================

def build() -> None:
    """Build five combat engineers, including a toolbox carrier."""
    build_squad("engineer")
