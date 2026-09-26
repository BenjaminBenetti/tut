"""The Sovereign, the finale's apex boss bug (#1179, campaign arc §6.9, §8).

Concept: docs/design/concepts/campaign/sovereign.md; modeller's brief:
docs/design/kits/campaign-bestiary.md#sovereign. She shares the brown
family's materials, joint beads and hooked mandibles, and owns a silhouette
nothing else has: a regal centaur, six armoured legs planted wide under a
long body, an upright torso with a long neck and a raised head, a big swept
crown of pale blades round a magenta gem, two tall pale scythes folded in
front of the chest, and a mantle of overlapping plates draped down her back
like a train, shortened to end on the ground inside her 4×4 footprint.

```
        side view, front to the left (-Y)

                crown \\ \\ \\
                  gem (*)\\ \\
                 head  <o  \\___
     scythe  (     neck |  mantle rows, each overlapping the next
      blade   )  torso  |______
     hand  _/  \\ elbow  | body  \\_____
             leg0     leg1   leg2   \\____ train on the ground
```

Rig (UnitMotionRig reads only top-level nodes):

- six legs ``leg_[lr]0..2`` (0 front, 2 rear), each one node with its origin
  at the hip and ``motion_joint``; the rig steps ``l0 l2 r1`` against
  ``l1 r0 r2``;
- ``scythe_l`` and ``scythe_r``, origin at the shoulder with
  ``motion_joint``. Each small clawed hand (``hand_l``, ``hand_r``) is a
  *child* of its scythe node, so each side's arm group stays one top-level
  node and the authored shoulder joint holds;
- body nodes ``carapace`` (the six-legged lower body), ``torso`` (upright
  torso and neck), ``head``, ``crown`` and ``mantle``: none matches an arm or
  leg prefix;
- ``socket_crown`` at the gem, the anchor for the buff aura.

Palette: walnut mantle plates and torso, chestnut leg armour and torso
plates, tan only on the mantle rims, bone crown blades, scythe blades and
claw tips, dark umber joints and scythe backs, one magenta gem and a few
small green eyes and crown veins.
"""

from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import (  # noqa: E402
    bead,
    finish,
    group_new,
    hooked_blade,
    joint_origin,
    mesh,
    sweep,
)
from bpy_kit import mesh_objects, socket, sphere  # noqa: E402

FOOTPRINT = (4, 4)

# ===========================================
# Palette tokens
# ===========================================

DARK = "bug-chitin-dark"
MID = "bug-chitin-mid"
TAN = "bug-chitin-tan"
BONE = "bug-bone"
BLACK = "bug-chitin-black"
MAGENTA = "bug-bio-magenta"
GREEN = "bug-bio-green"

# ===========================================
# Proportions (tiles; `finish` only trims the height to HEIGHT)
# ===========================================

#: Height to the tip of the tallest crown blade, the manifest height.
HEIGHT = 3.5
#: The widest and deepest she may be: just inside the 4×4 footprint.
MAX_SPAN = 3.9

#: The lower body under the mantle: centre and radii across, along and up.
CARAPACE = (0.0, 0.1, 1.0)
CARAPACE_RADII = (0.6, 0.95, 0.38)

#: The upright torso's centreline from the waist to the collar, with its
#: half-widths across and half-depths front to back.
TORSO = ((0.0, -0.42, 1.08), (0.0, -0.56, 1.44), (0.0, -0.66, 1.8),
         (0.0, -0.72, 2.1), (0.0, -0.74, 2.36))
TORSO_WIDTHS = (0.48, 0.38, 0.46, 0.54, 0.36)
TORSO_DEPTHS = (0.38, 0.29, 0.32, 0.34, 0.23)

#: The neck from the collar to the back of the skull.
NECK = ((0.0, -0.74, 2.3), (0.0, -0.81, 2.58), (0.0, -0.87, 2.82))
#: The head: skull centreline from the nape to the beak.
SKULL = ((0.0, -0.8, 2.96), (0.0, -0.93, 2.97), (0.0, -1.08, 2.9),
         (0.0, -1.21, 2.79), (0.0, -1.3, 2.68))

#: The crown's ring sits on the back of the skull. Its blades rise from the
#: ring round the back and sides of the head (open at the face) and flare
#: outward and back, so the side blades stay in the silhouette from any yaw
#: and the crown reads as a pale star from above, the gem at its centre.
CROWN_RING = Vector((0.0, -0.84, 3.07))
CROWN_RING_RADIUS = 0.13
#: Long blades: azimuth (0 straight back, ±180 the face), lean out from
#: vertical (degrees), length.
CROWN_BLADES = ((0, 44, 1.1), (24, 47, 1.12), (48, 52, 1.06), (72, 58, 0.96),
                (96, 62, 0.84), (120, 60, 0.68), (144, 54, 0.5))
