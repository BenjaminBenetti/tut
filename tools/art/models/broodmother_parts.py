"""The Broodmother, the boss egg-layer of Alpha Hunt (#1179, campaign arc §6.8).

Concept: docs/design/concepts/campaign/broodmother.md (and -scarred.md);
modeller's brief: docs/design/kits/campaign-bestiary.md#broodmother. She
shares the brown family's legs, eye clusters, sickles and materials from
bug_parts.py, and owns a silhouette nothing else has: a small armoured front
carried on six long legs, and behind it a huge ribbed egg sac with glowing
eggs, caged by hooked bone spines, ending in a short ovipositor.

```
        side view, front to the left (-Y)

                spines  )  )  )  )  )
         crest  ___   ________________
        (rim) /    \ / hoop hoop hoop \___ ovipositor
   scythe  head thorax      egg sac       =>  socket_clutch
       \_/   /  |  \  \
          leg0 leg1 leg2
```

Six legs (``leg_[lr]0..2``, 0 front, 1 middle, 2 rear) carry ``motion_joint``
origins for UnitMotionRig; with that numbering the rig's phase rule steps
``l0 l2 r1`` against ``l1 r0 r2``, a true tripod. Her two sickles are
``scythe_l`` and ``scythe_r``, folded forward like a guard. The body is two
nodes, ``carapace`` (the thorax) and ``sac`` (the egg sac, its hoops, eggs,
cage spines and ovipositor); neither is named ``flesh_…``, which the rig
would take for an arm. ``socket_clutch`` sits at the ovipositor's tip, where
a clutch is laid.

The scarred nemesis variant is the same build with a wide bone scar across
the crest (a thin green weep along it), two whole cage spines gone on the
left with a snapped stump, and dark regrowth over the left flank.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bug_parts import face, forearm, limb, vents  # noqa: E402
from crescent_geometry import (  # noqa: E402
    bead,
    finish,
    group_new,
    rim,
    scute,
    shell,
    sweep,
)
from bpy_kit import mesh_objects, socket  # noqa: E402

FOOTPRINT = (3, 3)

# ===========================================
# Proportions (Blender units before `finish` normalises the height)
# ===========================================

#: Height to the tallest cage spine, the manifest height.
HEIGHT = 1.75
#: The egg sac: centre and radii across, along and up.
SAC = (0.0, 0.42, 0.72)
SAC_RADII = (0.76, 0.92, 0.6)
#: Where the hoops ring the sac, as fractions of its length (front to back).
HOOPS = (0.16, 0.33, 0.5, 0.67, 0.84)
#: The thorax core, in front of the sac.
THORAX = (0.0, -0.72, 0.6)
#: The head, low under the crest.
HEAD = (0.0, -1.14, 0.5)
#: Leg anchors per index: hip, knee, ankle, foot (x for the right side).
LEGS = (
    (0, 0.108, (0.3, -0.92, 0.52), (0.72, -1.1, 0.78), (0.94, -1.26, 0.3), (1.02, -1.34, 0.015)),
    (1, 0.114, (0.38, -0.6, 0.5), (0.9, -0.6, 0.8), (1.14, -0.52, 0.3), (1.24, -0.48, 0.015)),
    (2, 0.108, (0.42, -0.26, 0.46), (0.94, -0.02, 0.76), (1.12, 0.34, 0.28), (1.16, 0.52, 0.015)),
)
#: The ovipositor's centreline, from the sac's rear to its tip.
OVIPOSITOR = ((0.0, 1.22, 0.62), (0.0, 1.38, 0.52), (0.0, 1.5, 0.4), (0.0, 1.58, 0.3))


# ===========================================
# Helpers
# ===========================================


def _sac_point(t: float, phi: float, lift: float = 1.0) -> tuple[float, float, float]:
    """A point on the sac's surface: `t` 0..1 front to back, `phi` 0 at the crown."""
    x, y, z = SAC
    rx, ry, rz = SAC_RADII
    theta = 0.12 + t * (math.pi - 0.24)
    ring = math.sin(theta)
    return (
        x + math.sin(phi) * rx * ring * lift,
        y - math.cos(theta) * ry,
        z + math.cos(phi) * rz * ring * lift,
    )


