"""Closed, reusable organic surfaces for the brown Crescent bug family.

Coordinates use Blender world space, with -Y forward. Pieces keep their own
origins for rigid animation. Continuous authored UVs let texture follow the
whole surface without stamping the atlas pattern on every tiny triangle.
"""

from __future__ import annotations

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import join, material, mesh_objects, sphere  # noqa: E402


def mesh(name, vertices, faces, token, smooth=True):
    """Create a closed surface with outward normals and a meaningful origin."""
    centre = sum((Vector(v) for v in vertices), Vector()) / len(vertices)
    data = bpy.data.meshes.new(name)
    data.from_pydata([Vector(v) - centre for v in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    ob.location = centre
    data.materials.append(material(token))
    for face in data.polygons:
        face.use_smooth = smooth
    spans = [(max(v[k] for v in vertices) - min(v[k] for v in vertices), k) for k in range(3)]
    axes = [entry[1] for entry in sorted(spans, reverse=True)[:2]]
    lows = [min(v[k] for v in vertices) for k in axes]
    sizes = [max(v[k] for v in vertices) - low for k, low in zip(axes, lows)]
    uv = data.uv_layers.new(name="UVMap")
    for loop in data.loops:
        point = vertices[loop.vertex_index]
        uv.data[loop.index].uv = tuple(0.08 + 0.84 * (point[k] - low) / max(size, 0.00001)
                                       for k, low, size in zip(axes, lows, sizes))
    ob["atlas_preserve_uv"] = True
    return ob


def sweep(name, points, widths, depths=None, token="bug-chitin-dark", sides=8, smooth=True):
    """Loft capped elliptical rings along a path; never collapse a tip ring."""
    pts = [Vector(p) for p in points]
    depths = widths if depths is None else depths
    vertices, frames = [], []
    for i, point in enumerate(pts):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
        ref = Vector((1, 0, 0)) if abs(tangent.x) < 0.85 else Vector((0, 1, 0))
        u = (ref - tangent * ref.dot(tangent)).normalized()
        v = tangent.cross(u).normalized()
        frames.append((u, v))
        for k in range(sides):
            a = k * math.tau / sides
            vertices.append(point + u * math.cos(a) * max(widths[i], 0.0003)
                            + v * math.sin(a) * max(depths[i], 0.0003))
    faces = []
    for i in range(len(pts) - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))),
                  tuple((len(pts) - 1) * sides + k for k in range(sides))])
    return mesh(name, vertices, faces, token, smooth), frames


def bead(name, at, radius, token, scale=(1, 1, 1), segments=12, rings=8):
    """A compact organic joint or recessed sensory organ."""
    ob = sphere(name, radius, at, token, segments, rings, scale, smooth=True)
    ob["atlas_preserve_uv"] = True
    return ob


def shell(name, at, width, depth, rise, token="bug-chitin-dark", crescent=0.0,
          thickness=0.025, segments=40, rings=7):
    """Thin domed shell with a swept crescent outline and a closed underside."""
    cx, cy, cz = at
    outline = []
    for i in range(segments):
        a = math.tau * i / segments
        signed = min(a, math.tau - a)
        horn = math.exp(-((signed - 2.03) / 0.23) ** 2) * crescent
        x = math.sin(a) * width * (0.91 + horn * 0.34)
        y = -math.cos(a) * depth
        if math.cos(a) < 0:
            y = y * (1 - crescent * 0.6) + horn * depth * 0.64
        outline.append((x, y))
    vertices = [(cx, cy, cz + rise)]
    for layer in range(1, rings + 1):
        r = layer / rings
        for x, y in outline:
            z = cz + rise * (1 - r ** 1.7) ** 0.78
            vertices.append((cx + x * r, cy + y * r, z))
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    for layer in range(rings - 1):
        start = 1 + layer * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((start + i, start + j, start + segments + j, start + segments + i))
    underside = len(vertices)
    vertices.append((cx, cy, cz + rise - thickness))
    for x, y in outline:
        vertices.append((cx + x, cy + y, cz - thickness))
    outer = 1 + (rings - 1) * segments
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((outer + i, outer + j, underside + 1 + j, underside + 1 + i))
        faces.append((underside, underside + 1 + j, underside + 1 + i))
    ob = mesh(name, vertices, faces, token, smooth=True)
    return ob, [(cx + x, cy + y, cz - thickness * 0.1) for x, y in outline]


def rim(name, outline, radius, token="bug-chitin-tan"):
    """A periodic closed tube forming the reinforced edge of a shell."""
    points = [Vector(p) for p in outline]
    vertices = []
    n, sides = len(points), 6
    for i, p in enumerate(points):
        tangent = (points[(i + 1) % n] - points[(i - 1) % n]).normalized()
        u = tangent.cross(Vector((0, 0, 1))).normalized()
        for k in range(sides):
            a = math.tau * k / sides
            vertices.append(p + u * math.cos(a) * radius
                            + Vector((0, 0, math.sin(a) * radius * 0.7)))
    faces = []
    for i in range(n):
        for k in range(sides):
            faces.append((i * sides + k, i * sides + (k + 1) % sides,
                          ((i + 1) % n) * sides + (k + 1) % sides,
                          ((i + 1) % n) * sides + k))
    return mesh(name, vertices, faces, token)