#: The short, steeper inner row between the long blades.
CROWN_INNER = ((12, 32, 0.6), (36, 34, 0.6), (60, 38, 0.56), (84, 40, 0.5), (108, 40, 0.42))
#: Blades that carry a thin green vein up their outer face.
CROWN_VEINED = (48, 96)

#: Shoulder and elbow of each scythe arm (x for the right side).
SHOULDER = (0.46, -0.72, 2.2)
ELBOW = (0.76, -1.02, 1.42)
#: The scythe blade's plane turns this far from facing straight ahead, so
#: its broad face shows to the front and to its own side.
SCYTHE_TURN = math.radians(16)
#: The blade's back edge from its root at the elbow: (outward, up) in its
#: plane. It rises in a tusk-like crescent and folds its point in across the
#: chest toward the throat.
SCYTHE = ((0.0, 0.0), (0.18, 0.36), (0.24, 0.78), (0.14, 1.16), (-0.08, 1.42), (-0.38, 1.54))

#: The small forearm under each scythe: chest root, elbow, wrist.
HAND = ((0.28, -1.0, 1.72), (0.46, -1.28, 1.56), (0.38, -1.54, 1.64))

#: Leg anchors per index: radius, hip, knee, ankle, foot (x for the right).
LEGS = (
    (0, 0.2, (0.42, -0.52, 0.92), (1.0, -0.98, 1.36), (1.34, -1.36, 0.5), (1.44, -1.52, 0.0)),
    (1, 0.21, (0.56, 0.04, 0.9), (1.26, -0.02, 1.4), (1.64, -0.06, 0.5), (1.74, -0.08, 0.0)),
    (2, 0.2, (0.52, 0.58, 0.9), (1.04, 0.98, 1.34), (1.38, 1.3, 0.5), (1.48, 1.42, 0.0)),
)

#: The mantle's centreline (y, z) from the upper back down over the body to
#: the train's end on the ground, before smoothing.
MANTLE_PATH = ((-0.62, 2.5), (-0.46, 2.26), (-0.3, 2.0), (-0.1, 1.78), (0.22, 1.66),
               (0.58, 1.52), (0.92, 1.22), (1.2, 0.82), (1.42, 0.44), (1.62, 0.2),
               (1.9, 0.14))
#: How far round the arch the plates reach either side of the centreline.
MANTLE_PHI = 1.2
#: Row spacing and plate length along the mantle, as arclength.
MANTLE_ROW = 0.4
MANTLE_PLATE = 0.76
#: About how wide one plate is, across the arch.
MANTLE_PLATE_WIDTH = 0.36

# ===========================================
# Small helpers
# ===========================================


def _lerp(a, b, t):
    """Point a fraction ``t`` of the way from ``a`` to ``b``."""
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


def _side(point, side):
    """Mirror an authored right-side point onto ``side`` (-1 left, 1 right)."""
    return (point[0] * side, point[1], point[2])


def _ring_faces(rings, sides):
    """Quads joining consecutive rings, plus a cap at each end."""
    faces = []
    for i in range(rings - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))),
                  tuple((rings - 1) * sides + k for k in range(sides))])
    return faces


def _loft(name, points, widths, depths, normal, token, sides=6, toward=None,
          shift=None, smooth=True):
    """Loft capped rings whose width axis stays in the plane of ``normal``.

    ``crescent_geometry.sweep`` picks each ring's frame from the tangent, so a
    flat blade twists where its path turns along X. Here the width axis is
    always ``normal × tangent``: a crown blade or scythe keeps its broad face
    toward ``normal`` from root to tip. ``toward`` flips the width axis to
    point at that point, and ``shift`` moves each ring that many widths along
    it (a blade grown off one side of its spine).
    """
    pts = [Vector(p) for p in points]
    n = Vector(normal).normalized()
    shift = shift or [0.0] * len(pts)
    vertices = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
        u = n.cross(t).normalized()
        if toward is not None and u.dot(Vector(toward) - p) < 0:
            u = -u
        v = t.cross(u).normalized()
        w, d = max(widths[i], 0.0015), max(depths[i], 0.0015)
        centre = p + u * shift[i] * w
        for k in range(sides):
            a = k * math.tau / sides
            vertices.append(centre + u * math.cos(a) * w + v * math.sin(a) * d)
    return mesh(name, vertices, _ring_faces(len(pts), sides), token, smooth)


