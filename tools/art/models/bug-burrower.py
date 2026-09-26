r"""Bug: bug-burrower, the Act II tunneller (#1179). Run through make_model.py.

The brown family's digger (concept: docs/design/concepts/campaign/burrower.md,
brief: docs/design/kits/campaign-bestiary.md#burrower). It shares the family's
materials and joint anatomy, and owns a silhouette nothing else has: a long,
low body of seven overlapping chestnut bands with tan front rims, a blunt
wedge head capped by a pale ploughshare, and two huge serrated spade
forelimbs splayed forward either side of the head.

```
     top view, front up (-Y)                 side view, front to the left (-Y)

   blade_l   ploughshare   blade_r                  bands 0 .. 6
   |vvvvv|      /  \      |vvvvv|             _________________________
    \   /      |    |      \   /          ___/ |  |  |  |  |  |  |    \__ tail
     \_/-------[band 0]-------\_/     plough/   |  |  |  |  |  |  |       /
               [band 1]                 /______|__|__|__|__|__|__|______/
      leg_l0 --[band 2]-- leg_r0       blade     leg0      leg1     leg2
      leg_l1 --[band 3]-- leg_r1
               [band 4]
      leg_l2 --[band 5]-- leg_r2   <- two green breathing slits a side
               [band 6]
                 tail
```

Each band's front edge stands proud of the band ahead, so the tan rims read
as concentric arches from the front and as stripes from above, and still read
when the model is sunk half through the ground for a burrow or surface move.
Every piece is a closed shell, and the underside is closed by a dark belly.

Rig (UnitMotionRig): six short digging legs ``leg_[lr]0..2`` and two shovel
arms ``blade_l`` / ``blade_r``, each one top-level node whose origin is its
hip or shoulder and carries ``motion_joint``. The body is ``carapace`` and the
face is ``head`` (its origin is forward of the body, for the facing check).
"""

import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crescent_geometry import bead, finish, group_new, joint_origin, mesh, sweep  # noqa: E402
from bpy_kit import mesh_objects  # noqa: E402

FOOTPRINT = (1, 1)

# ===========================================
# Proportions (tile units, authored at final scale; `finish` trims the height)
# ===========================================

#: Height to the top of the back (bestiary brief).
HEIGHT = 0.45
#: Bounds kept inside one tile, so the diagonal of the box stays under the tile's.
MAX_WIDTH = 0.95
MAX_DEPTH = 0.98

#: The seven back bands: front edge of the first, step between front edges, length.
BAND_COUNT = 7
BAND_START = -0.245
BAND_STEP = 0.088
BAND_LENGTH = 0.102
#: Centre height of every band's arch and how far round the flank it wraps.
ARCH_CENTRE_Z = 0.18
ARCH_SPREAD = math.radians(102)
ARCH_SEGMENTS = 12
#: Outer scale of each band's front, middle and rear ring: the rear tucks under the next band.
BAND_SCALES = (0.985, 1.0, 0.945)
#: The tan rim wraps the front edge of each band, standing proud of the band ahead.
RIM_LENGTH = 0.016

#: Head wedge: ring centres from inside the first band to the snout, half-widths, half-depths.
HEAD_PATH = [(0, -0.19, 0.25), (0, -0.29, 0.215), (0, -0.37, 0.15), (0, -0.425, 0.08)]
HEAD_WIDTHS = [0.16, 0.15, 0.12, 0.065]
HEAD_DEPTHS = [0.13, 0.115, 0.082, 0.034]

#: Lowest point of the closed belly.
BELLY_Z = 0.06

#: Shovel arm: shoulder, elbow and wrist on the right (+X) side; mirrored for the left.
SHOULDER = (0.12, -0.17, 0.17)
ELBOW = (0.2, -0.235, 0.2)
WRIST = (0.25, -0.28, 0.2)
#: Spade blade: length from the wrist, half-widths at the heel and the cutting edge.
SPADE_LENGTH = 0.24
SPADE_HEEL = 0.045
SPADE_EDGE = 0.135
SPADE_TEETH = 6

