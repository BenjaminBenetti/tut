"""Mech A part builders: Vanguard chassis, Strider legs, Tracker arms, autocannon, missile pod.

Shared by the per-model scripts (``tdf-mech-*.py``) and the assembled reference.
Proportions follow the placeholder split (style guide §3, §6) so sockets stay
where the mech bay expects them; the look follows ``docs/design/concepts/mech.png``
and the mech-bay sheets: boxy chamfered armour, dark joints, olive panels,
orange markings, cyan visor slit.

Blender axes: X right, Y back (+Y), Z up; the mech faces -Y. Three.js
placeholder coordinates (x, y, z) map to Blender (x, -z, y).

        socket_back ● (0.3, 1.05, -0.25)         chassis pivot = socket_chassis of legs
   socket_arm_l ●─┐  ┌─● socket_arm_r          arm pivot = shoulder, hangs -Z, forearm -Y
                  └──┘                          weapon pivot = socket_weapon, points -Y
              legs: socket_chassis (0, 1.42, 0)
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cylinder, socket  # noqa: E402

CH = 0.025  # standard chamfer width on armour


def armour(name, size, at, token="tdf-grey-mid", rot=(0, 0, 0), chamfer=CH):
    """Chamfered armour block."""
    return bevel(box(name, size, at, token, rot), chamfer)


# ===========================================
# Legs (Strider): pivot on the ground, socket_chassis at z = 1.42
# ===========================================


def build_legs() -> None:
    """Digitigrade legs with toes, knee armour and a hip block."""
    for side in (-1, 1):
        x = side * 0.3
        s = f"{'l' if side < 0 else 'r'}"
        # foot: heel block, two toes forward, toe caps
        armour(f"foot_{s}", (0.3, 0.34, 0.12), (x, 0.06, 0.06), "tdf-grey-dark")
        for toe in (-1, 1):
            armour(f"toe_{s}{toe}", (0.11, 0.24, 0.09), (x + toe * 0.09, -0.24, 0.045), "tdf-grey-dark", chamfer=0.015)
        box(f"heel_{s}", (0.2, 0.08, 0.1), (x, 0.24, 0.05), "tdf-grey-dark")
        # shin, angled back like a digitigrade
        armour(f"shin_{s}", (0.22, 0.24, 0.5), (x, 0.06, 0.4), "tdf-grey-mid", rot=(math.radians(-8), 0, 0))
        box(f"shin_pipe_{s}", (0.08, 0.06, 0.4), (x, -0.1, 0.42), "tdf-grey-dark")
        # knee: joint cylinder + armour cap
        cylinder(f"knee_joint_{s}", 0.12, 0.12, 0.3, 6, (x, 0.0, 0.7), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
        armour(f"knee_cap_{s}", (0.26, 0.12, 0.18), (x, -0.14, 0.72), "tdf-olive", chamfer=0.02)
        # thigh, angled forward
        armour(f"thigh_{s}", (0.26, 0.3, 0.44), (x, -0.02, 0.96), "tdf-grey-mid", rot=(math.radians(10), 0, 0))
        box(f"thigh_stripe_{s}", (0.05, 0.02, 0.2), (x + side * 0.14, -0.16, 0.98), "tdf-orange")
        # hip joint
        cylinder(f"hip_joint_{s}", 0.14, 0.14, 0.2, 6, (x, 0.0, 1.22), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
    armour("hip", (0.9, 0.46, 0.26), (0, 0, 1.3), "tdf-grey-dark", chamfer=0.03)
    armour("pelvis_plate", (0.48, 0.1, 0.18), (0, -0.26, 1.26), "tdf-olive", chamfer=0.015)
    box("hip_pin", (0.3, 0.3, 0.06), (0, 0, 1.44), "tdf-grey-dark")
    socket("chassis", (0, 0, 1.42))


# ===========================================
# Chassis (Vanguard): pivot at its base, arm and back sockets
# ===========================================


def build_chassis() -> None:
    """Boxy torso, chest plate, shoulder blocks, cockpit with visor slit."""
    armour("torso", (0.98, 0.7, 0.96), (0, 0, 0.5), "tdf-grey-mid", chamfer=0.035)
    armour("chest_plate", (0.66, 0.08, 0.46), (0, -0.37, 0.46), "tdf-olive", chamfer=0.02)
    box("chest_vent_l", (0.12, 0.02, 0.2), (-0.36, -0.36, 0.52), "tdf-grey-dark")
    box("chest_vent_r", (0.12, 0.02, 0.2), (0.36, -0.36, 0.52), "tdf-grey-dark")
    armour("back_plate", (0.78, 0.1, 0.66), (0, 0.38, 0.5), "tdf-grey-dark", chamfer=0.02)
    armour("shoulders", (1.36, 0.58, 0.28), (0, 0, 0.92), "tdf-grey-dark", chamfer=0.03)
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        armour(f"pad_{s}", (0.3, 0.6, 0.34), (side * 0.55, 0, 0.94), "tdf-olive", chamfer=0.025)
        box(f"pad_mark_{s}", (0.1, 0.02, 0.08), (side * 0.55, -0.31, 0.98), "tdf-orange")
        cylinder(f"shoulder_joint_{s}", 0.1, 0.1, 0.14, 8, (side * 0.74, 0, 0.85), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
    armour("cockpit", (0.42, 0.42, 0.3), (0, -0.05, 1.21), "tdf-grey-mid", chamfer=0.03)
    box("visor", (0.3, 0.02, 0.07), (0, -0.27, 1.23), "tdf-visor")
    box("cockpit_brow", (0.44, 0.1, 0.05), (0, -0.24, 1.32), "tdf-grey-dark")
    box("hazard", (0.08, 0.02, 0.3), (0.42, -0.36, 0.4), "tdf-orange-dim")
    box("marking", (0.18, 0.02, 0.12), (-0.3, -0.36, 0.62), "tdf-orange")
    box("back_mount", (0.24, 0.24, 0.08), (0.3, 0.25, 1.06), "tdf-grey-dark")
    socket("arm_l", (-0.72, 0, 0.85))
    socket("arm_r", (0.72, 0, 0.85))
    socket("back", (0.3, 0.25, 1.05))


# ===========================================
# Arms (Tracker): pivot at the shoulder socket, socket_weapon at the wrist
# ===========================================


def build_arm(side: int) -> None:
    """Armoured upper arm, elbow joint, forearm pointing forward, sensor pod."""
    s = side
    armour("shoulder", (0.26, 0.26, 0.26), (s * 0.08, 0, 0), "tdf-grey-dark", chamfer=0.02)
    armour("upper_arm", (0.24, 0.28, 0.46), (s * 0.1, 0, -0.33), "tdf-grey-mid", chamfer=0.02)
    box("upper_stripe", (0.02, 0.2, 0.26), (s * 0.23, 0, -0.33), "tdf-olive")
    cylinder("elbow", 0.1, 0.1, 0.28, 8, (s * 0.1, 0.02, -0.6), "tdf-grey-dark", rot=(0, math.pi / 2, 0))
    armour("forearm", (0.22, 0.42, 0.22), (s * 0.1, -0.24, -0.65), "tdf-grey-mid", chamfer=0.02)
    armour("sensor_pod", (0.1, 0.16, 0.08), (s * 0.24, -0.2, -0.56), "tdf-grey-dark", chamfer=0.01)
    box("sensor_lens", (0.02, 0.06, 0.04), (s * 0.3, -0.2, -0.56), "tdf-visor")
    box("wrist_ring", (0.24, 0.06, 0.24), (s * 0.1, -0.45, -0.65), "tdf-grey-dark")
    socket("weapon", (s * 0.1, -0.47, -0.65))


# ===========================================
# Weapons: pivot at socket_weapon / socket_back, muzzle toward -Y
# ===========================================


def build_autocannon() -> None:
    """Rotary autocannon: receiver, six-barrel cluster, orange muzzle ring."""
    armour("receiver", (0.22, 0.32, 0.22), (0, -0.12, 0), "tdf-grey-dark", chamfer=0.02)
    box("ammo_box", (0.1, 0.16, 0.14), (0.16, -0.06, -0.02), "tdf-olive")
    cylinder("hub", 0.09, 0.09, 0.08, 8, (0, -0.32, 0), "tdf-grey-dark", rot=(math.pi / 2, 0, 0))
    for i in range(6):
        a = i * math.pi / 3
        cylinder(f"barrel_{i}", 0.025, 0.025, 0.4, 6, (0.055 * math.cos(a), -0.52, 0.055 * math.sin(a)), "tdf-grey-mid", rot=(math.pi / 2, 0, 0))
    cylinder("muzzle_ring", 0.1, 0.1, 0.05, 8, (0, -0.7, 0), "tdf-orange", rot=(math.pi / 2, 0, 0))
    socket("muzzle", (0, -0.74, 0))


def build_missile_pod() -> None:
    """Six-tube missile pod on a short mount, tubes open toward -Y."""
    box("mount", (0.18, 0.18, 0.1), (0, 0, -0.05), "tdf-grey-dark")
    armour("pod", (0.5, 0.5, 0.34), (0, 0, 0.17), "tdf-grey-mid", chamfer=0.03)
    box("pod_stripe", (0.5, 0.02, 0.04), (0, -0.25, 0.33), "tdf-orange-dim")
    box("pod_panel", (0.12, 0.5, 0.36), (0.2, 0, 0.17), "tdf-olive")
    for i, (x, z) in enumerate([(-0.14, 0.1), (0, 0.1), (0.14, 0.1), (-0.14, 0.25), (0, 0.25), (0.14, 0.25)]):
        cylinder(f"tube_{i}", 0.05, 0.05, 0.08, 8, (x - 0.02, -0.26, z), "tdf-grey-dark", rot=(math.pi / 2, 0, 0))
    socket("muzzle", (0, -0.3, 0.17))


# ===========================================
# Assembled reference (all parts at their sockets)
# ===========================================


def _place(builder, offset: tuple[float, float, float]) -> None:
    """Run a part builder, then translate everything it created by ``offset``."""
    import bpy

    before = set(bpy.data.objects)
    builder()
    for ob in set(bpy.data.objects) - before:
        ob.location = (ob.location.x + offset[0], ob.location.y + offset[1], ob.location.z + offset[2])


def build_assembled() -> None:
    """Mech A: Strider legs, Vanguard chassis, Tracker arms, autocannon right, missile pod back."""
    _place(build_legs, (0, 0, 0))
    chassis = (0, 0, 1.42)
    _place(build_chassis, chassis)
    arm_l = (chassis[0] - 0.72, chassis[1], chassis[2] + 0.85)
    arm_r = (chassis[0] + 0.72, chassis[1], chassis[2] + 0.85)
    _place(lambda: build_arm(-1), arm_l)
    _place(lambda: build_arm(1), arm_r)
    _place(build_autocannon, (arm_r[0] + 0.1, arm_r[1] - 0.47, arm_r[2] - 0.65))
    _place(build_missile_pod, (chassis[0] + 0.3, chassis[1] + 0.25, chassis[2] + 1.05))
