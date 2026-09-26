"""Bug: bug-hive-guard, the stationary spine thrower (#1179). Run through make_model.py.

A living turret rooted in a hive chamber (concept:
docs/design/concepts/campaign/hive-guard.md, modeller's brief:
docs/design/kits/campaign-bestiary.md#hive-guard). It shares the brown
family's eye clusters and materials from bug_parts.py and owns a silhouette
nothing else has: a fortress, wide at the base, a broad chestnut shield with a
pale horn rim in front, two fanned racks of dark quills on a domed back, and
four buttress roots whose claws are buried in resin collars on the floor.

```
        side view, front to the left (-Y)

                   racks  ////
            horn  \\    /////
          shield   \ dome ___
         (rim)  ___/          \
       head  eyes   thorax     |
           /  root         root \
       collar                   collar
```

It never walks, so it has no ``leg_*`` nodes: the root limbs are named
``root_…`` and stay body. Each spine rack is one node, ``blade_rack_l`` and
``blade_rack_r``, with a ``motion_joint`` at its base on the back, so a volley
kicks both racks back while the body recoils. ``socket_muzzle`` sits at the top
of the racks for the spine tracer's origin.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bug_parts import face  # noqa: E402
from crescent_geometry import (  # noqa: E402
    bead,
    finish,
    group_new,
    joint_origin,
    mesh,
    rim,
    scute,
    shell,
    sweep,
)
from bpy_kit import mesh_objects, socket  # noqa: E402

FOOTPRINT = (1, 1)

# ===========================================
# Proportions (Blender units before `finish` normalises the height)
# ===========================================

#: Centre of the domed back, behind the shield and over the thorax.
DOME = (0.0, 0.1, 0.33)
#: How high the dome rises from its rim.
DOME_RISE = 0.28
#: Where the head sits: low and sunken under the shield's lower point.
HEAD = (0.0, -0.35, 0.15)
#: Each rack's base runs along the dome from front to back at this offset.
RACK_X = 0.13
RACK_Y = (0.0, 0.24)
#: Spines per rack.
SPINES = 8
#: Where each root leaves the body, where it arches out, and where its
#: claws bite the floor.
ROOTS = [
    ("l0", (-0.25, -0.14, 0.2), (-0.4, -0.25, 0.25), (-0.41, -0.34, 0.0)),
    ("r0", (0.25, -0.14, 0.2), (0.4, -0.25, 0.25), (0.41, -0.34, 0.0)),
    ("l1", (-0.25, 0.26, 0.2), (-0.4, 0.35, 0.24), (-0.41, 0.42, 0.0)),
    ("r1", (0.25, 0.26, 0.2), (0.4, 0.35, 0.24), (0.41, 0.42, 0.0)),
]


# ===========================================
# Helpers
# ===========================================


def lerp(a, b, t):
    """Point a fraction ``t`` of the way from ``a`` to ``b``."""
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


def plate(name, rows, cols, point, thickness, token):
    """A closed curved plate: a front grid, a back grid offset along +Y, and stitched sides."""
    front = [point(i / (rows - 1), j / (cols - 1)) for i in range(rows) for j in range(cols)]
    back = [(x, y + thickness, z) for x, y, z in front]
    count = len(front)
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a = i * cols + j
            faces.append((a, a + 1, a + cols + 1, a + cols))
            faces.append((a + count + cols, a + count + cols + 1, a + count + 1, a + count))
    boundary = list(range(cols))
    boundary += [i * cols + cols - 1 for i in range(1, rows)]
    boundary += [(rows - 1) * cols + j for j in range(cols - 2, -1, -1)]
    boundary += [i * cols for i in range(rows - 2, 0, -1)]
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        faces.append((b, a, a + count, b + count))
    return mesh(name, front + back, faces, token, smooth=False)


# ===========================================
# Parts
# ===========================================


def shield_point(v, u):
    """The shield's front surface: ``v`` from the lower point (0) to the top edge (1), ``u`` across."""
    half = 0.03 + 0.36 * v ** 0.85
    across = (u * 2 - 1) * half
    z = 0.16 + 0.54 * v
    # Bulges forward at the centre line, wraps back a little at its edges,
    # and the top leans back over the dome like a raised visor.
    y = -0.47 + 0.24 * v - 0.04 * (1 - (u * 2 - 1) ** 2) + 0.1 * (across / 0.39) ** 2
    return (across, y, z)


