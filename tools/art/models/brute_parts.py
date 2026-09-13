"""A low, broad Crescent beetle authored for the brute's real 2 x 2 footprint.

Blender coordinates are Z up and -Y forward. Shared anatomy supplies the
motion joints; brute-specific leg surfaces keep the stance lean and jointed.
Run through bug-brute.py and make_model.py.
"""

from __future__ import annotations

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bug_parts import abdomen, face, forearm, limb, vents
from bpy_kit import mesh_objects
from crescent_geometry import (
    bead,
    finish,
    group_new,
    hooked_blade,
    joint_origin,
    mesh,
    scute,
    sweep,
)


# ===========================================
# Brute: one broad vault with paired wing cases
# ===========================================


def _vault_profile(t):
    """Describe the rounded longitudinal outline without collapsing either end."""
    curve = max(0.0, math.sin(math.pi * t)) ** 0.72
    return (
        curve,
        -0.43 + 0.92 * t,
        0.072 + 0.495 * curve,
        0.435 + 0.022 * curve,
        0.105 + 0.338 * curve,
    )


def _vault_point(side, t, angle, offset=0.0):
    """Evaluate a wing case, offset along its elliptical section normal."""
    _, y, width, base, rise = _vault_profile(t)
    sine = math.sin(angle)
    cosine = math.cos(angle)

    nx = sine / width
    nz = cosine / rise
    normal_length = math.hypot(nx, nz)
    nx /= normal_length
    nz /= normal_length

    return (
        side * (0.007 + width * sine + offset * nx),
        y,
        base + rise * cosine + offset * nz,
    )


def _closed_grid(name, upper, lower, rows, cols, side, token, smooth=True):
    """Close a rectangular surface patch, correcting winding for mirrored parts."""
    count = len(upper)
    vertices = upper + lower
    faces = []

    for i in range(rows - 1):
        for j in range(cols - 1):
            a = i * cols + j
            faces.append((a, a + 1, a + cols + 1, a + cols))
            faces.append(
                (
                    a + count + cols,
                    a + count + cols + 1,
                    a + count + 1,
                    a + count,
                )
            )

    boundary = list(range(cols))
    boundary += [i * cols + cols - 1 for i in range(1, rows)]
    boundary += [
        (rows - 1) * cols + j
        for j in range(cols - 2, -1, -1)
    ]
    boundary += [i * cols for i in range(rows - 2, 0, -1)]

    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        faces.append((b, a, a + count, b + count))

    if side < 0:
        faces = [tuple(reversed(face_indices)) for face_indices in faces]

    return mesh(name, vertices, faces, token, smooth=smooth)


def _thorax_core():
    """Fill the vault with a dark thorax whose shallow belly clears the ground."""
    rows, sides = 17, 20
    vertices = []
    faces = []

    for i in range(rows):
        curve, y, _, base, _ = _vault_profile(i / (rows - 1))
        width = 0.062 + 0.502 * curve
        upper_rise = 0.083 + 0.340 * curve
        lower_drop = 0.105 + 0.155 * curve

        for j in range(sides):
            angle = math.tau * j / sides
            cosine = math.cos(angle)
            vertical_radius = upper_rise if cosine >= 0.0 else lower_drop
            vertices.append(
                (
                    width * math.sin(angle),
                    y,
                    base + vertical_radius * cosine,
                )
            )

    for i in range(rows - 1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))

    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((rows - 1) * sides + j for j in range(sides)))
    mesh("thorax", vertices, faces, "bug-chitin-black")


