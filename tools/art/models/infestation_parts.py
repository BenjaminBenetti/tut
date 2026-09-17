"""Authored Resin Shell infestation kit: closed, instanced overlays over existing surfaces.

Flat tiles are kept low so occupants remain readable; heavy shell thickness
belongs on walls and occupied props. Apertures match the city wall kit.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import mesh
from bpy_kit import material, mesh_objects, join

FOOTPRINT = (1, 1)


def plate(name, cx, cy, width, length, height, base=0.018, variant=0):
    """A sealed overlapping carapace scute with a narrow tan beveled lip."""
    outline = [(0, -0.54), (0.36, -0.38), (0.5, -0.02), (0.40, 0.36),
               (0.12, 0.5), (-0.32, 0.41), (-0.50, 0.08), (-0.34, -0.34)]
    verts = [(cx + x * width, cy + y * length, base) for x, y in outline]
    verts += [(cx + x * width * 0.87, cy + y * length * 0.86,
               base + height * (0.35 if y < 0 else 0.5)) for x, y in outline]
    verts.append((cx + width * 0.03, cy - length * 0.05, base + height))
    faces = [tuple(reversed(range(8)))]
    faces += [(i, (i + 1) % 8, (i + 1) % 8 + 8, i + 8) for i in range(8)]
    faces += [(8 + i, 8 + (i + 1) % 8, 16) for i in range(8)]
    lip = mesh(name + "_lip", verts, faces, "bug-chitin-tan", smooth=True)
    # Each material is its own closed solid: exported material primitives
    # remain watertight instead of splitting the skin along an open seam.
    top = [(cx + (x-cx)*0.985, cy + (y-cy)*0.985, z + 0.012) for x,y,z in verts]
    cap = mesh(name, top, faces, "bug-chitin-mid" if variant % 2 else "bug-chitin-dark", smooth=True)
    return join([lip, cap], name)



def wet_seam(name, points, radius=0.025):
    """A sealed low pool in a seam, subdued green rather than a glowing river."""
    from crescent_geometry import sweep
    sweep(name, points, [radius] * len(points), [radius * 0.4] * len(points),
          token="bug-bio-green-dim", sides=5, smooth=True)


def ground(variant=0):
    """Low continuous resin skin with four overlapping broad scutes."""
    outline = [(-0.5, -0.5), (0.0, -0.49), (0.5, -0.5), (0.49, 0.0),
               (0.5, 0.5), (0.0, 0.49), (-0.5, 0.5), (-0.49, 0.0)]
    verts = [(x, y, 0) for x, y in outline] + [(x, y, 0.018) for x, y in outline]
    faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
    faces += [(i, (i+1)%8, (i+1)%8+8, i+8) for i in range(8)]
    mesh("resin_skin", verts, faces, "bug-flesh", smooth=False)
    for i, (x, y, w, length, h) in enumerate([
        (-0.19, -0.24, 0.59, 0.49, 0.10),
        (0.23, -0.08, 0.53, 0.65, 0.13),
        (-0.23, 0.22, 0.55, 0.55, 0.11),
        (0.23, 0.33, 0.54, 0.32, 0.095),
    ]):
        if variant:
            x, y, w, length = -x, -y, w * 0.98, length * 0.95
        plate(f"scute_{i}", x, y, w, length, h, variant=i + variant)
    wet_seam("resin_seam", [(-0.04, -0.48, 0.029), (-0.03, -0.17, 0.031), (0.02, 0.05, 0.035)])


def wall(kind="solid"):
    """Double-sided shell growth around an unchanged wall/window/door aperture."""
    pieces = []
    if kind == "solid":
        pieces = [(x, z, 0.52, 0.54) for x in (-0.24, 0.24) for z in (0.27, 0.75, 1.20)]
    elif kind == "window":
        pieces = [(x, z, 0.18, 0.81) for x in (-0.42, 0.42) for z in (0.40, 1.08)]
        pieces += [(0, z, 0.99, 0.30) for z in (0.15, 1.35)]
    else:
        pieces = [(x, z, 0.18, 0.81) for x in (-0.42, 0.42) for z in (0.40, 1.08)]
        pieces += [(0, 1.36, 0.99, 0.25)]
    for side in (-1, 1):
        for i, (x, z, w, length) in enumerate(pieces):
            ob = plate(f"{kind}_{side}_{i}", x, z, w, length, 0.22 + 0.025 * (i % 2),
                       base=0.025, variant=i)
            transform_wall(ob, side)
    # Authored bottom is at ground level for the exporter and per-storey fitting.
    lower_to_ground()


def transform_wall(ob, side):
    """Turn a horizontal scute into a vertical one, keeping its real geometry."""
    matrix = ob.matrix_world.copy()
    for vertex in ob.data.vertices:
        x, y, z = matrix @ vertex.co
        vertex.co = Vector((x, side * (z + 0.055), y))
    if side == 1:
        ob.data.flip_normals()
    ob.matrix_world.identity()
    ob.data.update()


def collar():
    """A low shell collar to envelop the occupied base of a prop."""
    for i in range(4):
        a = math.tau * i / 4
        ob = plate(f"collar_{i}", 0, 0.22, 0.75, 0.50, 0.15, variant=i)
        matrix = ob.matrix_world.copy()
        for vertex in ob.data.vertices:
            x, y, z = matrix @ vertex.co
            r = 0.32 + z
            vertex.co = Vector((math.cos(a) * r - math.sin(a) * x,
                                math.sin(a) * r + math.cos(a) * x, y))
        ob.matrix_world.identity()
    lower_to_ground()


def lower_to_ground():
    """Translate the completed wall/collar so its lowest shell lip rests at zero."""
    bpy.context.view_layer.update()
    low = min((ob.matrix_world @ v.co).z for ob in mesh_objects() for v in ob.data.vertices)
    for ob in mesh_objects():
        ob.location.z -= low


def finish_materials():
    """Keep shell matte and resin seams wet; both borrow existing palette tokens."""
    combined = join(mesh_objects(), "resin_shell")
    combined["atlas_preserve_uv"] = True
    for token in ("bug-chitin-dark", "bug-chitin-mid", "bug-chitin-tan"):
        material(token).node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.64
    for token in ("bug-flesh", "bug-bio-green-dim"):
        material(token).node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.34
