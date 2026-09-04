"""Bug builders: swarmer, lurker, brute and the egg spawner (style guide §3 silhouettes,
§4.2 palette; concept sheets under ``docs/design/concepts/``).

Sharp, bladed, chitinous: dark chitin plates, bone blade edges, small bright
bioluminescence (green for swarmer and brute, magenta for lurker, both on the
spawner). Organic masses are smooth-shaded spheres; plates and blades are
chamfered boxes. Bugs face -Y like everything else.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cut_below, cylinder, socket, sphere  # noqa: E402


def plate(name, size, at, token="bug-chitin-dark", rot=(0, 0, 0), chamfer=0.015):
    """Chamfered chitin plate."""
    return bevel(box(name, size, at, token, rot), chamfer)


def blade(name, length, at, rot, token_back="bug-chitin-black"):
    """A scythe blade: dark chamfered back with a bone edge strip along -Y.

    ``rot`` orients the blade; it lies along local -Y from ``at`` (its root).
    """
    plate(f"{name}_back", (0.05, length, 0.12), at, token_back, rot, chamfer=0.012)
    box(f"{name}_edge", (0.06, length * 0.96, 0.03), at, "bug-bone", rot)


def leg(name, at, yaw, splay, length=0.3, thickness=0.05, token="bug-chitin-dark"):
    """An insect leg: coxa angled out and down from ``at``, tibia down to the ground."""
    up = length * 0.5
    box(f"{name}_coxa", (thickness, thickness, length), (at[0] + math.sin(yaw) * up * 0.7, at[1] + math.cos(yaw) * up * 0.7, at[2] - up * 0.3), token,
        rot=(math.cos(yaw) * splay, -math.sin(yaw) * splay, 0))
    box(f"{name}_tibia", (thickness * 0.8, thickness * 0.8, length * 0.9), (at[0] + math.sin(yaw) * length * 1.05, at[1] + math.cos(yaw) * length * 1.05, max(at[2] - length * 0.9, length * 0.4)), token,
        rot=(math.cos(yaw) * splay * 0.4, -math.sin(yaw) * splay * 0.4, 0))


# ===========================================
# Swarmer: low wedge, six legs, short blades, green eyes (0.5 u)
# ===========================================


def build_swarmer() -> None:
    """Fast low wedge: abdomen behind, thorax, low head with blades, dorsal spines."""
    sphere("abdomen", 0.2, (0, 0.28, 0.24), "bug-chitin-mid", segments=8, rings=5, scale=(0.75, 1.3, 0.8), smooth=True)
    plate("thorax", (0.32, 0.4, 0.22), (0, -0.02, 0.26), "bug-chitin-dark", chamfer=0.03)
    plate("collar", (0.26, 0.2, 0.18), (0, -0.26, 0.2), "bug-chitin-mid", chamfer=0.02)
    plate("head", (0.18, 0.2, 0.13), (0, -0.44, 0.13), "bug-chitin-dark", chamfer=0.02)
    for side in (-1, 1):
        box(f"eye_{'l' if side < 0 else 'r'}", (0.06, 0.02, 0.05), (side * 0.05, -0.54, 0.15), "bug-bio-green")
        box(f"eye2_{'l' if side < 0 else 'r'}", (0.035, 0.02, 0.03), (side * 0.09, -0.52, 0.11), "bug-bio-green")
        blade(f"blade_{'l' if side < 0 else 'r'}", 0.3, (side * 0.14, -0.55, 0.1), (math.radians(35), 0, side * math.radians(12)))
        for i, y in enumerate((-0.2, 0.0, 0.18)):
            leg(f"leg_{'l' if side < 0 else 'r'}{i}", (side * 0.14, y, 0.2), side * math.radians(90 - 25 * (i - 1)), math.radians(45))
    # Dorsal glow and crest carry the whole read at 64 px per tile: a 0.5 u bug
    # on dark asphalt is 32 px of near-black chitin, and a 0.02 u vein is
    # sub-pixel. Wider, not brighter — bioluminescence stays small and hard
    # (style guide §4.2), and the bone crest is what separates the silhouette
    # from the ground.
    for i, y in enumerate((-0.16, 0.0, 0.16)):
        box(f"vein_{i}", (0.05, 0.09, 0.02), (0, y, 0.38), "bug-bio-green")
    # Segmented, not one slab: four tapering plates read as a spined back both
    # at 64 px and in a close-up render, where a single bone box looked like a
    # backpack.
    for i, (y, w) in enumerate(((-0.2, 0.19), (-0.02, 0.16), (0.16, 0.12))):
        box(f"crest_{i}", (w, 0.11, 0.02), (0, y, 0.375), "bug-bone")
    for i, y in enumerate((0.3, 0.12, -0.06)):
        cylinder(f"spine_{i}", 0.0, 0.06, 0.16, 4, (0, y, 0.42 - i * 0.02), "bug-bone", rot=(math.radians(-20), 0, 0))


# ===========================================
# Lurker: tall, thin, forward-leaning stalker with scythe arms (1.3 u)
# ===========================================


def build_lurker() -> None:
    """Question-mark silhouette: long legs, narrow waist, hooded head, two long scythes."""
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        x = side * 0.12
        plate(f"thigh_{s}", (0.09, 0.12, 0.42), (x, 0.08, 0.62), "bug-chitin-dark", rot=(math.radians(-20), 0, 0), chamfer=0.01)
        plate(f"shin_{s}", (0.08, 0.09, 0.5), (x, -0.04, 0.25), "bug-chitin-dark", rot=(math.radians(12), 0, 0), chamfer=0.01)
        plate(f"foot_{s}", (0.1, 0.18, 0.05), (x, -0.1, 0.025), "bug-chitin-black", chamfer=0.008)
        box(f"claw_{s}", (0.03, 0.08, 0.03), (x, -0.2, 0.02), "bug-bone")
    plate("waist", (0.16, 0.14, 0.2), (0, 0, 0.85), "bug-chitin-mid", chamfer=0.015)
    plate("chest", (0.3, 0.22, 0.34), (0, -0.08, 1.03), "bug-chitin-dark", rot=(math.radians(-20), 0, 0), chamfer=0.02)
    sphere("hood", 0.11, (0, -0.2, 1.24), "bug-chitin-dark", segments=8, rings=5, scale=(0.9, 1.3, 1.0), smooth=True)
    box("slit", (0.14, 0.02, 0.035), (0, -0.32, 1.2), "bug-bio-magenta")
    box("hood_crest", (0.03, 0.2, 0.02), (0, -0.16, 1.34), "bug-bone")
    box("spine_glow", (0.06, 0.02, 0.34), (0, 0.06, 1.02), "bug-bio-magenta")
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        plate(f"upper_arm_{s}", (0.07, 0.08, 0.42), (side * 0.2, -0.3, 1.08), "bug-chitin-mid", rot=(math.radians(-65), 0, 0), chamfer=0.01)
        blade(f"scythe_{s}", 0.7, (side * 0.24, -0.5, 1.15), (math.radians(20), 0, side * math.radians(-6)))
    cylinder("tail", 0.02, 0.07, 0.6, 6, (0, 0.34, 0.72), "bug-chitin-dark", rot=(math.radians(110), 0, 0))
    for i in range(3):
        box(f"tail_glow_{i}", (0.035, 0.07, 0.035), (0, 0.24 + i * 0.12, 0.79 - i * 0.05), "bug-bio-magenta")


# ===========================================
# Brute: armoured dome with cleaver blades (1.8 u)
# ===========================================


def build_brute() -> None:
    """Boulder carapace, head sunk into the chest, spikes, two cleavers dragging."""
    sphere("carapace", 0.5, (0, 0, 1.05), "bug-chitin-dark", segments=10, rings=6, scale=(0.95, 1.0, 1.3), smooth=True)
    sphere("carapace_ridge", 0.36, (0, 0.05, 1.35), "bug-chitin-mid", segments=8, rings=5, scale=(1.0, 1.0, 0.8), smooth=True)
    plate("head", (0.34, 0.3, 0.28), (0, -0.5, 0.72), "bug-chitin-dark", chamfer=0.02)
    box("eye_slit", (0.28, 0.02, 0.055), (0, -0.66, 0.76), "bug-bio-green")
    box("seam", (0.9, 0.06, 0.06), (0, -0.3, 0.55), "bug-flesh")
    for side in (-1, 1):
        s = "l" if side < 0 else "r"
        for i, y in enumerate((-0.22, 0.2)):
            plate(f"leg_{s}{i}", (0.22, 0.24, 0.42), (side * 0.3, y, 0.21), "bug-chitin-dark", chamfer=0.015)
        plate(f"arm_{s}", (0.24, 0.26, 0.5), (side * 0.5, -0.2, 0.55), "bug-chitin-mid", chamfer=0.02)
        plate(f"cleaver_{s}", (0.1, 0.7, 0.16), (side * 0.46, -0.4, 0.08), "bug-chitin-black", chamfer=0.012)
        box(f"cleaver_edge_{s}", (0.11, 0.68, 0.05), (side * 0.46, -0.42, 0.02), "bug-bone")
        box(f"flesh_{s}", (0.06, 0.2, 0.3), (side * 0.36, -0.18, 0.5), "bug-flesh")
    # A bone ridge down the carapace: at 64 px per tile the brute is a dark
    # boulder against dark ground, and the spikes alone read as noise rather
    # than as an edge.
    for i, (y, w) in enumerate(((-0.34, 0.26), (-0.12, 0.3), (0.1, 0.26), (0.3, 0.18))):
        box(f"ridge_{i}", (w, 0.13, 0.03), (0, y, 1.68), "bug-bone")
    for i, y in enumerate((-0.23, -0.01, 0.2)):
        box(f"vent_{i}", (0.16, 0.06, 0.02), (0, y, 1.67), "bug-bio-green")
    for i, (x, y, z) in enumerate([(0, 0, 1.82), (-0.2, 0.15, 1.7), (0.2, 0.15, 1.7), (-0.3, -0.2, 1.5), (0.3, -0.2, 1.5)]):
        cylinder(f"spike_{i}", 0.0, 0.08, 0.25, 4, (x, y, z), "bug-bone", rot=(math.radians(-15 * (i % 2)), 0, 0))


# ===========================================
# Egg spawner: fleshy mound, eggs, hatch stalk (1.4 u), socket_hatch
# ===========================================


def build_egg_spawner() -> None:
    """Mound with three eggs and one split glowing egg, a stalk with a hatch, veins."""
    cylinder("pool", 0.55, 0.55, 0.02, 12, (0, 0, 0.01), "bug-bio-green-dim")
    cut_below(sphere("mound", 0.5, (0, 0, 0.15), "bug-flesh", segments=10, rings=6, scale=(1.0, 1.0, 0.8), smooth=True))
    cylinder("stalk", 0.12, 0.2, 0.7, 8, (0, 0, 0.85), "bug-flesh")
    cylinder("hatch", 0.2, 0.2, 0.1, 8, (0, 0, 1.25), "bug-chitin-dark")
    cylinder("hatch_glow", 0.12, 0.12, 0.04, 8, (0, 0, 1.32), "bug-bio-magenta")
    socket("hatch", (0, 0, 1.4))
    plate("ridge_0", (0.08, 0.5, 0.14), (-0.25, 0.1, 0.45), "bug-chitin-dark", rot=(0, 0, 0.4), chamfer=0.01)
    plate("ridge_1", (0.08, 0.4, 0.14), (0.2, 0.3, 0.42), "bug-chitin-dark", rot=(0, 0, -0.7), chamfer=0.01)
    for i, (x, y) in enumerate([(-0.28, -0.2), (0.28, 0.22), (-0.22, 0.28)]):
        sphere(f"egg_{i}", 0.18, (x, y, 0.5), "bug-flesh-light", segments=8, rings=6, scale=(1, 1, 1.4), smooth=True)
    sphere("egg_split", 0.18, (0.28, -0.24, 0.5), "bug-flesh-light", segments=8, rings=6, scale=(1, 1, 0.9), smooth=True)
    sphere("egg_core", 0.11, (0.28, -0.24, 0.66), "bug-bio-magenta", segments=8, rings=6)
    for i, (at, rot) in enumerate([((0, -0.3, 0.46), (0, 0, 0.6)), ((-0.3, 0.05, 0.4), (0, 0, 1.4)), ((0.15, 0.3, 0.44), (0, 0, -0.5))]):
        box(f"vein_{i}", (0.025, 0.4, 0.025), at, "bug-bio-green", rot=rot)
