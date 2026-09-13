"""Deterministic infantry squads: five soldiers, one grounded base, six roles.

Front is -Y. The supplied wedge and standing proportions are preserved.
The disc occupies z = 0..0.05; soldiers stand directly on its top surface.
Standing headgear reaches 0.97 u; radio aerial tips reach 1.36 u.
The raised rocket launcher projects above the standing helmet line.

Each figure exports separate legs, an optional knee node, and one upper mesh.
Equipment belongs to the whole squad; individual poses add secondary reads.
"""

from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cylinder, join  # noqa: E402

# ===========================================
# Formation, proportions and palette

SLOTS = [
    (0.0, -0.28),
    (-0.24, -0.05),
    (0.24, -0.05),
    (-0.13, 0.2),
    (0.13, 0.2),
]
BASE_TOP = 0.05
RADIO_HEIGHT = 1.36

COLOURS = {
    "rifle": ("tdf-olive", "tdf-olive-dark", "tdf-olive"),
    "rocket": ("tdf-grey-dark", "tdf-olive-dark", "tdf-grey-mid"),
    "sniper": ("tdf-olive-dark", "tdf-olive-dark", "tdf-grey-mid"),
    "engineer": ("tdf-orange-dim", "tdf-olive-dark", "tdf-grey-mid"),
    "medic": ("tdf-grey-light", "tdf-olive", "tdf-grey-mid"),
    "radio": ("tdf-olive", "tdf-grey-mid", "tdf-olive-dark"),
}


# ===========================================
# Local construction and articulated export

class _Figure:
    """Build upper parts in coordinates measured from a soldier's hip."""

    def __init__(self, prefix, at, kit, kneel, index):
        """Record the pose, palette and independently articulated parts."""
        self.prefix = prefix
        self.x, self.y = at
        self.kit = kit
        self.index = index
        self.kneel = kneel
        self.leg_h = 0.18 if kneel and kit == "sniper" else (
            0.26 if kneel else 0.4
        )
        self.hip = BASE_TOP + self.leg_h
        self.depth = 0.12 if kit == "medic" else 0.14
        self.uniform, self.trousers, self.sleeves = COLOURS[kit]
        self.upper = []
        self.knees = []

    def world(self, at):
        """Translate a hip-relative point into Blender world coordinates."""
        return (self.x + at[0], self.y + at[1], self.hip + at[2])

    def block(self, name, size, at, token, rot=(0.0, 0.0, 0.0),
              chamfer=0.0):
        """Add a named upper-body box, optionally with a single chamfer."""
        ob = box(
            f"{self.prefix}_{name}", size, self.world(at), token, rot=rot
        )
        if chamfer:
            bevel(ob, chamfer, segments=1)
        self.upper.append(ob)
        return ob

    def beam(self, name, start, end, width, depth, token):
        """Connect two local points with a rectangular, flat-shaded beam."""
        a, b = Vector(start), Vector(end)
        direction = b - a
        rotation = direction.to_track_quat("Z", "Y").to_euler()
        return self.block(
            name,
            (width, depth, direction.length),
            tuple((a + b) * 0.5),
            token,
            rot=tuple(rotation),
        )

    def rod(self, name, start, end, radius, token, segments=6,
            radius_tip=None):
        """Connect two local points with a cylinder or tapered round."""
        a, b = Vector(start), Vector(end)
        direction = b - a
        rotation = direction.to_track_quat("Z", "Y").to_euler()
        ob = cylinder(
            f"{self.prefix}_{name}",
            radius if radius_tip is None else radius_tip,
            radius,
            direction.length,
            segments,
            self.world(tuple((a + b) * 0.5)),
            token,
            rot=tuple(rotation),
        )
        self.upper.append(ob)
        return ob

    def finish(self):
        """Apply every upper modifier before joining; retain rig nodes."""
        if self.knees:
            join(self.knees, f"{self.prefix}_knee")

        for ob in self.upper:
            if not ob.modifiers:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            for modifier in list(ob.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)

        # The torso is first, giving every upper mesh the same useful origin.
        join(self.upper, f"{self.prefix}_upper")


