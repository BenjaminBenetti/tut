"""Skyfall's great pod core (#1238): the spore pod grown huge and rooted.

The crash site's spore pod, grown to stand on 3×3 tiles at the heart of
the great pod: the same charred teardrop husk of cracked chitin staves,
standing upright, with more staves, fat roots over the whole skirt, the
magenta core glowing through every seam and the split crown on top.

    standing  eleven staves cracked into four plates each; the front two
              lean apart over russet membrane; magenta seams (emissive)
    ripe      the staves peeled open into petals round a bright orb, as
              the mature spore pod is (the last turns before it ripens)
    damaged   staves snapped off and lying on the roots, the membrane torn
              open where they broke, the glow guttering in a few seams

          standing            ripe               damaged
            /\\                \\  ()  /             /\\
           /||\\               \\(  )/            /|  \\  ← torn flaps
          |||||               |\\__/|           ||| ~ |
          |||||               |||||            |||_  |
       ~~~~~~~~~~~         ~~~~~~~~~~~      ~~~~▭~~~~▭~  ← fallen staves
       roots over the whole 3×3 skirt

The husk is built in the spore pod's own units with spore_pod_parts.py's
pieces and the `GREAT_POD` shape, then grown by one factor for every
state, so the three swap in place at the same size. The skirt fills the
footprint's inscribed circle.
"""

from __future__ import annotations

import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bounds, cut_below, mesh_objects, socket  # noqa: E402
from crescent_geometry import bead, sweep  # noqa: E402
from spore_pod_parts import (  # noqa: E402
    PodShape, clod, core, disc, local_point, plate, radius_at, rim_along, seam_gap, shrink,
    tilt_matrix,
)

# ===========================================
# Proportions
# ===========================================

#: The spore pod's husk, taller and slimmer, with more staves and plates.
GREAT_POD = PodShape(length=1.76, radius=0.45, staves=11, seam=0.034, twist=0.4,
                     plate_columns=3, plate_rows=5.0, orb=0.27)
#: Every state is grown by this factor from the pod's own units.
GROWTH = 2.0
#: The finished model must stay inside its 3×3 footprint.
SPREAD = 2.96
#: The skirt's radius in pod units (grown, it nearly fills the footprint).
SKIRT = 0.72
#: Staves the damaged pod has lost, and how many plates of each survive.
BROKEN = {1: 3, 2: 2, 3: 1, 5: 2, 7: 1, 9: 2}
#: The guttering seams still lit on the damaged pod: (stave, s from, s to).
GLINTS = [(1, 0.2, 0.38), (4, 0.42, 0.6), (6, 0.12, 0.3), (8, 0.5, 0.66), (10, 0.3, 0.46)]

STANDING, RIPE, DAMAGED = "standing", "ripe", "damaged"


# ===========================================
# Husk
# ===========================================


def stave_cracks(k: int, rng, state: str):
    """A stave's crack lines (s at its left and right edges, bottom to top)
    and its hinge (s, angle) or None."""
    front = k in (0, GREAT_POD.staves - 1)
    if state == RIPE:
        top = 0.95 - 0.04 * (k % 2)
        mid = 0.6 + 0.08 * rng.random()
        slant = rng.uniform(-0.05, 0.05)
        return [(0.0, 0.0), (0.3, 0.3), (mid - slant, mid + slant), (top, top)], (0.3, 0.4 + 0.12 * rng.random())
    top = 0.84 if k == 0 else 0.955 - 0.03 * (k % 2)
    rungs = [0.2 + 0.1 * rng.random(), 0.42 + 0.1 * rng.random(), 0.64 + 0.1 * rng.random()]
    cracks = [(0.0, 0.0)]
    for n, rung in enumerate(rungs):
        slant = rng.uniform(-0.06, 0.06) * (1 if n % 2 else -1)
        cracks.append((rung - slant, rung + slant))
    cracks.append((top, top))
    # The crown's two front staves lean apart: the split.
    hinge = (rungs[-1], 0.42 if k == 0 else 0.22) if front else None
    return cracks, hinge


