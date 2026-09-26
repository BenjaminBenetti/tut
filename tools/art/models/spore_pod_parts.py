"""The crash site's spore pod (campaign arc §6.3), ripening and mature.

A charred teardrop husk of cracked chitin staves, sunk nose-first into
the ground and tilted, glowing magenta through its seams, with fleshy
roots gripping a small scorched skirt. The mature state has the staves
split open like petals round a bright core: the scene swaps it in over
the last turns before the pod matures.

    husk      7 staves round the axis, each cracked into 2 or 3 plates;
              the gaps between them show the magenta core (emissive)
    crown     two short staves at the front leave a split, where the
              russet membrane and its green veins show
    roots     tapering sweeps from the husk out onto the skirt
    skirt     env-dirt disc with a charred patch and a few clods

Coordinates use Blender world space, Z up, -Y forward. The pod is built
in its own frame (axis along +Z, `s` from 0 at the buried base to 1 at
the tip), then tilted and cut at the ground. Follow
docs/design/concepts/campaign/spore-pod.png and
docs/design/kits/campaign-bestiary.md#spore-pod.
"""

from __future__ import annotations

import math
import os
import random
import sys

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from crescent_geometry import bead, finish, mesh, sweep  # noqa: E402
from bpy_kit import cut_below, socket  # noqa: E402

# ===========================================
# Proportions
# ===========================================

#: Husk length along its axis and widest radius, before `finish` scales it.
LENGTH = 1.62
RADIUS = 0.5
#: How far the base sits under the ground along the axis.
BURY = 0.3
#: Staves round the husk; the gap between two is a glowing seam.
STAVES = 7
SEAM = 0.04
#: How far the staves spiral round the axis from base to tip, in radians.
TWIST = 0.45
#: Plates are this thick, as a share of the husk's radius.
SHELL = 0.16
#: The finished model's height and its widest extent (one tile, and a
#: little over: the pod is the whole mission and should read as large).
HEIGHT = 1.25
SPREAD = 1.34
#: The mature pod's exposed core, before `finish` scales it.
ORB = 0.3


# ===========================================
# Profile and frame
# ===========================================


def radius_at(s: float) -> float:
    """The husk's radius at `s` along its axis: a narrow buried nose, a fat
    belly, and an ogive taper to the tip."""
    if s <= 0.45:
        return RADIUS * (0.42 + 0.58 * math.sin(0.5 * math.pi * s / 0.45))
    t = min(1.0, (s - 0.45) / 0.55)
    return RADIUS * max(0.0, 1 - t ** 1.6) ** 0.85


def local_point(s: float, theta: float, scale: float = 1.0) -> Vector:
    """A point on (or inside, with `scale` < 1) the husk in the pod's own frame.

    `theta` 0 faces the front (-Y) and grows towards +X; the staves
    spiral by `TWIST` from base to tip.
    """
    r = radius_at(s) * scale
    a = theta + TWIST * s
    return Vector((math.sin(a) * r, -math.cos(a) * r, s * LENGTH - BURY))


def tilt_matrix(lean: float, back: float) -> Matrix:
    """The pod's lean: `lean` radians towards +X, `back` radians away from the camera."""
    return Matrix.Rotation(lean, 4, "Y") @ Matrix.Rotation(-back, 4, "X")


def lerp(pair, u: float) -> float:
    """The value `u` of the way from `pair[0]` to `pair[1]`."""
    return pair[0] + (pair[1] - pair[0]) * u


# ===========================================
# Husk pieces
# ===========================================


def plate(name, frame, thetas, lower, upper, token, rng, hinge=None):
    """One cracked chitin plate: a thick curved patch of the husk, closed.

    `thetas` spans the stave; `lower` and `upper` are the crack lines as
    (s at the stave's left edge, s at its right), so cracks run slanted.
    `hinge` (s, angle) swings everything above that ring outwards, which
    is how the mature pod's staves split into petals.
    """
    nu = 3
    nv = max(2, round((sum(upper) - sum(lower)) / 2 * LENGTH * 5))
    outer, inner = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u = i / nu
            s = lerp((lerp(lower, u), lerp(upper, u)), j / nv)
            theta = lerp(thetas, u)
            bulge = 1.0 + 0.05 * math.sin(math.pi * u) + rng.uniform(-0.025, 0.035)
            outer.append(local_point(s, theta, bulge))
            inner.append(local_point(s, theta, 1.0 - SHELL))
    if hinge is not None:
        mid = lerp(thetas, 0.5)
        outer = [swing(p, hinge, mid) for p in outer]
        inner = [swing(p, hinge, mid) for p in inner]
    return patch(name, frame, outer, inner, nu, nv, token)


