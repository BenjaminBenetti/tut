"""Mech progression part weapon-back: incendiary-launcher; reproducible source for #1168."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mech_progression_parts import build_back_weapon

FOOTPRINT = (0, 0)

def build():
    """Build the part with its catalogue-compatible attachment sockets."""
    build_back_weapon('incendiary-launcher')