def _sharpen(ob, pairs):
    """Mark the edges joining each vertex pair sharp, so smooth faces split there only."""
    wanted = {frozenset(p) for p in pairs}
    for edge in ob.data.edges:
        if frozenset(edge.vertices) in wanted:
            edge.use_edge_sharp = True


#: A pointed, keeled plate: outline (across -1..1, along 0 top .. 1 tip) and
#: the two keel points raised along its centre.
PLATE_OUTLINE = ((-0.7, 0.0), (-1.0, 0.3), (-0.6, 0.68), (0.0, 1.0),
                 (0.6, 0.68), (1.0, 0.3), (0.7, 0.0))
PLATE_KEEL = ((0.0, 0.06), (0.0, 0.56))


def _plate(name, at, token, keel, thickness, rim=None):
    """A keeled pointed plate laid through ``at(across, along, lift)``.

    ``at`` maps the plate's own coordinates onto a surface, so the same
    outline serves a chest chevron and a mantle scale curved over the arch.
    Faces are smooth with a sharp edge round the top outline: crisp plate
    edges at a third of the vertices of flat shading. ``rim`` is
    ``(grow_across, grow_along, token)``: a slightly larger backing slab
    tucked under the plate whose edge shows as a coloured rim.

    ```
        TL ___ K0 ___ TR      top edge (tucked under the row above)
          /     |     \\
         L      K1     R      keel K0-K1 raised by ``keel``
          \\     |     /
           LL   |   LR
              \\ | /
               TIP
    ```
    """
    top = [at(a, b, 0.0) for a, b in PLATE_OUTLINE]
    ridge = [at(a, b, keel) for a, b in PLATE_KEEL]
    bottom = [at(a, b, -thickness) for a, b in PLATE_OUTLINE]
    faces = [(0, 1, 8, 7), (1, 2, 8), (2, 3, 8), (3, 4, 8), (4, 5, 8), (5, 6, 7, 8), (6, 0, 7),
             tuple(reversed(range(9, 16)))]
    faces += [(i, (i + 1) % 7, 9 + (i + 1) % 7, 9 + i) for i in range(7)]
    ob = mesh(name, top + ridge + bottom, faces, token, smooth=True)
    _sharpen(ob, [(i, (i + 1) % 7) for i in range(7)])
    if rim:
        grow_a, grow_b, rim_token = rim
        outline = [(a * grow_a, 0.5 + (b - 0.5) * grow_b) for a, b in PLATE_OUTLINE]
        upper = [at(a, b, -0.3 * thickness) for a, b in outline]
        lower = [at(a, b, -1.4 * thickness) for a, b in outline]
        slab = [tuple(range(7)), tuple(reversed(range(7, 14)))]
        slab += [(i, (i + 1) % 7, 7 + (i + 1) % 7, 7 + i) for i in range(7)]
        backing = mesh(name + "_rim", upper + lower, slab, rim_token, smooth=True)
        _sharpen(backing, [(i, (i + 1) % 7) for i in range(7)])
    return ob


def _flat_frame(origin, across, along, normal, half_width, length, curve=0.0):
    """``at`` for `_plate` on a gently curved patch: centre-top at ``origin``."""
    o, x, y, n = (Vector(v) for v in (origin, across, along, normal))
    x, y, n = x.normalized(), y.normalized(), n.normalized()

    def at(a, b, lift):
        return o + x * (a * half_width) + y * (b * length) + n * (lift - curve * a * a)

    return at


def _perpendicular(direction, hint):
    """The part of ``hint`` at right angles to ``direction``, normalised."""
    d = Vector(direction).normalized()
    h = Vector(hint)
    return (h - d * h.dot(d)).normalized()


def _curve(keys, f):
    """Piecewise-linear lookup of ``(fraction, value)`` keys."""
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            t = (f - f0) / (f1 - f0) if f1 > f0 else 0.0
            return v0 + (v1 - v0) * min(max(t, 0.0), 1.0)
    return keys[-1][1]


# ===========================================
# Mantle surface
# ===========================================


def _chaikin(points, iterations=3):
    """Round a polyline's corners, keeping both ends fixed."""
    pts = [Vector(p) for p in points]
    for _ in range(iterations):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        out.append(pts[-1])
        pts = out
    return pts


