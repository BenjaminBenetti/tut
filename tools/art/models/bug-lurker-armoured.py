"""Bug: bug-lurker-armoured, the Act III armoured lurker (#1179).

The shipped lurker (bug_parts.lurker_anatomy) under slab armour, per the
campaign bestiary kit: a face mask with eye slits, thorax collars, slab
sleeves on the sickle backs and armoured fins. The armour is subtler than
the swarmer's and brute's, so the tall thin mantis silhouette survives.
Same nodes and pivots as bug.lurker; run through make_model.py.

    lurker_anatomy() ─► carapace ◄─ thorax collars, fin plates, tail plates
                        head        ◄─ mask; the eyes glow under its edge
                        leg_[lr][01] ◄─ thigh cuffs
                        scythe_[lr]  ◄─ upper-arm cuff, sleeve on the sickle back
    finish(1.35 u)
"""

import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour_parts import SLAB, BONE, blade_back, boss, cuff, frames, into, lip, new_since  # noqa: E402
from bug_parts import LURKER_BOUNDS, lurker_anatomy  # noqa: E402
from crescent_geometry import finish, shell, sweep  # noqa: E402

FOOTPRINT = (1, 1)

#: The kit's height for the variant: the base's 1.3 u plus its plate.
HEIGHT = 1.35

#: Leg radii as lurker_anatomy authors them: front pair, rear pair.
LEG_RADIUS = {"0": 0.033, "1": 0.036}
#: The sickle arm's authored radius, and its blade's widths from the wrist.
ARM_RADIUS = 0.044
SICKLE_WIDTHS = [0.038, 0.066, 0.077, 0.049, 0.001]


def build() -> None:
    """Build the lurker, armour its nodes and stand it at the variant's height."""
    limbs = lurker_anatomy()
    _thorax_collars()
    _fins()
    _tail_plates()
    _mask()
    for side in ("l", "r"):
        for pair in ("0", "1"):
            _thigh_cuff(f"leg_{side}{pair}", limbs[f"leg_{side}{pair}"], LEG_RADIUS[pair])
        _sickle(f"scythe_{side}", limbs[f"scythe_{side}"])
    _, max_width, max_depth = LURKER_BOUNDS
    finish(HEIGHT, max_width, max_depth)


# ===========================================
# Carapace
# ===========================================


def _thorax_collars() -> None:
    """A dark collar over each thorax ring, a little wider, with a pale lip."""
    before = new_since()
    # The ring layout of lurker_anatomy's thorax_ring{i}.
    for i in range(5):
        z, y = 0.58 + i * 0.085, 0.092 - i * 0.035
        _, edge = shell(f"thorax_collar{i}", (0, y - 0.004, z + 0.008), (0.10 - i * 0.007) * 1.1,
                        0.118, 0.058, SLAB, thickness=0.02, segments=16, rings=2)
        lip(f"thorax_collar_rim{i}", edge, 0.0075)
    into("carapace", before)


def _fins() -> None:
    """A dark plate over each swept shoulder fin, its outer edge rimmed in bone."""
    before = new_since()
    for side in (-1, 1):
        # lurker_anatomy's shoulder_fin{side}, thickened.
        points = [(side * 0.08, -0.065, 0.89), (side * 0.14, 0.035, 1.02), (side * 0.10, 0.17, 1.08)]
        widths = [0.035, 0.047, 0.002]
        sweep(f"fin_plate{side}", points, [w * 1.12 + 0.002 for w in widths],
              [0.018, 0.026, 0.003], token=SLAB, sides=8)
        edge = [tuple(Vector(p) + u * side * (w * 1.1)) for p, w, (u, _) in
                zip(points, widths, frames(points))]
        sweep(f"fin_rim{side}", edge, [0.006, 0.007, 0.002], token=BONE, sides=4)
        boss(f"fin_boss{side}", tuple(Vector(points[0]) + Vector((side * 0.012, 0.02, 0.022))), 0.014)
    into("carapace", before)


def _tail_plates() -> None:
    """Thicker, darker plates over the tail's four rear tergites, each with a bone lip."""
    before = new_since()
    # The tergite layout of bug_parts.abdomen("tail", (0, 0.20, 0.48), 5, 0.13, 0.11, 0.067).
    count, width, length, rise = 5, 0.13, 0.11, 0.067
    for i in range(1, count):
        ratio = 1 - i / (count + 1)
        y, z = 0.20 + i * length * 0.52, 0.48 - i * rise * 0.11 + 0.014
        _, edge = shell(f"tail_plate{i}", (0, y + 0.006, z), width * ratio * 1.06, length * 0.96,
                        rise * ratio * 0.96, SLAB, thickness=0.02, segments=12, rings=2)
        lip(f"tail_plate_rim{i}", edge, 0.007)
    into("carapace", before)


# ===========================================
# Head
# ===========================================


def _mask() -> None:
    """A dark mask over the wedge face; the magenta eyes glow in the slit under its edge.

    The brow keel pokes through the mask's crown, so the base's tan
    marking survives as a raised stud.
    """
    before = new_since()
    stations = [(0, -0.13, 1.10), (0, -0.25, 1.133), (0, -0.40, 1.05)]
    widths = [0.058, 0.155, 0.026]
    sweep("mask", stations, widths, [0.022, 0.027, 0.012], token=SLAB, sides=10)
    for side in (-1, 1):
        edge = [(x + side * w * 0.97, y, z) for (x, y, z), w in zip(stations, widths)]
        sweep(f"mask_rim{side}", edge, [0.005, 0.0065, 0.004], token=BONE, sides=4)
    into("head", before)


# ===========================================
# Limbs
# ===========================================


def _thigh_cuff(name, points, radius) -> None:
    """A slim slab cuff over the leg's upper segment."""
    before = new_since()
    cuff(f"{name}_armour", points[0], points[1], radius * 1.22, start=0.18, end=0.72, sides=6)
    into(name, before)


def _sickle(name, points) -> None:
    """An upper-arm cuff and a slab sleeve down the sickle's back."""
    before = new_since()
    anchor, elbow, blade = points[0], points[1], points[2:]
    cuff(f"{name}_upper_armour", anchor, elbow, ARM_RADIUS * 1.2, start=0.25, end=0.8, sides=6)
    boss(f"{name}_elbow_boss", (elbow[0], elbow[1], elbow[2] + ARM_RADIUS * 0.95), ARM_RADIUS * 0.38)
    blade_back(f"{name}_sleeve", blade, SICKLE_WIDTHS, ARM_RADIUS * 0.42, 4, 0.0075)
    into(name, before)
