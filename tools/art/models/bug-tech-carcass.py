"""Bug: tech carcass, a dead bug split open over a cluster of glowing tech nodules.

    blender -b --python tools/art/make_model.py -- --script tools/art/models/bug-tech-carcass.py \
        --id bug.tech-carcass --category bugs --file bug-tech-carcass.glb --quality final

A lurker-scale corpse on its belly, head slumped to the ground, legs splayed
flat with one rear leg curled in the air. The two carapace halves have peeled
apart along the dorsal seam like opened wing cases, exposing a dark cavity
full of faceted ``tdf-visor`` crystals (the tech points the player harvests,
#1171). Eyes use the non-emissive ``bug-bio-green-dim`` so nothing on the bug
itself glows: the only light is the cyan cluster.

    z
    ^      cyan shards
    |        /|\\
    |   tan  /|||\\  tan        <- lifted shell halves, lips flank the seam
    |  ,--/ ' ' ' \\--.
    |_/ russet body    \\_  head        legs splay flat, toes on z = 0
    +-------------------------> -y (front)

Coordinates are Blender world space, Z up, front facing -Y; ``finish``
normalises the corpse to 0.8 u tall inside a 1×1 tile.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from crescent_geometry import bead, finish, group_new, hooked_blade, rim, scute, shell, sweep  # noqa: E402
from bpy_kit import cut_below, cylinder, mesh_objects  # noqa: E402

FOOTPRINT = (1, 1)

#: Cool emissive accent for the harvestable nodules (style guide §4.1).
TECH_TOKEN = "tdf-visor"

# ===========================================
# Anatomy
# ===========================================


def dead_leg(name, points, radius, grounded=True):
    """A slack articulated leg: tapered segments under flared chitin cuffs.

    Cheaper than ``bug_parts.limb`` (about 190 triangles; the cuff flare hides
    the joint, so no knee bead) so six limbs fit a prop-scale budget.
    ``grounded`` adds two pale toes that touch z = 0.
    """
    before = set(mesh_objects())
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        mid = tuple(a[k] * 0.55 + b[k] * 0.45 for k in range(3))
        r = radius * (1 - i * 0.22)
        sweep(f"{name}_segment{i}", [a, mid, b], [r * 0.62, r * 0.60, r * 0.36],
              token="bug-chitin-dark" if i % 2 == 0 else "bug-chitin-black", sides=6)
        cuff = [tuple(a[k] * (1 - t) + b[k] * t for k in range(3)) for t in (0.12, 0.26, 0.52, 0.72)]
        sweep(f"{name}_cuff{i}", cuff, [r * 0.88, r * 1.16, r * 1.0, r * 0.68],
              [r * 0.80, r * 1.0, r * 0.90, r * 0.60], token="bug-chitin-mid", sides=6)
    if grounded:
        p = points[-1]
        for side in (-1, 1):
            sweep(f"{name}_toe{side}", [p, (p[0] + side * radius * 0.35, p[1] - radius * 0.8, 0.004)],
                  [radius * 0.24, 0.002], token="bug-bone", sides=6)
    return group_new(before, name)


def dead_head(at, size):
    """A slumped head resting on the ground with dull eyes and drooping mandibles."""
    before = set(mesh_objects())
    x, y, z = at
    bead("head_core", at, size, "bug-chitin-black", scale=(1.15, 0.9, 0.62), segments=12, rings=6)
    scute("brow_keel", (x, y - size * 0.1, z + size * 0.5), size * 0.8, size * 1.3, size * 0.2, tilt=-0.15)
    for side in (-1, 1):
        bead(f"eye{side}", (x + side * size * 0.86, y - size * 0.6, z + size * 0.08), size * 0.22,
             "bug-bio-green-dim", scale=(1, 0.7, 1), segments=8, rings=5)
        hooked_blade(f"mandible{side}",
                     [(x + side * size * 0.45, y - size * 0.5, z - size * 0.2),
                      (x + side * size * 0.7, y - size * 1.0, z - size * 0.45),
                      (x + side * size * 0.25, y - size * 1.35, z - size * 0.55)],
                     [size * 0.2, size * 0.13, 0.001], size * 0.12, size * 0.05)
    return group_new(before, "head")


def carapace_half(side):
    """One lifted wing-case half, built flat at the origin then rolled outwards.

    Its tan lip and lozenges follow the family's dorsal markings; rolling the
    inner edge up opens the seam and makes the split read as a break, not a
    live posture.
    """
    before = set(mesh_objects())
    _, edge = shell(f"shell{side}", (0, 0, 0), 0.19, 0.33, 0.10, "bug-chitin-dark",
                    thickness=0.018, segments=18, rings=4)
    rim(f"shell_lip{side}", edge, 0.009)
    for i, (y, w) in enumerate(((-0.17, 0.11), (-0.02, 0.13), (0.14, 0.10))):
        z = 0.10 * (1 - (abs(y) / 0.33) ** 1.7) ** 0.78
        scute(f"shell_mark{side}_{i}", (side * 0.03, y, z - 0.004), w, 0.13, 0.02, tilt=-0.08 * y / 0.17)
    half = group_new(before, f"carapace{side}")
    half.location = (side * 0.205, -0.03, 0.20)
    half.rotation_euler = (0.06, side * 0.36, side * 0.05)
    return half


def tech_shard(name, base, length, radius, tilt_x, tilt_y):
    """A six-sided faceted crystal rising from ``base`` along a tilted axis."""
    axis = (math.cos(tilt_x) * math.sin(tilt_y), -math.sin(tilt_x), math.cos(tilt_x) * math.cos(tilt_y))
    at = tuple(base[k] + axis[k] * length * 0.5 for k in range(3))
    cylinder(name, radius * 0.28, radius, length, 6, at, TECH_TOKEN, rot=(tilt_x, tilt_y, 0.0))


def tech_cluster(centre):
    """The harvestable payload: a dark cavity packed with cyan crystal shards and nodules."""
    before = set(mesh_objects())
    x, y, z = centre
    bead("cavity", (x, y, z), 0.13, "bug-chitin-black", scale=(0.95, 2.3, 0.55), segments=12, rings=6)
    shards = [
        # (dx, dy, length, radius, tilt_x, tilt_y)
        (0.00, -0.02, 0.46, 0.070, 0.10, -0.08),
        (-0.05, 0.08, 0.36, 0.060, -0.35, -0.30),
        (0.05, -0.12, 0.34, 0.055, 0.40, 0.28),
        (0.06, 0.14, 0.27, 0.050, -0.45, 0.42),
        (-0.06, -0.14, 0.28, 0.050, 0.55, -0.40),
        (-0.02, 0.21, 0.20, 0.042, -0.65, -0.15),
        (0.03, -0.23, 0.21, 0.042, 0.62, 0.20),
        (-0.08, 0.00, 0.18, 0.040, 0.05, -0.70),
        (0.08, 0.03, 0.17, 0.040, -0.10, 0.72),
    ]
    for i, (dx, dy, length, radius, tx, ty) in enumerate(shards):
        tech_shard(f"shard{i}", (x + dx, y + dy, z + 0.02), length, radius, tx, ty)
    for i, (dx, dy) in enumerate(((-0.05, -0.08), (0.06, 0.07), (0.0, 0.17), (-0.04, 0.26), (0.03, -0.28))):
        bead(f"nodule{i}", (x + dx, y + dy, z + 0.05), 0.04, TECH_TOKEN, scale=(1, 1, 0.75), segments=8, rings=4)
    return group_new(before, "tech_cluster")


# ===========================================
# Model
# ===========================================


def build() -> None:
    """The carcass: body, split carapace, tech payload, slumped head and slack limbs."""
    body_start = set(mesh_objects())
    body = bead("thorax", (0, -0.04, 0.12), 0.21, "bug-flesh", scale=(1.0, 1.4, 0.62), segments=14, rings=8)
    cut_below(body)
    bead("thorax_plates", (0, -0.04, 0.10), 0.21, "bug-chitin-mid", scale=(1.06, 1.3, 0.5), segments=14, rings=7)
    # Slumped abdomen: three overlapping tergites flattening towards the tail.
    for i, (y, w, rise) in enumerate(((0.24, 0.19, 0.10), (0.34, 0.16, 0.08), (0.43, 0.12, 0.06))):
        shell(f"tergite{i}", (0.02 * i, y, rise * 0.15), w, 0.12, rise,
              "bug-chitin-mid" if i % 2 == 0 else "bug-chitin-dark", thickness=0.012, segments=12, rings=3)
        scute(f"tail_mark{i}", (0.02 * i, y + 0.01, rise * 1.1), w * 0.45, 0.07, 0.012)
    bead("tail_core", (0.02, 0.33, 0.05), 0.12, "bug-chitin-black", scale=(0.9, 1.8, 0.4), segments=10, rings=5)
    group_new(body_start, "body")

    tech_cluster((0, -0.03, 0.24))
    for side in (-1, 1):
        carapace_half(side)

    dead_head((0, -0.38, 0.07), 0.095)

    for side in (-1, 1):
        label = "l" if side < 0 else "r"
        dead_leg(f"leg_{label}0", [(side * 0.16, -0.17, 0.10), (side * 0.36, -0.24, 0.17),
                                   (side * 0.46, -0.33, 0.02)], 0.036)
        dead_leg(f"blade_{label}", [(side * 0.12, -0.28, 0.13), (side * 0.29, -0.42, 0.07),
                                    (side * 0.29, -0.52, 0.03)], 0.038, grounded=False)
        wrist = (side * 0.29, -0.52, 0.03)
        hooked_blade(f"blade_hook_{label}",
                     [wrist, (side * 0.24, -0.58, 0.025), (side * 0.12, -0.61, 0.02)],
                     [0.03, 0.036, 0.001], 0.016, 0.006)
    dead_leg("leg_r1", [(0.16, 0.12, 0.10), (0.37, 0.22, 0.16), (0.46, 0.34, 0.02)], 0.038)
    # One rear leg curled into the air is the dead-insect signature.
    dead_leg("leg_l1", [(-0.16, 0.12, 0.10), (-0.32, 0.20, 0.32), (-0.22, 0.14, 0.40)], 0.038, grounded=False)
    finish(0.8, 1.0, 1.0)
