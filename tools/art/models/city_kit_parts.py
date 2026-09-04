"""Shared builders for the city building kit (issues #274, #509).

Blender axes: X runs along a wall, Y is its thickness, Z is up; the front
faces -Y so the glTF export puts it on +Z. Sizes are in tiles (1 u = 2 m),
walls are 1 u long and 1.5 u tall on a 0.1 u core (style guide §7).

    plinth ──► brick body ──► cornice          openings keep the plinth and
      0.16        1.24         0.10            cornice bands unbroken, so a
    ────────────────────────────────           run of mixed wall pieces lines
                                               up course for course.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import bevel, box, cylinder  # noqa: E402

# ===========================================
# Kit constants
# ===========================================

#: Wall length along X, core thickness along Y, total height along Z.
WALL_LENGTH = 1.0
WALL_THICKNESS = 0.1
WALL_HEIGHT = 1.5

#: Bands shared by every full-height wall piece so mixed runs line up.
PLINTH_HEIGHT = 0.16
CORNICE_HEIGHT = 0.1
PLINTH_THICKNESS = 0.14
CORNICE_THICKNESS = 0.14

#: Top of the wall field, i.e. the underside of the cornice.
BRICK_TOP = WALL_HEIGHT - CORNICE_HEIGHT


# ===========================================
# Materials
# ===========================================


class Material:
    """One building's palette: the wall field, its bands, and its openings.

    A city of one material reads as an atlas limitation rather than a city,
    so the kit ships three families built from the same geometry. Only the
    tokens change, which keeps every piece inside its 800-triangle budget
    and keeps mixed runs lining up course for course.

    @param body - Palette token for the wall field.
    @param band - Token for the plinth and cornice.
    @param trim - Token for sills, thresholds and window frames.
    @param uv_rot - Cell rotation for the body; brick courses need 90.
    """

    def __init__(self, body: str, band: str, trim: str, uv_rot: int = 90) -> None:
        self.body = body
        self.band = band
        self.trim = trim
        self.uv_rot = uv_rot


#: Residential and older stock: red brick on concrete bands. The original kit.
BRICK = Material(body="env-brick", band="env-concrete", trim="env-concrete")

#: Civic and office blocks: poured concrete banded with steel spandrels. The
#: band is darker than the body here and lighter than it on brick — what
#: matters at 64 px is that a floor line exists, not which way it goes.
CONCRETE = Material(body="env-concrete", band="env-metal", trim="env-sidewalk", uv_rot=0)

#: Industrial sheds and depots: profiled steel panel with rusted trim.
PANEL = Material(body="env-metal", band="env-concrete", trim="env-rust", uv_rot=0)


# ===========================================
# Wall pieces
# ===========================================


def wall_bands(material: Material = BRICK) -> None:
    """Plinth at the base and cornice at the top, both slightly proud.

    @param material - Building family; only the band token changes.
    """
    plinth = box(
        "plinth",
        (WALL_LENGTH, PLINTH_THICKNESS, PLINTH_HEIGHT),
        (0, 0, PLINTH_HEIGHT / 2),
        material.band,
    )
    bevel(plinth, 0.015)
    cornice = box(
        "cornice",
        (WALL_LENGTH, CORNICE_THICKNESS, CORNICE_HEIGHT),
        (0, 0, WALL_HEIGHT - CORNICE_HEIGHT / 2),
        material.band,
    )
    bevel(cornice, 0.015)


def wall_panel(
    name: str,
    width: float,
    z0: float,
    z1: float,
    x: float = 0.0,
    material: Material = BRICK,
) -> None:
    """One wall field between two heights, full wall thickness.

    @param name - Object name.
    @param width - Length along X.
    @param z0 - Bottom height.
    @param z1 - Top height.
    @param x - Centre along X.
    @param material - Building family.
    """
    box(
        name,
        (width, WALL_THICKNESS, z1 - z0),
        (x, 0, (z0 + z1) / 2),
        material.body,
        uv_rot=material.uv_rot,
    )


def window_opening(
    sill_z: float = 0.55,
    head_z: float = 1.07,
    width: float = 0.56,
    material: Material = BRICK,
) -> None:
    """Glazed opening with a sill, jambs and a frame cross, in one family's tokens.

    @param sill_z - Top of the sill.
    @param head_z - Underside of the head.
    @param width - Clear glazed width.
    @param material - Building family.
    """
    jamb = (WALL_LENGTH - width) / 2
    wall_panel("spandrel", WALL_LENGTH, PLINTH_HEIGHT, sill_z - 0.06, material=material)
    sill = box(
        "sill",
        (width + 2 * jamb * 0.8, PLINTH_THICKNESS + 0.02, 0.06),
        (0, 0, sill_z - 0.03),
        material.trim,
    )
    bevel(sill, 0.015)
    for side in (-1, 1):
        wall_panel(
            f"jamb_{'l' if side < 0 else 'r'}",
            jamb,
            sill_z,
            head_z,
            side * (width + jamb) / 2,
            material,
        )
    wall_panel("head", WALL_LENGTH, head_z, BRICK_TOP, material=material)
    box("glass", (width - 0.04, 0.04, head_z - sill_z - 0.04), (0, 0, (sill_z + head_z) / 2), "env-glass")
    box("mullion", (0.04, 0.07, head_z - sill_z), (0, 0, (sill_z + head_z) / 2), "env-metal")
    box("transom", (width, 0.07, 0.04), (0, 0, (sill_z + head_z) / 2), "env-metal")


def door_opening(width: float = 0.6, head_z: float = 1.2, material: Material = BRICK) -> None:
    """Open doorway: plinth and brick on each jamb, a lintel over the head only,
    and a metal threshold.

    No applied frame — at 64 px per tile a frame reads as noise around the
    opening, and the opening itself is what has to be legible. Pieces are cut
    so nothing overlaps: coincident faces z-fight into black patches.

    @param width - Clear opening width.
    @param head_z - Underside of the lintel.
    @param material - Building family.
    """
    jamb = (WALL_LENGTH - width) / 2
    for side in (-1, 1):
        name = "l" if side < 0 else "r"
        x = side * (width + jamb) / 2
        plinth = box(
            f"plinth_{name}",
            (jamb, PLINTH_THICKNESS, PLINTH_HEIGHT),
            (x, 0, PLINTH_HEIGHT / 2),
            material.band,
        )
        bevel(plinth, 0.015)
        wall_panel(f"jamb_{name}", jamb, PLINTH_HEIGHT, BRICK_TOP, x, material)
    wall_panel("lintel", width, head_z, BRICK_TOP, material=material)
    # The threshold plate stays steel in every family: a door gets walked on,
    # and a worn metal plate is what that looks like whatever the wall is made of.
    threshold = box(
        "threshold",
        (width + 0.04, PLINTH_THICKNESS, 0.04),
        (0, 0, 0.02),
        "env-metal",
    )
    bevel(threshold, 0.012)


# ===========================================
# Deck pieces
# ===========================================


def panelled_deck(name: str, height: float, border_token: str, panel_token: str, border: float = 0.06) -> None:
    """A 1×1 deck: a trim ring in one token around a centre in another.

    Everything sits at the same height. An earlier version recessed the centre
    a few millimetres for a shadow line; the tile a floor is laid over is the
    same 0.05 u thick, so the recess let the ground below poke through and
    every interior floor grew a green square. Colour, not depth, does the work.

    ```
      ┌───────────────┐  ring   (border_token)
      │ ┌───────────┐ │
      │ │  centre   │ │  centre (panel_token)
      │ └───────────┘ │
      └───────────────┘
    ```

    @param name - Object name prefix.
    @param height - Deck height in tiles.
    @param border_token - Trim ring palette token.
    @param panel_token - Centre palette token.
    @param border - Ring width in tiles.
    """
    inner = 1.0 - 2 * border
    box(f"{name}_centre", (inner, inner, height), (0, 0, height / 2), panel_token)
    for side in (-1, 1):
        box(
            f"{name}_trim_x{'0' if side < 0 else '1'}",
            (1.0, border, height),
            (0, side * (0.5 - border / 2), height / 2),
            border_token,
        )
        box(
            f"{name}_trim_y{'0' if side < 0 else '1'}",
            (border, inner, height),
            (side * (0.5 - border / 2), 0, height / 2),
            border_token,
        )


def roof_vent(at_x: float, at_y: float) -> None:
    """Small capped vent stack, for a hand-placed roof feature.

    @param at_x - Centre along X.
    @param at_y - Centre along Y.
    """
    cylinder("vent", 0.05, 0.06, 0.12, 8, (at_x, at_y, 0.06), "env-metal")
    box("vent_cap", (0.16, 0.16, 0.02), (at_x, at_y, 0.13), "env-metal")
