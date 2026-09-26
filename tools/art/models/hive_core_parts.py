"""The Hive Assault's hive core (campaign arc §6.5), whole and damaged.

A russet heart mass caged in a crown of tall chitin ribs, with magenta
membrane windows, thin green veins, root arteries across a dark cavern
floor and ribbed eggs at its base. The damaged state has ribs snapped
off, the membrane torn open over one wound, the windows dulled and an
egg burst: the scene swaps it in once the core is below half its hit
points.

    floor     a low disc of dark rock the footprint's width, a green pool
    heart     a lathed, faceted mass; flesh-light bands frame its windows
    windows   magenta lenses on the heart (emissive), dulled when damaged
    veins     thin green lines down the heart and out along the roots
    roots     thick flesh arteries from the heart's base over the floor
    ribs      nine tall curved chitin ribs with tan rims, arching inward
    eggs      five ribbed eggs round the base; one burst when damaged

Coordinates use Blender world space, Z up, -Y forward. The core is built
at its real size in tiles (3 across, 2.5 tall) and `finish` normalises
it to exactly that. Follow docs/design/concepts/campaign/hive-core.png
and docs/design/kits/campaign-bestiary.md#hive-core.
"""

from __future__ import annotations

import math
import os
import random
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from crescent_geometry import bead, finish, mesh, sweep  # noqa: E402
from bpy_kit import cut_below  # noqa: E402

# ===========================================
# Proportions
# ===========================================

#: The finished model's height and its footprint (3×3 tiles).
HEIGHT = 2.5
SPREAD = 2.96
#: The floor disc's radius: it fills the footprint's inscribed circle.
FLOOR_RADIUS = 1.46
FLOOR_TOP = 0.07
#: The heart: its widest radius, its height and where its base sits.
HEART_RADIUS = 0.96
HEART_HEIGHT = 1.85
HEART_BASE = 0.02
#: The heart is lathed from this many sides and rings.
HEART_SIDES = 16
HEART_RINGS = 12
#: Ribs round the heart, and the ring they rise from.
RIBS = 9
RIB_FOOT = 1.22
RIB_TOP = 2.45


# ===========================================
# Heart
# ===========================================


def heart_radius(s: float) -> float:
    """The heart's radius at `s` from its base (0) to its crown (1): a
    narrow root, a full belly low down, and a rounded dome of a crown."""
    if s >= 1.0:
        return 0.0
    dome = math.sin(math.pi * max(s, 0.0) ** 0.75) ** 0.55
    return HEART_RADIUS * max(0.5 * (1 - s) ** 2, dome)


def heart_point(s: float, theta: float, scale: float = 1.0) -> Vector:
    """A point on (or off, with `scale`) the heart's surface. `theta` 0
    faces the front (-Y) and grows towards +X."""
    r = heart_radius(s) * scale
    return Vector((math.sin(theta) * r, -math.cos(theta) * r, HEART_BASE + s * HEART_HEIGHT))


def heart(rng) -> None:
    """The heart mass: a closed faceted lathe with a slightly lumpy skin."""
    vertices = []
    lumps = [[1.0 + rng.uniform(-0.035, 0.035) for _ in range(HEART_SIDES)]
             for _ in range(HEART_RINGS)]
    for j in range(HEART_RINGS):
        s = 0.02 + 0.96 * j / (HEART_RINGS - 1)
        for k in range(HEART_SIDES):
            theta = k * math.tau / HEART_SIDES + (0.5 * math.tau / HEART_SIDES) * (j % 2)
            vertices.append(tuple(heart_point(s, theta, lumps[j][k])))
    bottom = len(vertices)
    vertices.append((0.0, 0.0, HEART_BASE))
    top = len(vertices)
    vertices.append((0.0, 0.0, HEART_BASE + HEART_HEIGHT))
    faces = []
    for j in range(HEART_RINGS - 1):
        for k in range(HEART_SIDES):
            a = j * HEART_SIDES + k
            b = j * HEART_SIDES + (k + 1) % HEART_SIDES
            faces.append((a, b, b + HEART_SIDES, a + HEART_SIDES))
    for k in range(HEART_SIDES):
        faces.append((bottom, (k + 1) % HEART_SIDES, k))
        last = (HEART_RINGS - 1) * HEART_SIDES
        faces.append((top, last + k, last + (k + 1) % HEART_SIDES))
    mesh("heart", vertices, faces, "bug-flesh", smooth=False)


