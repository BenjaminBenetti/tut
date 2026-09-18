"""Progression mech kit (#1168): practical silhouettes, shared sockets, TDF palette."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder, socket
from mech_a_parts import armour

DARK = "tdf-grey-dark"
MID = "tdf-grey-mid"
LIGHT = "tdf-grey-light"
OLIVE = "tdf-olive"
ORANGE = "tdf-orange"
LENS = "tdf-visor"


def barrel(name, radius, length, at, token=DARK, tilt=math.pi / 2):
    """A closed six-sided tube aligned forward, within the weapon triangle budget."""
    return cylinder(name, radius, radius, length, 6, at, token, rot=(tilt, 0, 0))


def build_chassis(variant):
    """Build the dedicated scout, sensor or heat-core silhouette."""
    from mech_chassis_parts import build_chassis as chassis
    chassis(variant)


def build_legs(variant):
    """Broad articulated feet, reverse-jointed sprint actuators or folded anchor spades."""
    sprint = variant == "sprint"
    anchor = variant == "anchor"
    height = 1.43 if sprint else 1.25
    for side in (-1, 1):
        x = side * 0.29
        limb = "l" if side < 0 else "r"
        foot_width = 0.23 if sprint else 0.39
        armour(f"foot_{limb}", (foot_width, 0.59, 0.14), (x, -0.09, 0.07), DARK, chamfer=0.018)
        for toe in (-1, 1):
            box(f"toe_{limb}_{toe}", (foot_width * 0.35, 0.14, 0.09), (x + toe * foot_width * 0.25, -0.4, 0.045), LIGHT)
        armour(f"shin_{limb}", (0.19 if sprint else 0.29, 0.22, 0.55), (x, 0.035, 0.43), MID, rot=(-0.16 if sprint else 0, 0, 0), chamfer=0.02)
        cylinder(f"knee_{limb}", 0.12, 0.12, 0.29, 8, (x, -0.02, 0.73), DARK, rot=(0, math.pi / 2, 0))
        armour(f"thigh_{limb}", (0.23, 0.3, height - 0.7), (x, 0.04, (height + 0.7) / 2), MID, chamfer=0.02)
        box(f"shin_piston_{limb}", (0.055, 0.055, 0.57), (x + side * 0.15, 0.08, 0.86), LIGHT)
        box(f"thigh_mark_{limb}", (0.09, 0.02, 0.12), (x, -0.16, 1.0), ORANGE)
        if anchor:
            cylinder(f"shin_brace_hinge_{limb}", 0.075, 0.075, 0.26, 8, (x + side * 0.17, 0.06, 0.5), DARK, rot=(0, math.pi / 2, 0))
            box(f"brace_{limb}_spade", (0.12, 0.48, 0.45), (x + side * 0.24, 0.06, 0.31), OLIVE)
            box(f"brace_{limb}_edge", (0.15, 0.52, 0.055), (x + side * 0.24, 0.06, 0.11), LIGHT)
        elif not sprint:
            box(f"heel_pivot_{limb}", (0.15, 0.14, 0.15), (x, 0.25, 0.18), OLIVE)
    armour("hip", (0.82, 0.43, 0.22), (0, 0, height), DARK, chamfer=0.025)
    box("pelvis", (0.35, 0.09, 0.16), (0, -0.25, height), OLIVE)
    socket("chassis", (0, 0, height + 0.11))


def build_arm(variant, side):
    """Armour gauntlet, precision cradle or exposed coolant conduits; pivots at shoulder."""
    assault = variant == "assault"
    width = 0.29 if assault else 0.2
    box("shoulder", (width + 0.04, 0.29, 0.25), (side * 0.08, 0, 0), DARK)
    armour("upper_arm", (width, 0.26, 0.48), (side * 0.09, 0, -0.32), MID, chamfer=0.02)
    cylinder("elbow", 0.1, 0.1, width + 0.07, 8, (side * 0.09, 0, -0.6), DARK, rot=(0, math.pi / 2, 0))
    box("forearm", (width, 0.46, 0.2), (side * 0.09, -0.23, -0.65), MID)
    if assault:
        box("gauntlet", (0.1, 0.51, 0.38), (side * 0.29, -0.23, -0.59), LIGHT)
        box("stripe", (0.015, 0.12, 0.12), (side * 0.345, -0.35, -0.59), ORANGE)
    elif variant == "marksman":
        box("stabiliser", (0.08, 0.62, 0.07), (side * 0.23, -0.19, -0.55), LIGHT)
        box("optic", (0.13, 0.23, 0.1), (side * 0.1, -0.16, -0.48), OLIVE)
        box("optic_lens", (0.08, 0.015, 0.045), (side * 0.1, -0.285, -0.48), LENS)
    else:
        for n in (-1, 1):
            box(f"conduit_{n}", (0.055, 0.44, 0.055), (side * 0.23, -0.21, -0.64 + n * 0.07), OLIVE)
        for n in range(3):
            box(f"cooling_fin_{n}", (0.3, 0.035, 0.27), (side * 0.08, -0.08 - n * 0.13, -0.65), DARK)
    socket("weapon", (side * 0.09, -0.48, -0.65))


def build_arm_weapon(variant):
    """Each weapon reads by its muzzle, receiver and support hardware rather than paint."""
    box("receiver", (0.27, 0.35, 0.25), (0, -0.14, 0), DARK)
    box("top_plate", (0.25, 0.28, 0.065), (0, -0.13, 0.16), OLIVE)
    length = 0.78
    if variant == "scatter-cannon":
        for side in (-1, 1):
            barrel(f"barrel_{side}", 0.09, 0.44, (side * 0.09, -0.49, 0), MID)
            barrel(f"bore_{side}", 0.06, 0.025, (side * 0.09, -0.722, 0), DARK)
        length = 0.74
    elif variant == "pile-driver":
        barrel("piston_casing", 0.16, 0.46, (0, -0.45, 0), MID)
        barrel("steel_ram", 0.07, 0.36, (0, -0.78, 0), LIGHT)
        cylinder("point", 0, 0.07, 0.2, 4, (0, -1.03, 0), LIGHT, rot=(math.pi / 2, 0, 0))
        box("hazard", (0.3, 0.06, 0.045), (0, -0.42, 0.17), ORANGE)
        length = 1.13
    elif variant == "heavy-autocannon":
        barrel("barrel", 0.105, 0.7, (0, -0.65, 0), MID)
        barrel("muzzle_brake", 0.14, 0.14, (0, -1.03, 0), DARK)
        cylinder("ammo_drum", 0.16, 0.16, 0.16, 8, (0.21, -0.08, 0), OLIVE, rot=(0, math.pi / 2, 0))
        length = 1.11
    elif variant == "siege-railgun":
        for side in (-1, 1):
            box(f"rail_{side}", (0.08, 1.0, 0.2), (side * 0.1, -0.8, 0), LIGHT)
            box(f"capacitor_{side}", (0.12, 0.34, 0.18), (side * 0.19, -0.21, 0), OLIVE)
        for n in range(3):
            box(f"coil_{n}", (0.29, 0.055, 0.26), (0, -0.47 - n * 0.29, 0), DARK)
        box("charge_strip", (0.05, 0.54, 0.025), (0, -0.64, 0.15), ORANGE)
        length = 1.31
    elif variant == "thermal-lance":
        barrel("emitter", 0.08, 0.6, (0, -0.55, 0), LIGHT)
        for n in range(4):
            box(f"heat_fin_{n}", (0.26, 0.055, 0.26), (0, -0.34 - n * 0.14, 0), DARK)
        barrel("lens", 0.06, 0.025, (0, -0.865, 0), LENS)
        length = 0.89
    else:
        box("emitter_body", (0.29, 0.53, 0.19), (0, -0.53, 0), MID)
        for side in (-1, 1):
            box(f"focusing_rail_{side}", (0.06, 0.7, 0.3), (side * 0.19, -0.59, 0), DARK)
        box("lens", (0.22, 0.025, 0.13), (0, -0.81, 0), LENS)
        box("radiator", (0.33, 0.35, 0.06), (0, -0.49, 0.17), LIGHT)
        length = 0.95
    socket("muzzle", (0, -length, 0))


def build_back_weapon(variant):
    """Shoulder modules share a pivot but have distinct tube, rack and cannon silhouettes."""
    box("mount", (0.22, 0.22, 0.12), (0, 0, -0.04), DARK)
    box("receiver", (0.46, 0.38, 0.25), (0, 0, 0.14), MID)
    if variant == "smoke-launcher":
        for n in range(3):
            barrel(f"tube_{n}", 0.065, 0.35, ((n - 1) * 0.14, -0.12, 0.39), OLIVE, 0.7)
        socket("muzzle", (0, -0.25, 0.55))
    elif variant == "guided-missile-rack":
        for side in (-1, 1):
            box(f"pod_{side}", (0.2, 0.7, 0.26), (side * 0.15, -0.12, 0.4), OLIVE)
            barrel(f"missile_tip_{side}", 0.065, 0.04, (side * 0.15, -0.49, 0.4), LIGHT)
        box("seeker", (0.09, 0.09, 0.11), (0, -0.15, 0.59), DARK)
        box("seeker_lens", (0.07, 0.015, 0.07), (0, -0.2, 0.59), LENS)
        socket("muzzle", (0, -0.53, 0.4))
    elif variant == "incendiary-launcher":
        barrel("launcher", 0.13, 0.59, (0, -0.18, 0.4), DARK)
        for side in (-1, 1):
            cylinder(f"fuel_{side}", 0.09, 0.09, 0.32, 6, (side * 0.24, 0.02, 0.39), OLIVE)
        barrel("muzzle_ring", 0.14, 0.04, (0, -0.5, 0.4), ORANGE)
        socket("muzzle", (0, -0.53, 0.4))
    elif variant == "siege-howitzer":
        barrel("breech", 0.2, 0.32, (0, 0.07, 0.39), OLIVE, 0.85)
        barrel("tube", 0.105, 0.86, (0, -0.29, 0.7), MID, 0.85)
        barrel("brake", 0.15, 0.12, (0, -0.64, 1.0), DARK, 0.85)
        box("recoil_jack", (0.1, 0.28, 0.17), (0.21, -0.03, 0.38), LIGHT)
        socket("muzzle", (0, -0.69, 1.04))
    else:
        box("rack", (0.62, 0.55, 0.55), (0, -0.03, 0.48), OLIVE)
        for row in range(3):
            for col in range(3):
                barrel(f"rocket_{row}_{col}", 0.068, 0.045, ((col - 1) * 0.18, -0.325, 0.3 + row * 0.18), DARK)
        box("marking", (0.15, 0.026, 0.045), (0, -0.32, 0.78), ORANGE)
        socket("muzzle", (0, -0.36, 0.48))