def husk(frame, rng, state: str):
    """The staves round the axis. Returns the plate each broken stave lost
    just above its break, as (stave span, lower crack, upper crack, token)
    for `fallen`, and where each broken stave snapped (stave → s)."""
    shape = GREAT_POD
    step = math.tau / shape.staves
    lost, breaks = [], {}
    for k in range(shape.staves):
        cracks, hinge = stave_cracks(k, rng, state)
        keep = BROKEN.get(k, len(cracks) - 1) if state == DAMAGED else len(cracks) - 1
        for n in range(len(cracks) - 1):
            lower = tuple(c + (0.012 if n else 0.0) for c in cracks[n])
            upper = tuple(c - 0.012 for c in cracks[n + 1])
            gap = seam_gap((sum(lower) + sum(upper)) / 4, shape)
            thetas = ((k - 0.5) * step + gap, (k + 0.5) * step - gap)
            token = "bug-chitin-dark" if (k + n) % 2 else "bug-chitin-black"
            if n >= keep:
                if n == keep:
                    lost.append((thetas, lower, upper, token))
                continue
            if n == keep - 1 and keep < len(cracks) - 1:
                # The snapped plate: its top edge jagged, one corner gone.
                upper = (upper[0] - rng.uniform(0.02, 0.08), upper[1] + rng.uniform(0.02, 0.06))
                breaks[k] = sum(upper) / 2
            piece = plate(f"plate{k}_{n}", frame, thetas, lower, upper, token, rng, hinge=hinge,
                          shape=shape)
            cut_below(piece)
            if state == RIPE and n >= 1:
                # The petal's inner face, lit from the core.
                inset = (thetas[0] + gap * 0.6, thetas[1] - gap * 0.6)
                lining = plate(f"lining{k}_{n}", frame, inset, tuple(c + 0.02 for c in lower),
                               tuple(c - 0.03 for c in upper), "bug-flesh-light", rng, hinge=hinge,
                               shape=shape)
                shrink(lining, frame, 0.93)
            if n > 0 and rng.random() < 0.6:
                rim_along(f"rim{k}_{n}", frame, thetas, lower, rng, hinge=hinge, shape=shape)
    return lost, breaks


def fallen(lost, rng) -> None:
    """The damaged pod's snapped-off plates, lying on the roots round its
    base, face up and propped at a slant, every one pulled inside the skirt."""
    for i, (thetas, lower, upper, token) in enumerate(lost):
        s_mid = (sum(lower) + sum(upper)) / 4
        theta = (thetas[0] + thetas[1]) / 2
        a = theta + GREAT_POD.twist * s_mid
        pivot = local_point(s_mid, theta, 1.0, GREAT_POD)
        heading = a + rng.uniform(0.25, 0.6) * (1 if i % 2 else -1)
        out = Vector((math.sin(heading), -math.cos(heading), 0.0))
        target = out * rng.uniform(0.57, 0.6) + Vector((0.0, 0.0, 0.05))
        lay = -(math.pi / 2 - rng.uniform(0.12, 0.25))
        spin = heading + math.pi / 2 + rng.uniform(-0.4, 0.4)
        frame = (Matrix.Translation(target) @ Matrix.Rotation(spin, 4, "Z")
                 @ Matrix.Rotation(lay, 4, "X") @ Matrix.Rotation(-a, 4, "Z")
                 @ Matrix.Translation(-pivot))
        piece = plate(f"fallen{i}", frame, thetas, lower, upper, token, rng, shape=GREAT_POD)
        cut_below(piece)
        world = [piece.matrix_world @ v.co for v in piece.data.vertices]
        excess = max(Vector((p.x, p.y)).length for p in world) - (SKIRT - 0.015)
        if excess > 0:
            piece.location -= out * excess


# ===========================================
# Interior
# ===========================================