class _Gun:
    """Place weapon components along a consistent stock-to-muzzle axis."""

    def __init__(self, figure, name, origin, direction):
        """Construct an orthogonal weapon frame without scene parenting."""
        self.figure = figure
        self.name = name
        self.origin = Vector(origin)
        self.forward = Vector(direction).normalized()
        self.side = Vector(
            (-self.forward.y, self.forward.x, 0.0)
        ).normalized()
        self.up = self.side.cross(-self.forward).normalized()
        self.rotation = Matrix(
            (self.side, -self.forward, self.up)
        ).transposed().to_euler()

    def point(self, along=0.0, height=0.0, side=0.0):
        """Return a weapon-relative point in the figure's local coordinates."""
        return tuple(
            self.origin
            + self.forward * along
            + self.up * height
            + self.side * side
        )

    def block(self, name, size, along, height, token, side=0.0):
        """Add a box whose length follows the weapon's firing axis."""
        return self.figure.block(
            f"{self.name}_{name}",
            size,
            self.point(along, height, side),
            token,
            rot=tuple(self.rotation),
        )

    def pipe(self, name, start, end, radius, token, height=0.0,
             segments=6):
        """Add a barrel, optic or collar parallel to the firing axis."""
        return self.figure.rod(
            f"{self.name}_{name}",
            self.point(start, height),
            self.point(end, height),
            radius,
            token,
            segments=segments,
        )


def _body(f):
    """Build the torso first and preserve the runtime's single leg box."""
    torso_h = 0.30 if f.kit == "sniper" else 0.34
    f.block(
        "torso", (0.20, f.depth, torso_h),
        (0.0, 0.0, torso_h * 0.5), f.uniform,
    )
    f.block(
        "neck", (0.069, 0.065, 0.045),
        (0.0, 0.0, 0.3475), "tdf-grey-dark",
    )

    box(
        f"{f.prefix}_legs",
        (0.18, 0.14, f.leg_h),
        (f.x, f.y, BASE_TOP + f.leg_h * 0.5),
        f.trousers,
    )
    if f.kneel:
        f.knees.append(box(
            f"{f.prefix}_knee_block",
            (0.09, 0.135, 0.08),
            (f.x + 0.047, f.y - 0.058, BASE_TOP + 0.04),
            f.trousers,
        ))


def _arms(f, left, right, bent=None, bands=False):
    """Connect gloves to shoulders, bending the supporting arm forward."""
    for label, sign, hand in (
        ("l", -1.0, Vector(left)),
        ("r", 1.0, Vector(right)),
    ):
        shoulder = Vector((sign * 0.113, -0.025, 0.285))
        if label == bent:
            if f.index >= 3:
                # Rear support arms cross inward before reaching forward,
                # clearing the equipment on the flank soldiers.
                elbow = Vector((-sign * 0.020, -0.110, 0.285))
            else:
                elbow = Vector((sign * 0.132, -0.143, 0.185))
            first_end = elbow
            f.beam(
                f"arm_{label}", shoulder, elbow,
                0.060, 0.062, f.sleeves,
            )
            f.beam(
                f"forearm_{label}", elbow, hand,
                0.052, 0.055, f.sleeves,
            )
        else:
            first_end = hand
            f.beam(
                f"arm_{label}", shoulder, hand,
                0.060, 0.064, f.sleeves,
            )

        f.block(
            f"glove_{label}", (0.044, 0.045, 0.048),
            tuple(hand), "tdf-grey-dark",
        )

        if f.kit == "rifle" and label == "r":
            # A fitted orange shoulder marking remains visible above
            # the dark diagonal strap and lower belt pouch.
            axis = (first_end - shoulder).normalized()
            centre = shoulder.lerp(first_end, 0.18)
            f.beam(
                "shoulder_patch",
                centre - axis * 0.0135,
                centre + axis * 0.0135,
                0.066, 0.068, "tdf-orange",
            )

        if bands:
            axis = (hand - shoulder).normalized()
            centre = shoulder.lerp(hand, 0.34)
            f.beam(
                f"armband_{label}",
                centre - axis * 0.018,
                centre + axis * 0.018,
                0.068, 0.072, "tdf-orange",
            )