def lens(name, s_range, t_range, token, lift=1.035, depth=0.94, rows=2, cols=3):
    """A closed lens patch on the heart between two heights and two
    angles: the outer face just proud of the skin, the inner face sunk
    into it, so it reads as a window or a band without holes."""
    outer, inner = [], []
    for j in range(rows + 1):
        for i in range(cols + 1):
            u, v = i / cols, j / rows
            # Pinch the corners so the patch is an oval, not a square.
            squeeze = math.sin(math.pi * v) ** 0.5
            theta = t_range[0] + (t_range[1] - t_range[0]) * (0.5 + (u - 0.5) * max(squeeze, 0.08))
            s = s_range[0] + (s_range[1] - s_range[0]) * v
            outer.append(heart_point(s, theta, lift + 0.03 * math.sin(math.pi * u) * math.sin(math.pi * v)))
            inner.append(heart_point(s, theta, depth))
    return closed_patch(name, outer, inner, cols, rows, token)


def closed_patch(name, outer, inner, nu, nv, token):
    """Closes an outer and an inner grid into one watertight flat-shaded plate."""
    count = len(outer)
    vertices = [tuple(p) for p in outer] + [tuple(p) for p in inner]
    row = nu + 1

    def at(i, j, layer=0):
        return layer * count + j * row + i

    faces = []
    for j in range(nv):
        for i in range(nu):
            faces.append((at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)))
            faces.append((at(i, j, 1), at(i, j + 1, 1), at(i + 1, j + 1, 1), at(i + 1, j, 1)))
    for i in range(nu):
        faces.append((at(i, 0), at(i, 0, 1), at(i + 1, 0, 1), at(i + 1, 0)))
        faces.append((at(i, nv), at(i + 1, nv), at(i + 1, nv, 1), at(i, nv, 1)))
    for j in range(nv):
        faces.append((at(0, j), at(0, j + 1), at(0, j + 1, 1), at(0, j, 1)))
        faces.append((at(nu, j), at(nu, j, 1), at(nu, j + 1, 1), at(nu, j + 1)))
    return mesh(name, vertices, faces, token, smooth=False)


#: The windows: (centre height, height span, centre angle, angle span).
#: Two staggered rows round the upper belly, the largest at the front.
WINDOWS = [
    (0.5, 0.34, 0.0, 0.8),
    (0.46, 0.28, 1.0, 0.66),
    (0.46, 0.28, -1.0, 0.66),
    (0.5, 0.28, 2.05, 0.66),
    (0.5, 0.28, -2.05, 0.66),
    (0.47, 0.3, math.pi, 0.7),
    (0.76, 0.18, 0.52, 0.7),
    (0.76, 0.18, -0.52, 0.7),
    (0.77, 0.17, 1.6, 0.75),
    (0.77, 0.17, -1.6, 0.75),
    (0.78, 0.17, 2.66, 0.75),
    (0.78, 0.17, -2.66, 0.75),
]


def windows(damaged: bool) -> None:
    """Membrane windows framed by flesh-light bands. Damaged, the glow is
    dulled to flesh on all but the torn front wound and two others."""
    for n, (s, span, theta, width) in enumerate(WINDOWS):
        frame = (s - span * 0.62, s + span * 0.62)
        lens(f"band{n}", frame, (theta - width * 0.62, theta + width * 0.62),
             "bug-flesh-light", lift=1.045, depth=0.9)
        if damaged and n == 0:
            continue  # the wound: see `wound`
        lit = not damaged or n in (3, 7)
        lens(f"window{n}", (s - span / 2, s + span / 2), (theta - width / 2, theta + width / 2),
             "bug-bio-magenta" if lit else "bug-flesh", lift=1.075, depth=0.95)


