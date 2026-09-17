"""Resin Shell infestation: collar. Built with the art-blender workflow."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infestation_parts import ground, wall, collar, finish_materials

FOOTPRINT = (1, 1)


def build():
    """Build the closed collar overlay in the selected brown bug palette."""
    collar()
    finish_materials()