def _hold(f, gun, launcher=False, left_override=None):
    """Place the firing hand and supporting hand against the actual weapon."""
    main = gun.point(-0.022, -0.089 if launcher else -0.050)
    support = gun.point(0.090 if launcher else 0.073,
                        -0.056 if launcher else -0.029)
    if gun.origin.x >= 0.0:
        left, right, bent = support, main, "l"
    else:
        left, right, bent = main, support, "r"

    if left_override is not None:
        left = left_override
        bent = None
    _arms(f, left, right, bent=bent)


# ===========================================
# Headgear: the primary read from the game camera

def _helmet(f):
    """Build a light helmet, with a squarer shell for heavy infantry."""
    heavy = f.kit == "rocket"
    medical = f.kit == "medic"
    f.block(
        "helmet",
        (0.196 if heavy else 0.18, 0.184 if heavy else 0.174,
         0.148 if medical else 0.16),
        (0.0, 0.0, 0.434 if medical else 0.44),
        "tdf-grey-light",
        chamfer=0.018 if heavy else 0.025,
    )
    front = -0.092 if heavy else -0.087
    f.block(
        "brim", (0.204, 0.053, 0.017),
        (0.0, front - 0.006, 0.439), "tdf-grey-mid",
    )
    f.block(
        "visor", (0.119, 0.014, 0.038),
        (0.0, front - 0.007, 0.411), "tdf-visor",
    )
    if medical:
        # This lies entirely on the flat crown, clear of its bevel.
        f.block(
            "helmet_mark", (0.050, 0.118, 0.012),
            (0.0, 0.0, 0.514), "tdf-orange",
        )


def _soft_head(f, headset=False):
    """Build a broad face and soft cap, optionally under a bright headset."""
    f.block(
        "head", (0.145, 0.135, 0.12),
        (0.0, 0.0, 0.415), "tdf-grey-mid",
    )
    f.block(
        "eyes", (0.103, 0.014, 0.026),
        (0.0, -0.0745, 0.425), "tdf-visor",
    )
    f.block(
        "cap",
        (0.174, 0.156, 0.047) if headset else (0.181, 0.160, 0.060),
        (0.0, 0.0, 0.4665 if headset else 0.490),
        "tdf-olive-dark" if headset else "tdf-grey-mid",
        chamfer=0.010,
    )
    f.block(
        "cap_peak", (0.177, 0.080, 0.017),
        (0.0, -0.095, 0.4525 if headset else 0.464),
        "tdf-olive-dark",
    )
    if headset:
        for label, sign in (("l", -1.0), ("r", 1.0)):
            f.block(
                f"earcup_{label}", (0.030, 0.072, 0.116),
                (sign * 0.095, 0.0, 0.445), "tdf-grey-light",
            )
        f.block(
            "headset_band", (0.210, 0.045, 0.026),
            (0.0, 0.0, 0.507), "tdf-grey-light",
        )


def _hard_hat(f):
    """Build a broad hard-hat brim, chamfered crown and forward work lamp."""
    f.block(
        "helmet", (0.184, 0.178, 0.132),
        (0.0, 0.0, 0.442), "tdf-grey-light", chamfer=0.022,
    )
    f.block(
        "hardhat_brim", (0.212, 0.202, 0.018),
        (0.0, -0.003, 0.382), "tdf-orange",
    )
    f.block(
        "hardhat_ridge", (0.050, 0.118, 0.012),
        (0.0, 0.0, 0.514), "tdf-orange",
    )
    f.block(
        "visor", (0.112, 0.014, 0.031),
        (0.0, -0.096, 0.407), "tdf-grey-dark",
    )
    f.block(
        "lamp_housing", (0.060, 0.046, 0.045),
        (0.0, -0.109, 0.447), "tdf-grey-dark",
    )
    f.block(
        "lamp_lens", (0.040, 0.008, 0.028),
        (0.0, -0.136, 0.447), "tdf-visor",
    )