class _MantleSurface:
    """The mantle as an arched sheet over the back: arclength ``s``, across ``a``.

    The centreline runs in the YZ plane from the upper back to the train's
    end. Its cross-section is an arc of radius ``R(s)`` whose sides droop
    toward the body (a cape round the shoulders, a skirt over the flanks)
    and flatten where the train lies on the ground.

    ```
        cross-section over the body      a = -1 ... 0 ... 1
                 ____centre____
               /                \\        droop pulls the edges down
             /                    \\
          edge                    edge
    ```
    """

    def __init__(self):
        pts = _chaikin([Vector((0.0, y, z)) for y, z in MANTLE_PATH])
        self.points = pts
        self.lengths = [0.0]
        for a, b in zip(pts, pts[1:]):
            self.lengths.append(self.lengths[-1] + (b - a).length)
        self.total = self.lengths[-1]

    def centre(self, s):
        """Centreline point and unit tangent at arclength ``s``, extended straight past either end."""
        if s <= 0.0:
            t = (self.points[1] - self.points[0]).normalized()
            return self.points[0] + t * s, t
        for i in range(len(self.lengths) - 1):
            if self.lengths[i + 1] >= s:
                span = self.lengths[i + 1] - self.lengths[i]
                f = (s - self.lengths[i]) / span if span else 0.0
                a, b = self.points[i], self.points[i + 1]
                return a.lerp(b, f), (b - a).normalized()
        t = (self.points[-1] - self.points[-2]).normalized()
        return self.points[-1] + t * (s - self.total), t

    def radius(self, f):
        """Arch radius at fraction ``f`` down the mantle: shoulders, broad back, tapered train."""
        return _curve(((0.0, 0.56), (0.18, 0.74), (0.4, 0.94), (0.6, 0.96), (0.8, 0.82),
                       (1.0, 0.7)), f)

    def droop(self, f):
        """How much of the arch hangs down: full over the body, nearly flat on the ground."""
        return _curve(((0.0, 0.8), (0.6, 0.9), (0.8, 0.4), (1.0, 0.1)), f)

    def point(self, s, a):
        """Surface point at arclength ``s`` and across ``a`` (-1 left edge, 1 right)."""
        c, t = self.centre(s)
        f = min(max(s / self.total, 0.0), 1.0)
        r, phi = self.radius(f), a * MANTLE_PHI
        up = Vector((0.0, -t.z, t.y))
        return c + Vector((r * math.sin(phi), 0.0, 0.0)) - up * (r * (1 - math.cos(phi)) * self.droop(f))

    def normal(self, s, a):
        """Outward unit normal at (``s``, ``a``), by finite differences."""
        e = 0.01
        ds = self.point(s + e, a) - self.point(s - e, a)
        da = self.point(s, a + e) - self.point(s, a - e)
        n = da.cross(ds).normalized()
        _, t = self.centre(s)
        outward = Vector((math.sin(a * MANTLE_PHI), -t.z, t.y))
        return n if n.dot(outward) > 0 else -n


# ===========================================
# Body parts
# ===========================================


def carapace() -> None:
    """The long six-legged lower body: walnut shell, black belly, chestnut flank plates."""
    before = set(mesh_objects())
    bead("carapace_core", CARAPACE, 1.0, DARK, scale=CARAPACE_RADII, segments=16, rings=10)
    cx, cy, cz = CARAPACE
    bead("carapace_belly", (cx, cy + 0.02, cz - 0.2), 1.0, BLACK,
         scale=(CARAPACE_RADII[0] * 0.8, CARAPACE_RADII[1] * 0.84, 0.2), segments=12, rings=6)
    # Chestnut flank plates over the hips, under the mantle's skirt.
    for side in (-1, 1):
        for i, y in enumerate((-0.24, 0.32)):
            at = _flat_frame((side * 0.6, y - 0.2, 1.16), (0, 1, 0), (-side * 0.2, 0, -1), (side, 0, 0.2),
                             0.24, 0.32, curve=0.04)
            _plate(f"carapace_flank{side}_{i}", at, MID, 0.03, 0.03)
    group_new(before, "carapace")


def torso() -> None:
    """The upright torso and long neck, with chestnut chevrons down the chest."""
    before = set(mesh_objects())
    sweep("torso_core", list(TORSO), list(TORSO_WIDTHS), list(TORSO_DEPTHS), token=DARK, sides=12)
    bead("torso_waist", (0.0, -0.44, 1.12), 1.0, BLACK, scale=(0.48, 0.42, 0.2), segments=14, rings=6)
    # Chevrons down the chest, widest under the collar.
    for i, (z, half, length) in enumerate(((2.28, 0.3, 0.26), (2.06, 0.34, 0.28), (1.84, 0.3, 0.26),
                                           (1.62, 0.26, 0.25), (1.4, 0.23, 0.24))):
        y = _torso_front(z) - 0.005
        at = _flat_frame((0.0, y, z), (1, 0, 0), (0, -0.2, -1), (0, -1, 0.2), half, length, curve=0.08)
        _plate(f"torso_chevron{i}", at, MID, 0.04, 0.03)
    # The long neck, ringed with chestnut collars.
    sweep("torso_neck", list(NECK), [0.16, 0.12, 0.105], token=DARK, sides=10)
    for i, t in enumerate((0.28, 0.52, 0.76)):
        p = _lerp(NECK[0], NECK[-1], t)
        bead(f"torso_neck_ring{i}", p, 0.15 - 0.018 * i, MID, scale=(1.0, 1.0, 0.34), segments=12, rings=5)
    group_new(before, "torso")