def _spine(name: str, t: float, phi: float, reach: float, hook: float) -> None:
    """A hooked pale horn spine rising off the sac and curling back over it."""
    root = _sac_point(t, phi, 0.97)
    x, y, z = root
    lean = math.sin(phi)
    points = [
        root,
        (x + lean * reach * 0.2, y - reach * 0.08, z + reach * 0.5),
        (x + lean * reach * 0.3, y + reach * 0.22 * hook, z + reach * 0.9),
        (x + lean * reach * 0.3, y + reach * 0.62 * hook, z + reach * 0.98),
        (x + lean * reach * 0.24, y + reach * 0.9 * hook, z + reach * 0.84),
    ]
    sweep(name, points, [0.062, 0.045, 0.03, 0.016, 0.002], token="bug-bone", sides=6)


# ===========================================
# Parts
# ===========================================


def thorax(scarred: bool) -> None:
    """The armoured front: dark core, chestnut plates, tan chevrons and gills."""
    before = set(mesh_objects())
    bead("thorax_core", THORAX, 0.36, "bug-chitin-black", scale=(1.08, 1.2, 0.72),
         segments=18, rings=10)
    bead("thorax_belly", (0.0, -0.68, 0.42), 0.3, "bug-chitin-dark", scale=(1.15, 1.35, 0.5),
         segments=16, rings=8)
    _, edge = shell("thorax_shell", (0.0, -0.7, 0.72), 0.44, 0.44, 0.22, "bug-chitin-mid",
                    thickness=0.02, segments=28, rings=5)
    rim("thorax_rim", edge, 0.012)
    for i, (y, z, w) in enumerate([(-0.92, 0.9, 0.14), (-0.74, 0.95, 0.18), (-0.54, 0.92, 0.15)]):
        scute(f"thorax_chevron{i}", (0.0, y, z), w, 0.18, 0.03, tilt=0.2 - i * 0.14)
    for side in (-1, 1):
        # Chestnut flank plates over the leg roots.
        bead(f"flank_plate{side}", (side * 0.4, -0.66, 0.62), 0.12, "bug-chitin-mid",
             scale=(0.7, 2.2, 0.8), segments=12, rings=7)
        vents(f"gill{side}", (side * 0.34, -0.9, 0.8), 0.026, side, "bug-bio-green")
        # A short horn off each shoulder, the front of the protective cage.
        sweep(f"shoulder_horn{side}", [(side * 0.3, -0.84, 0.86), (side * 0.42, -0.8, 1.1),
                                       (side * 0.46, -0.64, 1.26), (side * 0.42, -0.52, 1.3)],
              [0.06, 0.042, 0.022, 0.002], token="bug-bone", sides=6)
    if scarred:
        # Dark umber regrowth patching two cracked plates on the left flank.
        for i, (y, z, r) in enumerate([(-0.8, 0.68, 0.13), (-0.55, 0.6, 0.11), (-0.68, 0.84, 0.09)]):
            bead(f"regrowth{i}", (-0.47, y, z), r, "bug-chitin-black", scale=(0.75, 1.3, 1.0),
                 segments=10, rings=6)
    group_new(before, "carapace")


def head(scarred: bool) -> None:
    """The low head under a crest-shaped shield with a tan rim."""
    before = set(mesh_objects())
    sweep("neck", [(0.0, -0.9, 0.56), (0.0, -1.02, 0.52), HEAD], [0.16, 0.17, 0.16],
          [0.11, 0.12, 0.1], token="bug-chitin-black", sides=10)
    face(HEAD, 0.19)
    _, edge = shell("crest", (0.0, -1.04, 0.72), 0.46, 0.34, 0.2, "bug-chitin-mid",
                    crescent=0.6, thickness=0.026, segments=32, rings=5)
    rim("crest_rim", edge, 0.02)
    scute("crest_keel", (0.0, -1.06, 0.9), 0.12, 0.4, 0.05, tilt=0.18)
    if scarred:
        # A wide bone-pale scar gouged diagonally across the crest's left,
        # with a thin green weep along it: exaggerated to read at 64 px.
        scar = [(-0.42, -1.2, 0.77), (-0.29, -1.1, 0.875), (-0.15, -0.98, 0.935), (0.02, -0.87, 0.92)]
        sweep("scar", scar, [0.03, 0.075, 0.075, 0.03], [0.025, 0.035, 0.035, 0.02],
              token="bug-bone", sides=8)
        sweep("scar_weep", [(p[0], p[1] - 0.012, p[2] + 0.034) for p in scar[1:3]],
              [0.008, 0.008], token="bug-bio-green", sides=5)
    group_new(before, "head")


