"""Building-scale tactical installation kit. Run make_model.py with --build-arg kind=...

Sealed plant occupies its registered footprint; generators and circulation are
composed separately by mapgen/data/mission-sites.ts. Front faces Blender -Y.
Each complete facility stays within the 800-triangle building-module budget.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import PALETTE, box, cylinder, bevel, join, mesh_objects, material

PALETTE.update({"env-awning-green": "#56735F", "env-awning-cream": "#D8D0B8"})


# ===========================================
# Shared structural details
# ===========================================


def beam(name, start, end, width, token="env-metal"):
    """Closed rectangular member aligned between two attachment points."""
    delta = Vector(end) - Vector(start)
    ob = box(name, (width, width, delta.length), (Vector(start) + Vector(end)) / 2, token)
    ob.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return ob


def slab(w, d):
    """Concrete raft with a dark equipment curb, entirely inside the footprint."""
    box("foundation", (w - .08, d - .08, .24), (0, 0, .12), "env-concrete")
    box("base_course", (w - .3, d - .3, .25), (0, 0, .365), "tdf-grey-dark")


def door(x, y, z=1.15, width=1.4):
    """Recessed service door, header and high-contrast hazard jambs."""
    box("service_door", (width, .06, 1.6), (x, y, z), "tdf-grey-dark")
    box("door_split", (.05, .08, 1.5), (x, y - .025, z), "env-metal")
    for dx in (-width / 2 - .12, width / 2 + .12):
        box("hazard_jamb", (.16, .08, .7), (x + dx, y - .02, z - .3), "tdf-orange")


def louvres(x, y, z, width=1.4):
    """Dark ventilation recess with three broad metal fins."""
    box("vent_recess", (width, .08, .8), (x, y, z), "tdf-grey-dark")
    for dz in (-.24, 0, .24):
        box("vent_fin", (width - .1, .12, .07), (x, y - .04, z + dz), "env-metal")


def sensor():
    """Large concave radar reflector on a braced pedestal over a control bunker."""
    slab(10, 8)
    box("control_bunker", (9.4, 7.4, 2.4), (0, 0, 1.55), "tdf-grey-mid")
    box("roof_band", (9.6, 7.6, .22), (0, 0, 2.86), "tdf-grey-light")
    box("operations_glass", (5.8, .08, .48), (-.6, -3.73, 2.12), "env-glass")
    door(-2.6, -3.78)
    louvres(2.9, -3.77, 1.25)
    for x in (-4.5, 4.5):
        box("orange_corner", (.18, .12, 1.2), (x, -3.75, 1.45), "tdf-orange")
    cylinder("bearing_plinth", 1.4, 1.75, .55, 12, (0, .3, 3.25), "tdf-grey-dark")
    for x in (-1, 1):
        beam("dish_support", (x, .8, 3.4), (x * .45, .3, 4.6), .3, "tdf-grey-light")
    cylinder("elevation_axle", .34, .34, 2.4, 10, (0, .3, 4.45), "env-metal", rot=(0, math.pi/2, 0))
    # A closed radial section forms both the concave face and convex back.
    segments = 24
    rings = [(0.08, 0), (1.45, .22), (3.1, 1.02), (3.18, 1.02), (3.18, .85), (1.45, .02), (.08, -.18)]
    verts = [(r * math.cos(a * 2*math.pi/segments), r * math.sin(a * 2*math.pi/segments), h) for r,h in rings for a in range(segments)]
    faces = []
    for ring in range(len(rings)-1):
        for i in range(segments):
            j = (i+1) % segments
            faces.append((ring*segments+i, ring*segments+j, (ring+1)*segments+j, (ring+1)*segments+i))
    faces += [tuple(range(segments-1,-1,-1)), tuple((len(rings)-1)*segments+i for i in range(segments))]
    mesh = bpy.data.meshes.new("reflector_shell")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("reflector", mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material("tdf-grey-light"))
    ob.location = (0, .3, 4.55)
    ob.rotation_euler.x = .58
    bpy.context.view_layer.update()
    # Feed tripod follows the dish's local coordinates.
    def world(point):
        """Transform reflector-local attachments onto the tilted bowl."""
        return ob.matrix_world @ Vector(point)
    for angle in (30, 150, 270):
        a = math.radians(angle)
        beam("feed_strut", world((2.85*math.cos(a), 2.85*math.sin(a), .92)), world((0, 0, 2.0)), .09, "tdf-grey-dark")
    feed = cylinder("receiver", .18, .23, .45, 8, world((0, 0, 2)), "tdf-orange")
    feed.rotation_euler.x = .58
    for x in (-3.3, 3.3):
        box("roof_cabinet", (1.0, 1.7, .65), (x, 2.2, 3.3), "tdf-grey-dark")


def pump_house():
    """Industrial pump hall with exposed manifold and four extraction ducts."""
    slab(8, 6)
    box("pump_hall", (7.5, 5.5, 2.5), (0, 0, 1.65), "env-plaster-warm")
    box("roof", (7.75, 5.75, .3), (0, 0, 3.05), "tdf-grey-dark")
    door(0, -2.8)
    louvres(-2.5, -2.8, 1.55)
    louvres(2.5, -2.8, 1.55)
    for x in (-2.7, -.9, .9, 2.7):
        box("duct_housing", (1.15, 2.9, .6), (x, .3, 3.5), "env-metal")
        box("duct_top", (.85, 2.5, .12), (x, .3, 3.86), "tdf-grey-light")
    cylinder("manifold", .22, .22, 6.5, 8, (0, 2.5, 3.7), "tdf-orange", rot=(0, math.pi/2, 0))
    for x in (-2.7, 2.7):
        cylinder("riser", .22, .22, 2.7, 8, (x, 2.5, 2.3), "tdf-orange")


def tanks():
    """Pair of tall banded pheromone reservoirs inside a containment raft."""
    slab(4, 6)
    for y in (-1.4, 1.4):
        cylinder("tank_body", 1.22, 1.22, 4.0, 12, (0, y, 2.55), "env-awning-cream")
        cylinder("tank_cap", .35, 1.22, .65, 12, (0, y, 4.87), "env-metal")
        for z in (.72, 2.8, 4.43):
            cylinder("tank_band", 1.25, 1.25, .18, 12, (0, y, z), "env-awning-green")
        box("chemical_mark", (.8, .08, .8), (0, y - 1.23, 2), "tdf-orange")
    cylinder("feed_pipe", .16, .16, 4.8, 8, (1.58, 0, .8), "env-metal", rot=(math.pi/2, 0, 0))
    for y in (-1.4, 1.4):
        beam("tank_outlet", (1.05, y, .8), (1.58, y, .8), .3)


def spray_tower():
    """Wide-footed dispersal column with four directional nozzles and maintenance braces."""
    slab(3, 3)
    cylinder("pump_base", .82, 1.13, 1.25, 8, (0,0,1.05), "env-awning-green")
    cylinder("pressure_column", .33, .42, 3.6, 10, (0,0,3.35), "tdf-grey-light")
    for x in (-1,1):
        for y in (-1,1):
            beam("tower_brace", (x, y, .48), (x*.2, y*.2, 3.7), .13)
    cylinder("distributor", .65, .48, .55, 8, (0,0,5.25), "tdf-orange")
    for i in range(4):
        angle = i*math.pi/2
        end = (math.cos(angle)*1.18, math.sin(angle)*1.18, 5.22)
        beam("nozzle_arm", (math.cos(angle)*.4, math.sin(angle)*.4, 5.22), end, .28, "tdf-grey-dark")
        tip = cylinder("nozzle", .25, .34, .35, 8, end, "tdf-grey-light")
        tip.rotation_euler = Vector((math.cos(angle), math.sin(angle), -.18)).to_track_quat("Z", "Y").to_euler()


def battery():
    """Massive twin cannon, armoured magazine bunker and flanking blast cheeks."""
    slab(12, 10)
    bevel(box("magazine_bunker", (11.4, 9.4, 2.15), (0,0,1.5), "tdf-grey-mid"), .24)
    box("bunker_roof", (10.9, 8.9, .3), (0,0,2.68), "tdf-grey-dark")
    door(0, -4.72, width=2.0)
    for x in (-4.0, 4.0):
        louvres(x,-4.73,1.6,1.8)
        bevel(box("blast_cheek", (1.2,6.2,1.35), (x,.4,3.3), "tdf-grey-light"), .18)
    cylinder("turret_ring", 2.65, 2.9, .45, 12, (0,1.1,3.02), "env-metal")
    bevel(box("turret_armour", (4.7,3.7,1.7), (0,1.25,4.05), "tdf-grey-mid"), .28)
    box("turret_crown", (3.4,2.5,.22), (0,1.4,5.01), "tdf-grey-dark")
    for x in (-1.1, 1.1):
        cylinder("barrel_sleeve", .4,.48,2.5,8,(x,-.7,4.3),"tdf-grey-light",rot=(math.pi/2,0,0))
        cylinder("barrel", .23,.28,3.5,8,(x,-2.75,4.3),"tdf-grey-dark",rot=(math.pi/2,0,0))
        box("muzzle_brake", (.76,.7,.64), (x,-4.46,4.3), "env-metal")
        box("bore", (.4,.035,.28), (x,-4.825,4.3), "tdf-grey-dark")
        box("gun_stripe", (.45,.15,.18), (x,-4.8,4.58), "tdf-orange")
    box("rangefinder", (1.25,.28,.38), (0,-.67,4.7), "env-glass")


def bank():
    """Broad civic treasury: stone colonnade, copper hipped vault roof and rear loading door."""
    slab(12,10)
    box("vault_block", (11.2,8.8,3.5), (0,.25,2.15), "env-plaster-warm")
    box("lower_course", (11.5,9.1,.35), (0,.25,.72), "env-concrete")
    box("entablature", (11.6,9.3,.42), (0,.05,3.93), "env-awning-cream")
    box("security_band", (11.3,9.0,.18), (0,.2,3.52), "tdf-grey-dark")
    # Broad hipped silhouette assembled as a closed tapered prism.
    verts=[(-5.7,-4.55,4.14),(5.7,-4.55,4.14),(5.7,4.55,4.14),(-5.7,4.55,4.14),(-4,-2.8,5.45),(4,-2.8,5.45),(4,2.8,5.45),(-4,2.8,5.45)]
    faces=[(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
    mesh=bpy.data.meshes.new("hipped_roof");mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new("hipped_roof",mesh);bpy.context.collection.objects.link(ob);ob.data.materials.append(material("env-roof-green"))
    box("clerestory", (5.4,2.0,.65), (0,.5,5.55), "env-glass")
    box("clerestory_cap", (5.7,2.3,.18), (0,.5,5.95), "env-awning-cream")
    for x in (-4.5,-2.7,2.7,4.5):
        cylinder("stone_column", .28,.36,2.8,8,(x,-4.49,2.12),"env-awning-cream")
        box("column_cap", (.76,.68,.24), (x,-4.49,3.59), "env-concrete")
    box("entry_frame", (2.5,.12,2.55), (0,-4.22,2), "env-concrete")
    box("bronze_doors", (2.05,.12,2.25), (0,-4.3,1.92), "env-rust")
    for x in (-.15,.15):
        box("door_handle", (.08,.12,.7), (x,-4.4,1.8), "env-awning-cream")
    # Treasury medallion is a relief, readable without tiny text.
    cylinder("seal", .53,.53,.12,12,(0,-4.65,3.9),"env-rust",rot=(math.pi/2,0,0))
    box("seal_bar", (.13,.08,.67), (0,-4.73,3.9), "env-awning-cream")
    for x in (-5.64,5.64):
        for y in (-2.4,0,2.4):
            box("secure_window", (.07,1.35,1.1), (x,y,2.5), "env-glass")
            box("window_mullion", (.1,.08,1.13), (x,y,2.5), "env-metal")
    box("rear_loading_door", (3,.12,2.5), (0,4.71,1.85), "tdf-grey-dark")
    for x in (-4.7,4.7):
        box("vault_buttress", (.8,1.2,3.0), (x,3.8,1.95), "env-concrete")


# ===========================================
# Entry
# ===========================================


def build(kind="sensor"):
    """Build one reproducible facility variant and consolidate by material."""
    builders={"sensor":sensor,"pump-house":pump_house,"tanks":tanks,"spray-tower":spray_tower,"battery":battery,"bank":bank}
    builders[kind]()
    join(mesh_objects(), "installation_" + kind.replace("-", "_"))
