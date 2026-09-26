"""Slab armour for the Act III armoured variants (#1179).

The campaign bestiary kit ("Armoured variants") keeps each shipped bug's
anatomy, footprint and rig nodes exactly and adds armour: thick dark slab
plates with bevelled bone rims and small knobbed bosses, the tan markings
kept as raised studs. The variant reads darker overall with bright rims.

Every helper builds loose meshes; ``into`` joins them into the rig node
they cover, so a plate moves with its leg or blade and the node keeps its
authored joint (``motion_joint``) and origin.

    anatomy()  ──► carapace, head, leg_*, blade_*/scythe_*/cleaver_*
    armour     ──► slab / cuff / boss / stud meshes
    into(node) ──► one node again, origin and joint unchanged
    finish()   ──► the variant's own height
"""

from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import join, mesh_objects  # noqa: E402
from crescent_geometry import bead, mesh, scute, shell, sweep  # noqa: E402

#: Slab plates: dark umber.
SLAB = "bug-chitin-black"
#: Bevelled rims and knobbed bosses: pale horn.
BONE = "bug-bone"
#: Raised studs where the base species' tan markings were.
STUD = "bug-chitin-tan"


# ===========================================
# Joining armour into the rig
# ===========================================


def into(node_name, before):
    """Join every mesh made since ``before`` into the named rig node.

    The node stays the active object, so its origin (the hip or shoulder
    pivot) and its custom properties (``motion_joint``) survive the join.
    """
    bpy.context.view_layer.update()
    node = bpy.data.objects[node_name]
    parts = [ob for ob in mesh_objects() if ob not in before and ob is not node]
    if not parts:
        return node
    for ob in parts:
        ob["atlas_preserve_uv"] = True
    joined = join([node, *parts], node_name)
    return joined


def new_since():
    """The mesh objects that exist now; pass it to ``into`` after building."""
    return set(mesh_objects())


# ===========================================
# Placement on a surface
# ===========================================


def surface_hit(node_name, x, y, top=3.0):
    """Where a vertical ray at (x, y) first meets the node from above: point and normal."""
    bpy.context.view_layer.update()
    ob = bpy.data.objects[node_name]
    inverse = ob.matrix_world.inverted()
    origin = inverse @ Vector((x, y, top))
    direction = (inverse.to_3x3() @ Vector((0, 0, -1))).normalized()
    hit, location, normal, _ = ob.ray_cast(origin, direction)
    if not hit:
        raise ValueError(f"no surface of {node_name} under ({x}, {y})")
    world = ob.matrix_world @ location
    world_normal = (ob.matrix_world.to_3x3().inverted().transposed() @ normal).normalized()
    if world_normal.z < 0:
        world_normal = -world_normal
    return world, world_normal


def orient(objects, pivot, normal, yaw=0.0):
    """Turn objects built dome-up about ``pivot`` so their up follows ``normal``."""
    up = Vector((0, 0, 1))
    rotation = up.rotation_difference(Vector(normal).normalized()).to_matrix().to_4x4()
    spin = Matrix.Rotation(yaw, 4, "Z")
    transform = Matrix.Translation(pivot) @ rotation @ spin @ Matrix.Translation(-Vector(pivot))
    bpy.context.view_layer.update()
    for ob in objects:
        ob.matrix_world = transform @ ob.matrix_world
    bpy.context.view_layer.update()


# ===========================================
# Plates
# ===========================================


def lip(name, outline, radius, token=BONE):
    """A bevelled rim round a plate's outline: a closed tube of diamond section.

    Four sides, not the six of ``crescent_geometry.rim``: at tactical size
    the diamond reads as a bevel, and the variant's many rims stay inside
    the swarmer's triangle budget.
    """
    points = [Vector(p) for p in outline]
    n, sides = len(points), 4
    vertices = []
    for i, p in enumerate(points):
        tangent = (points[(i + 1) % n] - points[(i - 1) % n]).normalized()
        u = tangent.cross(Vector((0, 0, 1))).normalized()
        for k in range(sides):
            a = math.tau * k / sides
            vertices.append(p + u * math.cos(a) * radius
                            + Vector((0, 0, math.sin(a) * radius * 0.8)))
    faces = [(i * sides + k, i * sides + (k + 1) % sides,
              ((i + 1) % n) * sides + (k + 1) % sides, ((i + 1) % n) * sides + k)
             for i in range(n) for k in range(sides)]
    return mesh(name, vertices, faces, token)


