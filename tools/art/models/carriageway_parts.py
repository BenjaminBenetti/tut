"""Carriageway modules, #840: centred 1 x 1 x .05 slab with optional details.

The slab uses the existing road tile pivot, at its centre. A kerb or painted
dash follows +Z in glTF (Blender -Y); the run is along X. The scene borrows
the selected road surface, suppresses paint/kerbs on trails, and combines
the named parts without stacking duplicate slabs.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box

SLAB_THICKNESS = 0.05
KERB_WIDTH = 0.08
KERB_RISE = 0.06
DASH_WIDTH = 0.05
DASH_LENGTH = 0.6
DASH_RISE = 0.003


def build_carriageway(kind: str) -> None:
    """Build one material-neutral road module with the existing slab pivot."""
    slab = box("road_surface", (1, 1, SLAB_THICKNESS), (0, 0, 0), "env-asphalt")
    # Normalised planar UVs let the consumer substitute any ground atlas cell.
    uv = slab.data.uv_layers.active.data
    for polygon in slab.data.polygons:
        for loop in polygon.loop_indices:
            vertex = slab.data.vertices[slab.data.loops[loop].vertex_index].co
            uv[loop].uv = (vertex.x + 0.5, 0.5 - vertex.y)
    if kind in ("kerb", "corner"):
        box(
            "road_kerb",
            (1, KERB_WIDTH, KERB_RISE),
            (0, -0.5 + KERB_WIDTH / 2, SLAB_THICKNESS / 2 + KERB_RISE / 2),
            "env-sidewalk",
        )
    if kind == "corner":
        # Butt onto the first strip: no overlapping coplanar faces at the turn.
        box(
            "road_kerb_return",
            (KERB_WIDTH, 1 - KERB_WIDTH, KERB_RISE),
            (0.5 - KERB_WIDTH / 2, KERB_WIDTH / 2, SLAB_THICKNESS / 2 + KERB_RISE / 2),
            "env-sidewalk",
        )
    if kind == "centre":
        box(
            "road_centre_line",
            (DASH_LENGTH, DASH_WIDTH, DASH_RISE),
            (0, -0.5 + DASH_WIDTH / 2, SLAB_THICKNESS / 2 + DASH_RISE / 2),
            "env-sidewalk",
        )