def swing(point: Vector, hinge, theta: float) -> Vector:
    """Rotates a point above the hinge ring outwards about the ring's tangent."""
    s_hinge, angle = hinge
    z_hinge = s_hinge * LENGTH - BURY
    if point.z <= z_hinge + 1e-6:
        return point
    a = theta + TWIST * s_hinge
    radial = Vector((math.sin(a), -math.cos(a), 0.0))
    pivot = radial * radius_at(s_hinge) + Vector((0.0, 0.0, z_hinge))
    axis = Vector((0.0, 0.0, 1.0)).cross(radial).normalized()
    return pivot + Matrix.Rotation(angle, 3, axis) @ (point - pivot)


def patch(name, frame, outer, inner, nu, nv, token):
    """Closes an outer and an inner grid into one watertight flat-shaded plate."""
    count = len(outer)
    vertices = [tuple(frame @ p) for p in outer] + [tuple(frame @ p) for p in inner]
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


def rim_along(name, frame, thetas, line, rng, hinge=None):
    """A toasted-tan rim along part of a plate's cracked lower edge, as on
    the concept's larger plates."""
    start = rng.uniform(0.0, 0.3)
    points = []
    for i in range(4):
        u = start + (0.7 - 0.05) * i / 3
        p = local_point(lerp(line, u) + 0.01, lerp(thetas, u), 1.05)
        if hinge is not None:
            p = swing(p, hinge, lerp(thetas, 0.5))
        points.append(tuple(frame @ p))
    sweep(name, points, [0.012, 0.017, 0.017, 0.011], token="bug-chitin-tan", sides=5, smooth=False)


def seam_gap(s: float) -> float:
    """Half the seam's angular width at `s`, so seams stay one width up the taper."""
    return min(0.2, 0.5 * SEAM / max(radius_at(s), 0.05))


def husk(frame, rng, mature: bool) -> None:
    """The staves: cracked plates round the axis, with the crown split at the front."""
    step = math.tau / STAVES
    for k in range(STAVES):
        front = k in (0, STAVES - 1)
        if mature:
            top = 0.95 - 0.04 * (k % 2)
            cracks = [(0.0, 0.0), (0.3, 0.3), (top, top)]
            hinge = (0.3, 0.5 + 0.14 * rng.random())
        else:
            top = 0.82 if k == 0 else 0.955 - 0.03 * (k % 2)
            low = 0.26 + 0.14 * rng.random()
            high = 0.55 + 0.14 * rng.random()
            slant = rng.uniform(-0.07, 0.07)
            cracks = [(0.0, 0.0), (low - slant, low + slant), (high + slant, high - slant),
                      (top, top)]
            # The crown's two front staves lean apart: the split.
            hinge = (high, 0.3 if k == 0 else 0.12) if front else None
        for n in range(len(cracks) - 1):
            lower = tuple(c + (0.012 if n else 0.0) for c in cracks[n])
            upper = tuple(c - 0.012 for c in cracks[n + 1])
            gap = seam_gap((sum(lower) + sum(upper)) / 4)
            thetas = ((k - 0.5) * step + gap, (k + 0.5) * step - gap)
            token = "bug-chitin-dark" if (k + n) % 2 else "bug-chitin-black"
            piece = plate(f"plate{k}_{n}", frame, thetas, lower, upper, token, rng, hinge=hinge)
            cut_below(piece)
            if mature and n == len(cracks) - 2:
                # The petal's inner face, lit from the core.
                inset = (thetas[0] + gap * 0.6, thetas[1] - gap * 0.6)
                lining = plate(f"lining{k}", frame, inset, tuple(c + 0.02 for c in lower),
                               tuple(c - 0.04 for c in upper), "bug-flesh-light", rng, hinge=hinge)
                shrink(lining, frame, 0.93)
            if n > 0 and rng.random() < 0.7:
                rim_along(f"rim{k}_{n}", frame, thetas, lower, rng, hinge=hinge)


