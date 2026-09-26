"""The Spore Platform's core (#1179, campaign arc §6.9): the finale's target.

A giant faceted magenta seed caged in tall chitin ribs that meet in a
crown above it, on a round chitin dais with a tan rim, fleshy root
tubes running from the seed's foot out over the dais. Green veins run
down the seed between the ribs. Follow
docs/design/concepts/campaign/spore-platform-core.png and
docs/design/kits/campaign-bestiary.md#spore-platform.

    side view                     top view, front (-Y) down
          crown ^ socket_hatch          . rib .
        rib (  ___  )  rib            rib  seed  rib
           ( /     \\ )                 .  (  )  .
           ( | seed | )  veins         rib      rib
           (  \\___/  )                    . .
      roots ~~~cradle~~~ roots          front gap: two ribs frame
     =========dais=========              the seed for the camera
     ----------rim----------

Stands on the core stage's 3x3 pad (the `platform-core` hook), drawn at
the spawner's tile as built: about 2.8 u wide and 2.8 u tall.

The glow is bounded (style guide: SwiftShader budget): emissive
materials only, no light attached, since a point light would cost every
lit fragment on the map under software rendering. The seed's magenta
glows at `SEED_GLOW`, well under the kit's default 3.0, so it reads as
magenta rather than blowing out to white on the largest emissive
surface in the game; the veins keep the default.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import bpy_kit  # noqa: E402
from bpy_kit import cylinder, socket, sphere  # noqa: E402
from crescent_geometry import bead, rim, sweep  # noqa: E402

FOOTPRINT = (3, 3)

# ===========================================
# Proportions
# ===========================================

#: The dais: radius at the foot and the top, and its height.
DAIS_FOOT = 1.36
DAIS_TOP = 1.26
DAIS_HEIGHT = 0.14
#: The inner step the seed stands on.
STEP_RADIUS = 0.92
STEP_HEIGHT = 0.1
#: The seed: centre height, horizontal and vertical radius.
SEED_Z = 1.32
SEED_RX = 0.7
SEED_RZ = 0.98
#: Ribs round the seed; the front gap sits between two of them.
RIBS = 7
#: Each rib's (radius, height) from its foot to its tip.
RIB_PATH = (
    (0.98, 0.2),
    (1.08, 0.6),
    (1.1, 1.0),
    (1.02, 1.45),
    (0.86, 1.86),
    (0.6, 2.2),
    (0.34, 2.46),
    (0.14, 2.62),
)
#: How far a rib spirals round the seed from foot to tip, in radians.
RIB_TWIST = 0.28
#: Root tubes from the seed's foot out over the dais.
ROOTS = 8
#: Veins down the seed, between the ribs.
VEINS = 7
#: Emission strength of the seed's magenta (the kit default is 3.0).
SEED_GLOW = 0.7


# ===========================================
# Build
# ===========================================


def build() -> None:
    """The dais, the seed and its veins, the cage of ribs, the crown and the roots."""
    bpy_kit.EMISSIVE_STRENGTH["bug-bio-magenta"] = SEED_GLOW
    build_dais()
    build_seed()
    build_ribs()
    build_roots()
    socket("hatch", (0.0, 0.0, 2.84))


def build_dais() -> None:
    """A round chitin dais with a tan rim and an inner step."""
    cylinder("core_dais", DAIS_TOP, DAIS_FOOT, DAIS_HEIGHT, 16, (0, 0, DAIS_HEIGHT / 2), "bug-chitin-dark")
    outline = [
        (math.cos(a) * (DAIS_TOP + 0.02), math.sin(a) * (DAIS_TOP + 0.02), DAIS_HEIGHT)
        for a in (i * math.tau / 24 for i in range(24))
    ]
    rim("core_dais_rim", outline, 0.04, "bug-chitin-tan")
    cylinder(
        "core_step",
        STEP_RADIUS - 0.06,
        STEP_RADIUS,
        STEP_HEIGHT,
        14,
        (0, 0, DAIS_HEIGHT + STEP_HEIGHT / 2),
        "bug-chitin-mid",
    )


def build_seed() -> None:
    """The faceted seed in a fleshy cradle, veined in green between the ribs."""
    sphere(
        "core_seed",
        1.0,
        (0, 0, SEED_Z),
        "bug-bio-magenta",
        segments=14,
        rings=10,
        scale=(SEED_RX, SEED_RX, SEED_RZ),
    )
    bead(
        "core_cradle",
        (0, 0, DAIS_HEIGHT + STEP_HEIGHT + 0.14),
        0.62,
        "bug-flesh",
        scale=(1, 1, 0.42),
        segments=14,
        rings=6,
    )
    for i in range(VEINS):
        azimuth = (i + 0.5) * math.tau / RIBS + 0.1 * math.sin(i * 2.3)
        points, widths = [], []
        for k in range(9):
            polar = 0.22 * math.pi + k * (0.62 * math.pi) / 8
            theta = azimuth + 0.12 * math.sin(k * 1.4 + i)
            points.append(
                (
                    SEED_RX * 1.015 * math.sin(polar) * math.cos(theta),
                    SEED_RX * 1.015 * math.sin(polar) * math.sin(theta),
                    SEED_Z + SEED_RZ * 1.015 * math.cos(polar),
                )
            )
            widths.append(0.02 if 0 < k < 8 else 0.008)
        sweep(f"core_vein_{i}", points, widths, token="bug-bio-green", sides=4, smooth=False)


def build_ribs() -> None:
    """Tall ribs from the dais that bow round the seed and meet in a crown."""
    # The front (-Y, azimuth -90 degrees) falls between two ribs.
    start = -math.pi / 2 + math.pi / RIBS
    for i in range(RIBS):
        azimuth = start + i * math.tau / RIBS
        points, widths, depths = [], [], []
        last = len(RIB_PATH) - 1
        for k, (radius, height) in enumerate(RIB_PATH):
            theta = azimuth + RIB_TWIST * k / last
            points.append((radius * math.cos(theta), radius * math.sin(theta), height))
            taper = 1 - 0.55 * k / last
            widths.append(0.15 * taper)
            depths.append(0.1 * taper)
        sweep(f"core_rib_{i}", points, widths, depths, token="bug-chitin-mid", sides=6, smooth=False)
        # A tan spur where the rib leaves the dais: tan on the rims only.
        foot = RIB_PATH[0]
        cylinder(
            f"core_rib_spur_{i}",
            0.0,
            0.07,
            0.22,
            5,
            (foot[0] * 1.08 * math.cos(azimuth), foot[0] * 1.08 * math.sin(azimuth), DAIS_HEIGHT + 0.1),
            "bug-chitin-tan",
            rot=(0.0, 0.35, azimuth),
        )
    bead("core_crown", (0, 0, 2.66), 0.18, "bug-chitin-dark", scale=(1, 1, 0.8), segments=10, rings=6)
    for i in range(4):
        a = i * math.tau / 4 + math.pi / 4
        cylinder(
            f"core_crown_spike_{i}",
            0.0,
            0.05,
            0.26,
            5,
            (0.1 * math.cos(a), 0.1 * math.sin(a), 2.78),
            "bug-chitin-tan",
            rot=(0.45 * math.sin(a), -0.45 * math.cos(a), 0.0),
        )


def build_roots() -> None:
    """Fleshy root tubes from the seed's foot, arching out over the dais."""
    for i in range(ROOTS):
        azimuth = (i + 0.3) * math.tau / ROOTS
        reach = 1.3 + 0.06 * math.sin(i * 1.7)
        points, widths = [], []
        for k in range(7):
            t = k / 6
            radius = 0.42 + (reach - 0.42) * t
            height = 0.36 * (1 - t) ** 1.4 + 0.2 * math.sin(math.pi * t) * 0.5 + DAIS_HEIGHT * t
            theta = azimuth + 0.18 * math.sin(math.pi * t)
            points.append((radius * math.cos(theta), radius * math.sin(theta), max(height, 0.1)))
            widths.append(0.09 * (1 - 0.5 * t))
        token = "bug-flesh" if i % 2 == 0 else "bug-flesh-light"
        sweep(f"core_root_{i}", points, widths, token=token, sides=6, smooth=True)