# ===========================================
# Weapons and carrying poses

def _ready_gun(f, name, long=False, shotgun=False):
    """Keep front muzzles upright and rear weapons inside the wedge gaps."""
    if f.index == 0:
        elevation = 80.0 if shotgun else 78.0
        origin = (0.128, -0.145, 0.20)
    elif f.index in (1, 2):
        elevation = 12.0 if long else (32.0 if shotgun else 26.0)
        sign = -1.0 if f.index == 1 else 1.0
        origin = (sign * 0.126, -0.095, 0.27 if long else 0.22)
    else:
        elevation = 66.0 if long else 68.0
        origin = (0.060 if f.index == 3 else -0.060, -0.210, 0.195)

    angle = math.radians(elevation)
    return _Gun(
        f, name, origin, (0.0, -math.cos(angle), math.sin(angle))
    )


def _carbine(g, slung=False, smg=False):
    """Build a readable receiver, stock, barrel and projecting magazine."""
    length = 0.82 if slung else 1.0
    receiver_l = 0.106 if smg else 0.126
    stock_l = 0.065 if smg else 0.090
    stock_at = -0.078 if smg else -0.102
    muzzle = 0.112 if smg else 0.164
    width = 0.036 if slung else 0.044

    g.block(
        "receiver", (width, receiver_l * length, 0.052),
        0.0, 0.0, "tdf-grey-dark" if smg else "tdf-grey-mid",
    )
    g.block(
        "stock", (width * 0.85, stock_l * length, 0.047),
        stock_at * length, 0.006, "tdf-olive-dark",
    )
    g.pipe(
        "barrel", 0.050 * length, muzzle * length,
        0.0115 if slung else 0.014, "tdf-grey-dark",
    )
    g.block(
        "magazine", (0.030, 0.036 * length, 0.075 if smg else 0.067),
        0.002, -0.053, "tdf-grey-dark",
    )


def _marksman_rifle(g):
    """Build a long rifle with a raised scope and two folded bipod legs."""
    g.block(
        "receiver", (0.045, 0.126, 0.052),
        0.0, 0.0, "tdf-grey-dark",
    )
    g.block(
        "stock", (0.050, 0.115, 0.064),
        -0.116, 0.004, "tdf-olive-dark",
    )
    g.pipe("barrel", 0.055, 0.285, 0.0105, "tdf-grey-dark")
    g.block(
        "muzzle", (0.031, 0.042, 0.031),
        0.275, 0.0, "tdf-grey-mid",
    )
    g.pipe(
        "scope", -0.045, 0.082, 0.025,
        "tdf-grey-mid", height=0.049,
    )
    for label, sign in (("l", -1.0), ("r", 1.0)):
        g.figure.beam(
            f"{g.name}_bipod_{label}",
            g.point(0.164, -0.008, sign * 0.016),
            g.point(0.245, -0.038, sign * 0.028),
            0.014, 0.014, "tdf-grey-mid",
        )


def _shotgun(g):
    """Build a pump shotgun with a bright slide and underslung magazine."""
    g.block(
        "receiver", (0.045, 0.126, 0.052),
        0.0, 0.0, "tdf-grey-dark",
    )
    g.block(
        "stock", (0.040, 0.090, 0.052),
        -0.105, 0.004, "tdf-olive-dark",
    )
    # Four barrel sides suffice at this diameter; retain the pump and tube.
    g.pipe(
        "barrel", 0.055, 0.240, 0.0125,
        "tdf-grey-dark", segments=4,
    )
    g.block(
        "tube_magazine", (0.023, 0.155, 0.022),
        0.135, -0.028, "tdf-grey-mid",
    )
    g.block(
        "pump", (0.052, 0.090, 0.052),
        0.111, -0.013, "tdf-grey-light",
    )


