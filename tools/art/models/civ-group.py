"""Civilian group: four unarmed evacuees huddled on one light-grey disc.

Campaign arc §6.4 (Evacuation). Brief: docs/design/kits/campaign-bestiary.md,
"Civilian group"; concept: docs/design/concepts/campaign/civilian-group.png.

Front is -Y. The disc occupies z = 0..0.05 and every figure stands on its
top surface. Adults reach 0.9 u; the child reaches about 0.55 u.

                 -Y (front)
          fig1 child ─┐ holds hands
    fig0 woman ◄──────┘          fig3 elder ── cane
                  fig2 man (arms round fig0 and fig3)
                 +Y (back)

Rig parts follow the infantry squads (squad_parts.py): each figure exports
``fig<n>_legs`` (one box for both legs, which the runtime splits in two) and
``fig<n>_upper``. Nobody kneels, so there is no ``fig<n>_knee``. The disc is
``base``, the name the motion rig skips.

Bare heads, hair and empty hands separate civilians from infantry, whose read
is a helmet and a long weapon. ``tdf-orange`` is spent only on two emergency
blankets; the disc has no orange rim, so the selection ring stays the only
orange ring under a unit.

Export flat: the env-* clothing colours would otherwise pull brick and glass
atlas cells onto a unit.

    blender -b --python tools/art/make_model.py -- \\
      --script tools/art/models/civ-group.py --id civ.group --category units \\
      --file civ-group.glb --quality final --max-triangles 2000 --no-textured
"""

from __future__ import annotations

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import PALETTE, bevel, box, cylinder, join, material  # noqa: E402

FOOTPRINT = (1, 1)

# ===========================================
# Palette, disc and budget
# ===========================================

# Flat, untextured tokens (style guide §4.1): skin and hair for civilians,
# and the frontage kit's cream cloth. None of them has an atlas cell.
PALETTE.update(
    {
        "env-awning-cream": "#D8D0B8",
        "civ-skin": "#C08A5E",
        "civ-skin-deep": "#8E6544",
        "civ-hair": "#614C40",
        "civ-hair-grey": "#D5C4B8",
    }
)

BASE_RADIUS = 0.425
BASE_TOP = 0.05
TRIANGLE_BUDGET = 2000
FIGURE_COUNT = 4
WORLD = Matrix.Identity(4)

BLANKET = "tdf-orange"
TROUSERS = "tdf-grey-dark"


# ===========================================
# Figure construction and articulated export
# ===========================================


