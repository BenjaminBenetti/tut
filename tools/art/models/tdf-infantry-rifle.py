"""Rifle squad: light helmets, olive uniforms, carbines and chest ammunition."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_parts import build_squad  # noqa: E402

FOOTPRINT = (1, 1)


# ===========================================

def build() -> None:
    """Build five riflemen with a kneeling front-centre leader."""
    build_squad("rifle")