def _launcher(f):
    """Raise the right-shouldered launcher above the helmets; retain the hip pose."""
    shouldered = f.index == 1
    angle = math.radians(60.0 if shouldered else 22.0)
    g = _Gun(
        f, "launcher",
        (0.142 if shouldered else 0.128, -0.065,
         0.360 if shouldered else 0.150),
        (0.0, -math.cos(angle), math.sin(angle)),
    )
    g.pipe("tube", -0.210, 0.215, 0.045, "tdf-olive-dark", segments=8)
    g.pipe(
        "muzzle_collar", 0.178, 0.225, 0.055,
        "tdf-orange-dim" if shouldered else "tdf-grey-mid",
        segments=8,
    )
    g.pipe(
        "muzzle_recess", 0.224, 0.227, 0.041,
        "tdf-grey-dark",
    )
    g.pipe(
        "rear_collar", -0.224, -0.185, 0.055,
        "tdf-orange-dim", segments=6,
    )
    g.block(
        "grip", (0.037, 0.051, 0.081),
        -0.030, -0.078, "tdf-grey-dark",
    )
    g.block(
        "sight", (0.021, 0.047, 0.041),
        0.066, 0.059, "tdf-grey-light",
    )
    return g


# ===========================================
# Shared equipment

def _webbing(f, pouches=False):
    """Add fitted suspenders and a belt, optionally carrying rifle pouches."""
    front = -f.depth * 0.5
    for label, sign in (("l", -1.0), ("r", 1.0)):
        f.block(
            f"webbing_{label}", (0.025, 0.014, 0.210),
            (sign * 0.061, front - 0.007, 0.200), "tdf-olive-dark",
        )
        if pouches:
            f.block(
                f"pouch_{label}", (0.062, 0.039, 0.066),
                (sign * 0.053, front - 0.030, 0.143),
                "tdf-grey-mid",
            )
    f.block(
        "belt", (0.207, f.depth + 0.016, 0.035),
        (0.0, 0.0, 0.040), "tdf-grey-dark",
    )


def _cross(f, name, x, y, z, width, height, stroke):
    """Build a raised light cross from three touching, nonoverlapping bars."""
    f.block(
        f"{name}_stem", (stroke, 0.006, height),
        (x, y, z), "tdf-grey-light",
    )
    arm = (width - stroke) * 0.5
    for label, sign in (("l", -1.0), ("r", 1.0)):
        f.block(
            f"{name}_{label}", (arm, 0.006, stroke),
            (x + sign * (stroke + arm) * 0.5, y, z),
            "tdf-grey-light",
        )


def _case(f, medical=False):
    """Build a carried case with its open handle and optional medical cross."""
    x, y, z = -0.169, -0.043, 0.035
    # Keep the silhouette and markings; spend bevels on the visible headgear.
    f.block(
        "carried_case", (0.140, 0.085, 0.140),
        (x, y, z),
        "tdf-orange-dim" if medical else "tdf-grey-mid",
    )
    for label, sign in (("l", -1.0), ("r", 1.0)):
        f.block(
            f"case_handle_{label}", (0.016, 0.026, 0.048),
            (x + sign * 0.041, y, 0.126), "tdf-grey-dark",
        )
    f.block(
        "case_handle_top", (0.098, 0.026, 0.018),
        (x, y, 0.155), "tdf-grey-dark",
    )
    if medical:
        _cross(f, "case_cross", x, y - 0.0455, z,
               0.076, 0.078, 0.022)
    return (x, y, 0.171)


# ===========================================
# Rifle: olive uniforms, a broad diagonal strap and dark belt ammunition