def damaged_interior(frame, rng, breaks) -> None:
    """The guttering core: dull flesh where the magenta was, shrunk back
    from the husk so the breaks open onto a cavity and the seams go dark,
    a few still lit, torn membrane flapping round the broken staves."""
    shape = GREAT_POD
    step = math.tau / shape.staves
    samples = [0.0, 0.1, 0.22, 0.34, 0.48, 0.6, 0.7]
    body = sweep("core_body", [tuple(frame @ local_point(s, 0.0, 0.0, shape)) for s in samples],
                 [radius_at(s, shape) * 0.74 for s in samples], token="bug-flesh", sides=14)[0]
    cut_below(body)
    crown = [0.62, 0.72, 0.8, 0.87, 0.92]
    sweep("crown_membrane", [tuple(frame @ local_point(s, 0.0, 0.0, shape)) for s in crown],
          [radius_at(s, shape) * 0.82 for s in crown], token="bug-flesh-light", sides=12)
    for i, a in enumerate((-0.3, 0.05, 0.3)):
        vein = [local_point(0.7 + 0.04 * j, a + 0.07 * j * (1 if i % 2 else -1), 0.935, shape)
                for j in range(4)]
        sweep(f"crown_vein{i}", [tuple(frame @ p) for p in vein], [0.005, 0.006, 0.005, 0.003],
              token="bug-bio-green" if i == 1 else "bug-bio-green-dim", sides=5)
    # The last of the light, low in a few seams.
    for k, s0, s1 in GLINTS:
        theta = (k - 0.5) * step
        points = [local_point(s0 + (s1 - s0) * j / 2, theta, 0.95, shape) for j in range(3)]
        sweep(f"glint{k}", [tuple(frame @ p) for p in points], [0.008, 0.016, 0.006],
              [0.02, 0.03, 0.012], token="bug-bio-magenta", sides=5)
    # Each broken stave: torn flaps over the break, and a guttering ember inside.
    for k, s_break in breaks.items():
        theta = k * step
        ember = local_point(s_break + 0.08, theta, 0.76, shape)
        bead(f"ember{k}", tuple(frame @ ember), 0.05 + 0.02 * (s_break < 0.35), "bug-bio-magenta",
             scale=(1.0, 1.0, 1.3), segments=8, rings=6)
        for j in range(3):
            a = theta + (j - 1) * step * 0.3
            base = local_point(s_break + 0.05, a, 0.9, shape)
            droop = local_point(s_break + rng.uniform(0.0, 0.05), a + rng.uniform(-0.05, 0.05), 1.08, shape)
            tip = local_point(s_break - rng.uniform(0.04, 0.09), a, 1.13, shape)
            sweep(f"flap{k}_{j}", [tuple(frame @ p) for p in (base, droop, tip)],
                  [0.04, 0.03, 0.008], [0.012, 0.01, 0.005], token="bug-flesh-light", sides=5,
                  smooth=False)


# ===========================================
# Roots and skirt
# ===========================================


def roots(frame, rng, count: int = 14) -> None:
    """Fat fleshy roots from under the husk, hugging the ground in long
    sinuous runs out over the whole skirt, every other one forking."""
    for k in range(count):
        a = k * math.tau / count + rng.uniform(-0.14, 0.14)
        start = frame @ local_point(0.26, a, 0.86, GREAT_POD)
        out = Vector((math.sin(a), -math.cos(a), 0.0))
        across = Vector((-out.y, out.x, 0.0))
        wobble = rng.uniform(0.04, 0.08) * (1 if k % 2 else -1)
        reach = SKIRT - 0.04 + rng.uniform(-0.08, 0.0)
        points = [start]
        for j, (share, rise) in enumerate(((0.62, 0.075), (0.72, 0.055), (0.82, 0.042),
                                           (0.92, 0.03), (1.0, 0.014))):
            sway = wobble * math.sin(math.pi * (j + 1) / 3)
            points.append(out * (reach * share) + across * sway + Vector((0.0, 0.0, rise)))
        widths = [0.1, 0.08, 0.064, 0.048, 0.03, 0.012]
        sweep(f"root{k}", [tuple(p) for p in points], widths, [w * 0.7 for w in widths],
              token="bug-flesh", sides=6, smooth=True)
        if k % 2 == 0:
            fork = points[2]
            twig = across * (0.12 if k % 4 else -0.12)
            sweep(f"root{k}_fork", [tuple(fork), tuple(fork + out * 0.06 + twig * 0.55 + Vector((0, 0, -0.02))),
                                    tuple(fork + out * 0.1 + twig + Vector((0, 0, -0.04)))],
                  [0.032, 0.02, 0.008], [0.022, 0.014, 0.006], token="bug-flesh", sides=6, smooth=True)


