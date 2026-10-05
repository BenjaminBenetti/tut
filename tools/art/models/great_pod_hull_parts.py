"""Skyfall's great pod hull (#1238): the wall modules ringing the pod.

The great pod is the crash site's spore pod grown into a structure 17
tiles across. Its hull is a ring of one-tile modules placed edge to edge:
the spore pod's charred husk outside, russet flesh inside.

    outer side   two staves of cracked chitin plates per tile, black and
                 walnut in a checkerboard, tan lips, magenta in every crack
    inner side   russet membrane over the core, chitin ribs, a green vein
    core         one closed loft whose cross-section is identical at every
                 join, so neighbouring modules meet without a gap
    seam         the soft spot: the staves part down the middle and the
                 magenta tissue bulges out of the split on both faces

    outer face (-Y), one straight module       cross-section at every join
      x=-0.5        x=0        x=+0.5           z
         ┆ ╱╲        ┆   ╱╲     ┆           2.5 ┤   ╭─╮  ridge leans in
         ┆┌──┐      ┆  ┌──┐    ┆               │  ╱   ╲
         ┆│  │      ┆  ├──┤    ┆           1.5 ┤ ╱     │ inner (+Y):
         ┆├──┤      ┆  │  │    ┆               │ │     │ membrane, ribs
         ┆│  │      ┆  ├──┤    ┆           0.5 ┤ │     │
         ┆└──┘      ┆  └──┘    ┆           0.0 ┴─┴─────┴──
         half seam  seam  half seam             +0.29  -0.28   o (outward)

Straight modules run along X and join at local X ±0.5, armour on -Y.
The curve joins east (+X) and north (+Y) along a quarter circle about the
tile's north-east corner, armour on its convex south-west side. glTF
exports north to -Z. Everything stays inside its tile.

A point on the hull is (t, z, o): `t` 0..1 along the module's run, `z`
up, and `o` the offset along the run's outward normal (+o is armour).
"""

from __future__ import annotations

import math
import os
import random
import sys
from dataclasses import dataclass
from typing import Callable

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
from bpy_kit import cut_below, join, mesh_objects  # noqa: E402
from crescent_geometry import bead, mesh, sweep  # noqa: E402
from spore_pod_parts import patch  # noqa: E402

# ===========================================
# Cross-section
# ===========================================

#: The core's closed cross-section as (o, z), anticlockwise from the
#: outer foot: the armoured face curving in, the ridge, the inner face.
PROFILE = [
    (0.29, 0.0), (0.295, 0.55), (0.272, 1.1), (0.22, 1.6), (0.135, 2.0), (0.034, 2.32),
    (-0.06, 2.47),
    (-0.153, 2.36), (-0.212, 2.0), (-0.255, 1.4), (-0.272, 0.7), (-0.28, 0.0),
]
#: The outer (armoured) face as (z, o), bottom to top.
OUTER_FACE = [(z, o) for o, z in PROFILE[:6]]
#: The inner (flesh) face as (z, o), bottom to top.
INNER_FACE = [(z, o) for o, z in reversed(PROFILE[7:])]
#: Seams between staves, and cracks between the plates of one stave.
SEAM = 0.04
CRACK = 0.032
#: How far the plates and the glow layer stand off the outer face.
GLOW_LIFT = 0.008
PLATE_SINK = 0.045
#: A plate's lower edge stands this much prouder than its top, so each
#: plate overhangs the one below like a scale.
SHINGLE = 0.026


def face_offset(face, z: float) -> float:
    """The offset `o` of a face at height `z`, extending its end segments."""
    if z <= face[0][0]:
        (z0, o0), (z1, o1) = face[0], face[1]
    elif z >= face[-1][0]:
        (z0, o0), (z1, o1) = face[-2], face[-1]
    else:
        for (z0, o0), (z1, o1) in zip(face, face[1:]):
            if z0 <= z <= z1:
                break
    return o0 + (o1 - o0) * (z - z0) / (z1 - z0)


def lerp(pair, u: float) -> float:
    """The value `u` of the way from `pair[0]` to `pair[1]`."""
    return pair[0] + (pair[1] - pair[0]) * u


# ===========================================
# Runs: the centre line a module follows
# ===========================================