def _torso_front(z):
    """The torso's front surface (y) at height ``z`` along its centreline."""
    for (a, b), (da, db) in zip(zip(TORSO, TORSO[1:]), zip(TORSO_DEPTHS, TORSO_DEPTHS[1:])):
        if a[2] <= z <= b[2]:
            t = (z - a[2]) / (b[2] - a[2])
            return a[1] + (b[1] - a[1]) * t - (da + (db - da) * t)
    return TORSO[-1][1] - TORSO_DEPTHS[-1]


def head() -> None:
    """A narrow beaked head: green eye clusters either side, a chestnut brow keel, mandibles."""
    before = set(mesh_objects())
    sweep("head_skull", list(SKULL), [0.11, 0.155, 0.14, 0.09, 0.022], [0.12, 0.14, 0.12, 0.07, 0.016],
          token=DARK, sides=10)
    keel = [(x, y, z + d) for (x, y, z), d in zip(SKULL[:4], (0.1, 0.13, 0.11, 0.06))]
    sweep("head_keel", keel, [0.05, 0.1, 0.08, 0.02], [0.02, 0.035, 0.03, 0.01], token=MID, sides=6)
    for side in (-1, 1):
        # Three eyes per cluster, each set in a dark socket.
        for i, (y, z, r) in enumerate(((-1.04, 2.95, 0.04), (-0.95, 3.0, 0.032), (-1.13, 2.89, 0.027))):
            x = side * (0.13 - 0.014 * i)
            bead(f"head_socket{side}_{i}", (x - side * 0.01, y, z), r * 1.3, BLACK, segments=8, rings=5)
            bead(f"head_eye{side}_{i}", (x + side * 0.012, y - 0.01, z), r, GREEN, scale=(0.8, 1.0, 1.0),
                 segments=8, rings=5)
        hooked_blade(f"head_mandible{side}",
                     [(side * 0.055, -1.17, 2.74), (side * 0.11, -1.27, 2.66), (side * 0.035, -1.35, 2.6)],
                     [0.04, 0.025, 0.001], 0.022, 0.01)
    group_new(before, "head")


def _crown_frame(azimuth, lean):
    """A blade's root on the ring, its direction, and the ring's tangent there.

    ``azimuth`` is in degrees from straight back (+Y) toward +X, ``lean`` the
    blade's tilt out from vertical. Every blade also sweeps a little back.
    """
    psi, lam = math.radians(azimuth), math.radians(lean)
    radial = Vector((math.sin(psi), math.cos(psi), 0.0))
    tangent = Vector((math.cos(psi), -math.sin(psi), 0.0))
    root = CROWN_RING + radial * CROWN_RING_RADIUS
    direction = (radial * math.sin(lam) + Vector((0.0, 0.0, math.cos(lam))) + Vector((0.0, 0.22, 0.0)))
    return root, direction.normalized(), tangent


def _crown_blade(name, azimuth, lean, length, widths, depths):
    """One pale blade off the ring, flaring further out toward its tip.

    Its broad face lies along the ring (width toward its neighbours), so
    the blades read as one continuous crown. Returns the centreline and the
    face's outward normal.
    """
    root, _, tangent = _crown_frame(azimuth, lean)
    points = []
    for f in (0.0, 0.3, 0.55, 0.8, 1.0):
        _, d, _ = _crown_frame(azimuth, lean + 22 * f * f)
        points.append(root + d * (length * f) - Vector((0.0, 0.0, 0.04 * (1 - f))))
    _, d, _ = _crown_frame(azimuth, lean)
    normal = tangent.cross(d).normalized()
    _loft(name, points, widths, depths, normal, BONE, sides=6)
    return points, normal


