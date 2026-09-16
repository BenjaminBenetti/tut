"""Shared helpers for the strategic-map deployable buildings (#1153).

Animation contract shared by the three ``overworld-deployable-*`` models:

    base (origin at the footprint centre, y = 0)
    └── animated (one child mesh node; origin on its own axis of motion)

The strategic map rotates the ``animated`` node at runtime, so its origin
must sit on the vertical axis it yaws about (``rotation.y`` in three.js).
``finish_animated`` moves the origin there and parents the part to the base;
the moving parts are never passed to ``join`` with the static ones.

    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ battery  │     │dispersal │     │  sensor  │
    │ ╔══╗ ●   │     │  ▄▄  ╥   │     │  ┌──┐ ◑  │
    │ ╚══╝     │     │ (##) ║   │     │  │  │ │  │
    └──────────┘     └──────────┘     └──────────┘
      0.45 × 0.45 u footprint, base on z = 0, height ≤ 0.3 u
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder, join  # noqa: E402

# ===========================================
# Constants
# ===========================================

FOOTPRINT = (0.45, 0.45)
"""Footprint in tiles shared by every deployable (issue #1153)."""

ANIMATED_NODE = "animated"
"""Exact node name the strategic map looks up to rotate the moving part."""

FRONT = (math.pi / 2, 0.0, 0.0)
"""Rotation that points a cylinder's local +Z along Blender -Y (the front)."""


# ===========================================
# Static parts
# ===========================================


def foundation(size: float, height: float = 0.03) -> bpy.types.Object:
    """Dark square slab on z = 0 that anchors the installation to the map."""
    return box("foundation", (size, size, height), (0.0, 0.0, height / 2), "tdf-grey-dark")


def marking(name: str, size: tuple[float, float, float], at: tuple[float, float, float]) -> bpy.types.Object:
    """Small orange panel proud of a surface (style guide §4.1: orange is a marker)."""
    return box(name, size, at, "tdf-orange")


def lens(name: str, size: tuple[float, float, float], at: tuple[float, float, float]) -> bpy.types.Object:
    """Pale blue optic or status light."""
    return box(name, size, at, "tdf-visor")


def horizontal_cylinder(
    name: str,
    radius_tip: float,
    radius_root: float,
    length: float,
    segments: int,
    at: tuple[float, float, float],
    token: str,
) -> bpy.types.Object:
    """Cylinder or cone lying along -Y, centred at ``at``; ``radius_tip`` is the front end."""
    return cylinder(name, radius_tip, radius_root, length, segments, at, token, rot=FRONT)


# ===========================================
# Assembly
# ===========================================


def _set_origin(ob: bpy.types.Object, at: tuple[float, float, float]) -> None:
    """Move an object's origin to a world point without moving its geometry."""
    bpy.context.scene.cursor.location = at
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")


def finish_base(parts: list[bpy.types.Object]) -> bpy.types.Object:
    """Join the static parts into one ``base`` object pivoting at the footprint centre."""
    base = join(parts, "base")
    _set_origin(base, (0.0, 0.0, 0.0))
    return base


def finish_animated(
    parts: list[bpy.types.Object], axis_origin: tuple[float, float, float], base: bpy.types.Object
) -> bpy.types.Object:
    """Join the moving parts into the ``animated`` child of ``base``.

    ``axis_origin`` is the world point on the part's vertical axis of motion;
    it becomes the glTF node's translation, so rotating the node about its
    local up axis yaws the part in place.
    """
    animated = join(parts, ANIMATED_NODE)
    _set_origin(animated, axis_origin)
    animated.parent = base
    animated.matrix_parent_inverse = base.matrix_world.inverted()
    bpy.context.view_layer.update()
    return animated