class StraightRun:
    """Along X from -0.5 to +0.5, armour facing -Y."""

    def point(self, t: float) -> Vector:
        """The centre line at `t`."""
        return Vector((t - 0.5, 0.0, 0.0))

    def normal(self, t: float) -> Vector:
        """The outward (armour) direction at `t`."""
        return Vector((0.0, -1.0, 0.0))

    def length(self, o: float) -> float:
        """The run's length at offset `o` from the centre line."""
        return 1.0


class CurveRun:
    """A quarter circle about the tile's north-east corner, from the east
    edge's midpoint (t = 0) to the north edge's (t = 1), armour outside."""

    RADIUS = 0.5

    def angle(self, t: float) -> float:
        """The sweep angle at `t`, 0 at the east join and π/2 at the north."""
        return t * math.pi / 2

    def point(self, t: float) -> Vector:
        """The centre line at `t`."""
        a = self.angle(t)
        return Vector((0.5 - self.RADIUS * math.sin(a), 0.5 - self.RADIUS * math.cos(a), 0.0))

    def normal(self, t: float) -> Vector:
        """The outward (armour) direction at `t`, away from the corner."""
        a = self.angle(t)
        return Vector((-math.sin(a), -math.cos(a), 0.0))

    def length(self, o: float) -> float:
        """The arc's length at offset `o` from the centre line."""
        return (self.RADIUS + o) * math.pi / 2


#: Heights above this are lowered by a module's `sag`, reaching all of it at the ridge.
SAG_FROM = 1.5
RIDGE = 2.47


@dataclass
class Hull:
    """One module's frame: its run, how thick the wall is along it (1 is the
    full section) and how far its upper part sags (0 keeps the ridge). The
    seam thins and notches the wall towards its split; both stay at their
    defaults at the joins, so the section there never changes."""

    run: object
    thickness: Callable[[float], float] = lambda t: 1.0
    sag: Callable[[float], float] = lambda t: 0.0

    def at(self, t: float, z: float, o: float, lift: float = 0.0) -> Vector:
        """The point `o` (scaled by the local thickness) plus `lift` off the centre line."""
        p = self.run.point(t) + self.run.normal(t) * (o * self.thickness(t) + lift)
        p.z = z - self.sag(t) * min(1.0, max(0.0, (z - SAG_FROM) / (RIDGE - SAG_FROM)))
        return p

    def outer(self, t: float, z: float, lift: float = 0.0) -> Vector:
        """A point `lift` proud of the armoured face."""
        return self.at(t, z, face_offset(OUTER_FACE, z), lift)

    def inner(self, t: float, z: float, lift: float = 0.0) -> Vector:
        """A point `lift` proud of the flesh face (towards the pod's interior)."""
        return self.at(t, z, face_offset(INNER_FACE, z), -lift)

    def gap(self, width: float, o: float = 0.26) -> float:
        """A world width as a share of the run, measured at offset `o`."""
        return width / self.run.length(o)


# ===========================================
# Core and skins
# ===========================================


def core(hull: Hull, stations) -> None:
    """The structural loft: the shared cross-section at every station, capped."""
    count = len(PROFILE)
    vertices = [tuple(hull.at(t, z, o)) for t in stations for o, z in PROFILE]
    faces = []
    for i in range(len(stations) - 1):
        for j in range(count):
            k = (j + 1) % count
            faces.append((i * count + j, i * count + k, (i + 1) * count + k, (i + 1) * count + j))
    faces.append(tuple(reversed(range(count))))
    faces.append(tuple((len(stations) - 1) * count + j for j in range(count)))
    mesh("hull_core", vertices, faces, "bug-chitin-black", smooth=False)


def glow_layer(hull: Hull, columns) -> None:
    """The magenta interior just under the plates, edge to edge, so every
    seam and crack glows and neighbouring modules' seams continue it. It
    stops below the tips, where the charred core shows between them."""
    rows = [z for z, _ in OUTER_FACE][:-1]
    outer = [hull.outer(t, z, GLOW_LIFT) for z in rows for t in columns]
    inner = [hull.outer(t, z, -0.04) for z in rows for t in columns]
    patch("hull_glow", Matrix.Identity(4), outer, inner, len(columns) - 1, len(rows) - 1,
          "bug-bio-magenta")