def crown() -> None:
    """The crown: flared pale blades round the back of the head, a magenta gem, green veins."""
    before = set(mesh_objects())
    for i, (azimuth, lean, length) in enumerate(CROWN_BLADES):
        for sign in ((1,) if azimuth == 0 else (-1, 1)):
            name = f"crown_blade{i}_{'l' if sign < 0 else 'r'}"
            points, normal = _crown_blade(name, sign * azimuth, lean, length, [0.06, 0.095, 0.08, 0.045, 0.0],
                                          [0.03, 0.03, 0.025, 0.015, 0.0])
            # A thin green vein up the outer face of a few blades.
            if azimuth in CROWN_VEINED:
                vein = [p + normal * 0.03 for p in points[1:4]]
                sweep(name + "_vein", vein, [0.01, 0.009, 0.004], token=GREEN, sides=5)
    for i, (azimuth, lean, length) in enumerate(CROWN_INNER):
        for sign in (-1, 1):
            _crown_blade(f"crown_inner{i}_{'l' if sign < 0 else 'r'}", sign * azimuth, lean, length,
                         [0.045, 0.07, 0.06, 0.035, 0.0], [0.024, 0.024, 0.02, 0.013, 0.0])
    # The ring itself: a dark band round the skull under a chestnut diadem.
    bead("crown_band", tuple(CROWN_RING), CROWN_RING_RADIUS + 0.05, BLACK, scale=(1.0, 1.0, 0.5),
         segments=14, rings=6)
    bead("crown_diadem", tuple(CROWN_RING + Vector((0.0, 0.0, 0.05))), CROWN_RING_RADIUS + 0.03, MID,
         scale=(1.0, 1.0, 0.36), segments=14, rings=5)
    face = _gem_normal()
    tilt = math.atan2(face.z, -face.y)
    gem = sphere("crown_gem", 0.12, tuple(_gem_point()), MAGENTA, segments=6, rings=4,
                 scale=(0.8, 0.55, 1.3), smooth=False)
    gem.rotation_euler = (-tilt, 0.0, 0.0)
    gem["atlas_preserve_uv"] = True
    group_new(before, "crown")


def _gem_normal():
    """The way the gem faces: forward and up, between the camera and the sky."""
    return Vector((0.0, -0.6, 0.8)).normalized()


def _gem_point():
    """The magenta gem's centre, set in the diadem at the middle of the crown."""
    return CROWN_RING + Vector((0.0, -0.02, 0.1))


def mantle() -> None:
    """Rows of overlapping walnut and chestnut plates with tan rims, draped like a train.

    Each plate tucks its top edge under the row above and lifts its point
    over the row below, so the rows shingle from the upper back to the
    train's end on the ground.
    """
    before = set(mesh_objects())
    surface = _MantleSurface()
    rows = int((surface.total - MANTLE_PLATE) / MANTLE_ROW) + 1
    for k in range(rows):
        s0 = k * MANTLE_ROW
        f = min((s0 + MANTLE_PLATE * 0.5) / surface.total, 1.0)
        arc = 2 * surface.radius(f) * MANTLE_PHI
        count = max(2, round(arc / MANTLE_PLATE_WIDTH)) + (k % 2)
        half = 1.0 / count * 1.2
        for j in range(count):
            centre = -1.0 + (2 * j + 1) / count
            # Alternate plates sit a touch higher, so side overlaps shingle too.
            step = 0.01 if j % 2 else 0.0
            # Plates lengthen down the train, and the hem's plates hang
            # longest, so the edge reads as a feathered, pointed fringe.
            length = MANTLE_PLATE * (1.0 + 0.2 * f + (0.24 if abs(centre) > 0.72 else 0.0)
                                     + (0.2 if k == rows - 1 else 0.0))
            # ...but never past the train's end on the ground.
            length = min(length, surface.total + 0.02 - s0)

            def at(a, b, lift, s0=s0, centre=centre, half=half, step=step, length=length):
                s = s0 + b * length
                across = centre + a * half
                return surface.point(s, across) + surface.normal(s, across) * (
                    -0.04 + 0.13 * b + step + lift)

            # Walnut plates, with a chestnut stripe down the spine.
            token = MID if abs(centre) < 0.2 else DARK
            _plate(f"mantle_plate{k}_{j}", at, token, 0.03, 0.022, rim=(1.14, 1.08, TAN))
    group_new(before, "mantle")


# ===========================================
# Limbs
# ===========================================


