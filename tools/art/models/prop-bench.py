"""Ordinary outdoor seating for shared gardens and entrances (#960).

One tile, long axis X, seated users face Blender -Y / glTF +Z.
The 0.90 x 0.36 x 0.45 envelope includes the feet and open back supports.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, join, mesh_objects  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Make a 0.23-high slatted seat, open back and two grounded metal frames."""
    for index, y in enumerate((-0.14, -0.04, 0.06)):
        box(f"seat_slat_{index}", (0.90, 0.08, 0.04), (0, y, 0.21), "env-bark")
    for index, z in enumerate((0.32, 0.425)):
        box(f"back_slat_{index}", (0.90, 0.04, 0.05), (0, 0.16, z), "env-bark")
    for side, x in (("left", -0.37), ("right", 0.37)):
        box(f"{side}_foot", (0.07, 0.33, 0.035), (x, 0, 0.0175), "env-metal")
        box(f"{side}_front_leg", (0.035, 0.035, 0.33), (x, -0.13, 0.165), "env-metal")
        box(f"{side}_back_post", (0.035, 0.035, 0.44), (x, 0.14, 0.22), "env-metal")
        box(f"{side}_seat_bearer", (0.045, 0.31, 0.035), (x, -0.015, 0.18), "env-metal")
        box(f"{side}_armrest", (0.075, 0.33, 0.03), (x, 0, 0.33), "env-bark")
    # One primitive per material, rather than a draw batch per individual slat.
    bench = join(mesh_objects(), "bench")
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = bench
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
