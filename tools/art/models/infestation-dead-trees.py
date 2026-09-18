"""Leafless counterparts of the eight environment trees, with living pivots/scales.

Build with make_model.py --build-arg kind=tree-oak (or another BUILDERS key).
These are weathered tree skeletons: no foliage, chitin, base discs or infestation
growth. Capped, faceted limbs retain recognizable branching and palm leaf scars.
"""

from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, ".."))
from bpy_kit import cut_below, join, material, mesh_objects  # noqa: E402
from crescent_geometry import mesh  # noqa: E402

FOOTPRINT = (1, 1)
WOOD = "env-tuart-bark"
BARK = "env-bark"


def limb(name, points, radii, token=WOOD, sides=7, bark=False, broken=True):
    """Make a closed irregular limb with pale broken end grain and bark facets."""
    pts = [Vector(point) for point in points]
    vertices = []
    for i, point in enumerate(pts):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
        reference = Vector((1, 0, 0)) if abs(tangent.x) < 0.85 else Vector((0, 1, 0))
        u = (reference - tangent * reference.dot(tangent)).normalized()
        v = tangent.cross(u).normalized()
        for k in range(sides):
            angle = math.tau * k / sides
            uneven = 1 + 0.075 * math.sin(k * 2.3 + i * 1.2)
            split = radii[i] * (0.4 * math.sin(k * 2.4) if broken and i == len(pts) - 1 else 0)
            vertices.append(point + (u * math.cos(angle) + v * math.sin(angle)) * radii[i] * uneven
                            + tangent * split)
    faces = [tuple(reversed(range(sides)))]
    for i in range(len(pts) - 1):
        for k in range(sides):
            faces.append((i * sides + k, i * sides + (k + 1) % sides,
                          (i + 1) * sides + (k + 1) % sides, (i + 1) * sides + k))
    faces.append(tuple((len(pts) - 1) * sides + k for k in range(sides)))
    ob = mesh(name, vertices, faces, token, False)
    # Each material is a closed shell, so glTF's material splitting preserves
    # watertightness. Narrow surviving bark flakes expose the pale wood below.
    if bark:
        for i in range(min(3, len(pts) - 1)):
            k = (5 + (i % 2)) % sides
            j = (k + 1) % sides
            quad = [vertices[i * sides + k], vertices[i * sides + j],
                    vertices[(i + 1) * sides + j], vertices[(i + 1) * sides + k]]
            centre = sum(quad, Vector()) / 4
            skin = [centre + (v - centre) * .87 for v in quad]
            normal = ((skin[1] - skin[0]).cross(skin[3] - skin[0])).normalized()
            flake = [v + normal * lift for lift in [-.001, .002] for v in skin]
            mesh(name + f"_bark_flake_{i}", flake,
                 [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                  (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], BARK, False)
    if broken and token != WOOD:
        tangent = (pts[-1] - pts[-2]).normalized()
        ring = vertices[-sides:]
        grain = [v + tangent * lift for lift in [-.001, .003] for v in ring]
        caps = [tuple(reversed(range(sides))), tuple(range(sides, 2 * sides))]
        caps.extend((k, (k + 1) % sides, (k + 1) % sides + sides, k + sides) for k in range(sides))
        mesh(name + "_exposed_end_grain", grain, caps, WOOD, False)
    return ob


def roots(name, radius=0.11, reach=0.22, count=5, token=WOOD):
    """Set the stem into the ground with short radial root flares, never a plinth."""
    for i in range(count):
        angle = i * math.tau / count + 0.27
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        limb(name + f"_root_{i}", [direction * radius * 0.25 + Vector((0, 0, 0.17)),
                                  direction * reach * 0.65 + Vector((0, 0, 0.044)),
                                  direction * reach + Vector((0, 0, 0.013))],
             [radius * 0.48, radius * 0.29, 0.010], token, 6, bark=True)


def twig(name, start, elbow, end, radius=0.014):
    """Keep the finest bare twigs thick enough to survive the tactical camera."""
    return limb(name, [start, elbow, end], [radius, radius * 0.69, 0.006], sides=5)


def oak():
    """Short gnarly trunk, heavy crooked forks and a broad asymmetric bare crown."""
    roots("oak", 0.115, 0.245)
    limb("oak_trunk", [(0, 0, 0), (-0.025, 0.012, 0.29), (0.012, -0.016, 0.57),
                        (-0.016, 0.010, 0.87), (0.042, 0.012, 1.14), (0.016, 0.008, 1.37)],
         [0.11, 0.097, 0.077, 0.062, 0.039, 0.022], bark=True, sides=9)
    branches = [
        ([(0, 0, .52), (-.16, .035, .82), (-.29, .09, 1.10), (-.39, .055, 1.33)], .061),
        ([(0, 0, .68), (.19, -.09, .93), (.34, -.16, 1.12), (.41, -.22, 1.29)], .053),
        ([(-.01, .01, .79), (-.13, -.17, 1.03), (-.20, -.29, 1.22), (-.25, -.35, 1.41)], .045),
        ([(.01, 0, .91), (.14, .17, 1.16), (.19, .29, 1.42), (.31, .30, 1.59)], .041),
        ([(0, .01, 1.05), (-.08, .17, 1.29), (-.19, .24, 1.50), (-.13, .29, 1.66)], .035),
        ([(.02, .01, 1.14), (.13, -.095, 1.35), (.12, -.17, 1.51), (.20, -.20, 1.69)], .031),
    ]
    for i, (points, radius) in enumerate(branches):
        limb(f"oak_bough_{i}", points, [radius, radius * .72, radius * .46, .012])
        a, b, c = map(Vector, points[1:])
        side = Vector((-(c-a).y, (c-a).x, .14)).normalized()
        end = b + side * (.12 if i % 2 else -.12) + Vector((0, 0, .13))
        twig(f"oak_fork_{i}", b, b.lerp(end, .54) + Vector((0, 0, -.03)), end, .019)
        twig(f"oak_terminal_{i}", c.lerp(b, .40), c + side * .065 + Vector((0, 0, .07)),
             c + side * .10 + Vector((0, 0, .035)), .011)
    twig("oak_broken_low_branch", (-.03, 0, .58), (-.11, -.10, .70), (-.14, -.14, .72), .032)
    twig("oak_crown_split", (.016, .008, 1.30), (-.02, -.045, 1.49), (-.07, -.035, 1.62), .018)


def pine():
    """Tall tapering snag with sparse bare whorls and snapped upward side twigs."""
    roots("pine", .09, .20, 5)
    limb("pine_leader", [(0, 0, 0), (.013, -.014, .41), (-.007, .005, .89),
                         (.018, .003, 1.35), (.006, -.006, 1.77), (.017, -.012, 2.03)],
         [.078, .065, .047, .032, .018, .010], bark=True, sides=8)
    for tier, (z, reach, count) in enumerate([(.56, .42, 5), (.91, .36, 4),
                                            (1.24, .28, 5), (1.55, .20, 4), (1.78, .11, 3)]):
        for i in range(count):
            angle = i * math.tau / count + tier * .79 + .17
            d = Vector((math.cos(angle), math.sin(angle), 0))
            side = Vector((-d.y, d.x, 0))
            length = reach * (1 - .15 * ((i + tier) % 3))
            p0 = Vector((.005, 0, z))
            p1 = p0 + d * length * .40 + Vector((0, 0, -.065))
            p2 = p0 + d * length * .79 + side * .025 + Vector((0, 0, -.10))
            p3 = p0 + d * length + side * .043 + Vector((0, 0, -.053))
            limb(f"pine_whorl_{tier}_{i}", [p0, p1, p2, p3],
                 [.029 - tier * .003, .019 - tier * .002, .011, .007], sides=6)
            if tier < 4:
                sign = -1 if (i + tier) % 2 else 1
                end = p2 + side * length * .28 * sign + d * .035 + Vector((0, 0, .09))
                twig(f"pine_side_twig_{tier}_{i}", p1.lerp(p2, .63), p2 + side * length * .15 * sign,
                     end, .012)
            if tier < 2 and i % 2 == 0:
                twig(f"pine_broken_tip_{tier}_{i}", p1, p1 - side * .045 + Vector((0, 0, .026)),
                     p1 - side * .085 + Vector((0, 0, .06)), .013)


def palm_scars(name, height, lean, radius, count, rugged=False):
    """Closed narrow leaf-base scars wrap the stem without becoming frond fans."""
    for i in range(count):
        z = .20 + (height - .35) * i / count
        t = z / height
        cx = lean * t * t
        angle = i * 2.39
        points = []
        for j in range(4):
            a = angle + j * .38
            points.append((cx + math.cos(a) * radius * (1 - t * .23),
                           math.sin(a) * radius * (1 - t * .23), z + .012 * j))
        limb(name + f"_leaf_scar_{i}", points, [.008, .014, .012, .005],
             WOOD if i % 3 else "env-palm-trunk", sides=5)
    if rugged:
        for i in range(12):
            a = i * 2.40
            z = height - .46 + i * .034
            d = Vector((math.cos(a), math.sin(a), 0))
            centre = Vector((lean * (z / height) ** 2, 0, z))
            limb(name + f"_broken_petiole_base_{i}", [centre + d * radius * .65,
                 centre + d * radius * 1.30 + Vector((0, 0, .03)),
                 centre + d * radius * 1.47 + Vector((0, 0, .09))],
                 [.032, .027, .009], "env-palm-trunk", sides=5)


def palm():
    """The living palm's slim leaning stem, stripped to scars and a broken crown."""
    height, lean = 1.78, .16
    limb("palm_leaning_stem", [(lean * t * t, 0, height * t) for t in [0, .18, .39, .62, .81, 1]],
         [.072, .066, .061, .056, .052, .048], sides=8, bark=True)
    roots("palm", .06, .135, 4, "env-palm-trunk")
    palm_scars("palm", height, lean, .065, 15)
    for i in range(5):
        a = i * math.tau / 5 + .25
        d = Vector((math.cos(a), math.sin(a), 0))
        centre = Vector((lean, 0, height - .045))
        limb(f"palm_crown_stub_{i}", [centre + d * .025,
             centre + d * .062 + Vector((0, 0, .045)),
             centre + d * (.086 if i % 2 else .065) + Vector((0, 0, .075 + .025 * (i % 3)))],
             [.020, .013, .008], "env-palm-trunk", sides=5)


def tropical_almond():
    """An upright almond skeleton with its characteristic flat tiered crown."""
    roots("almond", .085, .18, 4)
    limb("almond_stem", [(0, 0, 0), (-.012, .007, .52), (0, 0, 1.04),
                          (.012, .008, 1.48), (.018, -.006, 1.87)],
         [.085, .065, .046, .031, .012], bark=True, sides=8)
    for tier, (z, reach, count) in enumerate([(1.10, .43, 4), (1.50, .39, 4), (1.80, .25, 3)]):
        for i in range(count):
            a = i * math.tau / count + .24 + tier * .67
            d = Vector((math.cos(a), math.sin(a), 0))
            side = Vector((-d.y, d.x, 0))
            start = Vector((0, 0, z - .09))
            p1 = start + d * reach * .39 + Vector((0, 0, .10))
            p2 = start + d * reach * .74 + side * .015 + Vector((0, 0, .15))
            tip = start + d * reach + side * .06 + Vector((0, 0, .16))
            limb(f"almond_tier_{tier}_{i}", [start, p1, p2, tip], [.030 - tier * .005, .020, .011, .007], sides=6)
            twig(f"almond_flat_fork_{tier}_{i}", p1, p2 - side * .070,
                 p2 + d * .065 - side * .115 + Vector((0, 0, .025)), .012)
            if tier == 0:
                twig(f"almond_terminal_split_{i}", p2, tip + side * .035,
                     tip + side * .057 + Vector((0, 0, .045)), .009)


def oil_palm():
    """Stocky straight palm with rough retained petiole bases and a bare crown."""
    height = 2.02
    roots("oil_palm", .11, .20, 6, "env-palm-trunk")
    limb("oil_palm_trunk", [(0, 0, 0), (-.01, .01, .36), (.006, 0, .80),
                            (.009, -.006, 1.26), (0, 0, 1.71), (.006, 0, height)],
         [.125, .112, .103, .094, .083, .072], "env-palm-trunk", sides=9)
    palm_scars("oil_palm", height, 0, .114, 24, rugged=True)
    for i in range(6):
        a = i * math.tau / 6 + .1
        d = Vector((math.cos(a), math.sin(a), 0))
        centre = Vector((.006, 0, height - .065))
        limb(f"oil_palm_crown_stump_{i}", [centre + d * .043,
             centre + d * .092 + Vector((0, 0, .086)),
             centre + d * .11 + Vector((0, 0, .15 + .025 * (i % 3)))],
             [.032, .023, .010], WOOD, sides=6)
    limb("oil_palm_broken_heart", [(.005, 0, 1.98), (.011, .008, 2.10), (.016, .006, 2.17)],
         [.029, .019, .009], WOOD, sides=6)


def tuart():
    """Pale eucalyptus snag with tall smooth forks and an open uneven crown."""
    roots("tuart", .095, .20, 5)
    limb("tuart_stem", [(0, 0, 0), (.015, -.003, .40), (0, 0, .81),
                        (-.03, .012, 1.21), (-.025, 0, 1.64), (-.08, .015, 1.97)],
         [.095, .078, .060, .047, .028, .013], sides=8)
    branches = [
        ([(0, 0, .88), (-.12, .024, 1.18), (-.24, .05, 1.48), (-.31, .12, 1.80)], .039),
        ([(0, 0, 1.02), (.12, -.10, 1.33), (.20, -.20, 1.68), (.28, -.19, 2.02)], .038),
        ([(-.01, 0, 1.16), (.105, .12, 1.46), (.18, .20, 1.79), (.24, .24, 2.13)], .034),
        ([(-.03, 0, 1.39), (-.16, -.06, 1.67), (-.19, -.12, 1.94), (-.14, -.15, 2.14)], .027),
    ]
    for i, (points, radius) in enumerate(branches):
        limb(f"tuart_swept_fork_{i}", points, [radius, radius * .79, .018, .009], sides=7)
        b, c = map(Vector, points[2:])
        side = Vector((.11 * (-1 if i % 2 else 1), .095, .12))
        twig(f"tuart_high_split_{i}", b, b.lerp(c, .55) + side * .65, c + side * .73, .016)
        twig(f"tuart_dry_spur_{i}", Vector(points[1]), Vector(points[1]) + Vector((-.07, -.05, .10)),
             Vector(points[1]) + Vector((-.10, -.075, .19)), .017)
    twig("tuart_broken_old_limb", (0, 0, .59), (.11, .015, .72), (.16, .025, .75), .035)


def banksia():
    """Low contorted multi-fork skeleton with small persistent woody seed cones."""
    roots("banksia", .087, .18, 5)
    limb("banksia_trunk", [(0, 0, 0), (-.025, -.012, .26), (.01, .004, .50), (-.022, .013, .70)],
         [.088, .076, .053, .038], bark=True, sides=8)
    branches = [
        ([(0, 0, .37), (-.16, .03, .62), (-.24, .09, .83), (-.25, .04, 1.15)], .045),
        ([(0, 0, .46), (.17, -.10, .73), (.23, -.13, .97), (.29, -.09, 1.21)], .044),
        ([(-.01, .01, .56), (.015, .13, .82), (.06, .17, 1.07), (.025, .21, 1.36)], .040),
        ([(0, 0, .51), (-.08, -.15, .75), (-.17, -.23, .98), (-.13, -.28, 1.20)], .036),
        ([(0, 0, .58), (-.10, .12, .83), (-.19, .23, 1.05), (-.25, .28, 1.17)], .032),
    ]
    for i, (points, radius) in enumerate(branches):
        limb(f"banksia_crooked_bough_{i}", points, [radius, radius * .71, .020, .010], sides=7)
        a, b, c = map(Vector, points[1:])
        offset = Vector((.12 * (-1 if i % 2 else 1), -.065, .04))
        twig(f"banksia_secondary_{i}", a.lerp(b, .63), b + offset * .58,
             c + offset - Vector((0, 0, .06)), .018)
        twig(f"banksia_terminal_fork_{i}", b, c - offset * .46 - Vector((0, 0, .06)),
             c - offset * .75 + Vector((0, 0, .025)), .013)
    # Woody seed capsules remain after leaves fall; these are small, closed pods.
    for i, centre in enumerate([(-.25, .04, 1.15), (.23, -.13, .99)]):
        c = Vector(centre)
        limb(f"banksia_old_seed_cone_{i}", [c - Vector((0, 0, .045)), c,
              c + Vector((.008, 0, .048)), c + Vector((.012, 0, .074))],
             [.020, .038, .032, .012], BARK, sides=8)


def grass_tree():
    """A low black fibrous stem, stripped of every leaf, with a shattered crown."""
    limb("grass_tree_charred_stem", [(0, 0, 0), (-.008, .005, .16), (.009, -.005, .35), (.01, 0, .52)],
         [.132, .120, .101, .084], "env-grass-tree-trunk", sides=10)
    roots("grass_tree", .071, .165, 6, "env-grass-tree-trunk")
    for i in range(12):
        a = i * math.tau / 12
        d = Vector((math.cos(a), math.sin(a), 0))
        z = .30 + .032 * (i % 3)
        limb(f"grass_tree_woody_fibre_{i}", [d * .085 + Vector((0, 0, z)),
             d * .092 + Vector((0, 0, .48)),
             d * .065 + Vector((.01, 0, .55 + .025 * (i % 4)))],
             [.017, .018, .006], "env-grass-tree-trunk" if i % 3 else WOOD, sides=5)
    limb("grass_tree_split_heart", [(.005, 0, .48), (.016, .005, .57), (.014, -.001, .65)],
         [.037, .026, .011], WOOD, sides=6)


BUILDERS = {
    "tree-oak": oak,
    "tree-pine": pine,
    "tree-palm": palm,
    "tree-tropical-almond": tropical_almond,
    "tree-oil-palm": oil_palm,
    "tree-tuart": tuart,
    "banksia": banksia,
    "grass-tree": grass_tree,
}


def finish():
    """Clip ground roots, consolidate materials and retain an exact base pivot."""
    bpy.context.view_layer.update()
    parts = mesh_objects()
    for ob in parts:
        cut_below(ob)
    ob = join(parts, "leafless_tree")
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return ob


def build(kind="tree-oak"):
    """Build one recognizable leafless species using the living model's pivot."""
    BUILDERS[kind]()
    return finish()
