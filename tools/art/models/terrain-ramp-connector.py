"""Full-width connector ramp, sharing the terrain kit's single RISE parameter.

Use the same solid graded section on roads and ground. Surface/side materials
come from the consumer. The low tile owns the entire footprint; its high edge
meets the upper terrace, avoiding the centre-to-centre plank's buried head.
Adjacent carriageway lanes butt into one apron without rails between them.
"""
import os
import sys
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain_slope_parts import build_slope

FOOTPRINT = (1, 1)


def build() -> None:
    """Use the shared RISE wedge; the scene fits one or two layers by scaling Y."""
    build_slope("straight")
    for ob in bpy.context.scene.objects:
        ob.name = "terrain-ramp-connector"
        if ob.type == "MESH":
            ob.data.name = ob.name
