"""Mech part variants for the starter catalogue (#169 ids): Bulwark and Atlas chassis,
Bastion and Jumper legs, Manipulator and Brace arms, flamer, pulse laser, railgun,
mortar, rotary cannon, and the assembled Mech B reference.

Same axes, sockets and design language as ``mech_a_parts.py`` (chamfered armour,
dark joints, olive panels, orange markings); silhouettes from
``docs/design/concepts/mech-bay/``: light = thin and exposed, heavy = wide and layered.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cylinder, socket  # noqa: E402
from mech_a_parts import _place, armour  # noqa: E402

# ===========================================
# Chassis variants: pivot at the base, sockets for arms and back
# ===========================================


def build_chassis_bulwark() -> None:
    """Bulwark: heavy, wide, layered front plates, recessed cockpit."""
    armour("torso", (1.2, 0.8, 1.0), (0, 0, 0.5), "tdf-grey-mid", chamfer=0.04)
    armour("plate_low", (0.9, 0.1, 0.34), (0, -0.44, 0.3), "tdf-grey-light", chamfer=0.02)
    armour("plate_high", (0.7, 0.1, 0.3), (0, -0.44, 0.7), "tdf-grey-light", chamfer=0.02)
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        armour(f"pad_{s}", (0.3, 0.14, 0.5), (side * 0.43, -0.4, 0.5), "tdf-olive", chamfer=0.02)
        cylinder(f"shoulder_joint_{s}", 0.12, 0.12, 0.14, 8, (side * 0.82, 0, 0.88), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
    armour("shoulders", (1.5, 0.7, 0.34), (0, 0, 0.94), "tdf-grey-dark", chamfer=0.035)
    armour("back_plate", (0.8, 0.12, 0.7), (0, 0.44, 0.5), "tdf-grey-dark", chamfer=0.02)
    armour("cockpit", (0.4, 0.4, 0.26), (0, 0, 1.22), "tdf-grey-mid", chamfer=0.03)
    box("cockpit_brow", (0.46, 0.12, 0.05), (0, -0.2, 1.33), "tdf-grey-dark")
    box("visor", (0.26, 0.02, 0.06), (0, -0.21, 1.22), "tdf-visor")
    box("marking", (0.16, 0.02, 0.1), (-0.4, -0.45, 0.62), "tdf-orange")
    box("hazard", (0.12, 0.02, 0.3), (0.5, -0.41, 0.4), "tdf-orange-dim")
    box("back_mount", (0.24, 0.24, 0.08), (0.3, 0.3, 1.1), "tdf-grey-dark")
    socket("arm_l", (-0.8, 0, 0.88))
    socket("arm_r", (0.8, 0, 0.88))
    socket("back", (0.3, 0.3, 1.1))


def build_chassis_atlas() -> None:
    """Atlas: tall high-capacity torso with twin reactor cylinders on the back."""
    armour("torso", (1.0, 0.75, 1.15), (0, 0, 0.575), "tdf-grey-mid", chamfer=0.035)
    armour("chest_plate", (0.6, 0.08, 0.6), (0, -0.4, 0.5), "tdf-olive", chamfer=0.02)
    armour("shoulders", (1.36, 0.6, 0.3), (0, 0, 1.05), "tdf-grey-dark", chamfer=0.03)
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        armour(f"pad_{s}", (0.3, 0.62, 0.34), (side * 0.55, 0, 1.07), "tdf-olive", chamfer=0.025)
        cylinder(f"shoulder_joint_{s}", 0.1, 0.1, 0.14, 8, (side * 0.74, 0, 1.0), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
        cylinder(f"reactor_{s}", 0.16, 0.16, 0.7, 8, (side * 0.3, 0.5, 0.7), "tdf-grey-dark")
        cylinder(f"reactor_cap_{s}", 0.1, 0.1, 0.06, 8, (side * 0.3, 0.5, 1.08), "tdf-orange")
    armour("cockpit", (0.44, 0.44, 0.32), (0, -0.05, 1.35), "tdf-grey-mid", chamfer=0.03)
    box("visor", (0.32, 0.02, 0.08), (0, -0.28, 1.37), "tdf-visor")
    box("marking", (0.2, 0.02, 0.12), (-0.3, -0.39, 0.75), "tdf-orange")
    box("back_mount", (0.24, 0.24, 0.08), (0, 0.05, 1.22), "tdf-grey-dark")
    socket("arm_l", (-0.72, 0, 1.0))
    socket("arm_r", (0.72, 0, 1.0))
    socket("back", (0, 0.05, 1.22))


# ===========================================
# Leg variants: pivot on the ground, socket_chassis on top
# ===========================================


def build_legs_bastion() -> None:
    """Bastion: short armoured pylons with wide stabiliser feet."""
    for side in (-1, 1):
        x = side * 0.31
        s = "l" if side < 0 else "r"
        armour(f"foot_{s}", (0.42, 0.66, 0.16), (x, -0.05, 0.08), "tdf-grey-dark", chamfer=0.03)
        box(f"foot_mark_{s}", (0.2, 0.02, 0.06), (x, -0.39, 0.08), "tdf-orange-dim")
        armour(f"shin_{s}", (0.34, 0.38, 0.5), (x, 0.03, 0.4), "tdf-grey-mid", chamfer=0.03)
        armour(f"knee_{s}", (0.36, 0.42, 0.14), (x, -0.02, 0.66), "tdf-grey-light", chamfer=0.02)
        armour(f"thigh_{s}", (0.34, 0.38, 0.36), (x, -0.02, 0.9), "tdf-grey-mid", chamfer=0.03)
        box(f"thigh_pad_{s}", (0.12, 0.02, 0.22), (x + side * 0.13, -0.22, 0.9), "tdf-olive")
    armour("hip", (1.0, 0.54, 0.26), (0, 0, 1.2), "tdf-grey-dark", chamfer=0.03)
    armour("pelvis_plate", (0.5, 0.1, 0.18), (0, -0.3, 1.16), "tdf-olive", chamfer=0.015)
    box("hip_pin", (0.3, 0.3, 0.06), (0, 0, 1.35), "tdf-grey-dark")
    socket("chassis", (0, 0, 1.33))


def build_legs_jumper() -> None:
    """Jumper: thin digitigrade legs with jump nozzles behind the calves."""
    for side in (-1, 1):
        x = side * 0.26
        s = "l" if side < 0 else "r"
        armour(f"foot_{s}", (0.24, 0.44, 0.1), (x, -0.08, 0.05), "tdf-grey-dark", chamfer=0.015)
        armour(f"shin_{s}", (0.18, 0.2, 0.62), (x, -0.02, 0.4), "tdf-grey-mid", rot=(math.radians(-14), 0, 0), chamfer=0.015)
        cylinder(f"knee_{s}", 0.1, 0.1, 0.24, 6, (x, 0.06, 0.72), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
        armour(f"thigh_{s}", (0.2, 0.24, 0.5), (x, 0.04, 0.98), "tdf-grey-mid", rot=(math.radians(12), 0, 0), chamfer=0.015)
        cylinder(f"nozzle_{s}", 0.06, 0.09, 0.22, 8, (x, 0.2, 0.35), "tdf-grey-dark")
        cylinder(f"nozzle_tip_{s}", 0.07, 0.07, 0.03, 8, (x, 0.2, 0.23), "tdf-orange")
        box(f"thigh_stripe_{s}", (0.04, 0.02, 0.2), (x + side * 0.11, -0.09, 1.0), "tdf-orange")
    armour("hip", (0.8, 0.44, 0.24), (0, 0, 1.3), "tdf-grey-dark", chamfer=0.025)
    armour("pelvis_plate", (0.4, 0.08, 0.16), (0, -0.25, 1.27), "tdf-olive", chamfer=0.015)
    box("hip_pin", (0.26, 0.26, 0.06), (0, 0, 1.44), "tdf-grey-dark")
    socket("chassis", (0, 0, 1.42))


# ===========================================
# Arm variants: pivot at the shoulder socket, socket_weapon at the wrist
# ===========================================


def build_arm_manipulator(side: int) -> None:
    """Manipulator: thin light arm with exposed actuators and a three-finger claw."""
    s = side
    armour("shoulder", (0.22, 0.22, 0.22), (s * 0.06, 0, 0), "tdf-grey-dark", chamfer=0.015)
    box("upper_arm", (0.12, 0.14, 0.48), (s * 0.08, 0, -0.32), "tdf-grey-mid")
    box("actuator", (0.05, 0.05, 0.36), (s * 0.08, 0.1, -0.32), "tdf-grey-dark")
    box("upper_stripe", (0.02, 0.1, 0.24), (s * 0.15, 0, -0.32), "tdf-olive")
    cylinder("elbow", 0.08, 0.08, 0.2, 8, (s * 0.08, 0.02, -0.58), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
    box("forearm", (0.12, 0.4, 0.12), (s * 0.08, -0.24, -0.62), "tdf-grey-mid")
    box("finger_0", (0.03, 0.12, 0.03), (s * 0.08 - 0.045, -0.5, -0.62), "tdf-grey-dark")
    box("finger_1", (0.03, 0.12, 0.03), (s * 0.08 + 0.045, -0.5, -0.62), "tdf-grey-dark")
    box("finger_2", (0.03, 0.12, 0.03), (s * 0.08, -0.5, -0.56), "tdf-grey-dark")
    box("wrist_ring", (0.14, 0.04, 0.14), (s * 0.08, -0.45, -0.62), "tdf-grey-dark")
    socket("weapon", (s * 0.08, -0.47, -0.62))


def build_arm_brace(side: int) -> None:
    """Brace: heavy arm with a recoil brace plate along the forearm and a shield slab."""
    s = side
    armour("shoulder", (0.32, 0.32, 0.32), (s * 0.1, 0, 0), "tdf-grey-dark", chamfer=0.025)
    armour("upper_arm", (0.3, 0.34, 0.5), (s * 0.12, 0, -0.36), "tdf-grey-mid", chamfer=0.025)
    armour("pad", (0.12, 0.34, 0.2), (s * 0.29, 0, -0.34), "tdf-olive", chamfer=0.015)
    cylinder("elbow", 0.12, 0.12, 0.32, 8, (s * 0.12, 0.04, -0.64), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
    armour("forearm", (0.28, 0.46, 0.28), (s * 0.12, -0.27, -0.68), "tdf-grey-mid", chamfer=0.025)
    armour("brace", (0.06, 0.5, 0.34), (s * 0.3, -0.27, -0.66), "tdf-grey-light", chamfer=0.015)
    box("brace_mark", (0.02, 0.16, 0.06), (s * 0.34, -0.27, -0.66), "tdf-orange")
    box("wrist_ring", (0.3, 0.06, 0.3), (s * 0.12, -0.5, -0.68), "tdf-grey-dark")
    socket("weapon", (s * 0.12, -0.52, -0.68))


# ===========================================
# Arm weapons: pivot at socket_weapon, muzzle toward -Y
# ===========================================


def build_flamer() -> None:
    """Flamer: stubby nozzle, ignition ring, twin fuel tanks alongside."""
    armour("receiver", (0.22, 0.3, 0.22), (0, -0.12, 0), "tdf-grey-dark", chamfer=0.02)
    cylinder("nozzle", 0.07, 0.07, 0.3, 8, (0, -0.42, 0), "tdf-grey-dark", rot=(math.pi / 2, 0, 0))
    cylinder("nozzle_ring", 0.1, 0.1, 0.05, 8, (0, -0.58, 0), "tdf-orange", rot=(math.pi / 2, 0, 0))
    for side in (-1, 1):
        cylinder(f"tank_{'l' if side < 0 else 'r'}", 0.08, 0.08, 0.36, 8, (side * 0.13, -0.1, -0.1), "tdf-olive-dark", rot=(math.pi / 2, 0, 0))
    box("valve", (0.06, 0.06, 0.1), (0, 0.04, 0.14), "tdf-grey-mid")
    socket("muzzle", (0, -0.61, 0))


def build_laser() -> None:
    """Pulse laser: slim barrel with a cooling rail and a cyan emitter lens."""
    armour("body", (0.2, 0.32, 0.2), (0, -0.12, 0), "tdf-grey-dark", chamfer=0.02)
    box("barrel", (0.08, 0.56, 0.08), (0, -0.54, 0), "tdf-grey-mid")
    box("rail", (0.03, 0.46, 0.12), (0.06, -0.5, 0.02), "tdf-olive")
    box("fin_0", (0.14, 0.02, 0.14), (0, -0.4, 0), "tdf-grey-dark")
    box("fin_1", (0.14, 0.02, 0.14), (0, -0.5, 0), "tdf-grey-dark")
    cylinder("lens", 0.06, 0.06, 0.04, 8, (0, -0.84, 0), "tdf-visor", rot=(math.pi / 2, 0, 0))
    socket("muzzle", (0, -0.86, 0))


def build_railgun() -> None:
    """Railgun: twin rails, orange charge strip, muzzle brace."""
    armour("body", (0.24, 0.36, 0.24), (0, -0.14, 0), "tdf-grey-dark", chamfer=0.02)
    box("rail_l", (0.06, 0.62, 0.16), (-0.07, -0.62, 0), "tdf-grey-dark")
    box("rail_r", (0.06, 0.62, 0.16), (0.07, -0.62, 0), "tdf-grey-dark")
    box("charge_strip", (0.16, 0.3, 0.04), (0, -0.45, 0.1), "tdf-orange")
    box("capacitor", (0.22, 0.14, 0.1), (0, -0.05, 0.16), "tdf-olive")
    armour("muzzle_brace", (0.22, 0.06, 0.2), (0, -0.9, 0), "tdf-grey-mid", chamfer=0.015)
    socket("muzzle", (0, -0.94, 0))


# ===========================================
# Back modules: pivot at socket_back
# ===========================================


def build_mortar() -> None:
    """Mortar: short tube angled up and forward on a base block."""
    tilt = 0.7
    box("mount", (0.2, 0.2, 0.1), (0, 0, -0.05), "tdf-grey-dark")
    armour("base", (0.44, 0.44, 0.2), (0, 0, 0.1), "tdf-grey-mid", chamfer=0.025)
    box("stripe", (0.44, 0.02, 0.04), (0, -0.22, 0.2), "tdf-olive")
    cylinder("tube", 0.09, 0.09, 0.5, 8, (0, 0.08, 0.4), "tdf-grey-dark", rot=(-tilt, 0, 0))
    cylinder("tube_ring", 0.11, 0.11, 0.04, 8, (0, 0.08 - 0.25 * math.sin(tilt), 0.4 + 0.25 * math.cos(tilt)), "tdf-orange-dim", rot=(-tilt, 0, 0))
    box("shell_rack", (0.1, 0.3, 0.16), (0.16, 0.02, 0.28), "tdf-olive")
    socket("muzzle", (0, 0.08 - 0.27 * math.sin(tilt), 0.4 + 0.27 * math.cos(tilt)))


def build_rotary_cannon() -> None:
    """Rotary cannon: six-barrel cluster on a turret block."""
    box("mount", (0.2, 0.2, 0.1), (0, 0, -0.05), "tdf-grey-dark")
    armour("turret", (0.4, 0.4, 0.3), (0, 0, 0.15), "tdf-grey-mid", chamfer=0.025)
    box("stripe", (0.4, 0.02, 0.04), (0, -0.2, 0.3), "tdf-orange-dim")
    cylinder("hub", 0.1, 0.1, 0.1, 8, (0, -0.24, 0.15), "tdf-grey-dark", rot=(math.pi / 2, 0, 0))
    for i in range(6):
        a = i * math.pi / 3
        cylinder(f"barrel_{i}", 0.03, 0.03, 0.45, 6, (0.08 * math.cos(a), -0.44, 0.15 + 0.08 * math.sin(a)), "tdf-grey-dark", rot=(math.pi / 2, 0, 0))
    box("ammo_feed", (0.12, 0.2, 0.12), (0.2, 0.06, 0.18), "tdf-olive")
    socket("muzzle", (0, -0.67, 0.15))


# ===========================================
# Assembled reference B
# ===========================================


def build_assembled_b() -> None:
    """Mech B: Bulwark chassis on Bastion legs with Brace arms, railgun and mortar."""
    _place(build_legs_bastion, (0, 0, 0))
    chassis = (0, 0, 1.33)
    _place(build_chassis_bulwark, chassis)
    arm_l = (chassis[0] - 0.8, chassis[1], chassis[2] + 0.88)
    arm_r = (chassis[0] + 0.8, chassis[1], chassis[2] + 0.88)
    _place(lambda: build_arm_brace(-1), arm_l)
    _place(lambda: build_arm_brace(1), arm_r)
    _place(build_railgun, (arm_r[0] + 0.12, arm_r[1] - 0.52, arm_r[2] - 0.68))
    _place(build_mortar, (chassis[0] + 0.3, chassis[1] + 0.3, chassis[2] + 1.1))
