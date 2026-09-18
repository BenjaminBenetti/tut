"""Six silhouette families with structural, chassis-specific shoulder hardpoints."""

import math
import bpy
from bpy_kit import box, cylinder, sphere, bevel, socket, _finish

DARK = "tdf-grey-dark"
MID = "tdf-grey-mid"
LIGHT = "tdf-grey-light"
OLIVE = "tdf-olive"
ORANGE = "tdf-orange"
LENS = "tdf-visor"

# x = shoulder spread, z = arm pivot; back = supported module pivot.
LAYOUTS = {
    "vanguard": (0.72, 0.85, (0.65, 0.18, 1.10)),
    "courser": (0.63, 0.82, (0.60, 0.28, 1.10)),
    "bulwark": (0.80, 0.88, (0.72, 0.18, 1.13)),
    "atlas": (0.84, 1.00, (0.77, 0.26, 1.24)),
    "surveyor": (0.58, 0.84, (0.59, 0.25, 1.12)),
    "crucible": (0.81, 0.88, (0.73, 0.20, 1.15)),
}


def plate(name, size, at, token=MID, rot=(0, 0, 0)):
    """A small chamfer catches light on functional armour and hardpoint hardware."""
    return bevel(box(name, size, at, token, rot), min(0.018, min(size) * 0.2))