#: How far the membrane puffs out between the ribs.
SWELL = 0.04


def membrane(hull: Hull, span, columns: int, bay: float, name: str = "hull_membrane") -> None:
    """The russet flesh over the inner face, puffing out between the ribs.

    The swelling repeats every `bay` of the run and peaks at t = 0, so it is
    the same at every join and a neighbour's membrane continues it; ribs
    stand in its troughs.
    """
    rows = [z for z, _ in INNER_FACE][:-1] + [2.3]
    outer, inner = [], []
    for z in rows:
        for i in range(columns + 1):
            t = lerp(span, i / columns)
            swelling = SWELL * math.cos(math.pi * t / bay) ** 2 * (0.6 + 0.4 * math.sin(math.pi * z / 1.6))
            outer.append(hull.inner(t, z, 0.022 + swelling))
            inner.append(hull.inner(t, z, -0.05))
    patch(name, Matrix.Identity(4), outer, inner, columns, len(rows) - 1, "bug-flesh")


# ===========================================
# Armour plates
# ===========================================


def plate(name, hull: Hull, span, lower, upper, token, lift, rng, columns=2, rows=None, tip=1.0,
          curl=(0.0, 0.0)):
    """One cracked chitin plate on the armoured face: a thick curved patch, closed.

    `span` is its share of the run; `lower` and `upper` its crack lines as
    (z at the left edge, z at the right), so cracks run slanted. `tip`
    below 1 pinches the top edge to a point that leans over the ridge;
    `curl` lifts the left or right edge outwards, as where the seam's
    chitin has failed to close.
    """
    rows = rows or max(1, round(((upper[0] + upper[1]) - (lower[0] + lower[1])) / 2 / 0.5))
    centre, half = (span[0] + span[1]) / 2, (span[1] - span[0]) / 2
    outer, inner = [], []
    for j in range(rows + 1):
        v = j / rows
        squeeze = 1.0 - (1.0 - tip) * v ** 1.4
        for i in range(columns + 1):
            u = i / columns
            t = centre + (2 * u - 1) * half * squeeze
            z = lerp((lerp(lower, u), lerp(upper, u)), v)
            bulge = 0.03 * math.sin(math.pi * u) * math.sin(math.pi * v) + rng.uniform(0.0, 0.01)
            edge = curl[0] * (1 - u) ** 2 + curl[1] * u ** 2
            outer.append(hull.outer(t, z, lift + bulge + SHINGLE * (1 - v) + edge))
            inner.append(hull.outer(t, z, -PLATE_SINK + edge * 0.6))
    return patch(name, Matrix.Identity(4), outer, inner, columns, rows, token)


def lip(name, hull: Hull, span, line, lift) -> None:
    """A toasted-tan lip along part of a plate's top edge, catching the light
    as the concept's plate edges do."""
    points = [hull.outer(lerp(span, u), lerp(line, u) - 0.014, lift + 0.016) for u in (0.18, 0.5, 0.82)]
    sweep(name, [tuple(p) for p in points], [0.022, 0.026, 0.02], [0.014, 0.016, 0.012],
          token="bug-chitin-tan", sides=4, smooth=False)


def stave(name, hull: Hull, span, cracks, parity, rng, columns=2, lips=(), tip=0.12, lift=None,
          curl=(0.0, 0.0)):
    """A stave of plates between `cracks` (z pairs, bottom to top), alternating
    black and walnut; the top plate rises to a tip over the ridge."""
    lift = (0.03 if parity % 2 == 0 else 0.048) if lift is None else lift
    for n in range(len(cracks) - 1):
        lower = tuple(c + (CRACK / 2 if n else 0.0) for c in cracks[n])
        upper = tuple(c - (CRACK / 2 if n < len(cracks) - 2 else 0.0) for c in cracks[n + 1])
        token = "bug-chitin-dark" if (parity + n) % 2 else "bug-chitin-black"
        top = n == len(cracks) - 2
        plate(f"{name}_{n}", hull, span, lower, upper, token, lift, rng, columns=columns,
              rows=3 if top and tip < 0.5 else 2 if top else None, tip=tip if top else 1.0, curl=curl)
        if n in lips:
            lip(f"{name}_lip{n}", hull, span, upper, lift)


