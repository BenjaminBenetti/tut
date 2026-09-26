"""The Tunnel Sabotage objective: prop.tunnel-mouth and prop.tunnel-mouth-sealed (#1179).

    blender -b --python tools/art/make_model.py -- --script tools/art/models/prop-tunnel-mouth.py \
        --id prop.tunnel-mouth --category props --file prop-tunnel-mouth.glb --quality final \
        --max-triangles 6000 --build-arg kind=open
    ... --id prop.tunnel-mouth-sealed --file prop-tunnel-mouth-sealed.glb --build-arg kind=sealed

A burrow broken up through the street (campaign arc §6.7, bestiary kit "Tunnel
mouth"): a ring of heaved slabs round a ribbed chitin throat that spirals down
to a dark floor and one small green glow; dark tendrils crawl out over the
cracks. The map's own asphalt and sidewalk tiles are the ground round it, so
the model is only the heaved rim and the throat, and everything stays at or
under 0.3 u: the mouth gives no cover.

    footprint 2 x 2, centred on the origin (Blender, Z up, front -Y)

           +Y
     socket_charge (-0.5, +0.5)     the rim notch over the footprint's (-x, -z)
         ●  ▁▂▃▂▁                   tile in three.js: the tile the charge's
       ▃▅          ▅▃               PlacedCharge stands on (the mouth's `pos`)
      ▅   throat    ▅   -X ... +X
       ▃▅   (●)    ▅▃               (●) the green glow on the dark floor
         ▁▂▃▅▃▂▁
           -Y

The sealed look is the same footprint caved in: the slabs fallen across the
hole over a mound of spoil, the throat buried, the tendrils torn, no glow.
"""

from __future__ import annotations

import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
from bpy_kit import box, cut_below, socket, sphere  # noqa: E402
from crescent_geometry import mesh, sweep  # noqa: E402

FOOTPRINT = (2, 2)

# ===========================================
# Constants
# ===========================================

#: Highest point of any slab: the kit's "at or below 0.3 u, no cover".
SLAB_CEILING = 0.29

#: Where the charge sits: the rim over the (-x, +y) tile in Blender, which is
#: three.js's (-x, -z) tile, the mouth's `pos` and so its charge's tile.
CHARGE_AT = (-0.5, 0.5)

#: The notch's bearing, so the rim is low where the charge block stands.
CHARGE_BEARING = math.atan2(CHARGE_AT[1], CHARGE_AT[0])

#: Segments round the throat.
RING = 32


# ===========================================
# Helpers
# ===========================================


def notch(angle: float, depth: float = 0.6, width: float = 0.42) -> float:
    """How much of the rim's height is left at ``angle``: low at the charge's notch."""
    delta = math.atan2(math.sin(angle - CHARGE_BEARING), math.cos(angle - CHARGE_BEARING))
    return 1.0 - depth * math.exp(-((delta / width) ** 2))


def lathe(name: str, profile: list[tuple[float, float]], token: str, seed: float,
          notched: bool = True, ripple: float = 0.06) -> None:
    """A closed ring surface from a closed (radius, height) cross-section, rippled and notched.

    The cross-section is a loop: the last point joins the first, so the ring is
    watertight without caps. The notch lowers every point off the ground.
    """
    vertices = []
    for r, z in profile:
        for j in range(RING):
            a = j * math.tau / RING
            wobble = 1 + ripple * math.sin(5 * a + seed) + ripple * 0.6 * math.cos(3 * a + 0.9 * seed)
            lift = notch(a) if notched and z > 0.0 else 1.0
            vertices.append((math.cos(a) * r * wobble, math.sin(a) * r * wobble, z * lift))
    faces = []
    for i in range(len(profile)):
        k = (i + 1) % len(profile)
        for j in range(RING):
            q = (j + 1) % RING
            faces.append((i * RING + j, i * RING + q, k * RING + q, k * RING + j))
    mesh(name, vertices, faces, token, smooth=False)


def throat_point(t: float, angle: float, lift: float = 0.0) -> tuple[float, float, float]:
    """A point on the throat's inner wall: ``t`` 0 at the lip, 1 at the floor."""
    r = 0.56 - 0.30 * t
    z = (0.20 - 0.17 * t) * notch(angle) + lift
    return (math.cos(angle) * r, math.sin(angle) * r, z)