#: Digging legs on the right side as (hip, knee, foot); mirrored for the left.
LEGS = [
    ((0.13, -0.06, 0.12), (0.26, -0.045, 0.175), (0.32, 0.0, 0.003)),
    ((0.13, 0.1, 0.12), (0.265, 0.12, 0.17), (0.32, 0.18, 0.003)),
    ((0.11, 0.25, 0.12), (0.235, 0.28, 0.16), (0.28, 0.35, 0.003)),
]
LEG_RADIUS = 0.031


# ===========================================
# Body profile
# ===========================================


def band_half_width(y: float) -> float:
    """Half-width of the back at ``y``: broadest just behind the head, tapering to the tail."""
    peak = -0.05
    k = 0.92 if y < peak else 0.42
    return 0.205 - k * (y - peak) ** 2


def band_top(y: float) -> float:
    """Height of the back's crown at ``y``."""
    peak = -0.03
    k = 1.74 if y < peak else 0.87
    return HEIGHT - k * (y - peak) ** 2


def arch_ring(y, scale, inset=0.0):
    """One arch cross-section of the back at ``y``, scaled about the arch centre.

    Args:
        y: Station along the body.
        scale: Outer scale of the section (1 is the body profile).
        inset: Pull the section in by this much (the shell's inner surface).
    """
    half = band_half_width(y) * scale - inset
    rise = (band_top(y) - ARCH_CENTRE_Z) * scale - inset
    points = []
    for k in range(ARCH_SEGMENTS + 1):
        theta = -ARCH_SPREAD + 2 * ARCH_SPREAD * k / ARCH_SEGMENTS
        points.append((math.sin(theta) * half, y, ARCH_CENTRE_Z + math.cos(theta) * rise))
    return points


def thick_arch(name, rings, thickness, token, smooth=False):
    """Close a shell from arch sections: outer and inner surfaces, flanks and both ends.

    ```
     outer 0 ... outer n        each ring is one closed loop of 2(n+1) points;
       |             |          rings are lofted, and the first and last loops
     inner 0 ... inner n        are capped by a quad strip between the arches
    ```

    Args:
        rings: ``(y, scale)`` stations front to back.
        thickness: Shell thickness.
        token: Palette token.
    """
    count = ARCH_SEGMENTS + 1
    loop = 2 * count
    vertices, faces = [], []
    for y, scale in rings:
        vertices.extend(arch_ring(y, scale) + arch_ring(y, scale, thickness)[::-1])
    for r in range(len(rings) - 1):
        for k in range(loop):
            a, b = r * loop + k, r * loop + (k + 1) % loop
            faces.append((a, b, b + loop, a + loop))
    for r in (0, len(rings) - 1):
        base = r * loop
        for k in range(count - 1):
            faces.append((base + k, base + k + 1, base + loop - 2 - k, base + loop - 1 - k))
    return mesh(name, vertices, faces, token, smooth)


def band_span(index):
    """Front and rear ``y`` of band ``index``."""
    front = BAND_START + index * BAND_STEP
    return front, front + BAND_LENGTH


# ===========================================
# Plates and teeth
# ===========================================


def frame_point(origin, u, v, n, s, t, h):
    """``origin + u*s + v*t + n*h`` as a tuple."""
    return tuple(origin + u * s + v * t + n * h)