# ===========================================
# Inner face, roots and finish
# ===========================================


def rib(name, hull: Hull, t: float, token: str = "bug-chitin-mid") -> None:
    """A chitin rib up the inner face, thick at the foot, bowing out into the
    pod at mid-height and tapering under the ridge."""
    heights = [0.02, 0.55, 1.15, 1.75, 2.28]
    points = [hull.inner(t, z, 0.045 + 0.025 * math.sin(math.pi * z / 2.4)) for z in heights]
    sweep(name, [tuple(p) for p in points], [0.07, 0.06, 0.052, 0.042, 0.024],
          [0.05, 0.046, 0.04, 0.034, 0.018], token=token, sides=5, smooth=False)


def vein(name, hull: Hull, path) -> None:
    """A thin green vein across the membrane; `path` is (t, z) pairs."""
    points = [hull.inner(t, z, 0.045) for t, z in path]
    sweep(name, [tuple(p) for p in points], [0.011, 0.013, 0.012, 0.007],
          token="bug-bio-green", sides=4, smooth=False)


def root(name, hull: Hull, t: float, bend: float, reach: float = 0.46) -> None:
    """A fleshy root from under the plates out onto the ground, inside the tile."""
    side = hull.run.point(min(t + 0.01, 1.0)) - hull.run.point(max(t - 0.01, 0.0))
    side = side.normalized() * bend
    points = [hull.at(t, 0.3, 0.25), hull.at(t, 0.12, 0.34) + side * 0.4,
              hull.at(t, 0.04, 0.41) + side * 0.8, hull.at(t, 0.012, reach) + side]
    sweep(name, [tuple(p) for p in points], [0.06, 0.045, 0.028, 0.012],
          token="bug-flesh", sides=5, smooth=False)


def finish_hull() -> None:
    """Seat everything on the ground and merge the pieces by palette token."""
    bpy.context.view_layer.update()
    for ob in mesh_objects():
        if min((ob.matrix_world @ Vector(v)).z for v in ob.bound_box) < -0.0001:
            cut_below(ob)
    groups = {}
    for ob in mesh_objects():
        groups.setdefault(ob.data.materials[0].name, []).append(ob)
    for token, parts in groups.items():
        merged = join(parts, "hull_" + token) if len(parts) > 1 else parts[0]
        merged["atlas_preserve_uv"] = True
    bpy.context.view_layer.update()


# ===========================================
# Modules
# ===========================================

#: Crack lines for the two staves of a straight module, bottom to top:
#: (z at the stave's left edge, z at its right). The top pair is the tip.
STRAIGHT_CRACKS = [
    [(0.0, 0.0), (0.92, 0.8), (1.72, 1.82), (2.64, 2.64)],
    [(0.0, 0.0), (0.62, 0.7), (1.42, 1.3), (2.47, 2.47)],
]


def build_plate() -> None:
    """A straight hull plate: two armoured staves outside, membrane and ribs inside."""
    rng = random.Random(0x6E0D)
    hull = Hull(StraightRun())
    g = hull.gap(SEAM / 2)
    core(hull, [0.0, 1.0])
    glow_layer(hull, [0.0, 1.0])
    stave("stave0", hull, (g, 0.5 - g), STRAIGHT_CRACKS[0], 0, rng, lips=(0, 1))
    stave("stave1", hull, (0.5 + g, 1.0 - g), STRAIGHT_CRACKS[1], 1, rng, lips=(1,))
    membrane(hull, (0.0, 1.0), 4, 0.5)
    rib("rib0", hull, 0.25)
    rib("rib1", hull, 0.75)
    vein("vein", hull, [(0.42, 0.25), (0.47, 0.8), (0.53, 1.35), (0.5, 1.95)])
    root("root0", hull, 0.22, 0.08)
    root("root1", hull, 0.7, -0.1)
    finish_hull()


