"""Repeatable installation wall modules and furnishings, on the ordinary city grid.

One module is one destructible wall edge, never an entire building. Door openings
keep the standard 0.6 by 1.2 clearance. Details are symmetric on both faces so
interior partitions and all four facade orientations use the same pieces.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import PALETTE, box, cylinder, material, socket
from city_kit_parts import Material, wall_bands, wall_panel, window_opening, door_opening

PALETTE.update({
    "env-bank-stone": "#D6CEB9",
    "env-bank-marble": "#ECE6D6",
    "env-bank-bronze": "#96815A",
    "env-armour-panel": "#505D60",
    "env-armour-frame": "#303C42",
    "env-safety-yellow": "#C9AA56",
    "env-sensor-white": "#CED8D5",
    "env-sensor-blue": "#436D86",
    "env-process-green": "#658174",
    "env-process-cream": "#C9CBB7",
})

FAMILIES = {
    "bank": Material("env-bank-stone", "env-bank-marble", "env-bank-bronze", 0),
    "battery": Material("env-armour-panel", "env-armour-frame", "env-metal", 0),
    "sensor": Material("env-sensor-white", "env-sensor-blue", "env-metal", 0),
    "dispersal": Material("env-process-green", "env-process-cream", "env-metal", 0),
}


def strip(name, width, depth, height, x, z, token):
    """Mirror a shallow relief on both wall faces; keep corners inside the module."""
    for face in (-1, 1):
        box(name, (width, depth, height), (x, face * (.05 + depth / 2), z), token)


def bank_detail(kind):
    """Moulded stone courses, bronze reveals and engaged classical pilasters."""
    if kind != "door":
        for z in (.23, 1.31):
            strip("stone_course", 1, .035, .05, 0, z, "env-bank-marble")
    for x in (-.44, .44):
        strip("pilaster", .10, .075, 1.08, x, .75, "env-bank-marble")
        for z in (.22, 1.31):
            strip("capital", .12, .095, .09, x, z, "env-bank-marble")
    if kind == "solid":
        strip("recessed_stone_panel", .58, .012, .77, 0, .77, "env-bank-marble")
        for z in (.36, 1.18):
            strip("bronze_reveal", .60, .015, .025, 0, z, "env-bank-bronze")


def battery_detail(kind):
    """Heavy steel frames, raised armour plates and readable bolted corners."""
    for x in (-.44, .44):
        strip("steel_rib", .11, .08, 1.3, x, .75, "env-armour-frame")
        for z in (.31, 1.19):
            strip("bolt", .045, .095, .045, x, z, "env-metal")
    if kind == "solid":
        for z in (.48, 1.02):
            strip("armour_plate", .73, .045, .48, 0, z, "env-armour-panel")
        strip("plate_seam", .75, .05, .035, 0, .75, "env-armour-frame")
    else:
        strip("warning_header", .65, .05, .065, 0, 1.32, "env-safety-yellow")


def sensor_detail(kind):
    """Clean insulated panels, blue service bands and louvred electronics vents."""
    for x in (-.47, .47):
        strip("panel_joint", .035, .015, 1.2, x, .77, "env-metal")
    if kind != "door":
        strip("blue_service_band", .93, .02, .13, 0, .32, "env-sensor-blue")
    if kind == "solid":
        strip("vent_inset", .58, .02, .36, 0, .96, "env-sensor-blue")
        for z in (.84, .94, 1.04):
            strip("vent_blade", .51, .045, .045, 0, z, "env-sensor-white")


def dispersal_detail(kind):
    """Ribbed green panels with exposed horizontal process pipes above the openings."""
    for x in (-.45, .45):
        strip("cladding_rib", .06, .035, 1.16, x, .75, "env-process-cream")
    for face in (-1, 1):
        pipe = cylinder("process_pipe", .045, .045, 1, 8, (0, face * .12, 1.28), "env-metal")
        pipe.rotation_euler[1] = math.pi / 2
        for x in (-.32, .32):
            collar = cylinder("pipe_collar", .06, .06, .055, 8, (x, face * .12, 1.28), "env-process-cream")
            collar.rotation_euler[1] = math.pi / 2
    if kind == "solid":
        for x in (-.23, 0, .23):
            strip("pressed_rib", .045, .025, .84, x, .70, "env-process-green")
    if kind == "door":
        for x in (-.37, .37):
            strip("door_guard", .085, .05, .29, x, .32, "env-safety-yellow")


def wall(family, kind):
    """Build a standard solid, window or open-door edge in the selected kit."""
    palette = FAMILIES[family]
    if kind == "door":
        box("cornice", (1, .14, .1), (0, 0, 1.45), palette.band)
        door_opening(material=palette)
        socket("door", (0, 0, 0))
    else:
        wall_bands(palette)
        if kind == "window":
            window_opening(material=palette)
        else:
            wall_panel("wall_core", 1, .16, 1.4, material=palette)
    {"bank": bank_detail, "battery": battery_detail,
     "sensor": sensor_detail, "dispersal": dispersal_detail}[family](kind)


def pillar():
    """Freestanding marble column on a square plinth, one occupied cover tile."""
    for z, width, height in ((.075, .61, .15), (.20, .49, .10), (1.30, .49, .10), (1.40, .61, .10)):
        box("column_plinth" if z < .3 else "column_capital", (width, width, height), (0, 0, z), "env-bank-marble")
    cylinder("tapered_shaft", .17, .21, 1.0, 12, (0, 0, .75), "env-bank-stone")
    for z in (.28, 1.22):
        cylinder("bronze_collar", .225, .225, .05, 12, (0, 0, z), "env-bank-bronze")


def barrier():
    """Low blast barrier: concrete footing, armoured face and exposed steel braces."""
    box("foundation", (.98, .64, .16), (0, 0, .08), "env-concrete")
    box("blast_core", (.94, .32, .44), (0, 0, .38), "env-armour-frame")
    for face in (-1, 1):
        box("armour_face", (.80, .055, .34), (0, face * .18, .38), "env-armour-panel")
        for x in (-.39, .39):
            box("brace", (.10, .08, .52), (x, face * .20, .34), "env-metal")
        box("identification_strip", (.36, .015, .07), (0, face * .215, .45), "env-safety-yellow")
    box("top_cap", (.98, .44, .06), (0, 0, .63), "env-metal")


def build(family="bank", kind="solid"):
    """Emit one replaceable city-grid part, preserving normal collision ownership."""
    if kind == "pillar":
        pillar()
    elif kind == "barrier":
        barrier()
    else:
        wall(family, kind)
    for token in ("env-bank-marble", "env-bank-bronze", "env-armour-panel"):
        shader = material(token).node_tree.nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = .34 if token == "env-bank-marble" else .6