def _rifle(f):
    """Equip every rifleman with a carbine, diagonal strap and large belt pouch."""
    f.block(
        "belt", (0.207, f.depth + 0.016, 0.035),
        (0.0, 0.0, 0.040), "tdf-grey-dark",
    )
    f.beam(
        "diagonal_strap",
        (-0.078, -0.078, 0.320), (0.074, -0.078, 0.065),
        0.044, 0.020, "tdf-grey-dark",
    )
    f.block(
        "belt_pouch", (0.084, 0.048, 0.075),
        (-0.047, -0.094, 0.079), "tdf-grey-dark",
    )
    f.block(
        "pack", (0.160, 0.058, 0.180),
        (0.0, 0.099, 0.170), "tdf-olive-dark",
    )
    g = _ready_gun(f, "carbine")
    _carbine(g)
    _hold(f, g)


# ===========================================
# Rocket: broad armour, lower-body pads and exposed spare rounds

def _rocket_knees(f):
    """Keep both knee pads in the optional lower-body rig node."""
    for label, sign in (("l", -1.0), ("r", 1.0)):
        low_knee = f.kneel and sign > 0.0
        centre = (
            f.x + (0.047 if low_knee else sign * 0.046),
            f.y + (-0.136 if low_knee else -0.0805),
            BASE_TOP + (0.051 if low_knee else f.leg_h * 0.56),
        )
        f.knees.append(box(
            f"{f.prefix}_pad_{label}",
            (0.064, 0.021, 0.076),
            centre,
            "tdf-grey-light",
        ))


def _rocket_pack(f):
    """Show larger pointed warheads above every ammunition backpack."""
    f.block(
        "rocket_pack", (0.174, 0.065, 0.235),
        (0.0, 0.1025, 0.165), "tdf-olive",
    )
    offsets = (-0.045, 0.045) if f.index in (1, 2) else (0.0,)
    for number, x in enumerate(offsets):
        f.rod(
            f"spare_{number}_shaft",
            (x, 0.134, 0.190), (x, 0.134, 0.415),
            0.021, "tdf-grey-mid", segments=5,
        )
        f.rod(
            f"spare_{number}_warhead",
            (x, 0.134, 0.414), (x, 0.134, 0.535),
            0.028, "tdf-orange-dim", radius_tip=0.0,
        )


def _rocket(f):
    """Arm two launcher operators and three armoured ammunition carriers."""
    f.block(
        "heavy_plate", (0.216, 0.040, 0.219),
        (0.0, -0.090, 0.210), "tdf-grey-mid",
    )
    for label, sign in (("l", -1.0), ("r", 1.0)):
        f.block(
            f"shoulder_plate_{label}", (0.047, 0.127, 0.065),
            (sign * 0.104, 0.0, 0.305), "tdf-grey-light",
        )
    _rocket_knees(f)
    _rocket_pack(f)
    if f.index in (1, 2):
        _hold(f, _launcher(f), launcher=True)
    else:
        g = _ready_gun(f, "carbine")
        _carbine(g)
        _hold(f, g)


# ===========================================
# Sniper: continuous dark capes, soft caps and long scoped weapons

def _cape(f):
    """Drape one bevelled slab over both shoulders and down to a small pack."""
    cape = f.block(
        "cape", (0.252, 0.160, 0.360),
        (0.0, 0.060, 0.180), "tdf-olive-dark",
        chamfer=0.012,
    )

    # Shape the existing closed box into one tapered slab. Its broad top
    # covers both shoulders; the narrower hem follows the back. Retaining
    # the box topology also retains its UVs and closed surface.
    for vertex in cape.data.vertices:
        if vertex.co.z < 0.0:
            vertex.co.x *= 0.73
            vertex.co.y = 0.080 if vertex.co.y > 0.0 else 0.017
    cape.data.update()

    # The hood overlaps the cape at its root and cups the back of the head.
    f.block(
        "hood", (0.143, 0.085, 0.110),
        (0.0, 0.0825, 0.395), "tdf-olive-dark",
    )
    f.block(
        "field_pack", (0.154, 0.054, 0.160),
        (0.0, 0.130, 0.120), "tdf-olive-dark",
    )
    f.block(
        "chest_strap", (0.027, 0.014, 0.145),
        (-0.049, -0.077, 0.157), "tdf-grey-mid",
    )


