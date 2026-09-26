"""Bug: bug-swarmer-armoured, the Act III armoured swarmer (#1179).

The shipped swarmer (bug_parts.swarmer_anatomy) under slab armour, per the
campaign bestiary kit: a second hood layer with a pale rim, a three-slab
spine with the lozenges as studs, thickened abdomen plates, and leg and
hook cuffs. Same nodes and pivots as bug.swarmer; run through make_model.py.

    swarmer_anatomy() ─► carapace ◄─ hood, spine slabs, abdomen plates
                         leg_[lr][01] ◄─ cuffs on the upper two segments
                         blade_[lr]   ◄─ upper-arm and hook cuffs
    finish(0.55 u)
"""

import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from armour_parts import SLAB, boss, cuff, into, lip, new_since, slab_on, stud  # noqa: E402
from bug_parts import SWARMER_BOUNDS, swarmer_anatomy  # noqa: E402
from crescent_geometry import finish, shell  # noqa: E402

FOOTPRINT = (1, 1)

#: The kit's height for the variant: the base's 0.5 u plus its plate.
HEIGHT = 0.55

#: Leg radii as swarmer_anatomy authors them: front pair, rear pair.
LEG_RADIUS = {"0": 0.038, "1": 0.042}
#: The blade arm's authored radius.
ARM_RADIUS = 0.035


def build() -> None:
    """Build the swarmer, armour its nodes and stand it at the variant's height."""
    limbs = swarmer_anatomy()
    _hood()
    _abdomen_plates()
    _spine()
    for side in ("l", "r"):
        for pair in ("0", "1"):
            _leg_cuffs(f"leg_{side}{pair}", limbs[f"leg_{side}{pair}"], LEG_RADIUS[pair])
        _blade_cuffs(f"blade_{side}", limbs[f"blade_{side}"])
    _, max_width, max_depth = SWARMER_BOUNDS
    finish(HEIGHT, max_width, max_depth)


# ===========================================
# Carapace
# ===========================================


def _hood() -> None:
    """A second, thick crescent over the mantle, rimmed in bone, knobbed at the brow."""
    before = new_since()
    # Slightly inside the mantle's outline so the base's tan lip still shows
    # under the new rim, and the doubled edge reads as two layers.
    _, edge = shell("hood", (0, -0.088, 0.336), 0.392, 0.298, 0.128, SLAB,
                    crescent=1.0, thickness=0.03, segments=36, rings=5)
    lip("hood_rim", edge, 0.0135)
    for index in (3, 33, 7, 29):
        x, y, z = edge[index]
        boss(f"hood_boss{index}", (x * 0.9, y * 0.9 - 0.009, z + 0.03), 0.017)
    into("carapace", before)


def _spine() -> None:
    """Three overlapping slabs down the back, the base's lozenges set in as studs."""
    before = new_since()
    for index, (y, width, depth, lift) in enumerate([(0.10, 0.085, 0.085, 0.004),
                                                     (-0.01, 0.10, 0.095, 0.010),
                                                     (-0.12, 0.11, 0.10, 0.016)]):
        _, at, normal = slab_on("carapace", f"spine{index}", 0.0, y, width, depth, 0.034,
                                lift=lift, level=0.6, thickness=0.022, segments=12, rings=2,
                                rim_radius=0.0075)
        top = at + normal * 0.028
        stud(f"spine_stud{index}", tuple(top), normal, width * 0.6, depth * 0.95, 0.02)
        # A knob where this slab's tail overlaps the next one back.
        boss(f"spine_boss{index}", tuple(at + normal * 0.012 + Vector((0, depth * 0.78, 0))), 0.011)
    into("carapace", before)


def _abdomen_plates() -> None:
    """Thicker, darker plates over the four rear tergites, each with a bone lip."""
    before = new_since()
    # The tergite layout of bug_parts.abdomen("abdomen", (0, 0.15, 0.28), 5, 0.19, 0.105, 0.082).
    count, width, length, rise = 5, 0.19, 0.105, 0.082
    for i in range(1, count):
        ratio = 1 - i / (count + 1)
        y, z = 0.15 + i * length * 0.52, 0.28 - i * rise * 0.11 + 0.016
        _, edge = shell(f"abdomen_plate{i}", (0, y + 0.006, z), width * ratio * 1.05, length * 0.96,
                        rise * ratio * 0.96, SLAB, thickness=0.024, segments=12, rings=2)
        lip(f"abdomen_plate_rim{i}", edge, 0.008)
    into("carapace", before)


# ===========================================
# Limbs
# ===========================================


def _leg_cuffs(name, points, radius) -> None:
    """Slab cuffs over the leg's upper two segments, with a boss on the knee."""
    before = new_since()
    for i in range(2):
        r = radius * (1 - i * 0.2)
        cuff(f"{name}_armour{i}", points[i], points[i + 1], r * 1.3, start=0.12, end=0.7, sides=6)
    knee = points[1]
    boss(f"{name}_knee_boss", (knee[0], knee[1], knee[2] + radius * 0.95), radius * 0.42)
    into(name, before)


def _blade_cuffs(name, points) -> None:
    """Cuffs on the upper arm and over the hook's root, where the base has a single scute."""
    before = new_since()
    anchor, elbow, wrist, hook = points[0], points[1], points[2], points[3]
    cuff(f"{name}_upper_armour", anchor, elbow, ARM_RADIUS * 1.25, start=0.2, end=0.8, sides=6)
    cuff(f"{name}_hook_armour", wrist, hook, ARM_RADIUS * 0.95, start=-0.05, end=0.55, sides=6)
    boss(f"{name}_elbow_boss", (elbow[0], elbow[1], elbow[2] + ARM_RADIUS * 0.95),
         ARM_RADIUS * 0.4)
    into(name, before)