def flat_plate(name, origin, u, v, n, outline, thickness, token, offset=0.0, keel=0.0):
    """A faceted plate: a convex outline in the (u, v) plane extruded along ``n``.

    The top face is inset and, with ``keel``, rises to a ridge along ``u`` so
    the plate catches light in two facets like the concept's cut chitin.

    ```
      rim ring (inset top)       each rim edge fans to the nearer ridge end;
      +--------------------+     where the fan switches ends, one triangle
      |  front ==== back   |     closes the ridge, so the top stays manifold
      +--------------------+
    ```

    Args:
        outline: Convex ``(s, t)`` points in order.
        thickness: Extrusion along ``n``, centred on ``offset``.
        keel: Height of the centre ridge above the top face (0 for flat).
    """
    count = len(outline)
    cs = sum(p[0] for p in outline) / count
    ct = sum(p[1] for p in outline) / count
    low, high = offset - thickness / 2, offset + thickness / 2
    vertices = [frame_point(origin, u, v, n, s, t, low) for s, t in outline]
    vertices += [frame_point(origin, u, v, n, cs + (s - cs) * 0.86, ct + (t - ct) * 0.86, high)
                 for s, t in outline]
    faces = [tuple(reversed(range(count)))]
    faces += [(i, (i + 1) % count, count + (i + 1) % count, count + i) for i in range(count)]
    if keel <= 0:
        faces.append(tuple(range(count, 2 * count)))
        return mesh(name, vertices, faces, token, smooth=False)
    s_min = min(p[0] for p in outline)
    s_max = max(p[0] for p in outline)
    split = s_min + (s_max - s_min) * 0.46
    front, back = len(vertices), len(vertices) + 1
    vertices.append(frame_point(origin, u, v, n, s_min + (s_max - s_min) * 0.12, ct, high + keel))
    vertices.append(frame_point(origin, u, v, n, s_min + (s_max - s_min) * 0.8, ct, high + keel))
    near_front = [(outline[i][0] + outline[(i + 1) % count][0]) / 2 < split for i in range(count)]
    for i in range(count):
        faces.append((count + i, count + (i + 1) % count, front if near_front[i] else back))
    for i in range(count):
        j = (i + 1) % count
        if near_front[i] != near_front[j]:
            faces.append((count + j, front, back))
    return mesh(name, vertices, faces, token, smooth=False)


def tooth(name, base_a, base_b, apex, normal, thickness, token="bug-bone"):
    """A triangular prism tooth: base edge ``base_a``–``base_b`` pointing to ``apex``."""
    half = Vector(normal) * (thickness / 2)
    tip_half = half * 0.35
    points = [Vector(base_a), Vector(base_b), Vector(apex)]
    vertices = [tuple(points[0] - half), tuple(points[1] - half), tuple(points[2] - tip_half),
                tuple(points[0] + half), tuple(points[1] + half), tuple(points[2] + tip_half)]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    return mesh(name, vertices, faces, token, smooth=False)


def serrate(name, start, end, out, normal, count, depth, thickness, inset=0.012):
    """A row of ``count`` teeth along ``start``→``end``, pointing along ``out``.

    The tooth bases sit ``inset`` inside the edge so each tooth overlaps the
    plate it grows from instead of touching it at a seam.
    """
    a, b, out = Vector(start), Vector(end), Vector(out).normalized()
    for i in range(count):
        # Neighbouring bases overlap a little but never share a vertex, so the
        # validator's position merge cannot fuse two teeth into a non-manifold edge.
        p0 = a.lerp(b, (i + 0.03) / count) - out * inset
        p1 = a.lerp(b, min(i + 1.1, count - 0.03) / count) - out * inset
        # Alternate long and short teeth, as the concept's saw edge does.
        reach = depth * (1.0 if i % 2 == 0 else 0.7)
        apex = a.lerp(b, (i + 0.5) / count) + out * reach
        tooth(f"{name}{i}", p0, p1, apex, normal, thickness)


# ===========================================
# Body
# ===========================================


