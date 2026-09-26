"""Bug: bug-spitter, the first ranged bug (#1179). Run through make_model.py.

The brown family's acid artillery (concept: docs/design/concepts/bug-spitter.md).
It shares the family's legs, eye clusters and materials from bug_parts.py, and
owns a silhouette nothing else has: a bloated, dim-green acid sac caged in
chitin ribs over the back, and a long spout pointing forward from the face.

```
        side view, front to the left (-Y)

               ___ribs___
             /  acid sac  \
   spout ===(head)forebody |
            /  |      |  \ |
          leg0 leg0  leg1 leg1
```

Four legs (``leg_[lr][01]``) carry ``motion_joint`` origins for UnitMotionRig;
there are no blade arms, so a shot plays as the body's recoil, which is the
spit. The spout is part of the ``head`` node.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bug_parts import abdomen, face, limb, vents  # noqa: E402
from crescent_geometry import bead, finish, group_new, rim, scute, shell, sweep  # noqa: E402
from bpy_kit import mesh_objects, socket  # noqa: E402

FOOTPRINT = (1, 1)

# ===========================================
# Proportions (Blender units before `finish` normalises the height)
# ===========================================

#: Centre of the acid sac: behind the forebody and high over the hips.
SAC = (0.0, 0.14, 0.55)
#: Sac radii across, along and up; no wider than the leg stance (concept notes).
SAC_RADII = (0.26, 0.33, 0.27)
#: Where the spout leaves the face and where its lip ends.
SPOUT_ROOT = (0.0, -0.33, 0.37)
SPOUT_TIP = (0.0, -0.62, 0.41)


# ===========================================
# Parts
# ===========================================


def forebody() -> None:
    """The armoured front half: dark core, chestnut dome, tan chevrons, gills."""
    bead("thorax", (0, -0.13, 0.33), 0.17, "bug-chitin-black", scale=(1.05, 1.2, 0.62),
         segments=20, rings=12)
    _, edge = shell("fore_shell", (0, -0.13, 0.37), 0.18, 0.2, 0.15, "bug-chitin-mid",
                    thickness=0.016, segments=36, rings=6)
    rim("fore_rim", edge, 0.008)
    for i, (y, z, w) in enumerate([(-0.25, 0.46, 0.07), (-0.16, 0.515, 0.1), (-0.06, 0.51, 0.085)]):
        scute(f"fore_chevron{i}", (0, y, z), w, 0.1, 0.02, tilt=0.18 - i * 0.12)
    for side in (-1, 1):
        vents(f"gill{side}", (side * 0.16, -0.12, 0.43), 0.018, side, "bug-bio-green")


def acid_sac() -> None:
    """The bloated sac, its bright veins and the cage of ribs holding it."""
    x, y, z = SAC
    rx, ry, rz = SAC_RADII
    bead("acid_sac", SAC, 1.0, "bug-bio-green-dim", scale=SAC_RADII, segments=28, rings=18)
    # Small bright veins lying on the membrane between the ribs: never a wash.
    for side in (-1, 1):
        for j, (a0, a1, lean) in enumerate([(0.5, 1.5, 0.55), (1.1, 2.3, 1.05), (1.7, 2.6, 1.4)]):
            points = []
            for k in range(6):
                theta = a0 + (a1 - a0) * k / 5
                phi = side * (lean + 0.05 * math.sin(k * 1.3 + j))
                points.append((x + math.sin(phi) * math.sin(theta) * rx * 1.005,
                               y - math.cos(theta) * ry * 1.005,
                               z + math.cos(phi) * math.sin(theta) * rz * 1.005))
            sweep(f"sac_vein{side}_{j}", points, [0.004, 0.006, 0.005, 0.006, 0.004, 0.002],
                  token="bug-bio-green", sides=5)
    # Four ribs arch over the sac from one flank to the other.
    for i, t in enumerate((0.22, 0.42, 0.62, 0.82)):
        theta = 0.25 + t * (math.pi - 0.5)
        ring_y = y - math.cos(theta) * ry
        scale = math.sin(theta)
        points = []
        for k in range(11):
            phi = -1.55 + 3.1 * k / 10
            points.append((x + math.sin(phi) * rx * scale * 1.03,
                           ring_y,
                           z + math.cos(phi) * rz * scale * 1.03))
        sweep(f"rib{i}", points, [0.012, 0.02, 0.026, 0.028, 0.03, 0.03, 0.03, 0.028, 0.026, 0.02, 0.012],
              [0.02] * 11, token="bug-chitin-dark", sides=8)
        scute(f"rib_mark{i}", (x, ring_y, z + rz * scale * 1.03 + 0.016), 0.05, 0.07, 0.018)
    # A keel rib runs front to back along the crown, tying the cage to the forebody.
    keel = []
    for k in range(9):
        theta = 0.18 + (math.pi - 0.36) * k / 8
        keel.append((x, y - math.cos(theta) * ry * 1.04, z + math.sin(theta) * rz * 1.04))
    sweep("keel", keel, [0.016, 0.022, 0.024, 0.024, 0.024, 0.024, 0.022, 0.018, 0.012],
          token="bug-chitin-mid", sides=8)
    # A short segmented belly tucks under the sac so it does not hover.
    abdomen("belly", (0, 0.02, 0.36), 4, 0.15, 0.1, 0.06)


def spout_and_face() -> None:
    """The recessed face with its eye clusters and the long acid spout."""
    before = set(mesh_objects())
    face((0, -0.29, 0.35), 0.085)
    mid = tuple(SPOUT_ROOT[k] * 0.5 + SPOUT_TIP[k] * 0.5 for k in range(3))
    sweep("spout", [SPOUT_ROOT, mid, SPOUT_TIP], [0.062, 0.046, 0.042], token="bug-chitin-mid", sides=12)
    for i, t in enumerate((0.25, 0.55)):
        at = tuple(SPOUT_ROOT[k] * (1 - t) + SPOUT_TIP[k] * t for k in range(3))
        bead(f"spout_ring{i}", at, 0.056 - i * 0.007, "bug-chitin-dark", scale=(1, 0.45, 1),
             segments=14, rings=8)
    lip = (SPOUT_TIP[0], SPOUT_TIP[1] - 0.012, SPOUT_TIP[2] + 0.002)
    bead("spout_lip", lip, 0.056, "bug-bone", scale=(1, 0.4, 1), segments=16, rings=8)
    bead("spout_bore", (lip[0], lip[1] - 0.012, lip[2]), 0.032, "bug-chitin-black",
         scale=(1, 0.4, 1), segments=14, rings=8)
    bead("spout_drip", (lip[0], lip[1] - 0.004, lip[2] - 0.055), 0.013, "bug-bio-green",
         scale=(1, 1, 1.5), segments=10, rings=8)
    group_new(before, "head")


def legs() -> None:
    """Four splayed walking legs, front pair reaching forward past the face."""
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        limb(f"leg_{s}0", [(side * 0.12, -0.16, 0.33), (side * 0.3, -0.28, 0.4),
                           (side * 0.38, -0.34, 0.16), (side * 0.42, -0.4, 0.015)], 0.058)
        limb(f"leg_{s}1", [(side * 0.12, 0.08, 0.34), (side * 0.31, 0.2, 0.42),
                           (side * 0.39, 0.3, 0.17), (side * 0.43, 0.38, 0.015)], 0.06)


# ===========================================
# Build
# ===========================================


def build() -> None:
    """Build the spitter standing on the ground, front toward -Y."""
    before = set(mesh_objects())
    forebody()
    acid_sac()
    group_new(before, "carapace")
    spout_and_face()
    legs()
    socket("muzzle", (SPOUT_TIP[0], SPOUT_TIP[1] - 0.03, SPOUT_TIP[2]))
    finish(0.9, 0.98, 1.05)