def slab(name: str, rng: random.Random, angle: float, radius: float, token: str,
         inward: float, length: float, width: float) -> None:
    """A broken paving slab heaved up round the hole, its inner edge lifted by ``inward``."""
    thick = 0.055
    rise = length / 2 * math.sin(inward) + thick / 2 * math.cos(inward)
    zc = min(SLAB_CEILING - rise, rise + 0.004)
    at = (math.cos(angle) * radius, math.sin(angle) * radius, zc)
    ob = box(name, (length, width, thick), at, token)
    # Turned so its length points at the hole, then tipped so the inner edge rises.
    # XYZ: rolled, then tipped about its width (the -X end, toward the hole,
    # up), then turned to its bearing.
    ob.rotation_euler = (rng.uniform(-0.12, 0.12), inward, angle + rng.uniform(-0.2, 0.2))
    cut_below(ob)


def tendril(name: str, rng: random.Random, angle: float, start: float, reach: float,
            width: float = 0.028) -> None:
    """A dark root crawling out over the cracks from the rim's foot."""
    points = []
    wander = rng.uniform(-0.25, 0.25)
    for i in range(6):
        t = i / 5
        a = angle + wander * t * t
        r = start + (reach - start) * t
        points.append((math.cos(a) * r, math.sin(a) * r, 0.012 + 0.01 * (1 - t)))
    widths = [max(0.008, width * (1 - i / 6)) for i in range(6)]
    sweep(name, points, widths, [w * 0.45 for w in widths], "bug-chitin-black", 5, smooth=False)


def rib(name: str, angle: float, token: str, sweep_turn: float = 1.05) -> None:
    """A ribbed chitin ring segment spiralling down the throat's inner wall."""
    points = [throat_point(i / 6, angle + sweep_turn * i / 6, lift=0.012) for i in range(7)]
    widths = [0.05 * (1 - 0.6 * i / 6) for i in range(7)]
    sweep(name, points, widths, [w * 0.7 for w in widths], token, 6, smooth=False)


# ===========================================
# The two looks
# ===========================================


def open_mouth() -> None:
    """The live burrow: heaved rim, ribbed throat, dark floor, one green glow."""
    rng = random.Random(1179)
    # The rim and throat as one closed ring: ground foot, over the lip, down
    # the inner wall to the floor's edge, and back along the ground.
    lathe("tunnel_throat", [
        (0.74, 0.0), (0.68, 0.13), (0.60, 0.21), (0.54, 0.20),
        (0.46, 0.14), (0.37, 0.08), (0.29, 0.035), (0.25, 0.0),
    ], "bug-flesh", seed=0.4)
    # The closed dark lining at the bottom of the throat: never a decal.
    lathe("tunnel_lining", [
        (0.33, 0.0), (0.33, 0.035), (0.27, 0.045), (0.0001, 0.03), (0.0001, 0.0),
    ], "bug-chitin-black", seed=1.3, notched=False, ripple=0.03)
    # Ribs spiralling down, dark and mid chitin in turn.
    for i in range(12):
        a = i * math.tau / 12 + 0.15
        rib(f"tunnel_rib_{i}", a, "bug-chitin-dark" if i % 2 else "bug-chitin-mid")
    # Tan rims on the outermost rib ends, along the lip.
    for i in range(12):
        a = i * math.tau / 12 + 0.15
        lip = [throat_point(-0.12 + 0.04 * k, a + 0.05 * k, lift=0.014) for k in range(4)]
        sweep(f"tunnel_rib_rim_{i}", lip, [0.026, 0.028, 0.024, 0.016], None,
              "bug-chitin-tan", 5, smooth=False)
    # One small glow deep in the throat.
    sphere("tunnel_glow", 0.07, (0.04, -0.03, 0.05), "bug-bio-green", 8, 5, (1.0, 0.8, 0.5))
    sphere("tunnel_glow_small", 0.035, (-0.07, 0.05, 0.045), "bug-bio-green", 6, 4, (1.0, 1.0, 0.6))
    # Heaved slabs round the rim, none over the charge's notch.
    count = 15
    for i in range(count):
        a = i * math.tau / count + rng.uniform(-0.1, 0.1)
        delta = math.atan2(math.sin(a - CHARGE_BEARING), math.cos(a - CHARGE_BEARING))
        if abs(delta) < 0.4:
            continue
        token = "env-concrete" if math.cos(a) > 0.1 else "env-asphalt"
        inward = rng.uniform(0.42, 0.68)
        length = rng.uniform(0.34, 0.42)
        # The inner end at the throat's lip, the outer end down on the street.
        radius = 0.6 + length / 2 * math.cos(inward)
        slab(f"tunnel_slab_{i}", rng, a, radius, token,
             inward=inward, length=length, width=rng.uniform(0.26, 0.34))
    # Chips of pavement fallen at the lip.
    for i in range(6):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(0.86, 0.95)
        box(f"tunnel_chip_{i}", (0.08, 0.07, 0.04), (math.cos(a) * r, math.sin(a) * r, 0.02),
            "env-concrete" if math.cos(a) > 0.1 else "env-asphalt", rot=(0.0, 0.0, a))
    # Tendrils across the cracks.
    for i in range(7):
        a = i * math.tau / 7 + 0.5
        reach = 0.98 / max(abs(math.cos(a)), abs(math.sin(a)))
        tendril(f"tunnel_tendril_{i}", rng, a, 0.7, min(reach, 1.3) * 0.97, width=0.036)
    # The flat stone the charge block stands on, in the notch.
    box("tunnel_charge_stone", (0.42, 0.34, 0.03), (CHARGE_AT[0], CHARGE_AT[1], 0.015), "env-asphalt",
        rot=(0.0, 0.0, CHARGE_BEARING))
    socket("charge", (CHARGE_AT[0], CHARGE_AT[1], 0.03))