def body_core() -> None:
    """Russet flesh that fills the bands and shows in their gaps, over a dark belly."""
    stations = [BAND_START - 0.03 + k * 0.07 for k in range(10)]
    sides = 16
    vertices, faces = [], []
    for y in stations:
        taper = 1.0 if BAND_START < y < 0.3 else 0.8
        half = band_half_width(y) * 0.9 * taper
        rise = (band_top(y) - ARCH_CENTRE_Z) * 0.82 * taper
        drop = (ARCH_CENTRE_Z - BELLY_Z - 0.012) * taper
        for k in range(sides):
            a = k * math.tau / sides
            z = ARCH_CENTRE_Z + math.cos(a) * (rise if math.cos(a) >= 0 else drop)
            vertices.append((math.sin(a) * half, y, z))
    for r in range(len(stations) - 1):
        for k in range(sides):
            a, b = r * sides + k, r * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(stations) - 1) * sides + k for k in range(sides)))
    mesh("body_core", vertices, faces, "bug-flesh")
    # The belly plates close the underside in dark chitin.
    sweep("belly", [(0, BAND_START, 0.1), (0, -0.05, 0.085), (0, 0.15, 0.085), (0, 0.33, 0.1)],
          [0.12, 0.16, 0.15, 0.08], [0.03, 0.03, 0.028, 0.02], token="bug-chitin-black", sides=10)


def bands() -> None:
    """Seven overlapping chestnut bands, each with a proud tan rim on its front edge."""
    for i in range(BAND_COUNT):
        front, rear = band_span(i)
        middle = front + BAND_LENGTH * 0.45
        thick_arch(f"band{i}", [(front, BAND_SCALES[0]), (middle, BAND_SCALES[1]),
                                (rear, BAND_SCALES[2])], 0.022, "bug-chitin-mid")
        thick_arch(f"band_rim{i}", [(front - 0.004, 1.0), (front + RIM_LENGTH, 1.02)],
                   0.03, "bug-chitin-tan")


def band_surface(index, y, theta, lift=0.0):
    """A point on band ``index``'s outer surface at ``y`` and arch angle ``theta``."""
    front, rear = band_span(index)
    middle = front + BAND_LENGTH * 0.45
    if y <= middle:
        scale = BAND_SCALES[0] + (BAND_SCALES[1] - BAND_SCALES[0]) * (y - front) / (middle - front)
    else:
        scale = BAND_SCALES[1] + (BAND_SCALES[2] - BAND_SCALES[1]) * (y - middle) / (rear - middle)
    scale += lift
    half = band_half_width(y) * scale
    rise = (band_top(y) - ARCH_CENTRE_Z) * scale
    return (math.sin(theta) * half, y, ARCH_CENTRE_Z + math.cos(theta) * rise)


def breathing_slits() -> None:
    """Two thin green slits a side on the sixth band, each in a dark recess."""
    front, _ = band_span(5)
    for side in (-1, 1):
        for j, y in enumerate((front + 0.034, front + 0.056)):
            thetas = [side * math.radians(a) for a in (48, 58, 68)]
            recess = [band_surface(5, y, t, 0.0) for t in thetas]
            light = [band_surface(5, y, t, 0.022) for t in thetas]
            sweep(f"slit_recess{side}_{j}", recess, [0.0075, 0.009, 0.0075], [0.006] * 3,
                  token="bug-chitin-black", sides=6)
            sweep(f"slit_light{side}_{j}", light, [0.0035, 0.0045, 0.0035], [0.003] * 3,
                  token="bug-bio-green", sides=6)


def tail() -> None:
    """A short tapered tail spike in two segments under the last band."""
    _, rear = band_span(BAND_COUNT - 1)
    z = ARCH_CENTRE_Z + 0.05
    sweep("tail_base", [(0, rear - 0.05, z + 0.01), (0, rear + 0.02, z), (0, rear + 0.06, z - 0.01)],
          [0.1, 0.075, 0.055], [0.085, 0.065, 0.05], token="bug-chitin-mid", sides=8, smooth=False)
    bead("tail_rim", (0, rear + 0.045, z - 0.007), 0.062, "bug-chitin-tan", scale=(1, 0.28, 0.9),
         segments=10, rings=6)
    sweep("tail_spike", [(0, rear + 0.05, z - 0.008), (0, rear + 0.08, z - 0.02), (0, rear + 0.11, z - 0.035)],
          [0.05, 0.03, 0.004], [0.045, 0.026, 0.004], token="bug-chitin-mid", sides=6, smooth=False)