def _back_mark(side, index, centre_t):
    """Embed one broad tan marking into the curved wing case without floating."""
    rows, cols = 5, 5
    half_lengths = (0.047, 0.050, 0.048, 0.041)
    shoulders = (0.58, 0.91, 1.0, 0.91, 0.58)
    upper = []
    lower = []

    for i in range(rows):
        u = i / (rows - 1)
        t = centre_t + (2.0 * u - 1.0) * half_lengths[index]
        centre_angle = 0.42 + 0.035 * math.sin(math.pi * t)

        for j in range(cols):
            v = j / (cols - 1)
            angle = centre_angle + (2.0 * v - 1.0) * 0.12 * shoulders[i]
            relief = (
                0.0035
                + 0.0035 * math.sin(math.pi * u) * math.sin(math.pi * v)
            )
            upper.append(_vault_point(side, t, angle, relief))
            lower.append(_vault_point(side, t, angle, -0.006))

    _closed_grid(
        f"back_mark_{side}_{index}",
        upper,
        lower,
        rows,
        cols,
        side,
        "bug-chitin-tan",
    )


def _wing_case(side):
    """Build half of a continuous beetle dome with a narrow seam and grown rim."""
    rows, cols = 21, 13
    last_angle = math.pi * 0.5 + 0.06
    upper = []
    lower = []

    for i in range(rows):
        t = i / (rows - 1)
        for j in range(cols):
            angle = last_angle * j / (cols - 1)
            upper.append(_vault_point(side, t, angle))
            lower.append(_vault_point(side, t, angle, -0.026))

    _closed_grid(
        f"elytron_{side}",
        upper,
        lower,
        rows,
        cols,
        side,
        "bug-chitin-dark",
    )

    # Fine chestnut lips reinforce the seam without becoming a central crest.
    samples = [0.025 + 0.95 * i / 20 for i in range(21)]
    sweep(
        f"elytron_seam_{side}",
        [_vault_point(side, t, 0.020) for t in samples],
        [0.0043] * len(samples),
        token="bug-chitin-mid",
        sides=6,
    )
    sweep(
        f"elytron_flank_lip_{side}",
        [_vault_point(side, t, last_angle - 0.024, 0.001) for t in samples],
        [0.007] * len(samples),
        token="bug-chitin-mid",
        sides=6,
    )

    # Shallow growth seams stay lateral, leaving the broad dorsal values clear.
    for index, t in enumerate((0.29, 0.50, 0.71)):
        points = [
            _vault_point(side, t, 0.76 + 0.78 * j / 6)
            for j in range(7)
        ]
        sweep(
            f"elytron_growth_{side}_{index}",
            points,
            [0.0035] * len(points),
            token="bug-chitin-mid",
            sides=6,
        )

    for index, t in enumerate((0.20, 0.40, 0.60, 0.79)):
        _back_mark(side, index, t)


# ===========================================
# Brute: sheltered flank armour and green gills
# ===========================================


def _flank_vents(side, label):
    """Seat green gills in the flank and expose their outer faces in the recesses."""
    name = f"gill_{label}"
    scale = 0.022
    before = set(mesh_objects())

    vents(
        name,
        (side * 0.566, -0.130, 0.359),
        scale,
        side,
        "bug-bio-green",
    )

    # The shared recess surrounds the light. Move the light partly through
    # its outward wall, retaining overlap while making the green slot visible.
    for ob in mesh_objects():
        if ob not in before and ob.name.startswith(name + "_light"):
            ob.location.x += side * scale * 0.50


# ===========================================
# Brute: long leg armour with restrained joint collars
# ===========================================


def _between(a, b, t):
    """Interpolate an attachment along a straight anatomical segment."""
    return tuple(a[k] * (1.0 - t) + b[k] * t for k in range(3))


def _leg_collar(name, a, b, radius, start, end, sides=8):
    """Overlap a segment with a short collar peaking at 1.1 times its radius."""
    widths = [radius * 1.02, radius * 1.10, radius * 1.02]
    sweep(
        name,
        [_between(a, b, t) for t in (start, (start + end) * 0.5, end)],
        widths,
        [width * 0.88 for width in widths],
        token="bug-chitin-mid",
        sides=sides,
    )


