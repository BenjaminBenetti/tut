"""One brown bug family, with species-specific silhouettes and shared anatomy.

Reproducible authored replacements for all four original bugs (the brute
lives in brute_parts.py since #1134, authored at its 2×2 footprint). The swarmer
follows the approved brown Crescent concept; the other classes inherit its
materials and joint anatomy without repeating its crescent silhouette. Limb node names
are the UnitMotionRig contract. See docs/design/kits/crescent-bugs.md.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import bead, finish, growth_ridges, group_new, hooked_blade, joint_origin, mesh, rim, scute, shell, sweep
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
# Lurker: exposed spearhead, arched neck, raised feelers and long sickles
# ===========================================


def build_lurker() -> None:
    """A lean mantis with an exposed wedge face and no enclosing hood."""
    before = set(mesh_objects())
    sweep("thorax", [(0, 0.11, 0.50), (0, 0.07, 0.70), (0, -0.04, 0.90), (0, -0.20, 1.055)],
          [0.10, 0.075, 0.084, 0.067], [0.105, 0.08, 0.08, 0.06],
          token="bug-flesh", sides=18)
    for i in range(5):
        z, y = 0.58 + i * 0.085, 0.092 - i * 0.035
        _, edge = shell(f"thorax_ring{i}", (0, y, z), 0.10 - i * 0.007, 0.11, 0.055,
                        "bug-chitin-dark", thickness=0.015, segments=24, rings=4)
        rim(f"thorax_rim{i}", edge, 0.007, "bug-chitin-mid")
        scute(f"spine_mark{i}", (0, y + 0.02, z + 0.055), 0.054, 0.078, 0.015)
    abdomen("tail", (0, 0.20, 0.48), 5, 0.13, 0.11, 0.067)
    for side in (-1, 1):
        # Thin backward shoulder fins emphasize its narrow, open chest.
        sweep(f"shoulder_fin{side}", [(side * 0.08, -0.065, 0.89),
              (side * 0.14, 0.035, 1.02), (side * 0.10, 0.17, 1.08)],
              [0.035, 0.047, 0.002], [0.012, 0.018, 0.001], token="bug-chitin-mid", sides=10)
        vents(f"gill{side}", (side * 0.074, -0.08, 0.875), 0.019, side, "bug-bio-magenta")
    group_new(before, "carapace")
    # The face itself is a tapered wedge, rather than a small head under a hat.
    head_start = set(mesh_objects())
    face((0, -0.24, 1.04), 0.115, "bug-bio-magenta")
    sweep("face_wedge", [(0, -0.15, 1.065), (0, -0.25, 1.095), (0, -0.405, 1.015)],
          [0.052, 0.145, 0.018], [0.04, 0.052, 0.021], "bug-chitin-dark", sides=10)
    scute("brow_keel", (0, -0.25, 1.144), 0.076, 0.16, 0.022, tilt=0.22)
    for side in (-1, 1):
        sweep(f"cheek_plate{side}", [(side * 0.14, -0.24, 1.097),
              (side * 0.09, -0.335, 1.06), (side * 0.018, -0.407, 1.02)],
              [0.009, 0.014, 0.004], token="bug-chitin-tan", sides=6)
        sweep(f"feeler{side}", [(side * 0.075, -0.17, 1.09),
              (side * 0.13, -0.095, 1.21), (side * 0.15, 0.005, 1.26)],
              [0.014, 0.009, 0.002], token="bug-chitin-black", sides=8)
        bead(f"temple_eye{side}", (side * 0.135, -0.28, 1.092), 0.025,
             "bug-bio-magenta", scale=(0.7, 1, 0.7), segments=14, rings=10)
    group_new(head_start, "head")
    for side in (-1, 1):
        label = "l" if side < 0 else "r"
        limb(f"leg_{label}0", [(side * 0.075, 0.055, 0.59), (side * 0.20, -0.09, 0.37),
                              (side * 0.145, -0.09, 0.10), (side * 0.20, -0.22, 0.015)], 0.033)
        limb(f"leg_{label}1", [(side * 0.08, 0.15, 0.56), (side * 0.24, 0.31, 0.45),
                              (side * 0.25, 0.28, 0.12), (side * 0.31, 0.42, 0.015)], 0.036)
        wrist = (side * 0.31, -0.345, 0.88)
        forearm(f"scythe_{label}", (side * 0.07, -0.07, 0.89), (side * 0.27, -0.11, 1.005), wrist,
                [wrist, (side * 0.38, -0.46, 0.77), (side * 0.42, -0.53, 0.57),
                 (side * 0.38, -0.56, 0.34), (side * 0.27, -0.49, 0.13)],
                [0.038, 0.066, 0.077, 0.049, 0.001], 0.044)
    finish(1.3, 0.95, 1.05)


# ===========================================
# Egg spawner: asymmetric clustered brood sacs, root web and soft hatch lips
# ===========================================


def brood_egg(name, at, radius, height):
    """An ovoid membrane anchored by six grown ribs, without a shield motif."""
    x, y, z = at
    bead(name, at, radius, "bug-flesh-light", scale=(1, 0.93, height / radius),
         segments=28, rings=18)
    for j in range(6):
        a = j * math.tau / 6
        points = []
        for k in range(9):
            theta = 0.19 + k * (math.pi - 0.38) / 8
            r = radius * math.sin(theta) * 1.015
            points.append((x + math.sin(a) * r, y + math.cos(a) * r * 0.93,
                           z - math.cos(theta) * height))
        sweep(f"{name}_rib{j}", points, [0.009 + 0.007 * math.sin(k * math.pi / 8) for k in range(9)],
              token="bug-chitin-tan", sides=6)
    scute(name + "_cap", (x, y, z + height * 0.97), radius * 0.45, radius * 0.6, 0.025)


def build_egg_spawner() -> None:
    """A rooted cluster of eggs with a fleshy central hatch, no crescent base or crown."""
    before = set(mesh_objects())
    # Organic root web: several low lobes instead of a single manufactured disc.
    bead("brood_mound", (0, 0.05, 0.15), 0.36, "bug-flesh", scale=(1.12, 1.05, 0.34),
         segments=28, rings=16)
    for i in range(9):
        a = i * math.tau / 9
        points = [(math.sin(a) * 0.14, math.cos(a) * 0.14, 0.18),
                  (math.sin(a + 0.15) * 0.36, math.cos(a + 0.15) * 0.37, 0.08),
                  (math.sin(a + 0.05) * 0.50, math.cos(a + 0.05) * 0.50, 0.015)]
        sweep(f"root{i}", points, [0.058, 0.038, 0.004], token="bug-chitin-dark", sides=10)
        scute(f"root_scale{i}", (points[1][0], points[1][1], 0.103), 0.064, 0.09, 0.018,
              "bug-chitin-mid")
    for i, (x, y, radius, height) in enumerate([(-0.25, -0.20, 0.20, 0.31),
                                               (0.24, -0.24, 0.16, 0.245),
                                               (-0.24, 0.22, 0.17, 0.38),
                                               (0.28, 0.24, 0.17, 0.29)]):
        brood_egg(f"egg{i}", (x, y, 0.12 + height), radius, height)
    centre = (0.04, 0.05)
    bead("hatch_bulb", (*centre, 0.51), 0.245, "bug-flesh", scale=(1, 1, 1.28),
         segments=32, rings=20)
    # Four rounded valves peel outwards from a short bulb, like an opening egg.
    for i in range(4):
        a = i * math.tau / 4 + math.pi / 4
        points = [(centre[0] + math.sin(a) * 0.10, centre[1] + math.cos(a) * 0.10, 0.33),
                  (centre[0] + math.sin(a) * 0.20, centre[1] + math.cos(a) * 0.20, 0.58),
                  (centre[0] + math.sin(a) * 0.20, centre[1] + math.cos(a) * 0.20, 0.81),
                  (centre[0] + math.sin(a) * 0.29, centre[1] + math.cos(a) * 0.29, 0.89)]
        sweep(f"hatch_lobe{i}", points, [0.05, 0.09, 0.10, 0.045],
              [0.03, 0.045, 0.045, 0.03], "bug-chitin-mid", sides=12)
        sweep(f"hatch_rib{i}", [(p[0], p[1], p[2] + 0.015) for p in points],
              [0.010, 0.018, 0.020, 0.012], token="bug-chitin-tan", sides=8)
    bead("hatch_throat", (*centre, 0.816), 0.17, "bug-chitin-black", scale=(1, 1, 0.15), segments=28, rings=12)
    bead("hatch_core", (*centre, 0.846), 0.105, "bug-bio-magenta", scale=(1, 1, 0.17), segments=24, rings=12)
    for side in (-1, 1):
        bead(f"brood_sac{side}", (side * 0.10, -0.31, 0.20), 0.028,
             "bug-bio-green", scale=(1, 1.5, 0.65))
    group_new(before, "brood_nest")
    socket("hatch", (centre[0], centre[1], 0.90))
    finish(1.4, 1.1, 1.1)