def carapace() -> None:
    """The whole back as one body node: core, belly, bands, slits and tail."""
    before = set(mesh_objects())
    body_core()
    bands()
    breathing_slits()
    tail()
    group_new(before, "carapace")


# ===========================================
# Head: wedge, ploughshare and sensory pits
# ===========================================


def head_section(t):
    """Centre, up-forward axis, half-width and half-depth of the head wedge at ``t``.

    ``t`` runs from 0 at the first ring of ``HEAD_PATH`` to ``len - 1`` at the
    snout, matching the frames ``sweep`` builds, so points land on the wedge.
    """
    points = [Vector(p) for p in HEAD_PATH]
    last = len(points) - 1
    ups = []
    for i in range(len(points)):
        tangent = (points[min(i + 1, last)] - points[max(i - 1, 0)]).normalized()
        ups.append(Vector((0, tangent.z, -tangent.y)).normalized())
    i = min(int(t), last - 1)
    f = t - i
    centre = points[i].lerp(points[i + 1], f)
    up = ups[i].lerp(ups[i + 1], f).normalized()
    width = HEAD_WIDTHS[i] + (HEAD_WIDTHS[i + 1] - HEAD_WIDTHS[i]) * f
    depth = HEAD_DEPTHS[i] + (HEAD_DEPTHS[i + 1] - HEAD_DEPTHS[i]) * f
    return centre, up, width, depth


def head_point(t, angle, lift=0.0):
    """A point on the head wedge at ``t``; ``angle`` 0 is the flank, 90° the crown."""
    centre, up, width, depth = head_section(t)
    return (centre + Vector((1, 0, 0)) * math.cos(angle) * (width + lift)
            + up * math.sin(angle) * (depth + lift))


def head() -> None:
    """The blunt digging wedge, its pale ploughshare plate and rows of green pits."""
    before = set(mesh_objects())
    # The wedge comes first so the joined node keeps its forward origin.
    sweep("head_wedge", HEAD_PATH, HEAD_WIDTHS, HEAD_DEPTHS, token="bug-chitin-dark",
          sides=8, smooth=False)
    ploughshare()
    sensory_pits()
    group_new(before, "head")


def ploughshare() -> None:
    """A keeled bone plate over the head, narrowing to a serrated digging point."""
    # Stations along the wedge's crown, from the apex under the first band's
    # rim to the tip at the snout; the plate lies on the crown, keel up.
    stations = [0.25, 0.8, 1.35, 1.9, 2.45, 3.0]
    widths = [0.012, 0.055, 0.085, 0.095, 0.07, 0.012]
    across = Vector((1, 0, 0))
    thickness, keel = 0.024, 0.024
    centre, normals = [], []
    for t in stations:
        _, up, _, _ = head_section(t)
        centre.append(head_point(t, math.pi / 2, 0.004))
        normals.append(up)
    # Push the tip past the snout so the point reads as the digging edge.
    centre[-1] = centre[-1] + (centre[-1] - centre[-2]).normalized() * 0.02
    vertices = []
    for c, normal, w in zip(centre, normals, widths):
        vertices += [tuple(c - across * w), tuple(c + normal * keel), tuple(c + across * w),
                     tuple(c + across * w * 0.92 - normal * thickness),
                     tuple(c - across * w * 0.92 - normal * thickness)]
    faces = []
    loop = 5
    for r in range(len(centre) - 1):
        for k in range(loop):
            a, b = r * loop + k, r * loop + (k + 1) % loop
            faces.append((a, b, b + loop, a + loop))
    faces.append(tuple(reversed(range(loop))))
    faces.append(tuple((len(centre) - 1) * loop + k for k in range(loop)))
    mesh("ploughshare", vertices, faces, "bug-bone", smooth=False)
    # Saw teeth down both lower edges, from the widest point to the tip.
    for side, label in ((-1, "l"), (1, "r")):
        start = centre[3] + across * side * widths[3]
        end = centre[5] + across * side * widths[5]
        edge = (end - start).normalized()
        out = (across * side - edge * edge.dot(across * side)).normalized()
        out = (out - normals[4] * out.dot(normals[4])).normalized()
        serrate(f"plough_tooth_{label}", start, end, out, normals[4], 4, 0.03, 0.018)
    down = (centre[5] - centre[4]).normalized()
    tooth("plough_tip", centre[5] - across * 0.026 - down * 0.02, centre[5] + across * 0.026 - down * 0.02,
          centre[5] + down * 0.04, normals[5], 0.02)