def egg_sac(scarred: bool) -> None:
    """The swollen sac: russet membrane, tan hoops, magenta eggs, bone cage."""
    before = set(mesh_objects())
    bead("sac_membrane", SAC, 1.0, "bug-flesh", scale=SAC_RADII, segments=30, rings=18)
    rx, ry, rz = SAC_RADII
    # Lighter swells between the hoops read as the sac's segments.
    for i in range(len(HOOPS) - 1):
        t = (HOOPS[i] + HOOPS[i + 1]) / 2
        x, y, z = _sac_point(t, 0.0)
        theta = 0.12 + t * (math.pi - 0.24)
        ring = math.sin(theta)
        bead(f"sac_swell{i}", (SAC[0], y, SAC[2]), 1.0, "bug-flesh-light",
             scale=(rx * ring * 1.03, 0.13, rz * ring * 1.03), segments=16, rings=8)
    # Hoops arch from belly to belly over the crown.
    for i, t in enumerate(HOOPS):
        points = [_sac_point(t, -2.25 + 4.5 * k / 12, 1.05) for k in range(13)]
        sweep(f"sac_hoop{i}", points, [0.026] * 13, [0.04] * 13, token="bug-chitin-tan", sides=8)
    # Eggs glow through the membrane in rows between the hoops: small and
    # bright, never a wash.
    for i in range(len(HOOPS) - 1):
        t = (HOOPS[i] + HOOPS[i + 1]) / 2
        for j, phi in enumerate((-1.7, -1.1, -0.45, 0.45, 1.1, 1.7)):
            bead(f"sac_egg{i}_{j}", _sac_point(t + (0.03 if j % 2 else -0.03), phi, 1.0),
                 0.052, "bug-bio-magenta", scale=(1, 1.6, 1), segments=7, rings=5)
    # The cage: pairs of hooked horn spines off the crown, tallest mid-sac.
    for i, t in enumerate(HOOPS):
        reach = 0.28 + 0.12 * math.sin(math.pi * t)
        for side in (-1, 1):
            # The nemesis lost two whole spines on her left (-X), one
            # snapped to a stump: the silhouette itself changes.
            if scarred and side < 0 and i in (1, 2):
                if i == 1:
                    root = _sac_point(t, side * 0.42, 0.97)
                    sweep("sac_spine_stump", [root, (root[0] - 0.02, root[1] + 0.01, root[2] + 0.1)],
                          [0.05, 0.028], token="bug-bone", sides=5)
                continue
            _spine(f"sac_spine{i}_{side}", t, side * 0.42, reach, 1.0)
    # A short ribbed ovipositor with a tail spike at the rear tip.
    sweep("sac_ovipositor", list(OVIPOSITOR), [0.17, 0.13, 0.09, 0.045],
          [0.14, 0.11, 0.08, 0.04], token="bug-chitin-black", sides=10)
    for k, (t, r) in enumerate(((0.3, 0.15), (0.6, 0.115))):
        a, b = OVIPOSITOR[1], OVIPOSITOR[2]
        at = tuple(a[n] * (1 - t) + b[n] * t for n in range(3))
        bead(f"sac_ovipositor_ring{k}", at, r, "bug-chitin-tan", scale=(1, 0.4, 0.9),
             segments=12, rings=6)
    tip = OVIPOSITOR[-1]
    sweep("sac_tail_spike", [(tip[0], tip[1] - 0.04, tip[2] + 0.04), (0.0, 1.62, 0.44),
                             (0.0, 1.66, 0.56)], [0.035, 0.02, 0.002], token="bug-bone", sides=6)
    group_new(before, "sac")


def legs() -> None:
    """Six long walking legs, splayed wide to carry the sac."""
    for side in (-1, 1):
        label = "l" if side < 0 else "r"
        for index, radius, *anchors in LEGS:
            limb(f"leg_{label}{index}", [(side * x, y, z) for x, y, z in anchors], radius)


def scythes() -> None:
    """Two long sickles folded forward in front of her face, like a guard."""
    for side in (-1, 1):
        label = "l" if side < 0 else "r"
        wrist = (side * 0.36, -1.42, 0.56)
        forearm(f"scythe_{label}", (side * 0.26, -0.98, 0.64), (side * 0.48, -1.26, 0.86), wrist,
                [wrist, (side * 0.32, -1.52, 0.4), (side * 0.22, -1.54, 0.24),
                 (side * 0.1, -1.47, 0.12)], [0.05, 0.08, 0.06, 0.002], 0.066)


# ===========================================
# Build
# ===========================================


def build_broodmother(scarred: bool = False) -> None:
    """Build the Broodmother standing on the ground, front toward -Y."""
    thorax(scarred)
    egg_sac(scarred)
    head(scarred)
    legs()
    scythes()
    tip = OVIPOSITOR[-1]
    socket("clutch", (tip[0], tip[1] + 0.03, tip[2] - 0.04))
    finish(HEIGHT, 2.9, 2.95)
