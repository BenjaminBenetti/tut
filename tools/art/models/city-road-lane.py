"""Plain interior lane slab for the material-parameterised carriageway kit."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carriageway_parts import build_carriageway

FOOTPRINT = (1, 1)


def build() -> None:
    """Build the unmarked road slab."""
    build_carriageway("lane")
