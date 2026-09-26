"""Bug: bug-brute-armoured, the Act III armoured brute (#1179).

The shipped brute (brute_parts.brute_anatomy) under slab armour, per the
campaign bestiary kit: a tortoise-shell of slabs over the wing cases, a
ram brow plate, leg cuffs and dark-backed cleavers. Same nodes and pivots
as bug.brute, at its two-tile footprint; run through make_model.py.

    brute_anatomy() ─► carapace ◄─ twelve vault slabs (studs on the ridge row)
                       head        ◄─ ram brow plate
                       leg_[lr]0..2 ◄─ thigh and shin cuffs
                       cleaver_[lr] ◄─ upper-arm cuff, dark back on the blade
    finish(1.0 u)

The slabs follow the wing cases' own surface (`_vault_point`), so they sit
on the dome at every yaw instead of floating over it.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour_parts import SLAB, STUD, BONE, blade_back, boss, cuff, into, lip, new_since  # noqa: E402
from brute_parts import BRUTE_BOUNDS, _closed_grid, _vault_point, brute_anatomy  # noqa: E402
from crescent_geometry import finish, scute, sweep  # noqa: E402

FOOTPRINT = (2, 2)

#: The kit's height for the variant: the base's 0.9 u plus its shell.
HEIGHT = 1.0

#: Leg radii as brute_anatomy authors them, by node index.
LEG_RADIUS = {0: 0.058, 1: 0.058, 2: 0.060}
#: The cleaver arm's authored radius, and its blade's widths from the wrist.
ARM_RADIUS = 0.092
CLEAVER_WIDTHS = [0.067, 0.105, 0.086, 0.008]

#: The tortoise shell: each slab's centre along the vault (t) and round it
#: (angle from the ridge), for both wing cases. The ridge row carries studs.
#: Neighbouring slabs overlap but never share a border exactly: coincident
#: border vertices would fuse two closed slabs into one non-manifold mesh.
SLAB_ROWS = (0.2, 0.47, 0.74)
SLAB_COLUMNS = (0.4, 1.05)
#: Half the slab's length along t and its half-width in angle.
SLAB_HALF = (0.14, 0.33)


def build() -> None:
    """Build the brute, armour its nodes and stand it at the variant's height."""
    limbs = brute_anatomy()
    _shell()
    _brow()
    for side in ("l", "r"):
        for index in (0, 1, 2):
            name = f"leg_{side}{index}"
            _leg_cuffs(name, limbs[name], LEG_RADIUS[index])
        _cleaver(f"cleaver_{side}", limbs[f"cleaver_{side}"])
    _, max_width, max_depth = BRUTE_BOUNDS
    finish(HEIGHT, max_width, max_depth)


# ===========================================
# Carapace
# ===========================================


def _vault_slab(name, side, t_centre, angle_centre, stud_on_top):
    """One domed hexagonal slab on the wing case, rimmed in bone.

    Rows narrow at both ends of the slab, which gives the six-sided
    outline of a tortoise scute; the upper surface bulges in the middle.
    """
    rows, cols = 4, 3
    half_t, half_angle = SLAB_HALF
    shoulders = (0.62, 1.0, 1.0, 0.62)
    upper, lower = [], []
    for i in range(rows):
        u = i / (rows - 1)
        t = t_centre + (2.0 * u - 1.0) * half_t
        for j in range(cols):
            v = j / (cols - 1)
            angle = max(0.035, angle_centre + (2.0 * v - 1.0) * half_angle * shoulders[i])
            relief = 0.016 + 0.024 * math.sin(math.pi * (0.2 + 0.6 * u)) * math.sin(math.pi * (0.2 + 0.6 * v))
            upper.append(_vault_point(side, t, angle, relief))
            lower.append(_vault_point(side, t, angle, -0.004))
    _closed_grid(name, upper, lower, rows, cols, side, SLAB)
    border = [upper[j] for j in range(cols)]
    border += [upper[i * cols + cols - 1] for i in range(1, rows)]
    border += [upper[(rows - 1) * cols + j] for j in range(cols - 2, -1, -1)]
    border += [upper[i * cols] for i in range(rows - 2, 0, -1)]
    lip(name + "_rim", border, 0.011)
    top = _vault_point(side, t_centre, angle_centre, 0.04)
    if stud_on_top:
        # The base's tan back markings, kept as raised studs on the ridge row.
        scute(name + "_stud", top, 0.07, 0.085, 0.03, STUD)
    else:
        boss(name + "_boss", top, 0.022)


def _shell() -> None:
    """Twelve slabs over the two wing cases: a ridge row and a flank row per side."""
    before = new_since()
    for side in (-1, 1):
        for row, t in enumerate(SLAB_ROWS):
            for column, angle in enumerate(SLAB_COLUMNS):
                _vault_slab(f"vault_slab_{side}_{row}_{column}", side, t, angle, column == 0)
    into("carapace", before)


# ===========================================
# Head
# ===========================================


def _brow() -> None:
    """A dark ram plate over the battering brow, rimmed in bone, a boss on its crown."""
    before = new_since()
    # Over brute_anatomy's battering_brow, a little proud of it.
    stations = [(0.0, -0.44, 0.44), (0.0, -0.561, 0.482), (0.0, -0.69, 0.446)]
    widths = [0.19, 0.236, 0.168]
    sweep("brow_plate", stations, widths, [0.046, 0.044, 0.022], token=SLAB, sides=12)
    for side in (-1, 1):
        edge = [(x + side * w * 0.97, y, z) for (x, y, z), w in zip(stations, widths)]
        sweep(f"brow_rim{side}", edge, [0.009, 0.011, 0.009], token=BONE, sides=4)
    front = [(x, -0.69 - 0.02 * math.cos(x / 0.168 * math.pi / 2), 0.448)
             for x in (-0.15, -0.075, 0.0, 0.075, 0.15)]
    sweep("brow_rim_front", front, [0.011] * len(front), token=BONE, sides=4)
    boss("brow_boss", (0.0, -0.575, 0.52), 0.03)
    into("head", before)


# ===========================================
# Limbs
# ===========================================


def _leg_cuffs(name, points, radius) -> None:
    """Slab cuffs over the rising thigh and the upper shin; the base's knee cap stays."""
    before = new_since()
    _, outlet, knee, ankle, _ = points
    cuff(f"{name}_thigh_armour", outlet, knee, radius * 1.3, start=0.18, end=0.78, sides=6)
    cuff(f"{name}_shin_armour", knee, ankle, radius * 1.02, start=0.12, end=0.5, sides=6)
    into(name, before)


def _cleaver(name, points) -> None:
    """An upper-arm cuff and a dark slab back down the cleaver, edge left pale."""
    before = new_since()
    anchor, elbow, blade = points[0], points[1], points[2:]
    cuff(f"{name}_upper_armour", anchor, elbow, ARM_RADIUS * 1.12, start=0.3, end=0.85, sides=6)
    blade_back(f"{name}_back", blade, CLEAVER_WIDTHS, ARM_RADIUS * 0.42, 3, 0.011)
    into(name, before)