def _brute_limb(name, points, radius):
    """Retain a shared limb's rig node while replacing its mesh with lean armour."""
    hip, outlet, knee, ankle, foot = points

    # Let the shared anatomy establish the exact node and motion_joint pivot.
    # Its default surface is replaced below; it is not retained in the export.
    node = limb(name, [hip, knee, ankle, foot], radius)
    surface_start = set(mesh_objects())

    bead(
        name + "_brute_hip",
        hip,
        radius * 0.98,
        "bug-chitin-black",
        segments=10,
        rings=6,
    )

    # One continuous upper casing travels under the rim before rising outside.
    # The bend at the outlet has no extra ball or plate stacked on top of it.
    upper_widths = [
        radius,
        radius,
        radius * 0.92,
        radius * 0.78,
    ]
    sweep(
        name + "_brute_upper",
        [hip, outlet, _between(outlet, knee, 0.50), knee],
        upper_widths,
        [width * 0.88 for width in upper_widths],
        token="bug-chitin-mid",
        sides=8,
    )
    _leg_collar(
        name + "_brute_hip_collar",
        hip,
        outlet,
        radius,
        0.19,
        0.37,
    )

    bead(
        name + "_brute_knee",
        knee,
        radius * 0.82,
        "bug-chitin-black",
        scale=(1.0, 1.0, 0.90),
        segments=10,
        rings=6,
    )
    scute(
        name + "_brute_knee_plate",
        (knee[0], knee[1], knee[2] + radius * 0.60),
        radius * 1.25,
        radius * 1.70,
        radius * 0.16,
        "bug-chitin-mid",
    )

    # All shin rings share one axis, giving a clear straight lower segment.
    shin_radius = radius * 0.76
    shin_widths = [
        shin_radius,
        shin_radius * 0.98,
        shin_radius * 0.76,
        shin_radius * 0.60,
    ]
    sweep(
        name + "_brute_shin",
        [
            knee,
            _between(knee, ankle, 0.22),
            _between(knee, ankle, 0.80),
            ankle,
        ],
        shin_widths,
        [width * 0.88 for width in shin_widths],
        token="bug-chitin-dark",
        sides=8,
    )
    _leg_collar(
        name + "_brute_knee_collar",
        knee,
        ankle,
        shin_radius,
        0.035,
        0.13,
    )
    _leg_collar(
        name + "_brute_ankle_collar",
        knee,
        ankle,
        shin_radius * 0.66,
        0.88,
        0.98,
        sides=6,
    )

    bead(
        name + "_brute_ankle",
        ankle,
        shin_radius * 0.65,
        "bug-chitin-black",
        segments=8,
        rings=5,
    )
    sweep(
        name + "_brute_tarsus",
        [ankle, _between(ankle, foot, 0.52), foot],
        [shin_radius * 0.64, radius * 0.34, radius * 0.17],
        token="bug-chitin-mid",
        sides=6,
    )

    for toe_side in (-1, 1):
        sweep(
            name + f"_brute_toe_{toe_side}",
            [
                foot,
                (
                    foot[0] + toe_side * radius * 0.24,
                    foot[1] - radius * 0.80,
                    0.004,
                ),
            ],
            [radius * 0.17, 0.002],
            token="bug-bone",
            sides=5,
        )

    # Transfer only the new mesh into the original animated object. Transform
    # it into that object's local coordinates so its authored hip stays fixed.
    surface = group_new(surface_start, name + "_surface")
    bpy.context.view_layer.update()
    surface.data.transform(node.matrix_world.inverted() @ surface.matrix_world)

    old_mesh = node.data
    node.data = surface.data
    node.data.name = name + "_mesh"
    bpy.data.objects.remove(surface, do_unlink=True)
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)

    return node


# ===========================================
# Brute: low head, six planted legs and heavy jaw cleavers
# ===========================================


