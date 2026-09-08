"""Wall-mounted use cues for existing building shells (#960).

Blender X runs along the wall, -Y points outdoors, Z is up. Each base pivot
is the wall attachment point; the renderer raises it to the documented mount
height. None of these pieces adds a standing platform or seals a real opening.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import PALETTE, box, join, socket  # noqa: E402


# Flat fabric shares the muted environmental register, without grass/snow texels.
PALETTE.update({"env-awning-green": "#56735F", "env-awning-cream": "#D8D0B8"})

def finish() -> None:
    """Bake one static mesh with a primitive per palette token and a wall locator."""
    objects = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
    mesh = join(objects, "frontage")
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    socket("wall", (0, 0, 0))


def shop_awning() -> None:
    """Three-tile striped fabric awning, mounting at 1.21 u above the floor."""
    # The fabric falls towards the street. The lowest valance stays above heads.
    for i in range(12):
        x = -1.375 + i * 0.25
        token = "env-awning-green" if i % 2 == 0 else "env-awning-cream"
        box(f"fabric_{i}", (0.25, 0.64, 0.045), (x, -0.32, 0.145), token,
            rot=(math.radians(12), 0, 0))
        box(f"valance_{i}", (0.25, 0.045, 0.08), (x, -0.63, 0.04), token)
    box("wall_rail", (3, 0.07, 0.08), (0, -0.035, 0.24), "env-metal")
    for x in (-1.35, 1.35):
        box("bracket", (0.035, 0.60, 0.035), (x, -0.30, 0.10), "env-metal",
            rot=(math.radians(9), 0, 0))
    finish()


def residential_entry() -> None:
    """Small domestic porch roof with a paired entry light, mounted at 1.10 u."""
    box("porch_top", (1.35, 0.42, 0.075), (0, -0.21, 0.22), "env-bark")
    box("porch_fascia", (1.35, 0.055, 0.14), (0, -0.395, 0.17), "env-sidewalk")
    for x in (-0.43, 0.43):
        box("light_back", (0.10, 0.06, 0.16), (x, -0.055, 0.08), "env-metal")
        box("light_lens", (0.065, 0.035, 0.09), (x, -0.10, 0.095), "env-snow")
    finish()


def residential_window() -> None:
    """A shallow Juliet guard and sill planter; no occupiable balcony floor."""
    box("planter", (0.56, 0.20, 0.14), (0, -0.19, 0.07), "env-bark")
    box("soil", (0.49, 0.16, 0.025), (0, -0.19, 0.143), "env-dirt")
    for i in range(3):
        box(f"leaves_{i}", (0.14, 0.15, 0.10), (-0.17 + i * 0.17, -0.19, 0.19), "env-foliage")
    for x in (-0.35, 0.35):
        box("guard_end", (0.032, 0.16, 0.43), (x, -0.09, 0.235), "env-metal")
    for i in range(6):
        box(f"guard_bar_{i}", (0.018, 0.025, 0.33), (-0.30 + i * 0.12, -0.16, 0.265), "env-metal")
    box("guard_top", (0.74, 0.04, 0.035), (0, -0.16, 0.4525), "env-metal")
    finish()


def workplace_entry() -> None:
    """A broad metal portal canopy with suspended strip light, mount 1.12 u."""
    box("canopy", (2.4, 0.54, 0.12), (0, -0.27, 0.19), "env-metal")
    box("dark_fascia", (2.4, 0.045, 0.10), (0, -0.535, 0.18), "env-roof")
    box("light_strip", (1.45, 0.10, 0.04), (0, -0.34, 0.11), "env-snow")
    for x in (-0.90, 0.90):
        box("wall_bracket", (0.07, 0.10, 0.13), (x, -0.05, 0.065), "env-metal")
    finish()


def mailbox_bank() -> None:
    """Shared apartment mailboxes, mounted on a solid entrance-side wall bay."""
    box("cabinet", (0.62, 0.09, 0.46), (0, -0.045, 0.23), "env-metal")
    for row in range(3):
        for column in range(2):
            x = -0.15 + column * 0.30
            z = 0.078 + row * 0.15
            box(f"door_{row}_{column}", (0.275, 0.012, 0.127), (x, -0.097, z), "env-sidewalk")
            box(f"slot_{row}_{column}", (0.19, 0.008, 0.012), (x, -0.107, z + 0.025), "env-roof")
    finish()
