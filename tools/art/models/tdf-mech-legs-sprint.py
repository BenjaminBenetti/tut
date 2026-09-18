"""Mech progression part legs: sprint; reproducible source for #1168."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mech_progression_parts import build_legs

FOOTPRINT = (1, 1)

def build():
    """Build the part with its catalogue-compatible attachment sockets."""
    build_legs('sprint')
