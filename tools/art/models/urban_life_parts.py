"""Roof and facade silhouettes for inhabited neighbourhoods (#1110).

Roof props pivot at their base centre. Facades run along X, face Blender -Y,
and start at their wall-mount height without covering a doorway or window.
"""

import math

from bpy_kit import box, cylinder
from frontage_parts import finish


def chimney() -> None:
    """Brick chimney with lead flashing, masonry cap and two capped clay pots."""
    box("flashing", (.44, .44, .055), (0, 0, .0275), "env-metal")
    box("brick-stack", (.32, .30, .63), (0, 0, .34), "env-brick")
    for z in (.20, .41, .61):
        box("masonry-course", (.33, .31, .025), (0, 0, z), "env-rust")
    box("stone-cap", (.40, .37, .07), (0, 0, .69), "env-concrete")
    for x in (-.10, .10):
        cylinder("clay-pot", .065, .07, .17, 8, (x, 0, .795), "env-rust")
        cylinder("dark-flue", .052, .052, .012, 8, (x, 0, .884), "env-asphalt")


def wall_ac() -> None:
    """Exterior compressor with a readable circular grille and lower supports."""
    for x in (-.25, .25):
        box("wall-bracket", (.06, .31, .06), (x, -.155, .03), "env-metal")
    box("compressor-case", (.70, .27, .35), (0, -.15, .245), "env-awning-cream")
    cylinder("fan-recess", .13, .13, .015, 12, (-.11, -.292, .245), "env-asphalt", (math.pi / 2, 0, 0))
    cylinder("fan-hub", .035, .035, .022, 8, (-.11, -.306, .245), "env-metal", (math.pi / 2, 0, 0))
    for z in (.18, .245, .31):
        box("vent-slot", (.14, .012, .026), (.21, -.29, z), "env-metal")
    finish()


def shutters() -> None:
    """Open shutters flank a clear .62u window aperture; no fake glazing."""
    for x in (-.405, .405):
        box("shutter-panel", (.19, .075, .60), (x, -.04, .30), "env-awning-green")
        for z in (.13, .29, .45):
            box("shutter-louvre", (.16, .035, .035), (x, -.09, z), "env-awning-cream")
    box("stone-sill", (1, .15, .07), (0, -.06, .035), "env-sidewalk")
    finish()


def warehouse_entry() -> None:
    """Wide corrugated loading canopy; all supports stay above the doorway."""
    box("canopy", (2.4, .66, .07), (0, -.33, .16), "env-metal")
    for x in (-1.05, -.75, -.45, -.15, .15, .45, .75, 1.05):
        box("roof-rib", (.04, .64, .045), (x, -.33, .2175), "env-sidewalk")
    box("front-fascia", (2.4, .06, .15), (0, -.63, .105), "env-rust")
    for x in (-.95, .95):
        box("brace", (.065, .53, .065), (x, -.275, .065), "env-metal", (.08, 0, 0))
    box("service-light", (.65, .09, .04), (0, -.47, .02), "env-awning-cream")
    finish()


def shop_sign_awning() -> None:
    """Terracotta shop canopy with broad cream fascia and simple stock symbols."""
    box("shade", (3, .64, .06), (0, -.32, .13), "env-brick", (.10, 0, 0))
    box("sign-board", (3, .055, .21), (0, -.61, .13), "env-awning-cream")
    for x in (-1.25, 1.25):
        box("sign-edge", (.07, .025, .18), (x, -.65, .13), "env-brick")
    for x in (-.45, 0, .45):
        box("stock-symbol", (.24, .026, .12), (x, -.653, .13), "env-awning-green")
    box("wall-rail", (3, .07, .07), (0, -.035, .245), "env-metal")
    finish()


def rooftop_hvac() -> None:
    """One-tile twin-fan packaged air handler with grounded roof rails."""
    for x in (-.33, .33):
        box("support-rail", (.11, .87, .12), (x, 0, .06), "env-metal")
    box("equipment-body", (.86, .80, .65), (0, 0, .425), "env-sidewalk")
    box("top-panel", (.90, .84, .05), (0, 0, .775), "env-metal")
    for y in (-.22, .22):
        cylinder("fan-well", .165, .165, .02, 12, (0, y, .81), "env-asphalt")
        cylinder("fan-hub", .045, .045, .018, 8, (0, y, .829), "env-metal")
        for angle in (0, math.pi / 2):
            box("fan-blade", (.25, .035, .012), (0, y, .828), "env-metal", (0, 0, angle))
    for z in (.28, .42, .56):
        box("intake-louvre", (.61, .02, .052), (0, -.411, z), "env-roof")


def rooftop_water_tank() -> None:
    """Banded cylindrical water tank on a short plinth, with a fill cap and pipe."""
    box("plinth", (.90, .90, .12), (0, 0, .06), "env-concrete")
    cylinder("tank", .37, .37, 1.01, 12, (0, 0, .625), "env-awning-cream")
    for z in (.25, .75, 1.10):
        cylinder("tank-band", .39, .39, .045, 12, (0, 0, z), "env-metal")
    cylinder("lid", .30, .38, .07, 12, (0, 0, 1.165), "env-metal")
    cylinder("fill-cap", .085, .085, .05, 8, (0, 0, 1.225), "env-roof")
    cylinder("outlet", .03, .03, .41, 8, (.40, 0, .325), "env-metal")


def manhole() -> None:
    """Flush round inspection cover with a wide rim and recessed-looking ribs."""
    cylinder("rim", .28, .28, .012, 12, (0, 0, .006), "env-metal")
    cylinder("cover", .23, .23, .014, 12, (0, 0, .012), "env-roof")
    for y in (-.12, 0, .12):
        box("cast-rib", (.32, .025, .005), (0, y, .0215), "env-metal")


def curb_drain() -> None:
    """Flush slotted storm drain; long edge follows the curb."""
    box("drain-frame", (.26, .62, .012), (0, 0, .006), "env-metal")
    box("dark-slots", (.20, .55, .009), (0, 0, .0165), "env-asphalt")
    for y in (-.22, -.11, 0, .11, .22):
        box("grate-bar", (.24, .035, .005), (0, y, .0225), "env-metal")
