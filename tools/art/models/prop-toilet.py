"""Compact ceramic toilet with a sculpted basin, open seat and separate cistern."""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder, material

FOOTPRINT = (1, 1)


def ring_mesh(name: str, profiles: list[tuple[float, float, float]], token: str, capped: bool = False) -> None:
    """Connect eight-sided oval rings into a closed seat or recessed basin."""
    vertices = []
    for rx, ry, z in profiles:
        vertices.extend((math.cos(i * math.tau / 8) * rx, math.sin(i * math.tau / 8) * ry - 0.045, z) for i in range(8))
    faces = []
    for ring in range(len(profiles) - 1):
        for i in range(8):
            a, b = ring * 8 + i, ring * 8 + (i + 1) % 8
            faces.append((a, b, b + 8, a + 8))
    if capped:
        faces.append(tuple(reversed(range(8))))
        faces.append(tuple(range((len(profiles) - 1) * 8, len(profiles) * 8)))
    else:
        last = (len(profiles) - 1) * 8
        faces.extend((last + i, last + (i + 1) % 8, (i + 1) % 8, i) for i in range(8))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material(token))
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)


def build() -> None:
    """Build a seated-height toilet, with the cistern toward its back wall."""
    pedestal = cylinder("ceramic_pedestal", 0.1, 0.12, 0.135, 8, (0, -0.015, 0.0675), "env-snow")
    pedestal.scale.y = 1.2
    box("rear_cistern_support", (0.17, 0.12, 0.28), (0, 0.15, 0.14), "env-snow")
    ring_mesh("recessed_bowl", [(0.105, 0.125, 0.115), (0.18, 0.225, 0.23), (0.13, 0.175, 0.23), (0.066, 0.093, 0.14)], "env-snow", capped=True)
    ring_mesh("open_cream_seat", [(0.186, 0.229, 0.232), (0.186, 0.229, 0.251), (0.128, 0.17, 0.251), (0.128, 0.17, 0.232)], "env-plaster-warm")
    box("cistern", (0.275, 0.12, 0.275), (0, 0.175, 0.3535), "env-snow")
    box("cistern_lid", (0.29, 0.137, 0.025), (0, 0.175, 0.5035), "env-snow")
    box("flush_lever", (0.05, 0.015, 0.019), (-0.085, 0.11, 0.463), "env-metal")
    water = cylinder("basin_water", 0.063, 0.063, 0.006, 8, (0, -0.045, 0.144), "env-water-shallow")
    water.scale.y = 1.35