def slab(name, at, width, depth, rise, thickness=0.02, crescent=0.0, segments=20, rings=3,
         rim_radius=0.006):
    """A thick dark dome plate with a pale bevelled rim, dome up, centred on ``at``.

    Returns the plate and its rim, so a caller can orient both together.
    """
    plate, edge = shell(name, at, width, depth, rise, SLAB, crescent=crescent,
                        thickness=thickness, segments=segments, rings=rings)
    return [plate, lip(name + "_rim", edge, rim_radius)]


def slab_on(node_name, name, x, y, width, depth, rise, lift=0.004, yaw=0.0, level=0.0, **kwargs):
    """A slab laid on the node's surface at (x, y), following its slope.

    ``level`` (0 to 1) blends the surface normal toward straight up, so a
    plate that lands on a sharp edge lies flatter than the edge itself.
    """
    point, normal = surface_hit(node_name, x, y)
    normal = normal.lerp(Vector((0, 0, 1)), level).normalized()
    at = (point.x, point.y, point.z + lift)
    parts = slab(name, at, width, depth, rise, **kwargs)
    orient(parts, Vector(at), normal, yaw)
    return parts, Vector(at), normal


def stud(name, at, normal, width, length, height, tilt_amount=0.0):
    """A raised tan lozenge where the base's marking was, standing on ``normal``."""
    ob = scute(name, at, width, length, height, STUD, tilt=tilt_amount)
    orient([ob], Vector(at), normal)
    return ob


def boss(name, at, radius, token=BONE):
    """A small knobbed bone boss where plates overlap."""
    return bead(name, at, radius, token, scale=(1, 1, 0.72), segments=6, rings=4)


# ===========================================
# Limb armour
# ===========================================


def _between(a, b, t):
    """A point part-way along a straight segment."""
    return tuple(a[k] * (1.0 - t) + b[k] * t for k in range(3))


def cuff(name, a, b, radius, start=0.15, end=0.75, flare=1.18, sides=8, band=0.1):
    """A thick dark slab sleeve round the segment a→b, its far end banded in bone.

    ``radius`` is the sleeve's; the band stands a little proud of it so
    the rim reads at tactical size.
    """
    t0, t1 = start, end
    widths = [radius * 0.96, radius * flare, radius * flare * 0.97, radius * 0.9]
    sweep(name, [_between(a, b, t) for t in (t0, t0 + (t1 - t0) * 0.3, t0 + (t1 - t0) * 0.75, t1)],
          widths, [w * 0.88 for w in widths], token=SLAB, sides=sides)
    r = radius * 0.94 * 1.08
    sweep(f"{name}_band", [_between(a, b, t1 - band * (t1 - t0)), _between(a, b, t1 + 0.01)],
          [r, r], [r * 0.88, r * 0.88], token=BONE, sides=sides)


def frames(points):
    """The (u, v) section axes ``crescent_geometry.sweep`` gives each point of a path.

    ``hooked_blade`` lofts its back with widths along ``v`` and puts the
    cutting edge at ``+v``, so ``-v`` is the blade's back.
    """
    pts = [Vector(p) for p in points]
    axes = []
    for i, point in enumerate(pts):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
        ref = Vector((1, 0, 0)) if abs(tangent.x) < 0.85 else Vector((0, 1, 0))
        u = (ref - tangent * ref.dot(tangent)).normalized()
        axes.append((u, tangent.cross(u).normalized()))
    return axes


def blade_back(name, points, widths, thickness, count, lip_radius, sides=6):
    """A dark slab sleeve over the back half of a ``hooked_blade``, with a bone lip.

    ``points``, ``widths`` and ``thickness`` are the blade's own; the sleeve
    covers its first ``count`` stations and stands thicker than the blade,
    so the back reads as plate while the pale cutting edge stays bare.
    """
    axes = frames(points)[:count]
    centres, backs = [], []
    for p, w, (_, v) in zip(points, widths, axes):
        p = Vector(p)
        centres.append(tuple(p - v * (w * 0.42)))
        backs.append(tuple(p - v * (w * 0.93)))
    cover = [max(w, 0.004) for w in widths[:count]]
    sweep(name, centres, [thickness * 1.9] * count, [w * 0.58 for w in cover],
          token=SLAB, sides=sides)
    sweep(name + "_lip", backs, [lip_radius] * count, token=BONE, sides=4)