def sensory_pits() -> None:
    """Four small green pits a side, each sunk in a dark socket, beside the ploughshare."""
    for side in (-1, 1):
        for i in range(4):
            t = 0.55 + 0.26 * i
            angle = math.radians(52 - 5 * i)
            at = head_point(t, angle)
            at.x *= side
            out = (head_point(t, angle, 0.01) - head_point(t, angle)).normalized()
            out.x *= side
            bead(f"pit_socket{side}_{i}", tuple(at), 0.018, "bug-chitin-black", segments=8, rings=6)
            bead(f"pit{side}_{i}", tuple(at + out * 0.011), 0.012, "bug-bio-green",
                 segments=8, rings=6)


# ===========================================
# Shovels (blade_l, blade_r)
# ===========================================


def spade_frame(side):
    """The spade's axes: ``u`` wrist→edge, ``v`` across the blade, ``n`` its outer face."""
    u = Vector((side * 0.42, -0.78, -0.5)).normalized()
    v_flat = Vector((-u.y, u.x, 0)).normalized() * side
    n_flat = u.cross(v_flat) * side
    tilt = math.radians(8)
    n = (n_flat * math.cos(tilt) + v_flat * math.sin(tilt)).normalized()
    v = n.cross(u).normalized() * side
    return u, v, n


def shovel(side) -> None:
    """One spade forelimb: ringed arm, broad blade, bone saw edge; pivots at the shoulder."""
    label = "l" if side < 0 else "r"
    name = f"blade_{label}"
    before = set(mesh_objects())
    shoulder = Vector((side * SHOULDER[0], SHOULDER[1], SHOULDER[2]))
    elbow = Vector((side * ELBOW[0], ELBOW[1], ELBOW[2]))
    wrist = Vector((side * WRIST[0], WRIST[1], WRIST[2]))
    sweep(name + "_upper", [tuple(shoulder), tuple(elbow), tuple(wrist)], [0.046, 0.043, 0.036],
          token="bug-chitin-dark", sides=10)
    bead(name + "_shoulder", tuple(shoulder.lerp(elbow, 0.2)), 0.056, "bug-flesh",
         scale=(1, 1, 0.9), segments=12, rings=8)
    bead(name + "_elbow", tuple(elbow), 0.05, "bug-chitin-black", segments=12, rings=8)
    cuff = [tuple(elbow.lerp(wrist, t)) for t in (0.15, 0.35, 0.7, 1.0)]
    sweep(name + "_cuff", cuff, [0.046, 0.054, 0.05, 0.04], token="bug-chitin-mid", sides=8)
    bead(name + "_wrist", tuple(wrist), 0.04, "bug-chitin-black", segments=10, rings=8)
    u, v, n = spade_frame(side)
    heel = wrist - u * 0.01
    length, h0, h1 = SPADE_LENGTH, SPADE_HEEL, SPADE_EDGE
    # Dark back plate: the whole blade.
    flat_plate(name + "_back", heel, u, v, n,
               [(-0.02, -h0 * 0.6), (0, -h0), (length, -h1), (length, h1), (0, h0), (-0.02, h0 * 0.6)],
               0.04, "bug-chitin-dark")
    # Chestnut face plate over the upper blade, ending in a chevron so the dark shows below.
    face_end = length * 0.7

    def half_at(s):
        """Blade half-width at ``s`` along the blade."""
        return h0 + (h1 - h0) * s / length

    flat_plate(name + "_face", heel, u, v, n,
               [(0.0, -h0 + 0.01), (face_end - 0.04, -half_at(face_end - 0.04) + 0.012),
                (face_end + 0.03, 0.0), (face_end - 0.04, half_at(face_end - 0.04) - 0.012),
                (0.0, h0 - 0.01)],
               0.012, "bug-chitin-mid", offset=0.024, keel=0.024)
    # Bone cutting edge and its saw teeth.
    flat_plate(name + "_edge", heel, u, v, n,
               [(length - 0.034, -h1 + 0.004), (length + 0.004, -h1 - 0.004),
                (length + 0.004, h1 + 0.004), (length - 0.034, h1 - 0.004)],
               0.046, "bug-bone")
    edge_a = heel + u * (length + 0.004) - v * (h1 + 0.004)
    edge_b = heel + u * (length + 0.004) + v * (h1 + 0.004)
    serrate(name + "_tooth", edge_a, edge_b, u, n, SPADE_TEETH, 0.042, 0.024)
    joint_origin(group_new(before, name), tuple(shoulder))