def front_shield() -> None:
    """The broad chestnut shield, its thick pale horn rim and a dark centre keel."""
    plate("shield", 10, 9, shield_point, 0.04, "bug-chitin-mid")
    # The rim runs up both flanks from the lower point and rises past the top
    # edge into two short horns, curling back as on the sheet.
    for side in (-1, 1):
        u = 1.0 if side > 0 else 0.0
        edge = [shield_point(v, u) for v in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
        top = edge[-1]
        horn = [(top[0] + side * 0.02, top[1] + 0.03, top[2] + 0.07),
                (top[0] + side * 0.005, top[1] + 0.08, top[2] + 0.14),
                (top[0] - side * 0.03, top[1] + 0.15, top[2] + 0.18)]
        path = [(x, y - 0.014, z) for x, y, z in edge] + horn
        widths = [0.022, 0.03, 0.036, 0.04, 0.042, 0.04, 0.032, 0.02, 0.004]
        sweep(f"shield_rim{side}", path, widths, [w * 0.8 for w in widths],
              token="bug-bone", sides=8)
    keel = [shield_point(v, 0.5) for v in (0.1, 0.4, 0.7, 0.97)]
    sweep("shield_keel", [(x, y - 0.012, z) for x, y, z in keel], [0.012, 0.018, 0.018, 0.012],
          [0.012] * 4, token="bug-chitin-dark", sides=6)
    # Two broad tan markings on the plate, the family's lighter facets.
    for side in (-1, 1):
        x, y, z = shield_point(0.62, 0.5 + side * 0.27)
        scute(f"shield_mark{side}", (x, y - 0.014, z), 0.1, 0.14, 0.014,
              token="bug-chitin-tan", tilt=0.25)


def body() -> None:
    """The dark thorax, the domed back with its tan plate edges and the flank skirts."""
    bead("thorax", (0.0, 0.06, 0.23), 0.35, "bug-chitin-black", scale=(1.02, 1.06, 0.52),
         segments=24, rings=14)
    _, edge = shell("dome", DOME, 0.37, 0.4, DOME_RISE, "bug-chitin-mid", thickness=0.05,
                    segments=36, rings=7)
    rim("dome_rim", edge, 0.016, "bug-chitin-tan")
    for i, (y, w) in enumerate([(-0.12, 0.11), (0.1, 0.13), (0.32, 0.1)]):
        r = abs(y - DOME[1]) / 0.4
        z = DOME[2] + DOME_RISE * (1 - r ** 1.7) ** 0.78
        scute(f"dome_plate{i}", (0.0, y, z - 0.004), w, 0.13, 0.022,
              token="bug-chitin-tan", tilt=0.25 - i * 0.25)
    # A low overlapping skirt plate on each flank ties the dome to the roots.
    for side in (-1, 1):
        _, skirt = shell(f"flank{side}", (side * 0.27, 0.06, 0.2), 0.14, 0.34, 0.1,
                         "bug-chitin-dark", thickness=0.02, segments=20, rings=4)
        rim(f"flank_rim{side}", skirt, 0.009, "bug-chitin-tan")


def roots() -> None:
    """Four buttress roots arched out of the flanks, claws buried in resin collars."""
    for label, hip, knee, foot in ROOTS:
        side = -1 if label.startswith("l") else 1
        front = foot[1] < 0
        before = set(mesh_objects())
        ankle = (foot[0], foot[1], 0.07)
        sweep(f"root_{label}_limb", [hip, lerp(hip, knee, 0.5), knee, lerp(knee, ankle, 0.55), ankle],
              [0.12, 0.11, 0.1, 0.085, 0.07], [0.1, 0.095, 0.085, 0.072, 0.06],
              token="bug-chitin-dark", sides=10)
        # Chestnut armour over the upper limb and the shin: the sheet's
        # heavy plated limbs.
        sweep(f"root_{label}_plate0", [lerp(hip, knee, 0.15), lerp(hip, knee, 0.55), lerp(hip, knee, 0.95)],
              [0.125, 0.13, 0.11], [0.09, 0.1, 0.085], token="bug-chitin-mid", sides=8)
        sweep(f"root_{label}_plate1", [lerp(knee, ankle, 0.15), lerp(knee, ankle, 0.5), lerp(knee, ankle, 0.85)],
              [0.105, 0.1, 0.082], [0.08, 0.078, 0.064], token="bug-chitin-mid", sides=8)
        scute(f"root_{label}_mark", (knee[0], knee[1], knee[2] + 0.085), 0.09, 0.1, 0.018,
              token="bug-chitin-tan")
        bead(f"root_{label}_knee", knee, 0.085, "bug-chitin-black", segments=12, rings=8)
        # The resin collar: a low mound grown up round the foot, so the
        # claws read as buried rather than standing on the floor.
        bead(f"root_{label}_collar", (foot[0], foot[1], 0.025), 0.11, "bug-chitin-dark",
             scale=(1.0, 1.0, 0.23), segments=16, rings=8)
        # Three pale claws bite forward and outward into the collar.
        out = (side * 0.6, -1 if front else 1)
        for k, spread in enumerate((-0.5, 0.0, 0.5)):
            angle = math.atan2(out[1], out[0]) + spread
            base = (foot[0] + math.cos(angle) * 0.02, foot[1] + math.sin(angle) * 0.02, 0.07)
            tip = (foot[0] + math.cos(angle) * 0.12, foot[1] + math.sin(angle) * 0.12, 0.008)
            sweep(f"root_{label}_claw{k}", [base, lerp(base, tip, 0.45), tip], [0.03, 0.022, 0.003],
                  token="bug-bone", sides=6)
        group_new(before, f"root_{label}")


def rack(side: int) -> None:
    """One fanned rack of quills on the back: dark shafts, pale points, small green tips."""
    s = "l" if side < 0 else "r"
    before = set(mesh_objects())
    x = side * RACK_X
    y0, y1 = RACK_Y

    def base(t):
        """Where the rack's base line meets the dome, ``t`` from front to back."""
        y = y0 + (y1 - y0) * t
        r = math.hypot(x, y - DOME[1]) / 0.39
        return (x, y, DOME[2] + DOME_RISE * (1 - r ** 1.7) ** 0.78 - 0.01)

    # The thin russet launching muscle along the rack's base.
    sweep(f"rack_{s}_muscle", [base(t) for t in (-0.1, 0.35, 0.75, 1.1)],
          [0.032, 0.036, 0.034, 0.026], [0.024, 0.028, 0.026, 0.02],
          token="bug-flesh", sides=8)
    for i in range(SPINES):
        t = i / (SPINES - 1)
        root = base(t)
        # The quills radiate: the front ones stand up and splay out, the
        # rear ones sweep back, and every other one is shorter so the fan
        # reads as two staggered rows.
        back = -0.15 + 1.1 * t
        out = 0.42 + 0.34 * t + (0.1 if i % 2 else 0.0)
        length = (0.62 - 0.16 * t) * (0.82 if i % 2 else 1.0)
        direction = (side * math.sin(out), math.sin(back) * math.cos(out),
                     math.cos(back) * math.cos(out))
        tip = tuple(root[k] + direction[k] * length for k in range(3))
        sweep(f"rack_{s}_shaft{i}", [root, lerp(root, tip, 0.3), lerp(root, tip, 0.82)],
              [0.03, 0.034, 0.022], token="bug-chitin-black", sides=6)
        sweep(f"rack_{s}_point{i}", [lerp(root, tip, 0.8), lerp(root, tip, 0.92), tip],
              [0.023, 0.015, 0.003], token="bug-bone", sides=6)
        bead(f"rack_{s}_glow{i}", lerp(root, tip, 0.975), 0.014, "bug-bio-green",
             segments=8, rings=6)
    anchor = base(0.5)
    joint_origin(group_new(before, f"blade_rack_{s}"), anchor)


# ===========================================
# Build
# ===========================================


def build() -> None:
    """Build the Hive Guard rooted on its tile, front toward -Y."""
    before = set(mesh_objects())
    body()
    front_shield()
    group_new(before, "carapace")
    face(HEAD, 0.1)
    roots()
    rack(-1)
    rack(1)
    socket("muzzle", (0.0, 0.3, 1.0))
    finish(1.3, 0.96, 0.98)