def mound_height(profile: list[tuple[float, float]], r: float) -> float:
    """The height of a lathe profile (outer to inner, by falling radius) at radius ``r``."""
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        if r1 <= r <= r0:
            return z0 + (z1 - z0) * (r0 - r) / (r0 - r1)
    return 0.0


def sealed_mouth() -> None:
    """The collapsed burrow: slabs fallen across a mound of spoil, the throat buried, no glow."""
    rng = random.Random(1180)
    # The old rim, slumped lower, filled to a shallow mound of spoil.
    mound = [(0.97, 0.0), (0.82, 0.08), (0.66, 0.13), (0.50, 0.12), (0.30, 0.13), (0.0001, 0.14)]
    lathe("tunnel_rim_slumped", mound + [(0.0001, 0.0)], "env-dirt", seed=0.9, notched=False,
          ripple=0.08)
    # Ribs broken off at the rim, their stumps still showing through the fill.
    for i in range(6):
        a = i * math.tau / 6 + 0.4
        base = (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.11)
        tip = (math.cos(a + 0.35) * 0.47, math.sin(a + 0.35) * 0.47, 0.16)
        mid = tuple((b + t) / 2 + (0.0 if k < 2 else 0.02) for k, (b, t) in enumerate(zip(base, tip)))
        sweep(f"tunnel_rib_stump_{i}", [base, mid, tip], [0.03, 0.024, 0.012], None,
              "bug-chitin-dark" if i % 2 else "bug-chitin-mid", 5, smooth=False)
    # The slabs fallen in over the hole, tilted every way, lying low.
    for i in range(11):
        a = i * math.tau / 11 + rng.uniform(-0.2, 0.2)
        r = rng.uniform(0.12, 0.62)
        token = "env-concrete" if math.cos(a) > 0.0 else "env-asphalt"
        length = rng.uniform(0.26, 0.38)
        width = rng.uniform(0.2, 0.3)
        thick = 0.055
        tilt = rng.uniform(0.08, 0.3)
        rise = length / 2 * math.sin(tilt) + thick / 2
        zc = min(SLAB_CEILING - rise, 0.13 + 0.06 * rng.random())
        ob = box(f"tunnel_fallen_slab_{i}", (length, width, thick),
                 (math.cos(a) * r, math.sin(a) * r, zc), token)
        ob.rotation_euler = (rng.uniform(-0.2, 0.2), tilt, a + rng.uniform(-0.8, 0.8))
        cut_below(ob)
    # Rubble chips on the mound's flanks.
    for i in range(9):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(0.55, 0.92)
        box(f"tunnel_rubble_{i}", (0.09, 0.08, 0.05),
            (math.cos(a) * r, math.sin(a) * r, mound_height(mound, r) + 0.01),
            "env-concrete" if math.cos(a) > 0.0 else "env-asphalt", rot=(0.0, 0.0, a))
    # The tendrils, torn short and dead.
    for i in range(5):
        a = i * math.tau / 5 + 0.2
        tendril(f"tunnel_tendril_{i}", rng, a, 0.86, rng.uniform(1.0, 1.15), width=0.022)
    socket("charge", (CHARGE_AT[0], CHARGE_AT[1], 0.03))


def build(kind: str = "open") -> None:
    """Builds the open mouth, or with ``kind=sealed`` the collapsed one."""
    if kind == "sealed":
        sealed_mouth()
    else:
        open_mouth()