def wound(rng) -> None:
    """The damaged core's torn membrane at the front: a ragged flap
    peeled down, and the magenta interior bulging through the tear."""
    s, span, theta, width = WINDOWS[0]
    bead("wound_glow", tuple(heart_point(s, theta, 0.95)), 0.34, "bug-bio-magenta",
         scale=(1.3, 0.6, 1.15), segments=12, rings=8)
    # Torn flaps round the rim, hanging open.
    for k in range(7):
        a = theta - width * 0.55 + k * width * 1.1 / 6
        base = heart_point(s + span * 0.55, a, 1.03)
        droop = heart_point(s + span * rng.uniform(-0.1, 0.25), a + rng.uniform(-0.05, 0.05), 1.22)
        tip = heart_point(s - span * rng.uniform(0.0, 0.3), a, 1.3)
        sweep(f"flap{k}", [tuple(base), tuple(droop), tuple(tip)], [0.07, 0.05, 0.012],
              [0.02, 0.018, 0.008], token="bug-flesh-light", sides=5, smooth=False)


def veins(rng, damaged: bool) -> None:
    """Thin green lines down the heart from the crown to the roots."""
    count = 5 if damaged else 8
    for k in range(count):
        theta = k * math.tau / count + rng.uniform(-0.12, 0.12)
        points, drift = [], 0.0
        for j in range(5):
            s = 0.8 - j * 0.17
            drift += rng.uniform(-0.1, 0.1)
            points.append(tuple(heart_point(max(s, 0.03), theta + drift, 1.03)))
        token = "bug-bio-green" if not damaged or k % 3 == 0 else "bug-bio-green-dim"
        sweep(f"vein{k}", points, [0.005, 0.007, 0.008, 0.008, 0.007],
              token=token, sides=4, smooth=False)


# ===========================================
# Ribs
# ===========================================


def rib_path(angle: float, height: float, lean: float) -> list[Vector]:
    """A rib's spine: up from the floor outside the heart, bowing out,
    then curling in over the crown. `lean` is how far the tip reaches in."""
    out = Vector((math.sin(angle), -math.cos(angle), 0.0))
    points = []
    for j in range(8):
        t = j / 7
        r = RIB_FOOT + 0.12 * math.sin(math.pi * t * 0.9) - lean * t ** 1.8
        z = height * (t ** 0.92)
        points.append(out * r + Vector((0.0, 0.0, z)))
    return points


def ribs(rng, damaged: bool) -> None:
    """Nine tall curved ribs, alternating chitin tones, each with a tan
    rim on its outer edge. Damaged, four snap off partway, one lies bent
    outwards, and the stumps end in jagged points."""
    broken = {1: 0.45, 3: 0.6, 5: 0.38, 7: 0.55}
    for k in range(RIBS):
        angle = (k + 0.5) * math.tau / RIBS + rng.uniform(-0.06, 0.06)
        height = RIB_TOP * (0.86 + 0.14 * ((k * 5) % RIBS) / RIBS)
        lean = 0.5 + rng.uniform(-0.04, 0.06)
        path = rib_path(angle, height, lean)
        widths = [0.16, 0.17, 0.16, 0.14, 0.12, 0.09, 0.055, 0.012]
        depths = [0.1, 0.11, 0.1, 0.09, 0.075, 0.06, 0.04, 0.01]
        if damaged and k in broken:
            keep = max(3, round(len(path) * broken[k]))
            path = path[:keep]
            widths = widths[:keep - 1] + [widths[keep - 1] * 0.55]
            depths = depths[:keep - 1] + [depths[keep - 1] * 0.5]
            # A jagged break: the last point kicked sideways.
            side = Vector((math.cos(angle), math.sin(angle), 0.0)) * 0.05
            path[-1] = path[-1] + side + Vector((0, 0, 0.06))
        if damaged and k == 4:
            # Bent outwards and down, cracked at its knee.
            path = [p if j < 3 else p + Vector((math.sin(angle), -math.cos(angle), 0.0)) * (0.25 * (j - 2))
                    - Vector((0, 0, 0.12 * (j - 2))) for j, p in enumerate(path)]
        token = "bug-chitin-dark" if k % 2 else "bug-chitin-mid"
        body = sweep(f"rib{k}", [tuple(p) for p in path], widths, depths, token=token,
                     sides=6, smooth=False)[0]
        cut_below(body)
        out = Vector((math.sin(angle), -math.cos(angle), 0.0))
        rim = [tuple(p + out * (d * 0.8) + Vector((0, 0, 0.02))) for p, d in zip(path, depths)]
        sweep(f"rib{k}_rim", rim[1:], [max(w * 0.28, 0.008) for w in widths[1:]],
              [0.02] * (len(rim) - 1), token="bug-chitin-tan", sides=4, smooth=False)
    if damaged:
        # The snapped-off pieces lying on the floor.
        for n, k in enumerate((1, 5)):
            angle = (k + 0.5) * math.tau / RIBS + 0.4
            out = Vector((math.sin(angle), -math.cos(angle), 0.0))
            side = Vector((-out.y, out.x, 0.0))
            start = out * 1.05 + Vector((0, 0, 0.1))
            shard = [start, start + side * 0.3 + Vector((0, 0, 0.05)),
                     start + side * 0.62 + out * 0.08 + Vector((0, 0, 0.08))]
            sweep(f"shard{n}", [tuple(p) for p in shard], [0.1, 0.08, 0.02], [0.06, 0.05, 0.015],
                  token="bug-chitin-dark", sides=6, smooth=False)