def hull(name, rings, token=MID):
    """Closed eight-sided loft: each ring is (height, half-width, half-depth, rearward offset)."""
    vertices = []
    for z, w, d, cy in rings:
        vertices.extend([(x * w, y * d + cy, z) for x, y in
                         [(-.65, -1), (.65, -1), (1, -.6), (1, .6),
                          (.65, 1), (-.65, 1), (-1, .6), (-1, -.6)]])
    faces = [tuple(reversed(range(8)))]
    for ring in range(len(rings) - 1):
        for i in range(8):
            a = ring * 8 + i
            b = ring * 8 + (i + 1) % 8
            faces.append((a, b, b + 8, a + 8))
    faces.append(tuple(range((len(rings) - 1) * 8, len(rings) * 8)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    return _finish(ob, name, token, False)


def fittings(variant):
    """Arm bearings and a bolted shelf support the module beside, never above, the cockpit."""
    x, z, back = LAYOUTS[variant]
    for side, label in [(-1, "l"), (1, "r")]:
        cylinder(f"shoulder_joint_{label}", .13, .13, .24, 8,
                 (side * (x - .06), 0, z), DARK, rot=(0, math.pi / 2, 0))
        socket(f"arm_{label}", (side * x, 0, z))
    bx, by, bz = back
    plate("back_mount_strut", (.20, .24, bz - z + .16),
          (bx, by, (bz + z) / 2 - .06), DARK)
    plate("back_mount_shelf", (.39, .36, .10), (bx, by, bz - .05), LIGHT)
    box("back_mount_inboard", (.34, .22, .10), (bx - .17, by, z + .06), DARK)
    for dx in [-.13, .13]:
        cylinder(f"back_mount_bolt_{dx}", .025, .025, .015, 6,
                 (bx + dx, by + .12, bz + .005), ORANGE)
    socket("back", back)


def vanguard():
    """Compact wedge hull with a proud helmet, angled breastplate and clipped shoulders."""
    hull("torso", [(0, .31, .25, 0), (.64, .52, .36, 0), (.97, .40, .28, .03)])
    hull("breastplate", [(.2, .27, .07, -.27), (.67, .37, .08, -.35), (.82, .28, .04, -.32)], OLIVE)
    for side in [-1, 1]:
        plate(f"pad_{side}", (.28, .51, .22), (side * .56, 0, .95), OLIVE, (0, side * -.18, 0))
        box(f"chest_vent_{side}", (.10, .035, .22), (side * .36, -.335, .50), DARK)
    hull("cockpit", [(1.0, .20, .20, -.02), (1.26, .20, .19, -.04), (1.34, .12, .13, -.01)], LIGHT)
    box("visor", (.26, .025, .065), (0, -.238, 1.23), LENS)
    box("id_flash", (.10, .025, .16), (-.18, -.428, .57), ORANGE)


def courser():
    """Lean forward cockpit, pinched waist and swept flight fairings."""
    hull("torso", [(0, .21, .18, .02), (.53, .34, .29, .04), (.93, .30, .26, .13)], DARK)
    hull("breastplate", [(.17, .19, .07, -.18), (.64, .29, .13, -.23), (.84, .20, .10, -.16)], LIGHT)
    hull("cockpit", [(.75, .17, .22, -.16), (1.09, .19, .28, -.17), (1.21, .12, .19, -.12)], OLIVE)
    plate("visor", (.24, .025, .12), (0, -.447, 1.06), LENS, (-.14, 0, 0))
    for side in [-1, 1]:
        plate(f"swept_fairing_{side}", (.20, .65, .18), (side * .47, .11, .88), MID, (.30, side * -.24, 0))
        cylinder(f"flight_intake_{side}", .08, .09, .41, 8, (side * .27, .34, .48), DARK)
        box(f"stripe_{side}", (.045, .025, .20), (side * .20, -.343, .55), ORANGE)


def bulwark():
    """Rounded siege carapace and a low recessed viewport, without a humanoid head."""
    sphere("torso", 1, (0, .03, .62), MID, segments=12, rings=8, scale=(.68, .48, .68))
    sphere("breastplate", 1, (0, -.24, .52), LIGHT, segments=8, rings=6, scale=(.55, .34, .45))
    plate("cockpit", (.45, .12, .19), (0, -.385, 1.04), DARK)
    box("visor", (.34, .025, .07), (0, -.457, 1.04), LENS)
    for side in [-1, 1]:
        sphere(f"pauldron_{side}", 1, (side * .61, .01, .91), OLIVE,
               segments=8, rings=6, scale=(.26, .36, .25))
        plate(f"lower_skirt_{side}", (.25, .12, .31), (side * .30, -.38, .19), OLIVE, (0, side * .2, 0))
    box("id_flash", (.14, .025, .08), (-.21, -.56, .67), ORANGE)


def atlas():
    """Broad industrial yoke around a low central cab and twin rear power drums."""
    hull("torso", [(0, .30, .25, .03), (.55, .49, .34, .03), (.94, .51, .30, .06)], DARK)
    hull("breastplate", [(.16, .26, .08, -.27), (.56, .44, .10, -.33), (.78, .37, .07, -.32)], OLIVE)
    for side in [-1, 1]:
        plate(f"yoke_{side}", (.36, .69, .42), (side * .60, .04, 1.05), LIGHT, (0, side * -.12, 0))
        cylinder(f"reactor_{side}", .20, .20, .68, 8, (side * .29, .43, .59), MID)
        cylinder(f"reactor_cap_{side}", .14, .14, .06, 8, (side * .29, .43, .94), ORANGE)
        box(f"pad_vent_{side}", (.20, .025, .13), (side * .60, -.316, 1.06), DARK)
    hull("cockpit", [(.84, .24, .24, -.12), (1.13, .24, .22, -.13), (1.22, .17, .16, -.10)], MID)
    box("visor", (.31, .025, .09), (0, -.365, 1.08), LENS)
    box("id_flash", (.20, .025, .11), (0, -.44, .50), ORANGE)


def surveyor():
    """Narrow sensor spindle with a monocular turret and an asymmetric scanner mast."""
    hull("torso", [(0, .21, .22, 0), (.65, .30, .26, .02), (.91, .23, .21, .04)], OLIVE)
    plate("breastplate", (.30, .10, .41), (0, -.265, .48), LIGHT, (-.13, 0, 0))
    cylinder("cockpit", .22, .25, .30, 8, (0, -.04, 1.06), MID)
    cylinder("optic_housing", .13, .13, .17, 8, (0, -.27, 1.07), DARK, (math.pi / 2, 0, 0))
    cylinder("optic_lens", .095, .095, .02, 8, (0, -.365, 1.07), LENS, (math.pi / 2, 0, 0))
    plate("scanner_mast", (.09, .10, .59), (-.40, .11, 1.12), DARK)
    plate("scanner", (.38, .20, .21), (-.40, .11, 1.44), LIGHT, (0, -.15, 0))
    box("scanner_lens", (.26, .025, .065), (-.40, -.005, 1.44), LENS)
    box("antenna", (.025, .025, .30), (-.54, .14, 1.62), DARK)
    for side in [-1, 1]:
        plate(f"shoulder_cap_{side}", (.21, .36, .15), (side * .44, 0, .86), MID)
    box("id_flash", (.07, .025, .16), (.17, -.258, .55), ORANGE)


def crucible():
    """Exposed cylindrical heat core within a cooling cage and wide finned radiators."""
    cylinder("torso", .30, .35, .92, 10, (0, .02, .50), DARK)
    cylinder("heat_core", .22, .22, .66, 10, (0, -.12, .51), ORANGE)
    for z in [.20, .43, .66, .84]:
        cylinder(f"core_band_{z}", .32, .32, .07, 10, (0, -.02, z), LIGHT)
    for side in [-1, 1]:
        plate(f"radiator_bank_{side}", (.24, .55, .78), (side * .52, .06, .49), DARK)
        for fin in range(5):
            plate(f"radiator_fin_{side}_{fin}", (.36, .60, .045), (side * .52, .06, .19 + fin * .15), MID)
        cylinder(f"coolant_pipe_{side}", .045, .045, .86, 6, (side * .32, -.25, .55), OLIVE)
        plate(f"pauldron_{side}", (.25, .48, .16), (side * .64, .03, .97), LIGHT)
    hull("cockpit", [(.91, .18, .19, -.02), (1.15, .24, .20, -.03), (1.27, .15, .14, 0)], OLIVE)
    box("visor", (.27, .025, .07), (0, -.243, 1.14), LENS)


def build_chassis(variant):
    """Build one complete torso and its matching supported attachment sockets."""
    {"vanguard": vanguard, "courser": courser, "bulwark": bulwark,
     "atlas": atlas, "surveyor": surveyor, "crucible": crucible}[variant]()
    fittings(variant)