class _Civilian:
    """Build one figure's parts in a hip frame and consolidate its rig nodes.

    The hip frame sits on the figure's vertical axis at hip height; a lean
    tips the upper body forward about the hip, a yaw turns it about Z.
    """

    def __init__(self, index, at, hip, torso, lean=0.0, yaw=0.0):
        """Record the figure's slot, hip height and upper-body frame."""
        self.prefix = f"fig{index}"
        self.x, self.y = at
        self.hip = hip
        self.torso_w, self.torso_d, self.torso_h = torso
        self.body = (
            Matrix.Translation((self.x, self.y, hip))
            @ Matrix.Rotation(yaw, 4, "Z")
            @ Matrix.Rotation(lean, 4, "X")
        )
        self.upper = []

    # -------------------------------------------
    # Frames

    def world(self, at, frame=None):
        """Map a point in ``frame`` (the hip frame by default) to world space."""
        frame = self.body if frame is None else frame
        return tuple(frame @ Vector(at))

    def head_frame(self, turn=0.0, tilt=0.0):
        """Return the frame at the top of the neck, turned and tilted."""
        return (
            self.body
            @ Matrix.Translation((0.0, 0.0, self.torso_h + 0.025))
            @ Matrix.Rotation(turn, 4, "Z")
            @ Matrix.Rotation(tilt, 4, "X")
        )

    # -------------------------------------------
    # Primitives

    def block(self, name, size, at, token, rot=(0.0, 0.0, 0.0), frame=None,
              chamfer=0.0, bottom=None):
        """Add an upper-body box; ``bottom`` = (sx, sy, dx, dy) reshapes its lower face."""
        frame = self.body if frame is None else frame
        rotation = (frame.to_3x3() @ Euler(rot).to_matrix()).to_euler()
        ob = box(
            f"{self.prefix}_{name}", size, self.world(at, frame), token,
            rot=tuple(rotation),
        )
        if bottom:
            sx, sy, dx, dy = bottom
            for vertex in ob.data.vertices:
                if vertex.co.z < 0.0:
                    vertex.co.x = vertex.co.x * sx + dx
                    vertex.co.y = vertex.co.y * sy + dy
            ob.data.update()
        if chamfer:
            bevel(ob, chamfer, segments=1)
        self.upper.append(ob)
        return ob

    def beam(self, name, start, end, width, depth, token, frame=None):
        """Connect two points in ``frame`` with a rectangular, flat-shaded beam."""
        a, b = Vector(start), Vector(end)
        direction = b - a
        rotation = direction.to_track_quat("Z", "Y").to_euler()
        return self.block(
            name, (width, depth, direction.length), tuple((a + b) * 0.5),
            token, rot=tuple(rotation), frame=frame,
        )

    def rod(self, name, start, end, radius, token, segments=6, frame=None):
        """Connect two points in ``frame`` with a flat-shaded round shaft."""
        frame = self.body if frame is None else frame
        a, b = frame @ Vector(start), frame @ Vector(end)
        direction = b - a
        ob = cylinder(
            f"{self.prefix}_{name}", radius, radius, direction.length,
            segments, tuple((a + b) * 0.5), token,
            rot=tuple(direction.to_track_quat("Z", "Y").to_euler()),
        )
        self.upper.append(ob)
        return ob

    def loft(self, name, rings, token, frame=None):
        """Close a flat-shaded shell through rings of points, bottom ring first.

        Every ring is a list of (x, y, z) in ``frame`` with the same count;
        the first and last rings are capped, so the shell is watertight.
        """
        frame = self.body if frame is None else frame
        count = len(rings[0])
        verts = [tuple(frame @ Vector(p)) for ring in rings for p in ring]
        faces = []
        for r in range(len(rings) - 1):
            for k in range(count):
                a = r * count + k
                b = r * count + (k + 1) % count
                faces.append((a, b, b + count, a + count))
        faces.append(tuple(range(count)))
        faces.append(tuple(range((len(rings) - 1) * count, len(rings) * count)))
        mesh = bpy.data.meshes.new(f"{self.prefix}_{name}")
        mesh.from_pydata(verts, [], faces)
        shell = bmesh.new()
        shell.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(shell, faces=shell.faces)
        shell.to_mesh(mesh)
        shell.free()
        mesh.materials.append(material(token))
        for poly in mesh.polygons:
            poly.use_smooth = False
        ob = bpy.data.objects.new(f"{self.prefix}_{name}", mesh)
        bpy.context.scene.collection.objects.link(ob)
        self.upper.append(ob)
        return ob

    def limb(self, name, points, width, depth, token, hand, frame=None):
        """Chain beams through ``points`` and end the chain in a skin-coloured hand.

        Beams run half a width past every elbow, so the joint has no notch.
        """
        last = len(points) - 2
        for number, (a, b) in enumerate(zip(points, points[1:])):
            a, b = Vector(a), Vector(b)
            run = (b - a).normalized() * width * 0.5
            start = a - run if number > 0 else a
            end = b + run if number < last else b
            self.beam(f"{name}_{number}", tuple(start), tuple(end),
                      width, depth, token, frame)
        self.block(
            f"{name}_hand", (0.044, 0.044, 0.046), points[-1], hand, frame=frame,
        )

    # -------------------------------------------
    # Rig nodes

    def legs(self, width, depth, trousers):
        """Build one trouser block and one pair of shoes as ``fig<n>_legs``.

        The runtime rig splits this block into two narrower legs about its
        centre, so both pieces stay centred on the figure's axis. Shoes share
        the trouser token: one material exports one primitive, which loads as
        the single mesh the rig looks for (two would load as a group).
        """
        height = self.hip - BASE_TOP
        trouser = box(
            f"{self.prefix}_legs", (width, depth, height),
            (self.x, self.y, BASE_TOP + height * 0.5), trousers,
        )
        shoes = box(
            f"{self.prefix}_shoes", (width + 0.012, depth + 0.04, 0.045),
            (self.x, self.y - 0.022, BASE_TOP + 0.0225), trousers,
        )
        join([trouser, shoes], f"{self.prefix}_legs")

    def finish(self):
        """Apply every chamfer, then join the upper body into ``fig<n>_upper``."""
        for ob in self.upper:
            if not ob.modifiers:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            for modifier in list(ob.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
        # The torso is first, so the upper node's origin is the chest.
        join(self.upper, f"{self.prefix}_upper")


# ===========================================
# Shared body parts
# ===========================================


def _torso(f, token):
    """Build a torso that narrows to the waist, with a skin-coloured neck."""
    w, d, h = f.torso_w, f.torso_d, f.torso_h
    f.block("torso", (w, d, h), (0.0, 0.0, h * 0.5), token,
            bottom=(0.86, 0.95, 0.0, 0.0))


def _shoulder(f, sign):
    """Return a shoulder joint in the hip frame; ``sign`` -1 is left (-X)."""
    return (sign * (f.torso_w * 0.5 + 0.02), 0.0, f.torso_h - 0.035)


def _head(f, skin, hair, style, turn=0.0, tilt=0.0, scale=1.0):
    """Build a bare, slightly oversized head with a nose and one of four haircuts."""
    s = scale
    f.block("neck", (0.05 * s, 0.05 * s, 0.05), (0.0, 0.0, f.torso_h + 0.012), skin)
    frame = f.head_frame(turn, tilt)
    hw, hd, hh = 0.11 * s, 0.115 * s, 0.125 * s
    f.block("head", (hw, hd, hh), (0.0, 0.0, hh * 0.5), skin,
            frame=frame, chamfer=0.016 * s)
    f.block("nose", (0.02 * s, 0.022 * s, 0.03 * s),
            (0.0, -hd * 0.5 - 0.006 * s, hh * 0.42), skin, frame=frame)

    if style == "long":
        # Crown, a long fall down the back to the shoulders, and side locks.
        f.block("hair_top", (hw + 0.014, hd + 0.014, 0.036),
                (0.0, 0.004, hh + 0.004), hair, frame=frame)
        f.block("hair_back", (hw + 0.018, 0.05, hh + 0.03),
                (0.0, hd * 0.5 + 0.004, (hh + 0.03) * 0.5 - 0.012), hair,
                frame=frame, bottom=(1.12, 1.0, 0.0, 0.01))
        for label, sign in (("l", -1.0), ("r", 1.0)):
            f.block(f"hair_{label}", (0.02, hd * 0.75, hh * 0.72),
                    (sign * (hw * 0.5 + 0.005), 0.012, hh * 0.52), hair,
                    frame=frame)
    elif style == "short":
        # Close crop with a raised front quiff.
        f.block("hair_top", (hw + 0.012, hd + 0.012, 0.034),
                (0.0, 0.004, hh + 0.002), hair, frame=frame)
        f.block("hair_quiff", (hw * 0.8, 0.045, 0.02),
                (0.0, -hd * 0.5 + 0.022, hh + 0.016), hair, frame=frame)
        f.block("hair_back", (hw + 0.012, 0.03, hh * 0.62),
                (0.0, hd * 0.5 - 0.002, hh * 0.66), hair, frame=frame)
    elif style == "grey":
        # Thin crown with fuller sides and back.
        f.block("hair_top", (hw + 0.006, hd + 0.004, 0.022),
                (0.0, 0.008, hh + 0.0), hair, frame=frame)
        f.block("hair_back", (hw + 0.012, 0.028, hh * 0.62),
                (0.0, hd * 0.5 - 0.001, hh * 0.62), hair, frame=frame)
        for label, sign in (("l", -1.0), ("r", 1.0)):
            f.block(f"hair_{label}", (0.016, hd * 0.6, hh * 0.42),
                    (sign * (hw * 0.5 + 0.002), 0.018, hh * 0.62), hair,
                    frame=frame)
    else:
        # A child's bob: crown, back and sides down to the jaw.
        f.block("hair_top", (hw + 0.016, hd + 0.016, 0.036),
                (0.0, 0.004, hh + 0.004), hair, frame=frame)
        f.block("hair_back", (hw + 0.016, 0.036, hh * 0.8),
                (0.0, hd * 0.5 + 0.002, hh * 0.56), hair, frame=frame)
        for label, sign in (("l", -1.0), ("r", 1.0)):
            f.block(f"hair_{label}", (0.02, hd * 0.72, hh * 0.62),
                    (sign * (hw * 0.5 + 0.006), 0.014, hh * 0.6), hair,
                    frame=frame)


def _blanket_ring(z, rx, ry, cy, lapel, notch, pleat=0.0):
    """Return one twelve-point blanket ring, open at the front.

    Points sit at 15° + 30°k round the body, measured from -Y towards +X.
    The two points either side of the front are pulled back behind the
    chest into ``notch`` (x, y); the next pair are the blanket's front edges,
    set forward of the chest at ``lapel`` (x, y), so the clothing shows only
    between them. The rest alternate by ``pleat`` for faceted folds.

        side ╲ lapel ╲_notch_╱ lapel ╱ side     (seen from above, front down)
                    chest shows here
    """
    ring = []
    for k in range(12):
        sign = 1.0 if k < 6 else -1.0
        if k in (0, 11):
            ring.append((sign * notch[0], notch[1], z))
            continue
        if k in (1, 10):
            ring.append((sign * lapel[0], lapel[1], z))
            continue
        theta = math.radians(15.0 + 30.0 * k)
        fold = pleat * (1.0 if k % 2 else -1.0)
        ring.append((
            rx * (1.0 + fold) * math.sin(theta),
            cy - ry * (1.0 + fold) * math.cos(theta),
            z,
        ))
    return ring


def _blanket(f):
    """Drape an orange emergency blanket over the shoulders, open at the front.

    A loft through four rings: a flared, pleated hem below the hip, the
    waist, the shoulders (wide enough to hide the upper arms) and a snug
    collar at the chin.
    """
    w, d, h = f.torso_w, f.torso_d, f.torso_h
    chest = -d * 0.5 + 0.02
    front = -d * 0.5
    rings = [
        _blanket_ring(-0.035, w * 0.5 + 0.08, d * 0.5 + 0.06, 0.02,
                      (0.08, front - 0.03), (0.05, chest), pleat=0.05),
        _blanket_ring(h * 0.5, w * 0.5 + 0.075, d * 0.5 + 0.05, 0.015,
                      (0.075, front - 0.028), (0.047, chest), pleat=0.03),
        _blanket_ring(h + 0.005, w * 0.5 + 0.065, d * 0.5 + 0.04, 0.01,
                      (0.07, front - 0.025), (0.045, chest)),
        _blanket_ring(h + 0.05, 0.072, 0.07, 0.006,
                      (0.045, -0.058), (0.028, -0.03)),
    ]
    f.loft("blanket", rings, BLANKET)


# ===========================================
# The four figures
# ===========================================

# Figure slots on the disc (x, y). Seen from above, front down:
#
#            man (-0.06, 0.20)
#   woman                       elder (0.21, 0.03)
#   (-0.22, -0.02)
#               child (0.05, -0.23)
#
# The diamond is skewed so that from the default 45° camera all four heads
# stay in view; from behind (135°, 225°) the adults hide the small child.
WOMAN_AT = (-0.22, -0.02)
CHILD_AT = (0.05, -0.23)
MAN_AT = (-0.06, 0.20)
ELDER_AT = (0.21, 0.03)

# Where the woman's right hand holds the child's left hand (world space).
HELD_HANDS = (-0.11, -0.10, 0.33)

# The elder's cane: ground contact and handle top (world space).
CANE_FOOT = (0.34, -0.155, BASE_TOP)
CANE_TOP = (0.335, -0.15, 0.44)


def _woman(index):
    """Build the woman: cream top, orange blanket, right hand holding the child's."""
    f = _Civilian(index, WOMAN_AT, hip=0.43, torso=(0.19, 0.12, 0.26))
    f.legs(0.15, 0.11, TROUSERS)
    _torso(f, "env-awning-cream")
    _head(f, "civ-skin", "civ-hair", "long", turn=math.radians(-28.0),
          tilt=math.radians(-4.0), scale=1.08)
    _blanket(f)
    # Right arm reaches down out of the blanket to the child.
    elbow = f.world((0.1, 0.01, 0.07))
    f.limb("arm_r", [f.world(_shoulder(f, 1.0)), elbow, HELD_HANDS],
           0.052, 0.056, "env-awning-cream", "civ-skin", frame=WORLD)
    # Left hand clutches the blanket closed at the chest.
    f.limb("arm_l", [_shoulder(f, -1.0), (-0.1, 0.0, 0.09), (-0.065, -0.1, 0.16)],
           0.052, 0.056, "env-awning-cream", "civ-skin")
    f.finish()


def _child(index):
    """Build the child (about 0.55 u): blue jacket with hood, brick trousers."""
    f = _Civilian(index, CHILD_AT, hip=0.24, torso=(0.13, 0.09, 0.145))
    f.legs(0.11, 0.085, "env-brick")
    _torso(f, "env-glass")
    f.block("hood", (0.1, 0.045, 0.05), (0.0, 0.05, f.torso_h - 0.005), "env-glass")
    _head(f, "civ-skin", "civ-hair", "bob", turn=math.radians(18.0),
          tilt=math.radians(-10.0), scale=0.98)
    # Left arm reaches up and back to the woman's hand.
    held = (HELD_HANDS[0] + 0.024, HELD_HANDS[1] - 0.02, HELD_HANDS[2] - 0.012)
    f.limb("arm_l", [f.world(_shoulder(f, -1.0)), held], 0.042, 0.044,
           "env-glass", "civ-skin", frame=WORLD)
    f.limb("arm_r", [_shoulder(f, 1.0), (0.1, -0.012, 0.0)],
           0.042, 0.044, "env-glass", "civ-skin")
    f.finish()


def _man(index):
    """Build the man in a work jacket, one arm round the woman and one round the elder."""
    f = _Civilian(index, MAN_AT, hip=0.44, torso=(0.2, 0.125, 0.27))
    f.legs(0.155, 0.115, TROUSERS)
    _torso(f, "env-glass")
    h, d = f.torso_h, f.torso_d
    # Open jacket over a light shirt, collar turned up at the neck.
    f.block("shirt", (0.07, 0.012, h * 0.72), (0.0, -d * 0.5 - 0.003, h * 0.62),
            "tdf-grey-light", bottom=(0.6, 1.0, 0.0, 0.0))
    for label, sign in (("l", -1.0), ("r", 1.0)):
        f.block(f"collar_{label}", (0.05, 0.03, 0.035),
                (sign * 0.04, -d * 0.5 + 0.004, h + 0.004), "env-glass",
                rot=(0.0, 0.0, sign * 0.5))
    f.block("jacket_hem", (0.21, d + 0.012, 0.035), (0.0, 0.0, 0.016), "env-glass")
    _head(f, "civ-skin-deep", "civ-hair", "short", turn=math.radians(24.0),
          scale=1.12)
    # Left arm across the woman's back, hand on her far shoulder.
    f.limb("arm_l", [f.world(_shoulder(f, -1.0)), (-0.27, 0.13, 0.735),
                     (-0.31, 0.0, 0.752)],
           0.055, 0.058, "env-glass", "civ-skin-deep", frame=WORLD)
    # Right arm across the elder's hunched back, hand on his far shoulder.
    f.limb("arm_r", [f.world(_shoulder(f, 1.0)), (0.17, 0.13, 0.715),
                     (0.3, 0.005, 0.715)],
           0.055, 0.058, "env-glass", "civ-skin-deep", frame=WORLD)
    f.finish()


def _elder(index):
    """Build the hunched elderly man: grey cardigan, orange blanket, cane in the right hand."""
    f = _Civilian(index, ELDER_AT, hip=0.42, torso=(0.19, 0.12, 0.26),
                  lean=math.radians(14.0))
    f.legs(0.15, 0.11, TROUSERS)
    _torso(f, "tdf-grey-light")
    _head(f, "civ-skin", "civ-hair-grey", "grey", turn=math.radians(22.0),
          tilt=math.radians(8.0), scale=1.1)
    _blanket(f)
    # Cane: a round shaft with a short forward crook under the hand.
    f.rod("cane", CANE_FOOT, CANE_TOP, 0.012, "env-bark", frame=WORLD)
    f.beam("cane_crook", (CANE_TOP[0], CANE_TOP[1] + 0.012, CANE_TOP[2]),
           (CANE_TOP[0], CANE_TOP[1] - 0.05, CANE_TOP[2] - 0.012),
           0.026, 0.026, "env-bark", frame=WORLD)
    hand = (CANE_TOP[0], CANE_TOP[1] - 0.012, CANE_TOP[2] + 0.02)
    elbow = f.world((0.11, 0.0, 0.1))
    f.limb("arm_r", [f.world(_shoulder(f, 1.0)), elbow, hand],
           0.052, 0.056, "tdf-grey-light", "civ-skin", frame=WORLD)
    # Left hand holds the blanket closed.
    f.limb("arm_l", [_shoulder(f, -1.0), (-0.1, 0.0, 0.09), (-0.065, -0.1, 0.15)],
           0.052, 0.056, "tdf-grey-light", "civ-skin")
    f.finish()


# ===========================================
# Build and source-side budget guard
# ===========================================


def _check_triangle_budget():
    """Reject an over-budget group after chamfers and joins are applied."""
    prefixes = tuple(f"fig{i}_" for i in range(FIGURE_COUNT))
    total = 0
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        if ob.name != "base" and not ob.name.startswith(prefixes):
            continue
        ob.data.calc_loop_triangles()
        total += len(ob.data.loop_triangles)
    if total > TRIANGLE_BUDGET:
        raise ValueError(f"Civilian group exceeds triangle budget: {total}/{TRIANGLE_BUDGET}")


def _drop_uvs():
    """Remove UV layers: every material is a flat colour, so UVs are dead bytes.

    A later textured export still works; the atlas pass adds a layer when a
    mesh has none.
    """
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        while ob.data.uv_layers:
            ob.data.uv_layers.remove(ob.data.uv_layers[0])


def build() -> None:
    """Build the disc and the four huddled civilians."""
    cylinder("base", BASE_RADIUS, BASE_RADIUS, BASE_TOP, 16,
             (0.0, 0.0, BASE_TOP * 0.5), "tdf-grey-light")
    for index, builder in enumerate((_woman, _child, _man, _elder)):
        builder(index)
    _check_triangle_budget()
    _drop_uvs()
