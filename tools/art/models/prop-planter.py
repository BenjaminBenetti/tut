"""Terracotta houseplant with broad, closed faceted leaves and branching stems."""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import cylinder, material

FOOTPRINT = (1, 1)


def leaf(name: str, start: tuple[float, float, float], end: tuple[float, float, float], width: float, token: str) -> None:
    """Build a thick diamond leaf with a raised centre and closed underside."""
    root, tip = Vector(start), Vector(end)
    middle = root.lerp(tip, 0.55)
    cross = (tip - root).cross(Vector((0, 0, 1))).normalized() * width
    vertices = [root, middle + cross, tip, middle - cross, middle + Vector((0, 0, 0.025)), middle - Vector((0, 0, 0.012))]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (1, 0, 5), (2, 1, 5), (3, 2, 5), (0, 3, 5)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material(token))
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)


def build() -> None:
    """Build a compact indoor plant, avoiding an outdoor tree's dense crown."""
    cylinder("terracotta_pot", 0.147, 0.105, 0.225, 8, (0, 0, 0.1125), "env-brick")
    cylinder("thick_pot_lip", 0.157, 0.154, 0.035, 8, (0, 0, 0.219), "env-rust")
    cylinder("dark_potting_soil", 0.127, 0.127, 0.008, 8, (0, 0, 0.24), "env-bark")
    cylinder("main_stem", 0.009, 0.012, 0.49, 6, (0, 0, 0.485), "env-tropical-leaf")
    for index, (height, yaw, length, rise) in enumerate((
        (0.36, 15, 0.225, 0.04),
        (0.405, 155, 0.23, 0.03),
        (0.44, 260, 0.25, 0.035),
        (0.49, 80, 0.23, 0.055),
        (0.53, 205, 0.225, 0.045),
        (0.575, 320, 0.2, 0.065),
        (0.635, 125, 0.185, 0.08),
        (0.68, 20, 0.16, 0.10),
    )):
        angle = math.radians(yaw)
        leaf(f"leaf_{index}", (0, 0, height), (math.cos(angle) * length, math.sin(angle) * length, height + rise), 0.075 if index < 5 else 0.061, "env-tropical-leaf" if index % 2 else "env-tropical-leaf-light")