def skirt(rng) -> None:
    """The footprint's own ground: a low disc of dirt, a charred patch round
    the husk, and clods of scorched earth near the rim."""
    count = 24
    ring = []
    for i in range(count):
        a = i * math.tau / count
        r = SKIRT * (1 + rng.uniform(-0.02, 0.0))
        ring.append((math.sin(a) * r, -math.cos(a) * r))
    disc(ring, 0.0, 0.03, 0.02, "skirt", "env-dirt")
    scorch = [(x * 0.72 + rng.uniform(-0.02, 0.02), y * 0.72 + rng.uniform(-0.02, 0.02)) for x, y in ring]
    disc(scorch, 0.022, 0.043, 0.036, "scorch", "bug-chitin-black")
    for i in range(10):
        a = i * math.tau / 10 + rng.uniform(0.1, 0.5)
        r = SKIRT * rng.uniform(0.74, 0.88)
        clod(f"clod{i}", (math.sin(a) * r, -math.cos(a) * r), 0.03 + rng.uniform(0.0, 0.03),
             "env-dirt" if i % 3 else "bug-chitin-black", rng)


# ===========================================
# Builder
# ===========================================


def grow(factor: float) -> None:
    """Scale the whole model uniformly about its base centre, baking every
    transform, and check it still fits its footprint."""
    bpy.context.view_layer.update()
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            matrix = ob.matrix_world.copy()
            origin = matrix.translation * factor
            for vertex in ob.data.vertices:
                vertex.co = (matrix @ vertex.co) * factor - origin
            ob.matrix_world = Matrix.Translation(origin)
            ob.data.update()
            ob["atlas_preserve_uv"] = True
        elif ob.name.startswith("socket_"):
            ob.location = ob.location * factor
    bpy.context.view_layer.update()
    lo, hi = bounds()
    reach = max(-lo.x, hi.x, -lo.y, hi.y)
    if reach > SPREAD / 2:
        raise SystemExit(f"great pod core reaches {reach:.3f} u from its centre, past its 3×3 footprint")


def build_great_pod_core(state: str = STANDING) -> None:
    """The great pod's core on its 3×3 skirt: standing, ripe or damaged."""
    rng = random.Random({STANDING: 0x6EC0, RIPE: 0x6EC1, DAMAGED: 0x6EC2}[state])
    frame = tilt_matrix(0.03, 0.02) if state == RIPE else tilt_matrix(0.06, 0.03)
    skirt(rng)
    lost, breaks = husk(frame, rng, state)
    if state == DAMAGED:
        damaged_interior(frame, rng, breaks)
        fallen(lost, rng)
    else:
        core(frame, state == RIPE, GREAT_POD)
    roots(frame, rng)
    crown = frame @ (Vector((0, 0, 0.62 + 0.3)) if state == RIPE else local_point(0.86, 0.0, 0.0, GREAT_POD))
    socket("hatch", tuple(crown))
    for ob in mesh_objects():
        if min((ob.matrix_world @ Vector(v)).z for v in ob.bound_box) < -0.0001:
            cut_below(ob)
    grow(GROWTH)
