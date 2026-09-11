"""Two-tile civilian vehicles for #1110, using the existing cover envelope."""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cylinder, material  # noqa: E402


def cabin(name: str, paint: str, utility: bool) -> None:
    """A closed sloping greenhouse with glass sides and a solid painted roof."""
    front, back = (0.55, -0.67) if utility else (0.55, -0.65)
    top_front, top_back = (0.19, -0.67) if utility else (0.15, -0.46)
    width, roof_width = 0.35, 0.31
    lower, top = 0.32, (0.86 if utility else 0.76) - 0.015
    vertices = [
        (back, -width, lower), (front, -width, lower),
        (front, width, lower), (back, width, lower),
        (top_back, -roof_width, top), (top_front, -roof_width, top),
        (top_front, roof_width, top), (top_back, roof_width, top),
    ]
    faces = [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5),
             (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material("env-glass"))
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    # Each glTF material primitive is closed on its own for the asset validator.
    box("painted-roof", (top_front - top_back, roof_width * 2, 0.02),
        ((top_front + top_back) / 2, 0, top + 0.005), paint)
    if utility:
        box("solid-cargo-body", (0.72, 0.716, 0.51), (-0.34, 0, 0.59), paint)
        for side in (-1, 1):
            box(f"cargo-trim-{side}", (0.64, 0.014, 0.06),
                (-0.34, side * 0.363, 0.42), "env-metal")
    else:
        for side in (-1, 1):
            box(f"window-pillar-{side}", (0.07, 0.026, 0.33),
                (-0.12, side * 0.34, 0.54), paint)


def build_vehicle(paint: str, utility: bool = False) -> None:
    """Keep all geometry within two longitudinal tiles and wheels grounded; export front +Z."""
    body = box("painted-body", (1.80, 0.76, 0.23), (0, 0, 0.25), paint)
    bevel(body, 0.025)
    cabin("greenhouse", paint, utility)
    for end in (-1, 1):
        box(f"bumper-{end}", (0.055, 0.72, 0.08),
            (end * 0.90, 0, 0.20), "env-asphalt")
        for side in (-1, 1):
            box(f"light-{end}-{side}", (0.018, 0.14, 0.07),
                (end * 0.906, side * 0.25, 0.30),
                "env-snow" if end == 1 else "env-brick")
    box("grille", (0.018, 0.28, 0.065), (0.908, 0, 0.29), "env-metal")
    for x in (-0.57, 0.57):
        for side in (-1, 1):
            cylinder(f"tyre-{x}-{side}", 0.165, 0.165, 0.095, 6,
                     (x, side * 0.365, 0.165), "env-asphalt", (math.pi / 2, 0, 0))
    # Cars formerly authored along X need an extra quarter-turn in the map
    # resolver. New kit follows the common model convention: front Blender -Y.
    for ob in bpy.context.scene.objects:
        x, y, z = ob.location
        ob.location = (y, -x, z)
        ob.rotation_euler.z -= math.pi / 2
