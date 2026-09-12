"""The Crescent family: brown swept mantles, tan keels and hooked forelimbs.

Reproducible authored replacements for all four original bugs. The swarmer
follows the approved brown Crescent concept; the other classes inherit its
shell language while retaining their gameplay silhouettes. Limb node names
are the UnitMotionRig contract. See docs/design/kits/crescent-bugs.md.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import bead, finish, growth_ridges, group_new, hooked_blade, joint_origin, rim, scute, shell, sweep
from bpy_kit import mesh_objects, socket


# ===========================================
# Anatomy shared by the family
# ===========================================


def limb(name, points, radius):
    """A connected articulated running leg with joint collars and a tapered foot."""
    before = set(mesh_objects())
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        mid = tuple(a[k] * 0.56 + b[k] * 0.44 for k in range(3))
        r = radius * (1 - i * 0.2)
        sweep(name + f"_segment{i}", [a, mid, b], [r * 0.64, r * 0.62, r * 0.38],
              token="bug-chitin-dark" if i % 2 == 0 else "bug-chitin-black", sides=10)
        # A tapered exoskeleton cuff overlaps each flexible segment; the
        # flared leading end reads as grown armour even when zoomed in.
        cuff = [tuple(a[k] * (1 - t) + b[k] * t for k in range(3))
                for t in (0.13, 0.24, 0.48, 0.70)]
        sweep(name + f"_cuff{i}", cuff, [r * 0.91, r * 1.19, r * 1.03, r * 0.71],
              [r * 0.83, r * 1.03, r * 0.94, r * 0.63], token="bug-chitin-mid", sides=8)
        if i < len(points) - 2:
            bead(name + f"_joint{i}", b, r * 0.71, "bug-chitin-black", segments=12, rings=8)
            scute(name + f"_jointplate{i}", (b[0], b[1], b[2] + r * 0.55),
                  r * 1.8, r * 2.0, r * 0.28, "bug-chitin-mid")
    # Two short terminal toes form a real contact rather than a hovering point.
    p = points[-1]
    for side in (-1, 1):
        sweep(name + f"_toe{side}", [p, (p[0] + side * radius * 0.32, p[1] - radius * 0.75, 0.004)],
              [radius * 0.24, 0.002], token="bug-bone", sides=6)
    return joint_origin(group_new(before, name), points[0])


def face(at, size, glow="bug-bio-green"):
    """Recessed head, protected eye clusters and two small curved mandibles."""
    before = set(mesh_objects())
    x, y, z = at
    bead("head_core", at, size, "bug-chitin-black", scale=(1, 0.8, 0.63), segments=20, rings=12)
    for side in (-1, 1):
        for i, ratio in enumerate((1.0, 0.57)):
            eye = (x + side * size * (0.71 + i * 0.22), y - size * (0.55 - i * 0.17),
                   z + size * (0.10 - i * 0.25))
            bead(f"eye_socket{side}_{i}", eye, size * 0.28 * ratio, "bug-chitin-black")
            bead(f"eye{side}_{i}", (eye[0], eye[1] - size * 0.13, eye[2] + size * 0.025),
                 size * 0.185 * ratio, glow, scale=(1, 0.72, 1), segments=14, rings=10)
        hooked_blade(f"mandible{side}",
                     [(x + side * size * 0.42, y - size * 0.46, z - size * 0.27),
                      (x + side * size * 0.60, y - size * 0.92, z - size * 0.39),
                      (x + side * size * 0.17, y - size * 1.20, z - size * 0.35)],
                     [size * 0.20, size * 0.12, 0.001], size * 0.13, size * 0.06)
    # Keep this node's origin at the actual front for the facing regression.
    return group_new(before, "head")


def forearm(name, anchor, elbow, wrist, blade_points, widths, radius):
    """Jointed upper arm, protective cuff and a true curved cutting blade."""
    before = set(mesh_objects())
    sweep(name + "_upper", [anchor, elbow, wrist], [radius, radius * 0.80, radius * 0.56],
          token="bug-chitin-mid", sides=12)
    bead(name + "_elbow", elbow, radius * 0.82, "bug-chitin-black", segments=14, rings=10)
    bead(name + "_wrist", wrist, radius * 0.58, "bug-chitin-black")
    scute(name + "_cuff", (elbow[0], elbow[1], elbow[2] + radius * 0.68),
          radius * 1.8, radius * 2.8, radius * 0.32)
    hooked_blade(name + "_hook", blade_points, widths, radius * 0.42, radius * 0.17)
    return joint_origin(group_new(before, name), anchor)


def vents(name, at, scale, side, glow):
    """Two sheltered glowing gill slots, each inside a dark chitin recess."""
    x, y, z = at
    for i in range(2):
        points = [(x, y + i * scale * 2.3, z),
                  (x + side * scale * 0.48, y + i * scale * 2.3, z - scale * 1.65)]
        sweep(f"{name}_recess{i}", points, [scale * 0.56] * 2, token="bug-chitin-black", sides=8)
        sweep(f"{name}_light{i}", [(p[0], p[1] - scale * 0.20, p[2] + scale * 0.10) for p in points],
              [scale * 0.24] * 2, token=glow, sides=6)


def abdomen(name, start, count, width, length, rise):
    """Overlapping independent tergites over a dark flexible abdomen."""
    x, y, z = start
    bead(name + "_core", (x, y + count * length * 0.24, z - rise * 0.9),
         width, "bug-chitin-black", scale=(0.76, count * length / width * 0.32, 0.32),
         segments=20, rings=12)
    for i in range(count):
        ratio = 1 - i / (count + 1)
        yy, zz = y + i * length * 0.52, z - i * rise * 0.11
        _, edge = shell(f"{name}_tergite{i}", (x, yy, zz), width * ratio, length,
                        rise * ratio, "bug-chitin-mid" if i % 2 == 0 else "bug-chitin-dark",
                        thickness=0.012, segments=24, rings=4)
        rim(f"{name}_lip{i}", edge, 0.007, "bug-chitin-mid")


# ===========================================
# Swarmer: flat Crescent shield, four running legs and two blade arms
# ===========================================


def build_swarmer() -> None:
    """Small, swift ground hunter; the approved brown Crescent silhouette."""
    before = set(mesh_objects())
    bead("thorax", (0, -0.02, 0.245), 0.19, "bug-chitin-black", scale=(1.1, 1.25, 0.55),
         segments=20, rings=12)
    abdomen("abdomen", (0, 0.15, 0.28), 5, 0.19, 0.105, 0.082)
    _, edge = shell("mantle", (0, -0.075, 0.31), 0.425, 0.325, 0.13,
                    crescent=1.0, thickness=0.018, segments=48, rings=8)
    rim("mantle_rim", edge, 0.0095)
    growth_ridges("mantle_ridge", (0, -0.075, 0.31), edge, 0.13)
    for i, (y, z, w, tilt) in enumerate([(-0.285, 0.377, 0.085, 0.36),
                                        (-0.17, 0.425, 0.12, 0.12),
                                        (-0.04, 0.439, 0.13, -0.03),
                                        (0.085, 0.402, 0.09, -0.30)]):
        scute(f"dorsal_lozenge{i}", (0, y, z), w, 0.13, 0.023, tilt=tilt)
    for side in (-1, 1):
        vents(f"gill{side}", (side * 0.225, 0.006, 0.385), 0.022, side, "bug-bio-green")
    group_new(before, "carapace")
    face((0, -0.32, 0.255), 0.10)
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        limb(f"leg_{s}0", [(side * 0.17, -0.06, 0.255), (side * 0.34, -0.19, 0.225),
                           (side * 0.405, -0.24, 0.085), (side * 0.47, -0.31, 0.015)], 0.038)
        limb(f"leg_{s}1", [(side * 0.15, 0.18, 0.265), (side * 0.32, 0.285, 0.255),
                           (side * 0.39, 0.365, 0.07), (side * 0.44, 0.44, 0.015)], 0.042)
        wrist = (side * 0.205, -0.425, 0.18)
        forearm(f"blade_{s}", (side * 0.12, -0.22, 0.255), (side * 0.245, -0.34, 0.22), wrist,
                [wrist, (side * 0.245, -0.475, 0.155), (side * 0.25, -0.53, 0.095),
                 (side * 0.205, -0.555, 0.035)], [0.026, 0.041, 0.028, 0.001], 0.035)
    finish(0.5, 0.98, 1.02)


# ===========================================
# Lurker: narrow high hood and long sickles, four stilt-like running legs
# ===========================================


def build_lurker() -> None:
    """A tall mantis-like Crescent stalker with a narrow waist and magenta eyes."""
    before = set(mesh_objects())
    sweep("thorax", [(0, 0.11, 0.53), (0, 0.075, 0.74), (0, -0.035, 0.94), (0, -0.12, 1.10)],
          [0.085, 0.065, 0.105, 0.12], [0.095, 0.08, 0.12, 0.12],
          token="bug-flesh", sides=16)
    for i in range(5):
        z, y = 0.61 + i * 0.10, 0.085 - i * 0.035
        _, edge = shell(f"thorax_ring{i}", (0, y, z), 0.095 + i * 0.013, 0.12, 0.07,
                        "bug-chitin-dark", thickness=0.018, segments=24, rings=4)
        rim(f"thorax_rim{i}", edge, 0.009, "bug-chitin-mid")
    abdomen("tail", (0, 0.20, 0.51), 4, 0.12, 0.10, 0.07)
    _, edge = shell("mantle", (0, -0.13, 1.065), 0.255, 0.23, 0.15, crescent=1.15,
                    thickness=0.018, segments=48, rings=8)
    rim("mantle_rim", edge, 0.012)
    growth_ridges("mantle_ridge", (0, -0.13, 1.065), edge, 0.15, 0.0045)
    for i, (y, z, tilt) in enumerate([(-0.265, 1.16, 0.35), (-0.15, 1.208, 0),
                                     (-0.035, 1.183, -0.35)]):
        scute(f"hood_lozenge{i}", (0, y, z), 0.07, 0.12, 0.025, tilt=tilt)
    for side in (-1, 1):
        vents(f"gill{side}", (side * 0.15, -0.09, 1.145), 0.021, side, "bug-bio-magenta")
    group_new(before, "carapace")
    face((0, -0.295, 1.015), 0.09, "bug-bio-magenta")
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        limb(f"leg_{s}0", [(side * 0.075, 0.055, 0.64), (side * 0.20, -0.075, 0.39),
                           (side * 0.145, -0.075, 0.115), (side * 0.20, -0.20, 0.015)], 0.034)
        limb(f"leg_{s}1", [(side * 0.08, 0.13, 0.61), (side * 0.23, 0.295, 0.50),
                           (side * 0.23, 0.265, 0.13), (side * 0.30, 0.37, 0.015)], 0.037)
        wrist = (side * 0.34, -0.35, 0.99)
        forearm(f"scythe_{s}", (side * 0.115, -0.105, 0.96), (side * 0.31, -0.13, 1.08), wrist,
                [wrist, (side * 0.395, -0.45, 0.88), (side * 0.43, -0.53, 0.68),
                 (side * 0.40, -0.56, 0.43), (side * 0.29, -0.49, 0.19)],
                [0.045, 0.074, 0.088, 0.057, 0.001], 0.045)
    finish(1.3, 0.95, 1.05)


# ===========================================
# Brute: heavy domed Crescent carapace, weight-bearing legs and cleavers
# ===========================================


def build_brute() -> None:
    """A thick, layered siege mantle with protected eyes and grounded cleavers."""
    before = set(mesh_objects())
    bead("thorax", (0, 0.06, 0.92), 0.40, "bug-chitin-dark", scale=(1, 1, 1.45), segments=28, rings=18)
    abdomen("abdomen", (0, 0.25, 0.91), 4, 0.30, 0.16, 0.21)
    _, edge = shell("mantle", (0, -0.07, 1.03), 0.49, 0.44, 0.55,
                    crescent=0.8, thickness=0.045, segments=56, rings=10)
    rim("mantle_rim", edge, 0.028)
    growth_ridges("mantle_ridge", (0, -0.07, 1.03), edge, 0.55, 0.008)
    # The swept hood exposes the rear thorax; overlapping vertical tergites
    # carry the armour language around the back instead of leaving a bare core.
    for i, (z, y, width) in enumerate(((0.85, 0.48, 0.40), (1.03, 0.48, 0.39),
                                       (1.21, 0.44, 0.34), (1.38, 0.36, 0.22))):
        plate_start = set(mesh_objects())
        _, rear_edge = shell(f"rear_tergite{i}", (0, 0, 0), width, 0.21, 0.09,
                             "bug-chitin-mid", thickness=0.022, segments=28, rings=5)
        rim(f"rear_lip{i}", rear_edge, 0.009, "bug-chitin-tan")
        plate = group_new(plate_start, f"rear_armour{i}")
        plate.rotation_euler.x = -math.pi / 2
        plate.location = (0, y, z)
    for side in (-1, 1):
        for i in range(2):
            _, shoulder_edge = shell(f"flank{side}_{i}", (side * 0.31, 0.02 + i * 0.16, 0.83 + i * 0.04),
                                     0.24, 0.26, 0.29, "bug-chitin-mid",
                                     crescent=0.8, thickness=0.027, segments=28, rings=5)
            rim(f"flank_rim{side}_{i}", shoulder_edge, 0.012)
        vents(f"gill{side}", (side * 0.365, -0.11, 1.325), 0.042, side, "bug-bio-green")
    for i, (y, z, w, tilt) in enumerate([(-0.385, 1.33, 0.16, 1.0),
                                        (-0.225, 1.52, 0.23, 0.45),
                                        (-0.05, 1.581, 0.24, 0.0),
                                        (0.12, 1.478, 0.18, -0.70)]):
        scute(f"dorsal_lozenge{i}", (0, y, z), w, 0.18, 0.052, tilt=tilt)
    group_new(before, "carapace")
    face((0, -0.39, 0.915), 0.18)
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        for i, y in enumerate((-0.12, 0.21)):
            limb(f"leg_{s}{i}", [(side * 0.245, y, 0.77), (side * 0.44, y + 0.045, 0.49),
                                 (side * 0.425, y + 0.09, 0.16), (side * 0.47, y + 0.08, 0.022)], 0.095)
        wrist = (side * 0.43, -0.45, 0.52)
        forearm(f"cleaver_{s}", (side * 0.30, -0.22, 0.93), (side * 0.49, -0.29, 0.72), wrist,
                [wrist, (side * 0.50, -0.52, 0.41), (side * 0.515, -0.61, 0.24),
                 (side * 0.43, -0.665, 0.075), (side * 0.32, -0.58, 0.035)],
                [0.07, 0.12, 0.13, 0.087, 0.002], 0.085)
    finish(1.8, 1.06, 1.15)


# ===========================================
# Egg spawner: crescent husks cradle three eggs and an opening central clutch
# ===========================================


def build_egg_spawner() -> None:
    """A rooted brown brood nest with ribbed eggs and a split, luminous hatch."""
    before = set(mesh_objects())
    _, edge = shell("root_mantle", (0, 0, 0.09), 0.47, 0.45, 0.11, "bug-chitin-dark",
                    crescent=0.8, thickness=0.04, segments=48, rings=7)
    rim("root_lip", edge, 0.018)
    bead("brood_mound", (0, 0.07, 0.24), 0.31, "bug-flesh", scale=(1.18, 1.06, 0.55),
         segments=28, rings=16)
    for i in range(8):
        a = i * math.tau / 8
        points = [(math.sin(a) * 0.20, math.cos(a) * 0.20, 0.20),
                  (math.sin(a) * 0.37, math.cos(a) * 0.38, 0.055),
                  (math.sin(a) * 0.47, math.cos(a) * 0.47, 0.009)]
        sweep(f"root{i}", points, [0.036, 0.022, 0.002], token="bug-chitin-black", sides=10)
    for i, (x, y, scale) in enumerate([(-0.25, -0.17, 0.95), (0.26, -0.17, 0.82), (-0.22, 0.23, 0.88)]):
        z = 0.42 * scale
        bead(f"egg{i}", (x, y, z), 0.17 * scale, "bug-flesh-light", scale=(1, 0.94, 1.55),
             segments=28, rings=18)
        for j in range(4):
            a = j * math.tau / 4
            points = [(x + math.sin(a) * 0.10 * scale, y + math.cos(a) * 0.10 * scale, z - 0.19 * scale),
                      (x + math.sin(a) * 0.165 * scale, y + math.cos(a) * 0.165 * scale, z),
                      (x + math.sin(a) * 0.12 * scale, y + math.cos(a) * 0.12 * scale, z + 0.19 * scale),
                      (x + math.sin(a) * 0.015, y + math.cos(a) * 0.015, z + 0.265 * scale)]
            sweep(f"egg{i}_rib{j}", points, [0.014, 0.022, 0.023, 0.005],
                  token="bug-chitin-tan", sides=8)
        scute(f"egg{i}_cap", (x, y, z + 0.255 * scale), 0.075, 0.10, 0.025)
    # Central egg: six separate shell valves open around a recessed hatch.
    centre = (0.10, 0.13)
    bead("central_egg", (*centre, 0.65), 0.22, "bug-flesh", scale=(1, 1, 1.6),
         segments=32, rings=20)
    for i in range(6):
        a = i * math.tau / 6
        points = [(centre[0] + math.sin(a) * 0.12, centre[1] + math.cos(a) * 0.12, 0.46),
                  (centre[0] + math.sin(a) * 0.215, centre[1] + math.cos(a) * 0.215, 0.73),
                  (centre[0] + math.sin(a) * 0.20, centre[1] + math.cos(a) * 0.20, 1.00),
                  (centre[0] + math.sin(a) * 0.27, centre[1] + math.cos(a) * 0.27, 1.20)]
        sweep(f"hatch_valve{i}", points, [0.040, 0.09, 0.075, 0.004],
              [0.024, 0.026, 0.028, 0.002], "bug-chitin-dark", sides=10)
        sweep(f"hatch_valve_rim{i}", [(p[0], p[1], p[2] + 0.016) for p in points],
              [0.012, 0.016, 0.014, 0.002], token="bug-chitin-tan", sides=6)
    bead("hatch_throat", (*centre, 1.025), 0.17, "bug-chitin-black", scale=(1, 1, 0.15), segments=28, rings=12)
    bead("hatch_core", (*centre, 1.059), 0.116, "bug-bio-magenta", scale=(1, 1, 0.20), segments=24, rings=12)
    for side in (-1, 1):
        bead(f"brood_sac{side}", (side * 0.18, -0.25, 0.21), 0.025,
             "bug-bio-green", scale=(1, 1.5, 0.55))
    group_new(before, "brood_nest")
    socket("hatch", (centre[0], centre[1], 1.12))
    finish(1.4, 1.0, 1.0)
