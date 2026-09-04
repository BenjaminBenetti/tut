"""Shared builders for the city props (issue #274, batches F and G).

Blender axes: X right, Y depth, Z up, front facing -Y so the glTF export puts
it on +Z. Sizes are in tiles (1 u = 2 m), so a 0.6 u crate is 1.2 m tall.

Cover props are read at 64 px per tile from four yaw stops, and what has to
survive that is the silhouette: a barrier's taper, a bin's sloped lid, a car's
cabin set back from its bonnet. Detail below about 0.04 u is invisible and
only costs triangles.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cylinder, sphere  # noqa: E402

# ===========================================
# Wheels and running gear
# ===========================================


def wheel(name: str, at: tuple[float, float, float], radius: float, width: float = 0.07) -> None:
    """One road wheel: a six-sided cylinder lying on its side along X.

    Six segments read as round at tile scale and cost 24 triangles; eight
    would put a four-wheeled car over the 300-triangle prop budget.

    @param name - Object name.
    @param at - Hub centre.
    @param radius - Wheel radius.
    @param width - Tyre width along X.
    """
    cylinder(name, radius, radius, width, 6, at, "env-asphalt", rot=(0, math.pi / 2, 0))


def car_body(
    length: float,
    width: float,
    wheel_radius: float,
    cabin_back: float,
    roof: float,
    boot: bool = False,
) -> None:
    """A generic low-poly car: sill, body, a narrower cabin with glass, bumpers, wheels.

    ```
                ┌──────┐              cabin  (86 % of body width, bevelled)
       ┌────────┴──────┴───────┐      body
       ●                     ●        wheels (proud of the body sides)
    ```

    The cabin is narrower than the body and the wheels stand proud of it, so
    from directly overhead the silhouette is a rounded rectangle with four
    dark corners rather than one flat box.

    @param length - Overall length along X.
    @param width - Overall width along Y.
    @param wheel_radius - Wheel radius; the body sits just above the hub.
    @param cabin_back - Cabin length along X.
    @param roof - Roof height.
    @param boot - Raise a boot deck behind the cabin (a saloon rather than a
        hatchback); without it a long car reads as a pickup with a flat bed.
    """
    # The body starts at hub height, so the wheels show below it from the side
    # and as four dark corners from overhead; an earlier version tucked them
    # under a low sill and the car read as a flatbed truck.
    sill = wheel_radius
    deck = sill + (roof - sill) * 0.40
    body = box("body", (length, width, deck - sill), (0, 0, (deck + sill) / 2), "env-metal")
    bevel(body, 0.03)
    cabin_width = width * 0.8
    cabin_x = -length * 0.02
    cabin = box(
        "cabin",
        (cabin_back, cabin_width, roof - deck),
        (cabin_x, 0, (roof + deck) / 2),
        "env-metal",
    )
    bevel(cabin, 0.05)
    glass_z = deck + (roof - deck) * 0.46
    box(
        "glass_front",
        (0.04, cabin_width * 0.9, (roof - deck) * 0.6),
        (cabin_x + cabin_back / 2, 0, glass_z),
        "env-glass",
    )
    box(
        "glass_rear",
        (0.04, cabin_width * 0.9, (roof - deck) * 0.52),
        (cabin_x - cabin_back / 2, 0, glass_z),
        "env-glass",
    )
    for side in (-1, 1):
        box(
            f"glass_{'l' if side < 0 else 'r'}",
            (cabin_back * 0.76, 0.03, (roof - deck) * 0.5),
            (cabin_x, side * (cabin_width / 2 + 0.01), glass_z),
            "env-glass",
        )
    if boot:
        boot_len = (length / 2 - (cabin_x + cabin_back / 2)) * 0.9
        boot_deck = box(
            "boot",
            (boot_len, width * 0.9, (roof - deck) * 0.34),
            (length / 2 - boot_len / 2 - 0.02, 0, deck + (roof - deck) * 0.17),
            "env-metal",
        )
        bevel(boot_deck, 0.03)
    for side in (-1, 1):
        box(
            f"bumper_{'f' if side < 0 else 'b'}",
            (0.07, width * 0.9, 0.11),
            (side * (length / 2 - 0.02), 0, sill + 0.06),
            "env-rust",
        )
    for x in (-length * 0.31, length * 0.31):
        for y in (-1, 1):
            wheel(f"wheel_{x:+.2f}_{'l' if y < 0 else 'r'}", (x, y * (width / 2 - 0.01), wheel_radius), wheel_radius)


# ===========================================
# Stacked and slatted cover
# ===========================================


def sandbag(
    name: str,
    at: tuple[float, float, float],
    length: float,
    token: str,
    tilt: float = 0.0,
    soft: bool = False,
) -> None:
    """One filled bag: a box, wider than it is tall, yawed a little.

    Cylinders were the first attempt and the stack read as a pile of pipes.
    A chamfer costs 44 triangles a bag against a 300-triangle prop budget, so
    only the top course passes ``soft``; lower bags are half-buried in their
    neighbours and their corners never read anyway.

    @param name - Object name.
    @param at - Bag centre.
    @param length - Bag length along X.
    @param token - Palette token.
    @param tilt - Yaw in radians, so a course is not a row of identical bricks.
    @param soft - Chamfer the corners.
    """
    ob = box(name, (length, 0.22, 0.13), at, token, rot=(0, 0, tilt))
    if soft:
        bevel(ob, 0.035)


def slat_face(name: str, size: tuple[float, float, float], at: tuple[float, float, float], token: str) -> None:
    """A plank face with its grain token; thin enough to read as boarding.

    @param name - Object name.
    @param size - Full width/depth/height.
    @param at - Centre.
    @param token - Palette token.
    """
    box(name, size, at, token)


# ===========================================
# Vegetation and street furniture
# ===========================================


def conifer(trunk_height: float, tiers: int, top: float, spread: float) -> None:
    """A pine: a bark trunk under stacked cones that narrow toward the top.

    ```
          /\\
         /__\\
        /____\\      tiers of cones, each wider and shorter than the one above
          ||        trunk
    ```

    @param trunk_height - Bare trunk height before the first tier.
    @param tiers - Number of cones.
    @param top - Total height.
    @param spread - Radius of the widest (lowest) tier.
    """
    cylinder("trunk", 0.05, 0.07, trunk_height, 6, (0, 0, trunk_height / 2), "env-bark")
    span = top - trunk_height
    for i in range(tiers):
        # Lower tiers overlap the one above by a third, so the silhouette is a
        # continuous cone rather than a stack of separate hats.
        base_z = trunk_height + span * i / tiers * 0.78
        height = span / tiers * 1.35
        radius = spread * (1 - i / tiers * 0.72)
        cylinder(
            f"tier_{i}",
            radius * 0.15,
            radius,
            height,
            8,
            (0, 0, base_z + height / 2),
            "env-foliage",
        )


def broadleaf(trunk_height: float, top: float, spread: float) -> None:
    """An oak: a bark trunk under three overlapping low-poly canopy lumps.

    @param trunk_height - Bare trunk height.
    @param top - Total height.
    @param spread - Canopy radius.
    """
    cylinder("trunk", 0.07, 0.1, trunk_height, 6, (0, 0, trunk_height / 2), "env-bark")
    canopy = top - trunk_height
    lumps = (
        (0.0, 0.0, trunk_height + canopy * 0.55, spread),
        (-spread * 0.42, spread * 0.2, trunk_height + canopy * 0.34, spread * 0.68),
        (spread * 0.38, -spread * 0.26, trunk_height + canopy * 0.38, spread * 0.62),
    )
    for i, (x, y, z, r) in enumerate(lumps):
        sphere(f"canopy_{i}", r, (x, y, z), "env-foliage", segments=6, rings=4, scale=(1.0, 1.0, 0.78))


def palm(trunk_height: float, fronds: int, lean: float) -> None:
    """A palm: a leaning segmented trunk with fronds drooping from the crown.

    @param trunk_height - Crown height.
    @param fronds - Fronds around the crown.
    @param lean - Horizontal offset of the crown from the base.
    """
    segments = 5
    for i in range(segments):
        t = (i + 0.5) / segments
        cylinder(
            f"trunk_{i}",
            0.05 - 0.012 * t,
            0.07 - 0.012 * t,
            trunk_height / segments * 1.08,
            6,
            (lean * t * t, 0, trunk_height * (i + 0.5) / segments),
            "env-bark",
        )
    crown = (lean, 0, trunk_height)
    for i in range(fronds):
        angle = 2 * math.pi * i / fronds
        # Alternating lengths and a real droop: fronds pitched a few degrees
        # read as a pinwheel from overhead, which is the angle that matters.
        reach = 0.46 if i % 2 else 0.38
        droop = math.radians(34)
        box(
            f"frond_{i}",
            (reach, 0.12, 0.035),
            (
                crown[0] + math.cos(angle) * reach * 0.5,
                crown[1] + math.sin(angle) * reach * 0.5,
                crown[2] - 0.06 - reach * 0.22,
            ),
            "env-foliage",
            rot=(0, droop, angle),
        )
    sphere("crown", 0.08, crown, "env-bark", segments=6, rings=4)


def post_and_rail(height: float, rails: int, span: float) -> None:
    """A timber fence: two posts across the tile with horizontal rails.

    @param height - Post height.
    @param rails - Rail count.
    @param span - Distance between post centres.
    """
    for side in (-1, 1):
        box(
            f"post_{'l' if side < 0 else 'r'}",
            (0.08, 0.08, height),
            (side * span / 2, 0, height / 2),
            "env-bark",
        )
    for i in range(rails):
        z = height * (0.34 + 0.44 * i / max(1, rails - 1)) if rails > 1 else height * 0.55
        box(f"rail_{i}", (span + 0.08, 0.04, 0.08), (0, 0, z), "env-bark")
