"""TDF cargo VTOL (#911): 5 x 7 u including the lowered boarding ramp.

Blender +Z is up and -Y is the nose. Exported glTF uses +Y up / +Z nose.
The three feet and rear ramp touch z=0; sockets preserve those contact points.
MapGen reserves the complete envelope separately from the 16 boarding columns.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cylinder, join, material, mesh_objects, socket  # noqa: E402

FOOTPRINT = (5, 7)

# ===========================================
# Closed hull sections
# ===========================================


def mesh(name, vertices, faces, token):
    """Build a closed flat-shaded part, with outward normals and atlas-ready UVs."""
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    data.materials.append(material(token))
    return ob


def section(half_width, bottom, top, chamfer):
    """Eight-point cross section with broad faces and deliberate corner bevels."""
    w, b, t, c = half_width, bottom, top, chamfer
    return [(-w+c, b), (w-c, b), (w, b+c), (w, t-c),
            (w-c, t), (-w+c, t), (-w, t-c), (-w, b+c)]


def loft(name, rings, token):
    """Cap and connect octagonal stations along the aircraft's longitudinal axis."""
    vertices = [(x, y, z) for y, profile in rings for x, z in profile]
    faces = [tuple(range(7, -1, -1)), tuple(range(len(vertices)-8, len(vertices)))]
    for j in range(len(rings)-1):
        for i in range(8):
            n = (i+1) % 8
            faces.append((j*8+i, j*8+n, (j+1)*8+n, (j+1)*8+i))
    return mesh(name, vertices, faces, token)


def cargo_shell():
    """A real open-backed cargo tube; every wall is closed, with no black decal door."""
    outer = section(1.28, 0.64, 3.15, 0.24)
    inner = section(1.06, 0.80, 2.94, 0.18)
    vertices = [(x, y, z) for profile in (outer, inner)
                for y in (-1.36, 1.86) for x, z in profile]
    faces = []
    for i in range(8):
        n = (i+1) % 8
        faces.extend([(i, n, 8+n, 8+i), (16+i, 24+i, 24+n, 16+n),
                      (i, 16+i, 16+n, n), (8+i, 8+n, 24+n, 24+i)])
    return mesh("cargo_shell", vertices, faces, "tdf-grey-mid")


def prism_x(name, profile_yz, x0, x1, token):
    """Extrude a longitudinal outline into a closed ramp, fin or reinforcement."""
    n = len(profile_yz)
    vertices = [(x, y, z) for x in (x0, x1) for y, z in profile_yz]
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, 2*n))]
    faces.extend((i, (i+1) % n, n+(i+1) % n, n+i) for i in range(n))
    return mesh(name, vertices, faces, token)


def strut(name, start, end, radius, token):
    """Place one six-sided load-bearing cylinder between two visible joints."""
    a, b = Vector(start), Vector(end)
    d = b-a
    ob = cylinder(name, radius, radius, d.length, 6, tuple((a+b)/2), token)
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return ob


# ===========================================
# Aircraft parts
# ===========================================


def build_nose():
    """Short armoured nose and a raised split cockpit distinguish the forward end."""
    loft("nose", [(-3.5, section(0.30, 1.12, 1.48, 0.08)),
                  (-2.64, section(0.82, 0.82, 2.12, 0.18)),
                  (-1.34, section(1.28, 0.64, 3.15, 0.24))], "tdf-grey-mid")
    bevel(box("cockpit_frame", (1.54, 1.08, 0.27), (0, -2.18, 2.31),
              "tdf-grey-dark", rot=(0.59, 0, 0)), 0.08)
    for sign in (-1, 1):
        bevel(box(f"windscreen_{sign}", (0.61, 0.83, 0.045),
                  (sign*0.365, -2.26, 2.45), "tdf-visor", rot=(0.59, 0, 0)), 0.012)
        bevel(box(f"cheek_{sign}", (0.15, 0.92, 0.34),
                  (sign*0.85, -2.14, 1.47), "tdf-olive"), 0.055)
        box(f"nose_id_{sign}", (0.075, 0.42, 0.17),
            (sign*0.94, -1.95, 1.97), "tdf-orange")


def build_nacelle(sign):
    """Short shoulder and a vertical ducted lift fan, not a long aeroplane wing."""
    x = sign*1.98
    bevel(box(f"wing_root_{sign}", (0.80, 1.25, 0.22),
              (sign*1.42, -0.12, 2.03), "tdf-grey-light"), 0.055)
    rings = [(-1.18, section(0.28, 1.60, 2.35, 0.12)),
             (-0.68, section(0.51, 1.35, 2.66, 0.13)),
             (0.86, section(0.51, 1.35, 2.66, 0.13)),
             (1.23, section(0.34, 1.50, 2.45, 0.12))]
    ob = loft(f"lift_nacelle_{sign}", rings, "tdf-olive")
    ob.location.x = x
    cylinder(f"fan_rim_{sign}", 0.47, 0.47, 0.10, 12,
             (x, 0.08, 2.70), "tdf-grey-light")
    cylinder(f"fan_well_{sign}", 0.40, 0.40, 0.015, 12,
             (x, 0.08, 2.758), "tdf-grey-dark")
    for blade in range(6):
        angle = blade*math.tau/6
        box(f"fan_blade_{sign}_{blade}", (0.26, 0.07, 0.012),
            (x+math.cos(angle)*0.20, 0.08+math.sin(angle)*0.20, 2.772),
            "tdf-grey-mid", rot=(0, 0, angle+0.18))
    cylinder(f"fan_hub_{sign}", 0.095, 0.12, 0.055, 8,
             (x, 0.08, 2.80), "tdf-grey-light")
    cylinder(f"downward_nozzle_{sign}", 0.31, 0.37, 0.24, 8,
             (x, 0.08, 1.25), "tdf-grey-dark")
    box(f"engine_id_{sign}", (0.10, 0.62, 0.09),
        (x+sign*0.33, 0.12, 2.68), "tdf-orange")
    for vent in range(3):
        box(f"engine_vent_{sign}_{vent}", (0.012, 0.12, 0.38),
            (x+sign*0.51, -0.23+vent*0.22, 1.95), "tdf-grey-dark")