def armoured_leg(name, hip, knee, ankle, foot, r, side):
    """A heavy leg: chestnut thigh plate, leaf greave on the shin, black joints, bone claw."""
    before = set(mesh_objects())
    out = Vector((side, 0.0, 0.0))
    up = Vector((0.0, 0.0, 1.0))
    bead(name + "_hip", hip, r * 0.9, BLACK, segments=10, rings=6)
    sweep(name + "_femur", [hip, _lerp(hip, knee, 0.5), knee], [r * 0.7, r * 0.68, r * 0.58], token=DARK,
          sides=8)
    # Thigh armour: a broad chestnut lens over the top of the femur.
    femur = Vector(knee) - Vector(hip)
    lid = _perpendicular(femur, up + out * 0.5)
    plate = [Vector(_lerp(hip, knee, t)) + lid * r * 0.42 for t in (0.1, 0.36, 0.7, 1.0)]
    _loft(name + "_thigh", plate, [r * 0.6, r * 1.02, r * 0.98, r * 0.5], [r * 0.28, r * 0.5, r * 0.46, r * 0.22],
          lid, MID, sides=8)
    bead(name + "_knee", knee, r * 0.72, BLACK, segments=10, rings=6)
    # A short dark spur off the knee, the sheet's barbed joint.
    spur_dir = (lid + femur.normalized() * 0.8).normalized()
    spur = [Vector(knee) + lid * r * 0.3, Vector(knee) + spur_dir * r * 1.1, Vector(knee) + spur_dir * r * 1.7]
    sweep(name + "_spur", spur, [r * 0.3, r * 0.16, 0.002], token=BLACK, sides=6)
    sweep(name + "_tibia", [knee, _lerp(knee, ankle, 0.5), ankle], [r * 0.52, r * 0.44, r * 0.32],
          token=BLACK, sides=8)
    # The shin's big pointed leaf plate on its outer face.
    shin = Vector(ankle) - Vector(knee)
    face = _perpendicular(shin, out + Vector((0.0, -0.4 if foot[1] < -0.5 else 0.4 if foot[1] > 0.5 else 0.0, 0.3)))
    greave = [Vector(_lerp(knee, ankle, t)) + face * r * 0.36 for t in (0.02, 0.22, 0.5, 0.8, 1.06)]
    _loft(name + "_greave", greave, [r * 0.6, r * 1.2, r * 1.16, r * 0.72, 0.0],
          [r * 0.24, r * 0.46, r * 0.44, r * 0.3, 0.0], face, MID, sides=8)
    bead(name + "_ankle", ankle, r * 0.4, BLACK, segments=8, rings=6)
    # The tarsus ends in a long pale claw that bites the ground.
    sweep(name + "_tarsus", [ankle, _lerp(ankle, foot, 0.45)], [r * 0.34, r * 0.28], token=DARK, sides=8)
    sweep(name + "_claw", [_lerp(ankle, foot, 0.4), _lerp(ankle, foot, 0.72), foot],
          [r * 0.28, r * 0.17, 0.002], token=BONE, sides=8)
    for toe in (-1, 1):
        base = _lerp(ankle, foot, 0.8)
        tip = (foot[0] + toe * r * 0.45 + side * r * 0.2, foot[1] - r * 0.5, 0.004)
        sweep(f"{name}_toe{toe}", [base, _lerp(base, tip, 0.5), tip], [r * 0.12, r * 0.08, 0.002],
              token=BONE, sides=5)
    return joint_origin(group_new(before, name), hip)


def legs() -> None:
    """Six armoured legs planted wide to the footprint's edges."""
    for side in (-1, 1):
        label = "l" if side < 0 else "r"
        for index, radius, *anchors in LEGS:
            hip, knee, ankle, foot = (_side(p, side) for p in anchors)
            armoured_leg(f"leg_{label}{index}", hip, knee, ankle, foot, radius, side)


