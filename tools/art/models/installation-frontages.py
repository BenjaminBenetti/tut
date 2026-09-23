"""Installation names on the ordinary modular entrance canopy, with its rear wall pivot."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from business_sign_parts import build_business_sign

FOOTPRINT = (3, .66)


def build(kind="sensor-array"):
    """Print the building's use without changing its door, walls or mounting rules."""
    build_business_sign(kind, compact=False)