def _sniper(f):
    """Give four marksmen scoped rifles and the low leader binoculars."""
    _cape(f)
    if f.index == 0:
        for label, sign in (("l", -1.0), ("r", 1.0)):
            f.rod(
                f"binocular_{label}",
                (sign * 0.043, -0.116, 0.421),
                (sign * 0.043, -0.202, 0.421),
                0.025, "tdf-grey-dark",
            )
        f.block(
            "binocular_bridge", (0.086, 0.034, 0.022),
            (0.0, -0.151, 0.421), "tdf-grey-mid",
        )
        _arms(
            f, (-0.065, -0.145, 0.397), (0.065, -0.145, 0.397)
        )
    else:
        g = _ready_gun(f, "marksman", long=True)
        _marksman_rifle(g)
        _hold(f, g)


# ===========================================
# Engineer: workwear, hard hats, pump guns and demolition equipment

def _engineer(f):
    """Equip every engineer with a shotgun, wrench and demolition satchel."""
    _webbing(f)
    f.block(
        "demolition_satchel", (0.176, 0.061, 0.235),
        (0.0, 0.1005, 0.150), "tdf-olive-dark",
    )
    f.block(
        "satchel_flap", (0.176, 0.012, 0.082),
        (0.0, 0.137, 0.223), "tdf-orange-dim",
    )
    f.block(
        "wrench_shaft", (0.020, 0.017, 0.150),
        (-0.061, -0.0925, 0.155), "tdf-grey-light",
    )
    for label, sign in (("l", -1.0), ("r", 1.0)):
        f.block(
            f"wrench_jaw_{label}", (0.018, 0.017, 0.044),
            (-0.061 + sign * 0.013, -0.0925, 0.232),
            "tdf-grey-light",
        )

    if f.index == 1:
        angle = math.radians(78.0)
        g = _Gun(
            f, "shotgun", (0.128, -0.110, 0.180),
            (0.0, -math.cos(angle), math.sin(angle)),
        )
        _shotgun(g)
        _hold(f, g, left_override=_case(f))
    else:
        g = _ready_gun(f, "shotgun", shotgun=True)
        _shotgun(g)
        _hold(f, g)


# ===========================================
# Medic: light clothing, marked packs and weapons slung across the chest

def _medic(f):
    """Equip every medic with a marked pack, armbands and a slung carbine."""
    _webbing(f)
    f.block(
        "medical_pack", (0.176, 0.058, 0.225),
        (0.0, 0.100, 0.175), "tdf-olive-dark",
    )
    f.block(
        "medical_panel", (0.143, 0.009, 0.166),
        (0.0, 0.1335, 0.180), "tdf-orange-dim",
    )
    _cross(f, "pack_cross", 0.0, 0.141, 0.180,
           0.120, 0.147, 0.032)

    f.beam(
        "carbine_sling",
        (-0.079, -0.067, 0.310), (0.081, -0.067, 0.080),
        0.016, 0.014, "tdf-olive-dark",
    )
    g = _Gun(
        f, "slung_carbine", (0.0, -0.088, 0.205), (1.0, 0.0, 0.70)
    )
    _carbine(g, slung=True)

    left = (-0.125, -0.075, 0.125)
    right = (0.125, -0.075, 0.130)
    if f.index == 1:
        left = _case(f, medical=True)
    _arms(f, left, right, bands=True)


# ===========================================
# Radio: headset silhouettes, compact weapons and two tall whip aerials