def scythe(side: int) -> bpy.types.Object:
    """One scythe arm: walnut upper arm, black elbow, a tall pale crescent with a black back."""
    label = "l" if side < 0 else "r"
    name = f"scythe_{label}"
    before = set(mesh_objects())
    shoulder, elbow = _side(SHOULDER, side), _side(ELBOW, side)
    bead(name + "_shoulder", shoulder, 0.11, BLACK, segments=10, rings=6)
    sweep(name + "_upper", [shoulder, _lerp(shoulder, elbow, 0.5), elbow], [0.09, 0.085, 0.075],
          token=DARK, sides=8)
    arm = Vector(elbow) - Vector(shoulder)
    lid = _perpendicular(arm, Vector((side * 1.0, -0.6, 0.2)))
    plate = [Vector(_lerp(shoulder, elbow, t)) + lid * 0.05 for t in (0.12, 0.4, 0.72, 0.95)]
    _loft(name + "_armour", plate, [0.065, 0.11, 0.1, 0.055], [0.028, 0.05, 0.045, 0.022], lid, MID, sides=8)
    bead(name + "_elbow", elbow, 0.095, BLACK, segments=10, rings=6)
    # The blade's plane is turned out toward its own side; "out" runs along it.
    out = Vector((side * math.cos(SCYTHE_TURN), math.sin(SCYTHE_TURN), 0.0))
    normal = Vector((side * math.sin(SCYTHE_TURN), -math.cos(SCYTHE_TURN), 0.0))
    root = Vector(elbow) + Vector((side * 0.02, -0.05, 0.06))
    spine = [root + out * h + Vector((0.0, 0.0, z)) for h, z in SCYTHE]
    inner = root + out * -0.4 + Vector((0.0, 0.0, 0.72))
    _loft(name + "_blade", spine, [0.08, 0.15, 0.165, 0.145, 0.1, 0.0], [0.055, 0.07, 0.07, 0.06, 0.044, 0.0],
          normal, BONE, sides=8, toward=inner, shift=[0.45, 0.55, 0.55, 0.55, 0.5, 0.0])
    _loft(name + "_back", spine, [0.04, 0.036, 0.034, 0.03, 0.022, 0.0], [0.045, 0.045, 0.043, 0.036, 0.026, 0.0],
          normal, BLACK, sides=6)
    # A short bone spur behind the elbow.
    heel = (elbow[0] + side * 0.1, elbow[1] + 0.14, elbow[2] - 0.2)
    sweep(name + "_spur", [elbow, _lerp(elbow, heel, 0.5), heel], [0.045, 0.028, 0.002], token=BONE, sides=6)
    return joint_origin(group_new(before, name), shoulder)


def hand(side: int) -> bpy.types.Object:
    """A small forearm held forward, three bone-tipped claws curling down."""
    label = "l" if side < 0 else "r"
    name = f"hand_{label}"
    before = set(mesh_objects())
    root, elbow, wrist = (_side(p, side) for p in HAND)
    bead(name + "_root", root, 0.065, BLACK, segments=8, rings=6)
    sweep(name + "_upper", [root, elbow], [0.055, 0.046], token=DARK, sides=8)
    bead(name + "_elbow", elbow, 0.055, BLACK, segments=8, rings=6)
    sweep(name + "_fore", [elbow, _lerp(elbow, wrist, 0.5), wrist], [0.05, 0.056, 0.044], token=MID, sides=8)
    palm = (wrist[0], wrist[1] - 0.05, wrist[2] - 0.01)
    bead(name + "_palm", palm, 0.06, DARK, scale=(1.0, 1.1, 0.7), segments=10, rings=6)
    for k, spread in enumerate((-0.055, 0.0, 0.055)):
        knuckle = (palm[0] + spread + side * 0.01, palm[1] - 0.08, palm[2] + 0.01)
        bend = (knuckle[0] + spread * 0.4, knuckle[1] - 0.065, knuckle[2] - 0.045)
        tip = (bend[0] + spread * 0.2, bend[1] - 0.01, bend[2] - 0.1)
        sweep(f"{name}_finger{k}", [palm, knuckle], [0.024, 0.02], token=BLACK, sides=6)
        sweep(f"{name}_claw{k}", [knuckle, bend, tip], [0.02, 0.014, 0.002], token=BONE, sides=6)
    ob = group_new(before, name)
    _set_origin(ob, root)
    return ob


def _set_origin(ob, anchor):
    """Move an object's origin to ``anchor`` without moving its mesh."""
    bpy.context.view_layer.update()
    target = Vector(anchor)
    offset = target - ob.location
    for vertex in ob.data.vertices:
        vertex.co -= offset
    ob.location = target
    return ob


def _parent_keep(child_name, parent_name):
    """Make one object a child of another without moving it in the world."""
    bpy.context.view_layer.update()
    child = bpy.data.objects[child_name]
    parent = bpy.data.objects[parent_name]
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse.identity()
    child.matrix_world = world
    bpy.context.view_layer.update()


# ===========================================
# Build
# ===========================================


def build_sovereign() -> None:
    """Build the Sovereign standing on the ground, front toward -Y."""
    carapace()
    torso()
    mantle()
    head()
    crown()
    legs()
    for side in (-1, 1):
        scythe(side)
        hand(side)
    socket("crown", tuple(_gem_point()))
    finish(HEIGHT, MAX_SPAN, MAX_SPAN)
    # Parent after `finish`, which bakes every mesh into world space: each
    # hand becomes a child of its scythe, so the side's arm group stays one
    # top-level node and the rig uses the authored shoulder joint.
    for label in ("l", "r"):
        _parent_keep(f"hand_{label}", f"scythe_{label}")
