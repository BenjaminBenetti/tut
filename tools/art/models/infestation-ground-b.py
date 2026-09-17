"""Resin Shell infestation: ground-b. Built with the art-blender workflow."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infestation_parts import ground, wall, collar, finish_materials

FOOTPRINT = (6, 6)


def build():
    """Build the closed ground-b overlay in the selected brown bug palette."""
    ground(1)
    finish_materials()