# ===========================================
# Legs
# ===========================================


def digging_leg(name, hip, knee, foot, radius):
    """A short thick digging leg: russet coxa, chestnut femur and shin, dark knee ring, bone claw."""
    before = set(mesh_objects())
    hip_v, knee_v, foot_v = Vector(hip), Vector(knee), Vector(foot)
    thigh = (knee_v - hip_v).normalized()
    shin = (foot_v - knee_v).normalized()
    bead(name + "_coxa", tuple(hip_v.lerp(knee_v, 0.3)), radius * 1.25, "bug-flesh",
         scale=(1, 1, 0.8), segments=10, rings=6)
    sweep(name + "_femur", [tuple(hip_v.lerp(knee_v, 0.2)), tuple(hip_v.lerp(knee_v, 0.6)), knee],
          [radius * 1.05, radius * 1.1, radius * 0.86], token="bug-chitin-mid", sides=8, smooth=False)
    # A dark joint ring rather than a ball: only its band shows between the segments.
    sweep(name + "_knee", [tuple(knee_v - thigh * radius * 0.5), tuple(knee_v + shin * radius * 0.5)],
          [radius * 0.84, radius * 0.84], token="bug-chitin-black", sides=8)
    claw_root = knee_v.lerp(foot_v, 0.58)
    sweep(name + "_shin", [tuple(knee_v + shin * radius * 0.3), tuple(knee_v.lerp(foot_v, 0.3)),
                           tuple(claw_root)],
          [radius * 0.95, radius * 0.98, radius * 0.66], token="bug-chitin-mid", sides=8, smooth=False)
    sweep(name + "_claw", [tuple(knee_v.lerp(foot_v, 0.52)), tuple(claw_root.lerp(foot_v, 0.45)), foot],
          [radius * 0.6, radius * 0.4, radius * 0.06], token="bug-bone", sides=6, smooth=False)
    return joint_origin(group_new(before, name), hip)


def legs() -> None:
    """Three short digging legs a side, tucked under the band edges."""
    for side in (-1, 1):
        label = "l" if side < 0 else "r"
        for i, (hip, knee, foot) in enumerate(LEGS):
            mirror = [(side * p[0], p[1], p[2]) for p in (hip, knee, foot)]
            digging_leg(f"leg_{label}{i}", *mirror, LEG_RADIUS)


# ===========================================
# Build
# ===========================================


def build() -> None:
    """Build the burrower on the ground, front toward -Y."""
    carapace()
    head()
    for side in (-1, 1):
        shovel(side)
    legs()
    finish(HEIGHT, MAX_WIDTH, MAX_DEPTH)