def shrink(ob, frame, factor: float) -> None:
    """Pulls a lining in towards the pod's axis so it sits inside its petal."""
    inverse = frame.inverted()
    for vertex in ob.data.vertices:
        world = ob.matrix_world @ vertex.co
        local = inverse @ world
        local.x *= factor
        local.y *= factor
        vertex.co = ob.matrix_world.inverted() @ (frame @ local)
    ob.data.update()


# ===========================================
# Core, crown and roots
# ===========================================


def core(frame, mature: bool) -> None:
    """The living interior: magenta light behind the seams, a membrane in the crown."""
    if mature:
        # Split wide open: one bright orb, veined, held in the petals' cup.
        centre = Vector((0.0, 0.0, 0.62))
        bead("core_orb", tuple(frame @ centre), ORB, "bug-bio-magenta",
             scale=(1, 1, 1.1), segments=20, rings=14)
        samples = (0.02, 0.2, 0.34)
        body = sweep("core_body", [tuple(frame @ local_point(s, 0.0, 0.0)) for s in samples],
                     [radius_at(s) * 0.86 for s in samples], token="bug-flesh", sides=14)[0]
        cut_below(body)
        # Russet veins across the orb, from its crown down its sides.
        for i in range(5):
            a = i * math.tau / 5 + 0.3
            arc = []
            for j in range(4):
                polar = math.pi * (0.12 + 0.16 * j)
                heading = a + 0.22 * j
                arc.append(centre + Vector((math.sin(heading) * math.sin(polar),
                                            -math.cos(heading) * math.sin(polar),
                                            math.cos(polar) * 1.1)) * (ORB * 1.02))
            sweep(f"orb_vein{i}", [tuple(frame @ p) for p in arc], [0.012, 0.014, 0.012, 0.008],
                  token="bug-flesh", sides=5)
        return
    samples = [0.0, 0.1, 0.22, 0.34, 0.48, 0.6, 0.7]
    body = sweep("core_body", [tuple(frame @ local_point(s, 0.0, 0.0)) for s in samples],
                 [radius_at(s) * 0.9 for s in samples], token="bug-bio-magenta", sides=14)[0]
    cut_below(body)
    crown = [0.62, 0.72, 0.8, 0.87, 0.92]
    sweep("crown_membrane", [tuple(frame @ local_point(s, 0.0, 0.0)) for s in crown],
          [radius_at(s) * 0.92 for s in crown], token="bug-flesh", sides=12)
    # The concept's split: russet flesh with thin green veins and a magenta slit.
    for i, (a, rise) in enumerate([(-0.3, 0.12), (0.0, 0.14), (0.25, 0.1)]):
        vein = [local_point(0.7 + rise * j / 3, a + 0.08 * j * (1 if i % 2 else -1), 0.935)
                for j in range(4)]
        sweep(f"crown_vein{i}", [tuple(frame @ p) for p in vein], [0.005, 0.006, 0.005, 0.003],
              token="bug-bio-green", sides=5)
    slit = [local_point(s, -0.42, 0.925) for s in (0.64, 0.7, 0.76, 0.82)]
    sweep("crown_slit", [tuple(frame @ p) for p in slit], [0.02, 0.035, 0.03, 0.012],
          [0.02, 0.03, 0.028, 0.012], token="bug-bio-magenta", sides=6)