def _radio_pack(f):
    """Build either a compact battery pack or a tall radio with an aerial."""
    tall = f.index in (1, 4)
    f.block(
        "radio_pack",
        (0.177, 0.075, 0.310) if tall else (0.165, 0.062, 0.215),
        (0.0, 0.1075 if tall else 0.101, 0.230 if tall else 0.180),
        "tdf-olive-dark",
    )
    if not tall:
        return

    f.block(
        "radio_panel", (0.135, 0.012, 0.145),
        (0.0, 0.151, 0.245), "tdf-grey-mid",
    )
    f.block(
        "radio_screen", (0.087, 0.006, 0.051),
        (0.0, 0.160, 0.274), "tdf-visor",
    )

    sign = -1.0 if f.index == 1 else 1.0
    x0, x1 = sign * 0.055, sign * 0.025
    f.block(
        "aerial_mount", (0.032, 0.030, 0.030),
        (x0, 0.135, 0.395), "tdf-grey-mid",
    )
    tip_bottom = RADIO_HEIGHT - 0.042
    f.rod(
        "aerial",
        (x0, 0.135, 0.400),
        (x1, 0.135, tip_bottom + 0.005 - f.hip),
        0.009, "tdf-grey-dark", radius_tip=0.0055,
    )
    f.rod(
        "aerial_tip",
        (x1, 0.135, tip_bottom - f.hip),
        (x1, 0.135, RADIO_HEIGHT - f.hip),
        0.014, "tdf-orange",
    )


def _radio(f):
    """Equip the signals squad with SMGs, headsets and a handset operator."""
    f.block(
        "signals_vest", (0.190, 0.024, 0.200),
        (0.0, -0.082, 0.200), "tdf-grey-mid",
    )
    f.block(
        "signals_tab", (0.043, 0.010, 0.050),
        (-0.050, -0.099, 0.267), "tdf-orange",
    )
    f.block(
        "pack_strap", (0.027, 0.014, 0.250),
        (0.060, -0.101, 0.205), "tdf-olive-dark",
    )
    _radio_pack(f)
    g = _ready_gun(f, "smg")
    _carbine(g, smg=True)

    if f.index == 0:
        f.block(
            "handset", (0.033, 0.040, 0.102),
            (-0.130, -0.073, 0.388), "tdf-grey-dark",
        )
        f.rod(
            "handset_cord",
            (-0.130, -0.073, 0.337), (-0.097, -0.055, 0.237),
            0.006, "tdf-grey-dark", segments=4,
        )
        _hold(f, g, left_override=(-0.134, -0.074, 0.373))
    else:
        _hold(f, g)


# ===========================================
# Public builders and source-side budget guard

def figure(prefix, at, kit, kneel=False, index=0):
    """Build one complete role-equipped soldier and consolidate its rig."""
    f = _Figure(prefix, at, kit, kneel, index)
    _body(f)

    if kit == "engineer":
        _hard_hat(f)
    elif kit in ("sniper", "radio"):
        _soft_head(f, headset=kit == "radio")
    else:
        _helmet(f)

    builders = {
        "rifle": _rifle,
        "rocket": _rocket,
        "sniper": _sniper,
        "engineer": _engineer,
        "medic": _medic,
        "radio": _radio,
    }
    builders[kit](f)
    f.finish()


def _check_triangle_budget():
    """Reject an over-budget squad after bevels and joins are applied."""
    prefixes = tuple(f"fig{i}_" for i in range(5))
    total = 0
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        if ob.name != "base" and not ob.name.startswith(prefixes):
            continue
        ob.data.calc_loop_triangles()
        total += len(ob.data.loop_triangles)
    if total > 2000:
        raise ValueError(f"Infantry squad exceeds triangle budget: {total}/2000")


def build_squad(kit):
    """Build five soldiers wearing one role, with the front leader kneeling."""
    if kit not in COLOURS:
        raise ValueError(f"Unknown infantry kit: {kit}")

    cylinder(
        "base", 0.425, 0.425, BASE_TOP, 16,
        (0.0, 0.0, BASE_TOP * 0.5), "tdf-grey-dark",
    )
    for index, at in enumerate(SLOTS):
        figure(
            f"fig{index}", at, kit,
            kneel=index == 0, index=index,
        )
    _check_triangle_budget()