def scute(name, at, width, length, height, token="bug-chitin-tan", tilt=0):
    """A sharp six-sided dorsal lozenge with a bevel and raised central keel."""
    x, y, z = at
    outline = [(0, -length * 0.6), (width * 0.5, -length * 0.12),
               (width * 0.42, length * 0.32), (0, length * 0.5),
               (-width * 0.42, length * 0.32), (-width * 0.5, -length * 0.12)]
    vertices = []
    for scale, lift in [(1, 0), (0.82, height * 0.38)]:
        vertices.extend((x + px * scale, y + py * scale, z + lift + py * tilt)
                        for px, py in outline)
    vertices.extend([(x, y - length * 0.18, z + height - length * 0.18 * tilt),
                     (x, y + length * 0.2, z + height + length * 0.2 * tilt)])
    faces = [tuple(reversed(range(6)))]
    faces.extend((i, (i + 1) % 6, 6 + (i + 1) % 6, 6 + i) for i in range(6))
    faces.extend([(6, 7, 12), (7, 8, 13, 12), (8, 9, 13),
                  (9, 10, 13), (10, 11, 12, 13), (11, 6, 12)])
    return mesh(name, vertices, faces, token, smooth=False)


def hooked_blade(name, points, widths, thickness, edge=0.008):
    """Curved, tapered blade with a separate closed pale cutting edge."""
    _, frames = sweep(name + "_back", points, [thickness] * len(points), widths,
                      "bug-chitin-black", sides=8)
    cut = [Vector(p) + v * (w * 0.88) for p, w, (_, v) in zip(points, widths, frames)]
    sweep(name + "_edge", cut, [edge * (0.4 + 0.6 * w / max(widths)) for w in widths],
          token="bug-bone", sides=6)


def group_new(before, name):
    """Consolidate a connected anatomical piece into one named rigid node."""
    bpy.context.view_layer.update()
    parts = [ob for ob in mesh_objects() if ob not in before]
    ob = join(parts, name)
    ob["atlas_preserve_uv"] = True
    return ob


def joint_origin(ob, anchor):
    """Keep the mesh in place but export its true hip/shoulder as a rigid pivot."""
    bpy.context.view_layer.update()
    target = Vector(anchor)
    offset = target - ob.location
    for vertex in ob.data.vertices:
        vertex.co -= offset
    ob.location = target
    ob["motion_joint"] = True
    return ob


def finish(height, max_width=1.0, max_depth=1.1):
    """Normalize physical bounds and keep all authored joints on the same scale."""
    from bpy_kit import bounds
    bpy.context.view_layer.update()
    lo, hi = bounds()
    sx = min(1, max_width / (hi.x - lo.x))
    sy = min(1, max_depth / (hi.y - lo.y))
    sz = height / (hi.z - lo.z)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            origin = ob.location.copy()
            matrix = ob.matrix_world.copy()
            for vertex in ob.data.vertices:
                point = matrix @ vertex.co
                vertex.co = Vector(((point.x - centre.x) * sx, (point.y - centre.y) * sy,
                                    (point.z - centre.z) * sz))
            ob.matrix_world.identity()
            target = Vector(((origin.x - centre.x) * sx, (origin.y - centre.y) * sy,
                             (origin.z - centre.z) * sz))
            for vertex in ob.data.vertices:
                vertex.co -= target
            ob.location = target
            ob.data.update()
            ob["atlas_preserve_uv"] = True
        elif ob.name.startswith("socket_"):
            ob.location = Vector(((ob.location.x - centre.x) * sx, (ob.location.y - centre.y) * sy,
                                  (ob.location.z - centre.z) * sz))
    bpy.context.view_layer.update()


def growth_ridges(name, at, outline, rise, radius=0.004):
    """Low relief follows the dome exactly, giving the shell grown radial ribs."""
    centre = Vector(at)
    count = len(outline)
    for side in (-1, 1):
        for j, fraction in enumerate((0.115, 0.205, 0.285)):
            index = int(count * fraction) * side % count
            outer = Vector(outline[index])
            points = []
            for i in range(9):
                r = 0.24 + i * 0.088
                point = centre.lerp(outer, r)
                point.z = centre.z + rise * (1 - r ** 1.7) ** 0.78 + radius * 0.16
                points.append(point)
            sweep(f"{name}_{side}_{j}", points,
                  [radius * (0.65 + 0.35 * math.sin(i * math.pi / 8)) for i in range(9)],
                  token="bug-chitin-dark", sides=6)
