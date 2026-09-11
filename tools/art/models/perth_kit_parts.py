"""Swan Coastal Plain planting and limestone at compact game scale (#1083)."""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import cylinder, join, material, mesh_objects, sphere  # noqa: E402


def finish(name: str) -> None:
    """Join material groups into one node and restore its grounded centre pivot."""
    obj = join(mesh_objects(), name)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def branch(name: str, start: tuple, end: tuple, radius: float, token: str) -> None:
    """Make a closed six-sided tapered branch between the two endpoints."""
    a, b = Vector(start), Vector(end)
    obj = cylinder(name, radius * 0.6, radius, (b - a).length, 6, (a + b) / 2, token)
    obj.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()


def solid(name: str, vertices: list, faces: list, token: str) -> None:
    """Create a flat-shaded closed solid with outward-wound faces."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material(token))
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)


def tuart() -> None:
    """A 2.2-high young/pruned tuart: branching structure and open grey-green crown."""
    cylinder("lower_trunk", 0.065, 0.095, 0.76, 6, (0, 0, 0.38), "env-tuart-bark")
    branch("upper_trunk", (0, 0, 0.69), (-0.025, 0, 1.76), 0.065, "env-tuart-bark")
    crowns = [
        (-0.24, 0.05, 1.64, 0.24, "env-sclerophyll-leaf"),
        (0.20, -0.20, 1.80, 0.27, "env-sclerophyll-leaf-light"),
        (0.18, 0.20, 1.96, 0.24, "env-sclerophyll-leaf"),
        (-0.12, -0.02, 2.035, 0.25, "env-sclerophyll-leaf-light"),
    ]
    for i, (x, y, z, r, token) in enumerate(crowns):
        branch(f"fork_{i}", (0, 0, 0.88 + i * 0.14), (x, y, z), 0.030, "env-tuart-bark")
        sphere(f"foliage_{i}", r, (x, y, z), token, segments=6, rings=4,
               scale=(1, 0.86, 0.66))
    finish("tree-tuart")


def banksia() -> None:
    """A 1.4-high Banksia with a dense irregular crown and a few upright flower spikes."""
    cylinder("trunk", 0.055, 0.085, 0.64, 6, (0, 0, 0.32), "env-bark")
    crowns = [(-0.20, 0.07, 0.89, 0.29), (0.19, -0.12, 0.98, 0.29), (0.04, 0.14, 1.12, 0.24)]
    for i, (x, y, z, r) in enumerate(crowns):
        branch(f"fork_{i}", (0, 0, 0.36), (x, y, z), 0.026, "env-bark")
        sphere(f"foliage_{i}", r, (x, y, z), "env-sclerophyll-leaf",
               segments=6, rings=4, scale=(1, 0.88, 0.72))
    for i, (x, y, z) in enumerate([(-0.19, 0.02, 1.09), (0.21, -0.10, 1.18), (0.03, 0.16, 1.30)]):
        cylinder(f"flower_{i}", 0.04, 0.035, 0.20, 6, (x, y, z), "env-limestone")
    finish("banksia")


def grass_tree() -> None:
    """A low grass tree: dark grounded trunk beneath a 0.94-wide arching leaf skirt."""
    cylinder("trunk", 0.085, 0.13, 0.53, 8, (0, 0, 0.265), "env-grass-tree-trunk")
    for i in range(22):
        angle = i * math.tau / 22
        reach = 0.47 if i % 2 else 0.37
        lift = 0.12 if i % 2 else 0.20
        points = [(0, 0, 0.53), (0.17, -0.018, 0.53 + lift),
                  (reach, 0, 0.35), (0.17, 0.018, 0.53 + lift),
                  (0.17, 0, 0.555 + lift)]
        points = [(math.cos(angle) * x - math.sin(angle) * y,
                   math.sin(angle) * x + math.cos(angle) * y, z) for x, y, z in points]
        # A closed four-sided pyramid, not double-sided paper leaves.
        solid(f"leaf_{i}", points, [(3, 2, 1, 0), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)],
              "env-sclerophyll-leaf" if i % 2 else "env-sclerophyll-leaf-light")
    finish("grass-tree")


def limestone_outcrop() -> None:
    """A 1.05-high pale outcrop with broken ledges, within the one-tile rock contract."""
    # Unequal polygon rings form a weathered mass rather than a concrete cube.
    rings = [
        (0, [(-.43, -.30), (-.14, -.43), (.32, -.33), (.46, .10), (.20, .40), (-.37, .32)]),
        (.43, [(-.39, -.29), (-.13, -.35), (.37, -.28), (.43, .12), (.19, .35), (-.33, .30)]),
        (.44, [(-.27, -.18), (-.09, -.27), (.35, -.27), (.40, .10), (.17, .32), (-.24, .18)]),
        (.94, [(-.24, -.16), (-.08, -.22), (.24, -.18), (.28, .10), (.12, .25), (-.23, .17)]),
    ]
    vertices = [(x, y, z) for z, ring in rings for x, y in ring]
    for i, z in enumerate([.94, 1.02, 1.05, .94, .91, .95]):
        x, y, _ = vertices[18 + i]
        vertices[18 + i] = (x, y, z)
    faces = [tuple(reversed(range(6)))]
    for level in range(3):
        for i in range(6):
            j = (i + 1) % 6
            faces.append((level * 6 + i, level * 6 + j, (level + 1) * 6 + j, (level + 1) * 6 + i))
    faces += [(18, 19, 20), (18, 20, 21), (18, 21, 22), (18, 22, 23)]
    solid("limestone", vertices, faces, "env-limestone")
    finish("limestone-outcrop")
