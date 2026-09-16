"""Industrial workbench with a rear tool rack, vice and lower storage shelf."""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box, cylinder, material
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def spanner_head() -> None:
    """Extrude a closed U-shaped jaw so the hanging tool reads as a spanner."""
    outline = ((-0.04, -0.03), (0.04, -0.03), (0.04, 0.033), (0.017, 0.033), (0.017, 0), (-0.017, 0), (-0.017, 0.033), (-0.04, 0.033))
    vertices = [(x + 0.005, y, z + 0.785) for y in (0.146, 0.180) for x, z in outline]
    faces = [tuple(range(8)), tuple(range(15, 7, -1))]
    faces.extend((i, i + 8, (i + 1) % 8 + 8, (i + 1) % 8) for i in range(8))
    mesh = bpy.data.meshes.new("spanner_jaw")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("spanner_jaw", mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material("env-metal"))


def build() -> None:
    """Build a practical bench whose tool silhouettes survive the isometric view."""
    box("worktop", (0.92, 0.53, 0.055), (0, -0.005, 0.4725), "env-sand")
    for index, (x, y) in enumerate(((-0.38, -0.20), (0.38, -0.20), (-0.38, 0.20), (0.38, 0.20))):
        box(f"leg_{index}", (0.055, 0.055, 0.455), (x, y, 0.2275), "env-roof-green")
    box("lower_shelf", (0.81, 0.44, 0.035), (0, 0, 0.125), "env-metal")
    box("front_rail", (0.81, 0.045, 0.085), (0, -0.20, 0.405), "env-roof-green")
    for side in (-1, 1):
        box(f"rack_post_{side}", (0.04, 0.04, 0.405), (side * 0.395, 0.21, 0.6875), "env-metal")
    box("tool_board", (0.80, 0.035, 0.325), (0, 0.225, 0.7175), "env-bark")
    box("hanging_rail", (0.69, 0.02, 0.025), (0, 0.20, 0.798), "env-metal")
    box("hammer_handle", (0.035, 0.028, 0.20), (-0.225, 0.17, 0.70), "env-sand")
    box("hammer_head", (0.14, 0.053, 0.054), (-0.225, 0.15, 0.795), "env-metal")
    box("spanner_shaft", (0.037, 0.029, 0.17), (0.005, 0.168, 0.69), "env-sidewalk")
    spanner_head()
    box("vice_base", (0.21, 0.18, 0.07), (-0.24, -0.16, 0.535), "env-metal")
    box("vice_fixed_jaw", (0.12, 0.055, 0.12), (-0.24, -0.103, 0.59), "env-roof-green")
    box("vice_moving_jaw", (0.12, 0.045, 0.09), (-0.24, -0.23, 0.59), "env-metal")
    cylinder("vice_screw", 0.016, 0.016, 0.12, 6, (-0.24, -0.264, 0.545), "env-metal", rot=(math.pi / 2, 0, 0))
    box("vice_crank", (0.10, 0.025, 0.02), (-0.24, -0.32, 0.545), "env-roof")
    box("toolbox", (0.25, 0.16, 0.12), (0.21, 0.025, 0.56), "env-brick")
    box("toolbox_handle", (0.12, 0.04, 0.025), (0.21, 0.025, 0.63), "env-roof")
    box("lower_stock", (0.27, 0.25, 0.17), (0.16, 0.02, 0.225), "env-plaster-warm")
    finish_prop("workbench")
