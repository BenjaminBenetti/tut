"""Resin Shell infestation: wall. Built with the art-blender workflow."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infestation_parts import ground, wall, collar, finish_materials

FOOTPRINT = (1, 0)


def build():
    """Build the closed wall overlay in the selected brown bug palette."""
    wall('solid')
    finish_materials()
