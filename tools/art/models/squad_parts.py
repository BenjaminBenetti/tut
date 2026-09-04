"""Infantry squad builders: five 0.9 u figures on one base disc, one per kit
(rifle, rocket, sniper, engineer, medic). Style guide §3 squad token, §4.1 palette,
``docs/design/concepts/infantry-squad.png``: big helmets, cyan visors, olive
uniform with grey chest plate, orange shoulder patch. The left-flank figure
carries the squad's special kit; the front-centre figure is the leader.

        z
        │  helmet (visor -Y)
        │  chest plate      arms hold the weapon forward (-Y)
        │  legs
        └── base disc, Ø 0.85, 0.05 thick, figures stand on it
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cylinder  # noqa: E402

# Figure positions (x, y) in a loose wedge; leader front-centre (front is -Y).
SLOTS = [(0.0, -0.28), (-0.24, -0.05), (0.24, -0.05), (-0.13, 0.2), (0.13, 0.2)]
BASE_TOP = 0.05


def figure(prefix: str, at: tuple[float, float], kit: str, kneel: bool = False) -> None:
    """One soldier at ``at`` on the base, facing -Y. ``kneel`` lowers the front rank."""
    x, y = at
    z0 = BASE_TOP
    leg_h = 0.26 if kneel else 0.4
    # legs (kneeling: shorter block plus a forward knee)
    box(f"{prefix}_legs", (0.18, 0.14, leg_h), (x, y, z0 + leg_h / 2), "tdf-olive-dark")
    if kneel:
        box(f"{prefix}_knee", (0.09, 0.22, 0.08), (x + 0.05, y - 0.1, z0 + 0.04), "tdf-olive-dark")
    z = z0 + leg_h
    box(f"{prefix}_torso", (0.26, 0.18, 0.34), (x, y, z + 0.17), "tdf-olive")
    bevel(box(f"{prefix}_plate", (0.28, 0.06, 0.2), (x, y - 0.11, z + 0.2), "tdf-grey-mid"), 0.012)
    box(f"{prefix}_patch", (0.06, 0.02, 0.05), (x - 0.15, y - 0.09, z + 0.28), "tdf-orange")
    box(f"{prefix}_pack", (0.18, 0.08, 0.2), (x, y + 0.12, z + 0.18), "tdf-olive-dark")
    # arms forward holding the weapon
    box(f"{prefix}_arm_l", (0.07, 0.24, 0.07), (x - 0.15, y - 0.12, z + 0.24), "tdf-olive")
    box(f"{prefix}_arm_r", (0.07, 0.24, 0.07), (x + 0.15, y - 0.12, z + 0.24), "tdf-olive")
    # helmet: bevelled box with a brim and a visor slit
    # The helmet is the one surface an isometric camera always sees, so
    # it carries the read (#613). Light, not mid: against grass the two
    # greys are equally distant in hue (ΔE 46 and 48) and it is *value*
    # that survives at 64 px and under a cast shadow -- grey-mid sits
    # only ΔL 6 from the olive torso, grey-light ΔL 19. This is the TDF
    # equivalent of the bugs' bone crest (§4.2): a small bright element
    # that says "there is something there" when the body cannot.
    bevel(box(f"{prefix}_helmet", (0.18, 0.18, 0.16), (x, y, z + 0.44), "tdf-grey-light"), 0.03)
    box(f"{prefix}_brim", (0.2, 0.06, 0.02), (x, y - 0.09, z + 0.44), "tdf-grey-dark")
    box(f"{prefix}_visor", (0.12, 0.02, 0.04), (x, y - 0.1, z + 0.42), "tdf-visor")
    # kit
    if kit == "rocket":
        cylinder(f"{prefix}_launcher", 0.045, 0.045, 0.6, 8, (x + 0.14, y - 0.05, z + 0.48), "tdf-grey-dark", rot=(math.pi / 2, 0, 0))
        box(f"{prefix}_warhead", (0.1, 0.06, 0.1), (x + 0.14, y - 0.36, z + 0.48), "tdf-orange-dim")
    elif kit == "sniper":
        box(f"{prefix}_rifle", (0.04, 0.6, 0.05), (x + 0.1, y - 0.3, z + 0.24), "tdf-grey-dark")
        box(f"{prefix}_scope", (0.03, 0.12, 0.04), (x + 0.1, y - 0.2, z + 0.29), "tdf-grey-mid")
    elif kit == "engineer":
        box(f"{prefix}_carbine", (0.04, 0.3, 0.05), (x + 0.1, y - 0.22, z + 0.24), "tdf-grey-dark")
        box(f"{prefix}_toolpack", (0.22, 0.1, 0.24), (x, y + 0.13, z + 0.18), "tdf-orange-dim")
    elif kit == "medic":
        box(f"{prefix}_carbine", (0.04, 0.3, 0.05), (x + 0.1, y - 0.22, z + 0.24), "tdf-grey-dark")
        box(f"{prefix}_medpack", (0.22, 0.1, 0.24), (x, y + 0.13, z + 0.18), "tdf-grey-light")
        box(f"{prefix}_cross_v", (0.03, 0.02, 0.12), (x, y + 0.19, z + 0.18), "tdf-orange")
        box(f"{prefix}_cross_h", (0.12, 0.02, 0.03), (x, y + 0.19, z + 0.18), "tdf-orange")
    else:
        box(f"{prefix}_rifle", (0.04, 0.4, 0.05), (x + 0.1, y - 0.24, z + 0.24), "tdf-grey-dark")
        box(f"{prefix}_mag", (0.03, 0.04, 0.08), (x + 0.1, y - 0.2, z + 0.19), "tdf-grey-dark")


def build_squad(kit: str) -> None:
    """Five figures on the disc; slot 1 (left flank) carries ``kit``; front rank kneels."""
    cylinder("base", 0.425, 0.425, BASE_TOP, 16, (0, 0, BASE_TOP / 2), "tdf-grey-dark")
    for i, at in enumerate(SLOTS):
        figure(f"fig{i}", at, kit if i == 1 else "rifle", kneel=i == 0)
