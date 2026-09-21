"""Separate equipment modules for ordinary enterable installation buildings.

Radar and cannon reuse the previous art's mechanical pieces, with every sealed
building mass removed. The pump is an interior machine. Shells, doors, floors
and roofs always come from the game's modular building kit.
"""
import importlib.util
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from bpy_kit import PALETTE, box, cylinder, join, mesh_objects

PALETTE.update({"env-awning-green": "#56735F"})


def machinery(kind):
    """Keep only mechanical parts from the original reproducible facility source."""
    spec = importlib.util.spec_from_file_location("facilities", Path(__file__).with_name("installation-facilities.py"))
    source = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(source)
    if kind == "radar":
        source.sensor()
        keep = ("bearing_plinth", "dish_support", "elevation_axle", "reflector", "feed_strut", "receiver")
    else:
        source.battery()
        keep = ("turret_", "barrel", "muzzle_", "bore", "gun_stripe", "rangefinder")
    for ob in list(mesh_objects()):
        if not ob.name.startswith(keep):
            bpy.data.objects.remove(ob, do_unlink=True)


def fit_module(kind, width, depth):
    """Centre a joined machine and place its base on the support plane at uniform scale."""
    ob = join(mesh_objects(), "installation_" + kind)
    points = [ob.matrix_world @ vertex.co for vertex in ob.data.vertices]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    scale = min((width - .12) / (high.x - low.x), (depth - .12) / (high.y - low.y))
    centre = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    for vertex, point in zip(ob.data.vertices, points):
        vertex.co = (point - centre) * scale
    ob.matrix_world = Matrix.Identity(4)
    ob.data.update()
    bpy.context.view_layer.update()


def pump():
    """One industrial pump skid, small enough to furnish a normal interior tile."""
    box("skid", (.86, .86, .12), (0, 0, .06), "tdf-grey-dark")
    cylinder("pressure_vessel", .24, .29, .75, 10, (0, .13, .51), "env-awning-green")
    cylinder("cap", .25, .25, .12, 10, (0, .13, .94), "env-metal")
    box("motor", (.46, .32, .32), (0, -.27, .30), "tdf-grey-mid")
    box("control_face", (.31, .04, .16), (0, -.44, .38), "tdf-orange")
    cylinder("feed", .08, .08, .64, 8, (.32, 0, .55), "env-metal")


def build(kind="radar"):
    """Build a roof machine or interior pump; no building shell is emitted."""
    if kind == "pump":
        pump()
        join(mesh_objects(), "installation_pump")
    else:
        machinery(kind)
        fit_module(kind, 5 if kind == "radar" else 4, 5)