def roots(frame, rng, count: int = 9) -> None:
    """Fleshy tendrils from the husk's buried base out across the skirt."""
    for k in range(count):
        a = k * math.tau / count + rng.uniform(-0.18, 0.18)
        start = frame @ local_point(0.3, a, 0.9)
        start.z = max(start.z, 0.14)
        out = Vector((math.sin(a), -math.cos(a), 0.0))
        reach = 0.58 + rng.uniform(0.0, 0.07)
        side = Vector((-out.y, out.x, 0.0)) * rng.uniform(-0.08, 0.08)
        ground = Vector((start.x, start.y, 0.0))
        points = [start,
                  ground + out * 0.12 + Vector((0, 0, 0.07)),
                  Vector((0, 0, 0)) + out * (reach * 0.72) + side + Vector((0, 0, 0.036)),
                  Vector((0, 0, 0)) + out * reach + side * 1.6 + Vector((0, 0, 0.014))]
        sweep(f"root{k}", [tuple(p) for p in points], [0.062, 0.046, 0.028, 0.01],
              token="bug-flesh", sides=7, smooth=False)
        if k % 2 == 0:
            fork = points[2]
            twig = Vector((-out.y, out.x, 0.0)) * (0.13 if k % 4 else -0.13)
            sweep(f"root{k}_fork", [tuple(fork), tuple(fork + out * 0.08 + twig * 0.5 + Vector((0, 0, -0.008))),
                                    tuple(fork + out * 0.14 + twig + Vector((0, 0, -0.02)))],
                  [0.016, 0.011, 0.006], token="bug-flesh", sides=6, smooth=False)


# ===========================================
# Ground skirt
# ===========================================


def skirt(rng) -> None:
    """A low disc of dirt with a charred patch and a few clods: the model's own ground."""
    ring = []
    for i in range(16):
        a = i * math.tau / 16
        r = 0.62 + rng.uniform(-0.04, 0.04)
        ring.append((math.sin(a) * r, -math.cos(a) * r))
    disc(ring, 0.0, 0.03, 0.02, "skirt", "env-dirt")
    scorch = [(x * 0.66 + rng.uniform(-0.02, 0.02), y * 0.66 + rng.uniform(-0.02, 0.02)) for x, y in ring]
    disc(scorch, 0.022, 0.043, 0.036, "scorch", "bug-chitin-black")
    for i in range(6):
        a = i * math.tau / 6 + rng.uniform(0.1, 0.5)
        r = 0.5 + rng.uniform(0.0, 0.1)
        clod(f"clod{i}", (math.sin(a) * r, -math.cos(a) * r), 0.035 + rng.uniform(0.0, 0.03),
             "env-dirt" if i % 3 else "bug-chitin-black", rng)


def disc(ring, z0, z_centre, z_edge, name, token) -> None:
    """A closed low dome over an outline: flat underside at `z0`, raised centre."""
    n = len(ring)
    vertices = [(0.0, 0.0, z_centre)] + [(x, y, z_edge) for x, y in ring] + [(x, y, z0) for x, y in ring]
    vertices.append((0.0, 0.0, z0))
    bottom = len(vertices) - 1
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    faces += [(1 + i, 1 + n + i, 1 + n + (i + 1) % n, 1 + (i + 1) % n) for i in range(n)]
    faces += [(bottom, 1 + n + (i + 1) % n, 1 + n + i) for i in range(n)]
    mesh(name, vertices, faces, token, smooth=False)


def clod(name, at, size, token, rng) -> None:
    """A broken lump of scorched earth, sitting on the skirt."""
    x, y = at
    base, top = [], []
    for i in range(5):
        a = i * math.tau / 5 + rng.uniform(-0.2, 0.2)
        r = size * rng.uniform(0.8, 1.15)
        base.append((x + math.sin(a) * r, y - math.cos(a) * r, 0.02))
        r *= 0.62
        top.append((x + math.sin(a) * r, y - math.cos(a) * r, 0.02 + size * rng.uniform(0.9, 1.4)))
    vertices = base + top
    faces = [tuple(reversed(range(5))), tuple(range(5, 10))]
    faces += [(i, (i + 1) % 5, 5 + (i + 1) % 5, 5 + i) for i in range(5)]
    mesh(name, vertices, faces, token, smooth=False)


# ===========================================
# Builder
# ===========================================


def build_spore_pod(mature: bool = False) -> None:
    """The spore pod standing in its tile, ripening or split open and mature."""
    rng = random.Random(0x5B0D if mature else 0x5B0C)
    frame = tilt_matrix(0.08, 0.04) if mature else tilt_matrix(0.36, 0.14)
    skirt(rng)
    husk(frame, rng, mature)
    core(frame, mature)
    roots(frame, rng)
    crown = frame @ (Vector((0, 0, 0.62 + 0.3)) if mature else local_point(0.86, 0.0, 0.0))
    socket("hatch", tuple(crown))
    finish(HEIGHT, SPREAD, SPREAD)