# ===========================================
# Roots, eggs and floor
# ===========================================


def roots(rng) -> None:
    """Thick flesh arteries from the heart's base out across the floor,
    forking, each with a thin green vein along its back."""
    count = 11
    for k in range(count):
        a = k * math.tau / count + rng.uniform(-0.15, 0.15)
        out = Vector((math.sin(a), -math.cos(a), 0.0))
        side = Vector((-out.y, out.x, 0.0))
        bend = rng.uniform(-0.18, 0.18)
        start = heart_point(0.12, a, 0.85)
        reach = FLOOR_RADIUS - 0.08 + rng.uniform(-0.05, 0.02)
        points = [start,
                  out * (HEART_RADIUS * 0.95) + Vector((0, 0, FLOOR_TOP + 0.09)),
                  out * (reach * 0.72) + side * bend + Vector((0, 0, FLOOR_TOP + 0.05)),
                  out * reach + side * bend * 1.8 + Vector((0, 0, FLOOR_TOP + 0.015))]
        sweep(f"root{k}", [tuple(p) for p in points], [0.13, 0.1, 0.06, 0.018],
              [0.11, 0.08, 0.045, 0.014], token="bug-flesh", sides=7, smooth=False)
        vein = [p + Vector((0, 0, w * 0.9)) for p, w in zip(points[1:], (0.08, 0.045, 0.014))]
        sweep(f"root{k}_vein", [tuple(p) for p in vein], [0.009, 0.008, 0.004],
              token="bug-bio-green", sides=4, smooth=False)
        if k % 2 == 0:
            fork = points[2]
            twig = side * (0.2 if k % 4 else -0.2)
            sweep(f"root{k}_fork", [tuple(fork), tuple(fork + out * 0.14 + twig * 0.5),
                                    tuple(fork + out * 0.26 + twig + Vector((0, 0, -0.02)))],
                  [0.04, 0.026, 0.01], token="bug-flesh", sides=6, smooth=False)


def egg(name, at, size, rng, burst=False) -> None:
    """A ribbed egg at the base: a russet ovoid with tan ribs; a burst
    one is split open with its lining showing."""
    x, y = at
    centre = (x, y, FLOOR_TOP + size * 1.15)
    bead(name, centre, size, "bug-flesh-light" if burst else "bug-flesh",
         scale=(1, 1, 1.4 if not burst else 0.8), segments=8, rings=6)
    ribs_count = 4
    for i in range(ribs_count):
        a = i * math.tau / ribs_count + rng.uniform(-0.1, 0.1)
        arc = []
        for j in range(4):
            polar = math.pi * (0.12 + 0.25 * j)
            reach = size * (1.02 if not burst else 1.25)
            rise = size * (1.4 if not burst else 0.8) * (1.4 if burst and j < 2 else 1.0)
            arc.append((x + math.sin(a) * math.sin(polar) * reach,
                        y - math.cos(a) * math.sin(polar) * reach,
                        centre[2] + math.cos(polar) * rise))
        sweep(f"{name}_rib{i}", arc, [0.012, 0.02, 0.02, 0.012],
              token="bug-chitin-tan", sides=4, smooth=False)


