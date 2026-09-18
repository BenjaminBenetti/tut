"""Infestation kit: resin ground, breached nests and municipal objects overtaken by chitin.

Build with make_model.py --build-arg kind=<ground|nest|car|compact|lamp|solid|window|door|half>.
Brown shell and tan ridges belong to the bug family; green is confined to small resin seams.
"""

import importlib.util
import math
import os
import sys
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
from bpy_kit import box, cylinder, sphere, material  # noqa: E402


def shell(name, at, size):
    """A broad six-sided chitin blister with a pale dorsal ridge."""
    sphere(name, 1, at, "bug-chitin-dark", segments=6, rings=3, scale=size)
    box(name + "_ridge", (size[0] * 1.25, 0.045, 0.045),
        (at[0], at[1], at[2] + size[2] * 0.8), "bug-chitin-tan")


def ground():
    """A thin repeatable resin slab, with raised angular veins and no obstructing geometry."""
    box("resin", (1, 1, 0.05), (0, 0, 0.025), "bug-flesh")
    outlines = [
        [(-0.5, -0.1), (-0.2, -0.2), (0.5, 0.34), (0.5, 0.39), (-0.22, -0.1), (-0.5, -0.04)],
        [(-0.12, -0.5), (-0.01, -0.13), (0.16, 0.5), (0.22, 0.5), (0.07, -0.15), (-0.07, -0.5)],
    ]
    for i, points in enumerate(outlines):
        vertices = [(x, y, z) for z in (0.045, 0.064 + i * 0.008) for x, y in points]
        faces = [tuple(reversed(range(6))), tuple(range(6, 12))]
        faces += [(j, (j + 1) % 6, (j + 1) % 6 + 6, j + 6) for j in range(6)]
        mesh = bpy.data.meshes.new(f"branch_{i}")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        ob = bpy.data.objects.new(f"resin_branch_{i}", mesh)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(material("bug-chitin-tan" if i == 0 else "bug-bio-green-dim"))


def tendril(name, start, end, radius=0.025):
    """A closed tapered resin strand, aligned between two surface attachment points."""
    delta = Vector(end) - Vector(start)
    ob = cylinder(name, radius * 0.55, radius, delta.length, 5,
                  tuple((Vector(start) + Vector(end)) / 2), "bug-flesh")
    ob.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()


def nest():
    """A dark bug hole encircled by asymmetric craggy, leaning shell spikes."""
    cylinder("burrow_shadow", 0.3, 0.36, 0.07, 10, (0, 0, 0.035), "bug-chitin-black")
    for i, height in enumerate([0.82, 1.25, 0.9, 0.65, 1.02, 0.5]):
        angle = i * math.tau / 6
        x, y = math.cos(angle) * 0.29, math.sin(angle) * 0.29
        cylinder(f"crag_{i}", 0.018, 0.15, height, 5, (x, y, height / 2 + 0.02),
                 "bug-chitin-dark" if i % 2 else "bug-chitin-mid")
        crag = bpy.context.object
        for vertex in crag.data.vertices:
            if vertex.co.z > 0:
                vertex.co.x += math.cos(angle) * 0.085
                vertex.co.y += math.sin(angle) * 0.085
        cylinder(f"tip_{i}", 0, 0.065, height * 0.24, 5,
                 (x + 0.025, y, height * 0.89), "bug-chitin-tan")
    cylinder("resin_in_hole", 0.15, 0.16, 0.018, 8, (0, 0, 0.08), "bug-bio-green-dim")


def car(compact=False):
    """A rusted car enveloped by shell growth, retaining the original collision envelope."""
    length = 0.9 if compact else 1.8
    box("rusted_body", (length, 0.56, 0.28), (0, 0, 0.31), "env-rust")
    box("cabin", (length * 0.52, 0.44, 0.31), (-length * 0.06, 0, 0.57), "env-glass")
    for x in [-length * 0.32, length * 0.32]:
        for y in [-0.28, 0.28]:
            cylinder("wheel", 0.13, 0.13, 0.07, 6, (x, y, 0.13), "env-asphalt", rot=(math.pi / 2, 0, 0))
    shell("roof_growth", (-length * 0.13, 0, 0.71), (length * 0.3, 0.25, 0.15))
    shell("bonnet_growth", (length * 0.32, 0, 0.45), (length * 0.16, 0.26, 0.13))
    box("resin_seam", (length * 0.8, 0.045, 0.035), (0, -0.3, 0.36), "bug-bio-green-dim")
    for side in [-1, 1]:
        tendril(f"windshield_root_{side}", (-length * 0.14, side * 0.1, 0.78),
                (length * 0.12, side * 0.31, 0.28), 0.06)


def lamp():
    """A recognisable lamp with a shell-wrapped column and dark, consumed head."""
    box("plinth", (0.2, 0.2, 0.1), (0, 0, 0.05), "env-concrete")
    cylinder("pole", 0.055, 0.075, 2.5, 6, (0, 0, 1.3), "env-rust")
    box("arm", (0.4, 0.07, 0.08), (0.18, 0, 2.5), "env-metal")
    box("dead_head", (0.28, 0.18, 0.12), (0.34, 0, 2.43), "bug-chitin-black")
    for i, height in enumerate([0.3, 0.95, 1.55, 2.24]):
        shell(f"growth_{i}", (0.035, 0, height), (0.13, 0.12, 0.22))
        if i < 3:
            tendril(f"root_{i}", (-0.045, 0.045, height), (0.075, -0.05, height + 0.58), 0.035)


def wall(kind):
    """Retains the authored opening and height while adding resin and shell plaques."""
    script = "building-wall" + ("" if kind == "solid" else "-" + kind)
    spec = importlib.util.spec_from_file_location("base_wall", os.path.join(HERE, script + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.build()
    height = 0.5 if kind == "half" else 1.5
    for side in [-1, 1]:
        for i, x in enumerate([-0.39, 0.38]):
            shell(f"plaque_{side}_{i}", (x, side * 0.09, height * (0.3 + i * 0.32)),
                  (0.11, 0.055, height * 0.22))
            start = (x, side * 0.11, height * (0.3 + i * 0.32))
            bend = (x + (0.06 if i == 0 else -0.06), side * 0.11, height * 0.17)
            tendril(f"root_{side}_{i}", start, bend, 0.035)
            tendril(f"foot_{side}_{i}", bend, (x - 0.025, side * 0.11, 0.035), 0.035)


def build(kind="nest"):
    """Builds one member of the coherent kit for export, validation and three-angle review."""
    if kind == "ground":
        ground()
    elif kind == "nest":
        nest()
    elif kind in ("car", "compact"):
        car(kind == "compact")
    elif kind == "lamp":
        lamp()
    else:
        wall(kind)