def build_brute() -> None:
    """Build a grounded beetle with a wider stance and a low, forward head."""
    body_start = set(mesh_objects())
    _thorax_core()

    # Four overlapping tergites emerge beneath the rear of the wing cases.
    # Their decreasing width leaves a short, blunt abdominal tip.
    abdomen("abdomen", (0.0, 0.430, 0.405), 4, 0.370, 0.160, 0.105)

    for side in (-1, 1):
        label = "l" if side < 0 else "r"
        _wing_case(side)

        # Low chestnut side plates join the belly to the leg attachments.
        bead(
            f"flank_plate_{label}",
            (side * 0.495, -0.015, 0.335),
            0.105,
            "bug-chitin-mid",
            scale=(0.76, 2.80, 0.82),
            segments=16,
            rings=8,
        )
        _flank_vents(side, label)

    group_new(body_start, "carapace")

    # Move the complete face, brow and jaw horns forward 0.060 and down 0.038.
    # A short sheltered neck maintains a solid attachment below the front lip.
    head_start = set(mesh_objects())
    head_at = (0.0, -0.583, 0.313)

    sweep(
        "head_neck",
        [
            (0.0, -0.365, 0.375),
            (0.0, -0.462, 0.339),
            head_at,
        ],
        [0.122, 0.139, 0.146],
        [0.073, 0.083, 0.078],
        token="bug-chitin-black",
        sides=10,
    )
    face(head_at, 0.180, "bug-bio-green")

    sweep(
        "battering_brow",
        [
            (0.0, -0.447, 0.415),
            (0.0, -0.561, 0.458),
            (0.0, -0.676, 0.426),
        ],
        [0.185, 0.226, 0.156],
        [0.065, 0.059, 0.029],
        token="bug-chitin-mid",
        sides=16,
    )

    for side in (-1, 1):
        hooked_blade(
            f"jaw_horn_{side}",
            [
                (side * 0.152, -0.611, 0.269),
                (side * 0.221, -0.707, 0.239),
                (side * 0.173, -0.816, 0.276),
            ],
            [0.042, 0.052, 0.006],
            0.031,
            0.010,
        )

    head = group_new(head_start, "head")
    head.name = "head"
    joint_origin(head, head_at)

    # Each specification contains hip, low outlet, raised knee, ankle and foot.
    # Front/rear pairs retain nodes 0/1; the rigid middle pair retains node 2.
    leg_specs = (
        (
            0,
            0.058,
            (0.385, -0.245, 0.302),
            (0.585, -0.290, 0.285),
            (0.695, -0.335, 0.555),
            (0.742, -0.435, 0.115),
            (0.767, -0.465, 0.024),
        ),
        (
            2,
            0.060,
            (0.445, 0.025, 0.282),
            (0.642, 0.032, 0.285),
            (0.728, 0.040, 0.566),
            (0.770, 0.100, 0.116),
            (0.782, 0.115, 0.024),
        ),
        (
            1,
            0.058,
            (0.382, 0.260, 0.300),
            (0.585, 0.325, 0.284),
            (0.697, 0.405, 0.550),
            (0.749, 0.565, 0.118),
            (0.768, 0.596, 0.024),
        ),
    )

    for side in (-1, 1):
        label = "l" if side < 0 else "r"

        for index, radius, *anchors in leg_specs:
            points = [(side * x, y, z) for x, y, z in anchors]
            _brute_limb(f"leg_{label}{index}", points, radius)

        # Short, broad cutting paddles frame the smaller head mandibles.
        # Their tips turn inward and slightly upward, clear of the ground.
        wrist = (side * 0.425, -0.597, 0.231)
        forearm(
            f"cleaver_{label}",
            (side * 0.290, -0.342, 0.312),
            (side * 0.425, -0.480, 0.287),
            wrist,
            [
                wrist,
                (side * 0.401, -0.729, 0.215),
                (side * 0.316, -0.829, 0.232),
                (side * 0.237, -0.860, 0.273),
            ],
            [0.067, 0.105, 0.086, 0.008],
            0.092,
        )

    # These are physical bounds, with no subsequent footprint enlargement.
    finish(0.9, 1.6, 1.8)