def build_gear():
    """Three planted pads and explicit ground-contact sockets for the site validator."""
    feet = [("nose", 0, -2.33, 0.50, 0.70, (0, -1.92, 1.05)),
            ("port", -1.35, 1.19, 0.60, 0.72, (-1.08, 0.87, 1.07)),
            ("starboard", 1.35, 1.19, 0.60, 0.72, (1.08, 0.87, 1.07))]
    for name, x, y, width, depth, mount in feet:
        bevel(box(f"foot_{name}", (width, depth, 0.16), (x, y, 0.08),
                  "tdf-grey-dark"), 0.035)
        strut(f"leg_{name}", (x, y, 0.16), mount, 0.105, "tdf-grey-light")
        strut(f"leg_brace_{name}", (x, y, 0.24),
              (mount[0], mount[1]+0.42, mount[2]-0.12), 0.065, "tdf-grey-dark")
        bevel(box(f"gear_fairing_{name}", (width*0.67, 0.35, 0.43),
                  (x, y, 0.48), "tdf-grey-mid"), 0.05)
        socket(f"contact_{name}", (x, y, 0))


def build_ramp():
    """A lowered load-bearing rear ramp reaches the envelope edge without sinking below it."""
    prism_x("boarding_ramp", [(1.82, 0.65), (1.82, 0.80), (3.5, 0.08), (3.5, 0)],
            -1.05, 1.05, "tdf-grey-dark")
    angle = -math.atan2(0.72, 1.68)
    for i in range(6):
        y = 2.00+i*0.245
        z = 0.80-(y-1.82)*0.72/1.68
        box(f"ramp_tread_{i}", (1.82, 0.065, 0.018), (0, y, z+0.015),
            "tdf-grey-light", rot=(angle, 0, 0))
    for sign in (-1, 1):
        box(f"ramp_edge_{sign}", (0.07, 1.53, 0.035),
            (sign*0.96, 2.61, 0.478), "tdf-orange-dim", rot=(angle, 0, 0))
        socket("ramp_left" if sign < 0 else "ramp_right", (sign*1.05, 3.5, 0))
        strut(f"ramp_actuator_{sign}", (sign*1.12, 1.75, 1.37),
              (sign*1.04, 2.48, 0.50), 0.045, "tdf-grey-light")


def build():
    """Build one squad/mech transport; all geometry stays inside the agreed reservation."""
    cargo_shell()
    build_nose()
    for sign in (-1, 1):
        build_nacelle(sign)
        bevel(box(f"cargo_side_plate_{sign}", (0.07, 2.32, 0.76),
                  (sign*1.29, 0.18, 1.84), "tdf-olive"), 0.018)
        box(f"cargo_identifier_{sign}", (0.024, 0.46, 0.22),
            (sign*1.338, 0.89, 2.11), "tdf-orange")
        box(f"folded_bench_{sign}", (0.15, 1.95, 0.16),
            (sign*0.89, 0.35, 1.20), "tdf-olive-dark")
        prism_x(f"tail_fin_{sign}", [(0.81, 3.06), (1.33, 3.54),
                                      (1.72, 3.54), (2.21, 3.06)],
                sign*1.02-0.055, sign*1.02+0.055, "tdf-grey-light")
    bevel(box("cargo_roof_panel", (1.68, 2.68, 0.065),
              (0, 0.13, 3.18), "tdf-grey-light"), 0.025)
    box("roof_identification", (0.17, 1.32, 0.025), (0, -0.17, 3.228), "tdf-orange")
    # Cargo-bay ribs carry the opening's scale without interior clutter.
    for y in (-0.90, 0.15, 1.20):
        for x in (-1.04, 1.04):
            box(f"bay_rib_{x}_{y}", (0.075, 0.08, 1.92),
                (x, y, 1.84), "tdf-grey-dark")
    build_gear()
    build_ramp()
    # This is static scenery: bake bevels, then emit one primitive per palette
    # material instead of a draw node for every bolt, tread and landing strut.
    parts = mesh_objects()
    for ob in parts:
        bpy.context.view_layer.objects.active = ob
        for modifier in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    hull = bpy.data.objects["cargo_shell"]
    join([hull] + [ob for ob in parts if ob != hull], "tdf_dropship")
