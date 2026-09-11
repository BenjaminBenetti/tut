"""Compact humid-lowland planting and rendered masonry for Lagos (#1082).

Tree silhouettes are young/pruned urban specimens inside the existing 1x1
placement contract, not mature botanical specimens scaled literally. Almond
branches form horizontal tiers; oil-palm leaves form an arched, feathered crown.
Every leaf is a closed solid. Join by material to keep instancing economical.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import cylinder, join, material, mesh_objects  # noqa: E402
from city_kit_parts import Material  # noqa: E402

PLASTER = Material("env-plaster-warm", "env-concrete", "env-sidewalk", uv_rot=0)


def solid(name: str, vertices: list, faces: list, token: str) -> None:
    """Create one closed flat-shaded mesh from explicit outward-wound faces."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material(token))
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)


def finish(name: str) -> None:
    """Keep one export node and a true base-centre pivot, retaining materials."""
    obj = join(mesh_objects(), name)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def branch(name: str, start: tuple, end: tuple, radius: float, token: str) -> None:
    """Point a tapered, closed six-sided branch between two positions."""
    a, b = Vector(start), Vector(end)
    obj = cylinder(name, radius * 0.65, radius, (b - a).length, 6, (a + b) / 2, token)
    obj.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()


def almond_crown(name: str, radius: float, z: float, depth: float, angle: float, token: str,
                 centre: tuple = (0, 0)) -> None:
    """A broad flattened octagonal crown with irregular, horizontal branch tips."""
    points = []
    for i in range(8):
        a = angle + i * math.tau / 8
        r = radius * (0.94 if i % 2 else 1)
        points.append((centre[0] + math.cos(a) * r, centre[1] + math.sin(a) * r * 0.88, z))
    points += [(centre[0] - radius * 0.12, centre[1], z + depth * 0.66),
               (centre[0], centre[1], z - depth * 0.34)]
    faces = []
    for i in range(8):
        j = (i + 1) % 8
        faces += [(i, j, 8), (j, i, 9)]
    solid(name, points, faces, token)


def tropical_almond() -> None:
    """A 2.0-high layered crown above a visible trunk; maximum spread 0.98."""
    cylinder("trunk", 0.045, 0.085, 1.87, 6, (0, 0, 0.935), "env-bark")
    for tier, (radius, z, depth, angle, centres) in enumerate([
        (0.29, 1.15, 0.24, 0, [(-0.20, -0.07), (0.20, 0.06)]),
        (0.29, 1.55, 0.25, 0.17, [(-0.12, 0.12), (0.14, -0.11)]),
        (0.25, 1.84, 0.16 / 0.66, -0.12, [(0.025, 0.015)]),
    ]):
        for i, centre in enumerate(centres):
            branch(f"branch_{tier}_{i}", (0, 0, z - 0.15),
                   (centre[0], centre[1], z),
                   0.018, "env-bark")
            almond_crown(f"crown_{tier}_{i}", radius, z, depth, angle,
                         "env-tropical-leaf-light" if tier == 2 or i == 1 else "env-tropical-leaf",
                         centre)
    finish("tree-tropical-almond")


def palm_frond(name: str, angle: float, lift: float, reach: float, token: str) -> None:
    """A closed arched leaf with broad feathered shoulders and a drooping tip."""
    # Eight points around the leaf perimeter, plus top/bottom ridges. The
    # perimeter rises at its middle and falls at its tip, not a flat pinwheel.
    outline = [
        (0.025, 0, 2.04), (reach * 0.35, -0.080, 2.12 + lift),
        (reach * 0.70, -0.065, 2.04 + lift), (reach, 0, 1.86 + lift),
        (reach * 0.70, 0.065, 2.04 + lift), (reach * 0.35, 0.080, 2.12 + lift),
    ]
    points = outline + [(reach * 0.40, 0, 2.16 + lift), (reach * 0.40, 0, 2.08 + lift)]
    rotated = [(math.cos(angle) * x - math.sin(angle) * y,
                math.sin(angle) * x + math.cos(angle) * y, z) for x, y, z in points]
    faces = []
    for i in range(6):
        j = (i + 1) % 6
        faces += [(i, j, 6), (j, i, 7)]
    solid(name, rotated, faces, token)


def oil_palm() -> None:
    """A 2.3-high sturdy palm with ten arching fronds inside a 0.98-wide crown."""
    cylinder("trunk", 0.075, 0.12, 2.02, 8, (0, 0, 1.01), "env-palm-trunk")
    # Retained leaf bases produce the stockier palm trunk, without tiny rings.
    for i in range(3):
        cylinder(f"leaf_base_{i}", 0.11, 0.09, 0.13, 8,
                 (0, 0, 1.63 + i * 0.14), "env-bark")
    for i in range(10):
        palm_frond(f"frond_{i}", i * math.tau / 10,
                   0.14 if i % 2 else 0, 0.43 if i % 2 else 0.49,
                   "env-tropical-leaf-light" if i % 2 else "env-tropical-leaf")
    finish("tree-oil-palm")