def build_curve() -> None:
    """A hull corner joining east and north: two wide staves on the convex
    south-west side, membrane and one rib in the tight inner corner."""
    rng = random.Random(0x6E0E)
    hull = Hull(CurveRun())
    g = hull.gap(SEAM / 2)
    stations = [0.0, 0.25, 0.5, 0.75, 1.0]
    core(hull, stations)
    glow_layer(hull, stations)
    # East stave is odd and north stave even, matching the straight
    # modules' alternation on both joins.
    stave("stave0", hull, (g, 0.5 - g), [(0.0, 0.0), (0.7, 0.86), (1.58, 1.48), (2.52, 2.52)], 1, rng,
          columns=3, lips=(1,))
    stave("stave1", hull, (0.5 + g, 1.0 - g), [(0.0, 0.0), (0.95, 0.82), (1.76, 1.7), (2.65, 2.65)], 0,
          rng, columns=3, lips=(0, 1))
    membrane(hull, (0.0, 1.0), 2, 1.0)
    rib("rib", hull, 0.5)
    root("root", hull, 0.5, 0.12, reach=0.52)
    finish_hull()


def build_seam() -> None:
    """The straight plate's weak twin: its staves part down the middle, the
    plates either side thinner and curling back, and magenta tissue bulges
    from the split on both faces and notches the ridge."""
    rng = random.Random(0x6E0F)
    split = 0.14

    def towards_split(t: float) -> float:
        """1 at the split, falling to 0 at the joins."""
        return 1.0 - abs(t - 0.5) / 0.5

    hull = Hull(StraightRun(), thickness=lambda t: 1.0 - 0.18 * towards_split(t),
                sag=lambda t: 0.34 * towards_split(t))
    g = hull.gap(SEAM / 2)
    stations = [0.0, 0.5 - split, 0.5 + split, 1.0]
    core(hull, stations)
    glow_layer(hull, stations)
    stave("stave0", hull, (g, 0.5 - split), STRAIGHT_CRACKS[0][:3] + [(2.56, 2.44)], 0, rng,
          tip=0.55, lift=0.035, curl=(0.0, 0.035))
    stave("stave1", hull, (0.5 + split, 1.0 - g), STRAIGHT_CRACKS[1][:3] + [(2.44, 2.54)], 1, rng,
          tip=0.55, lift=0.04, curl=(0.035, 0.0))
    wound(hull, split)
    membrane(hull, (0.0, 0.5 - split * 0.75), 2, 0.5, "membrane_west")
    membrane(hull, (0.5 + split * 0.75, 1.0), 2, 0.5, "membrane_east")
    rib("rib0", hull, 0.2)
    rib("rib1", hull, 0.8)
    finish_hull()


def wound(hull: Hull, split: float) -> None:
    """The split: a bulging magenta welt through the wall, proud of both
    faces and rising out of the notched ridge, with blisters on its outer
    face and pale torn flesh at its inner edges."""
    heights = [0.02, 0.45, 0.95, 1.5, 2.0, 2.32]
    centre, widths, depths = [], [], []
    for z in heights:
        o_out = face_offset(OUTER_FACE, z) * hull.thickness(0.5)
        o_in = face_offset(INNER_FACE, z) * hull.thickness(0.5)
        swell = 0.05 + 0.11 * math.sin(math.pi * min(z, 2.2) / 2.2)
        point = hull.at(0.5, z, (o_out + o_in) / 2)
        point.z = z  # unsagged: the welt rises out of the notched ridge
        centre.append(point)
        depths.append(max((o_out - o_in) / 2, 0.06) + swell)
        widths.append(split * (0.78 + 0.22 * math.sin(math.pi * min(z, 2.3) / 2.3)))
    sweep("welt", [tuple(p) for p in centre], widths, depths, token="bug-bio-magenta", sides=8,
          smooth=False)
    for n, (k, offset) in enumerate(((1, -0.04), (3, 0.035))):
        blister = centre[k] + hull.run.normal(0.5) * (depths[k] - 0.01)
        blister.x += offset
        bead(f"blister{n}", tuple(blister), 0.06, "bug-bio-magenta", scale=(1.0, 0.8, 1.3),
             segments=6, rings=4)
    for side, sign in (("west", -1), ("east", 1)):
        t = 0.5 + sign * split * 0.8
        fold = [hull.inner(t, z, 0.03) for z in (0.1, 0.9, 1.7, 2.2)]
        sweep(f"flesh_lip_{side}", [tuple(p) for p in fold], [0.016, 0.022, 0.018, 0.01],
              [0.02, 0.028, 0.024, 0.012], token="bug-flesh-light", sides=4, smooth=False)