def eggs(rng, damaged: bool) -> None:
    """Five eggs round the base, clustered at the front and sides."""
    spots = [(-0.95, -0.72, 0.17), (-0.7, -0.98, 0.12), (0.98, -0.62, 0.16),
             (1.05, 0.55, 0.13), (-1.1, 0.45, 0.14)]
    for n, (x, y, size) in enumerate(spots):
        egg(f"egg{n}", (x, y), size, rng, burst=damaged and n == 2)


def floor(rng) -> None:
    """The footprint's own ground: a low disc of dark rock with a
    chamfered rim, a green-dim pool at the front and a few stones."""
    n = 24
    ring = [(math.sin(i * math.tau / n) * FLOOR_RADIUS * (1 + rng.uniform(-0.012, 0.012)),
             -math.cos(i * math.tau / n) * FLOOR_RADIUS * (1 + rng.uniform(-0.012, 0.012)))
            for i in range(n)]
    disc("floor", ring, 0.0, FLOOR_TOP, FLOOR_TOP - 0.015, "bug-chitin-black")
    pool = []
    for i in range(12):
        a = i * math.tau / 12
        r = 0.36 * (1 + 0.25 * math.sin(3 * a) + rng.uniform(-0.05, 0.05))
        pool.append((0.3 + math.sin(a) * r * 1.4, -1.0 - math.cos(a) * r * 0.55))
    disc("pool", pool, FLOOR_TOP - 0.01, FLOOR_TOP + 0.012, FLOOR_TOP + 0.008, "bug-bio-green-dim")
    for i in range(7):
        a = i * math.tau / 7 + rng.uniform(0.1, 0.6)
        r = FLOOR_RADIUS - 0.2 + rng.uniform(-0.1, 0.05)
        stone(f"stone{i}", (math.sin(a) * r, -math.cos(a) * r), 0.06 + rng.uniform(0.0, 0.05), rng)


def disc(name, ring, z0, z_centre, z_edge, token) -> None:
    """A closed low dome over an outline: flat underside at `z0`, raised centre."""
    n = len(ring)
    cx = sum(x for x, _ in ring) / n
    cy = sum(y for _, y in ring) / n
    vertices = [(cx, cy, z_centre)] + [(x, y, z_edge) for x, y in ring] + [(x, y, z0) for x, y in ring]
    vertices.append((cx, cy, z0))
    bottom = len(vertices) - 1
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    faces += [(1 + i, 1 + n + i, 1 + n + (i + 1) % n, 1 + (i + 1) % n) for i in range(n)]
    faces += [(bottom, 1 + n + (i + 1) % n, 1 + n + i) for i in range(n)]
    mesh(name, vertices, faces, token, smooth=False)


def stone(name, at, size, rng) -> None:
    """A faceted lump of cavern rock sitting on the floor."""
    x, y = at
    base, top = [], []
    for i in range(5):
        a = i * math.tau / 5 + rng.uniform(-0.2, 0.2)
        r = size * rng.uniform(0.8, 1.2)
        base.append((x + math.sin(a) * r, y - math.cos(a) * r, FLOOR_TOP - 0.01))
        r *= 0.6
        top.append((x + math.sin(a) * r, y - math.cos(a) * r, FLOOR_TOP + size * rng.uniform(0.7, 1.1)))
    vertices = base + top
    faces = [tuple(reversed(range(5))), tuple(range(5, 10))]
    faces += [(i, (i + 1) % 5, 5 + (i + 1) % 5, 5 + i) for i in range(5)]
    mesh(name, vertices, faces, "env-rock", smooth=False)


# ===========================================
# Builder
# ===========================================


def build_hive_core(damaged: bool = False) -> None:
    """The hive core on its 3×3 floor, whole or badly damaged."""
    rng = random.Random(0x41CE if damaged else 0x41CD)
    floor(rng)
    heart(rng)
    windows(damaged)
    if damaged:
        wound(rng)
    veins(rng, damaged)
    roots(rng)
    ribs(rng, damaged)
    eggs(rng, damaged)
    finish(HEIGHT, SPREAD, SPREAD)
