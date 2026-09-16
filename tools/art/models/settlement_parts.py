"""Shared builders for the strategic-map settlement markers (issue #1152).

Six models share one module so the egg overlays can read the building layout
of the base they stack on. Everything sits on a 0.6 × 0.6 u plot with the
pivot at the base centre; the map views the plot straight down at 20 to 40 px,
so every decision below is about the top-down read: roof heights vary, street
gaps stay open, and the eggs land on rooftops and in those gaps rather than
inside walls.

    rural                town                 city
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │ ▄▄   ◯    │        │ ▄▄ ▄▄ ██  │        │ ██ ██ ██ █│  ▄ low block
    │      ▄▄   │        │ ▄▄    ▄▄  │        │ ██ ▲█ ██ █│  █ tower
    │ ▄▄   ▄▄   │        │ ██ ▄▄ ▄▄  │        │ ██ ██ ██  │  ◯ water tower
    └───────────┘        └───────────┘        └───────────┘  ▲ spire (beacon)
    height ≈ 0.21        height ≈ 0.28        height = 0.35

Blender axes: Z up, the front faces -Y (the export turns that into +Z).
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass

from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cut_below, cylinder, sphere  # noqa: E402

# ===========================================
# Plot constants
# ===========================================

#: Plot edge in tiles; the marker is drawn at 20 to 40 px for the whole plot.
PLOT = 0.6

#: Thin asphalt plate under every scale, so the street gaps read dark from above.
PLATE_HEIGHT = 0.02

#: Tallest point any scale may reach (the issue allows 0.35 for the city; the
#: rural tower tops out near 0.21 and the town at 0.28).
CITY_HEIGHT_CAP = 0.35

#: Beacon block on the tallest structure; the one `tdf-orange` accent per plot.
BEACON = 0.04


# ===========================================
# Layout data
# ===========================================


@dataclass(frozen=True)
class Building:
    """One block on the plot, centred at (x, y) on the plate.

    @param x - Centre along X (tiles, plot centre at 0).
    @param y - Centre along Y.
    @param w - Width along X.
    @param d - Depth along Y.
    @param h - Height above the plate.
    @param body - Palette token for the walls.
    @param roof - Palette token for the flat roof cap.
    """

    x: float
    y: float
    w: float
    d: float
    h: float
    body: str = "env-concrete"
    roof: str = "env-roof"

    @property
    def top(self) -> float:
        """World Z of the roof surface."""
        return PLATE_HEIGHT + self.h


@dataclass(frozen=True)
class EggSite:
    """Where an egg cluster sits: on a building's roof or on the plate in a gap.

    @param x - Cluster centre along X.
    @param y - Cluster centre along Y.
    @param building - Index into the layout's buildings, or None for street level.
    @param radius - Radius of the largest egg in the cluster.
    """

    x: float
    y: float
    building: int | None
    radius: float


@dataclass(frozen=True)
class Layout:
    """A settlement scale: its buildings, the tallest one, and where eggs go.

    @param buildings - Blocks on the plot.
    @param landmark - Index of the structure that carries the beacon.
    @param eggs - Egg cluster sites for the overlay.
    @param webs - Pairs of building indices that a webbing strand bridges.
    """

    buildings: tuple[Building, ...]
    landmark: int
    eggs: tuple[EggSite, ...]
    webs: tuple[tuple[int, int], ...]


#: Rural: four low blocks around open ground, a water tower as the landmark.
#: The tower is built separately (index 4 is reserved for it in `eggs`/`webs`).
RURAL = Layout(
    buildings=(
        Building(-0.17, -0.13, 0.16, 0.11, 0.06),
        Building(0.11, -0.17, 0.13, 0.09, 0.05, roof="env-concrete"),
        Building(-0.15, 0.13, 0.11, 0.14, 0.07),
        Building(0.14, 0.12, 0.19, 0.12, 0.05, body="env-metal", roof="env-roof"),
    ),
    landmark=4,
    eggs=(
        EggSite(0.14, 0.12, 3, 0.030),
        EggSite(-0.02, -0.02, None, 0.042),
        EggSite(0.23, -0.05, None, 0.032),
    ),
    webs=((3, 2), (0, 2)),
)

#: Water tower for the rural plot: tank on legs, the plot's tallest structure.
RURAL_TOWER = (-0.03, -0.20)
RURAL_TOWER_TANK_Z = (0.09, 0.15)

#: Town: a 3 × 3 grid with 0.04 u streets, one cell left open, two glass
#: mid-rises on the diagonal so the skyline reads from any yaw.
TOWN = Layout(
    buildings=(
        Building(-0.20, -0.20, 0.16, 0.16, 0.08),
        Building(0.00, -0.20, 0.16, 0.16, 0.10, roof="env-concrete"),
        Building(0.20, -0.20, 0.16, 0.16, 0.24, body="env-glass", roof="env-glass"),
        Building(-0.20, 0.00, 0.16, 0.16, 0.07, roof="env-concrete"),
        Building(0.00, 0.00, 0.16, 0.16, 0.12),
        Building(0.20, 0.00, 0.16, 0.16, 0.09),
        Building(-0.20, 0.20, 0.16, 0.16, 0.18, body="env-glass", roof="env-roof"),
        Building(0.00, 0.20, 0.16, 0.16, 0.08, roof="env-concrete"),
    ),
    landmark=2,
    eggs=(
        EggSite(0.00, 0.00, 4, 0.036),
        EggSite(-0.20, -0.20, 0, 0.032),
        EggSite(0.20, 0.20, None, 0.042),
        EggSite(0.20, 0.00, 5, 0.030),
    ),
    webs=((2, 5), (6, 3), (4, 1), (2, 4)),
)

#: City: a 4 × 4 grid of towers with 0.03 u streets and one plaza at the far
#: corner. Heights climb toward the spire at (row 1, column 2) so the
#: silhouette peaks off-centre.
_CITY_HEIGHTS = (
    (0.12, 0.16, 0.20, 0.13),
    (0.15, 0.21, 0.23, 0.18),
    (0.19, 0.20, 0.22, 0.14),
    (0.11, 0.17, 0.15, 0.12),
)
_CITY_GLASS = {(1, 1), (1, 2), (2, 2), (0, 2), (2, 0)}
_CITY_PLAZA = (3, 3)


def _city_buildings() -> tuple[Building, ...]:
    """Lay the city towers out on their grid, leaving the plaza cell open."""
    pitch, size = 0.15, 0.12
    towers = []
    for row, heights in enumerate(_CITY_HEIGHTS):
        for col, h in enumerate(heights):
            if (row, col) == _CITY_PLAZA:
                continue
            glass = (row, col) in _CITY_GLASS
            towers.append(
                Building(
                    -0.225 + col * pitch,
                    -0.225 + row * pitch,
                    size,
                    size,
                    h,
                    body="env-glass" if glass else "env-concrete",
                    roof="env-glass" if glass else "env-roof",
                )
            )
    return tuple(towers)


CITY = Layout(
    buildings=_city_buildings(),
    landmark=6,  # row 1, column 2: the 0.23 tower that carries the spire
    eggs=(
        EggSite(-0.225, -0.225, 0, 0.030),
        EggSite(0.225, 0.225, None, 0.032),
        EggSite(-0.075, 0.225, 13, 0.030),
        EggSite(0.225, -0.075, 7, 0.030),
        EggSite(-0.225, 0.075, 8, 0.030),
        EggSite(0.075, -0.225, 2, 0.030),
    ),
    webs=((5, 6), (6, 10), (9, 5), (6, 7), (10, 14), (1, 5)),
)

#: Every scale by id, sparsest first (mirrors `SETTLEMENT_SCALES`).
LAYOUTS: dict[str, Layout] = {"rural": RURAL, "town": TOWN, "city": CITY}


# ===========================================
# Base builders
# ===========================================


def plate() -> None:
    """The asphalt plot every scale stands on."""
    box("plate", (PLOT, PLOT, PLATE_HEIGHT), (0, 0, PLATE_HEIGHT / 2), "env-asphalt")


def block(name: str, b: Building) -> None:
    """A flat-roofed block: walls up to the roof, a thin cap in the roof token."""
    cap = 0.012
    box(f"{name}_body", (b.w, b.d, b.h - cap), (b.x, b.y, PLATE_HEIGHT + (b.h - cap) / 2), b.body)
    box(f"{name}_roof", (b.w, b.d, cap), (b.x, b.y, b.top - cap / 2), b.roof)


def beacon(name: str, at: tuple[float, float, float]) -> None:
    """The plot's single orange accent, centred on the top of its landmark."""
    box(name, (BEACON, BEACON, BEACON * 0.6), (at[0], at[1], at[2] + BEACON * 0.3), "tdf-orange")


def water_tower(name: str, x: float, y: float) -> float:
    """A rural water tower: four legs, a steel tank, a cone lid. Returns the lid apex Z."""
    z0, z1 = RURAL_TOWER_TANK_Z
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        box(f"{name}_leg{sx:+}{sy:+}", (0.012, 0.012, z0), (x + sx * 0.03, y + sy * 0.03, PLATE_HEIGHT + z0 / 2), "env-metal")
    cylinder(f"{name}_tank", 0.045, 0.045, z1 - z0, 8, (x, y, PLATE_HEIGHT + (z0 + z1) / 2), "env-metal")
    lid = 0.02
    cylinder(f"{name}_lid", 0.006, 0.047, lid, 8, (x, y, PLATE_HEIGHT + z1 + lid / 2), "env-roof")
    return PLATE_HEIGHT + z1 + lid


def spire(name: str, b: Building) -> float:
    """A landmark spire on a city tower: a stepped crown and a tapered pyramid. Returns its tip Z."""
    crown = 0.02
    box(f"{name}_crown", (b.w * 0.6, b.d * 0.6, crown), (b.x, b.y, b.top + crown / 2), "env-concrete")
    tip = CITY_HEIGHT_CAP - BEACON * 0.6
    height = tip - (b.top + crown)
    cylinder(f"{name}_pyramid", 0.014, b.w * 0.28, height, 4, (b.x, b.y, b.top + crown + height / 2), "env-concrete")
    return tip


def build_settlement(scale: str) -> None:
    """Build the base model for one scale: plate, blocks, landmark and beacon."""
    layout = LAYOUTS[scale]
    plate()
    for i, b in enumerate(layout.buildings):
        block(f"block{i}", b)
    if scale == "rural":
        tip = water_tower("tower", *RURAL_TOWER)
        beacon("beacon", (RURAL_TOWER[0], RURAL_TOWER[1], tip))
    elif scale == "town":
        b = layout.buildings[layout.landmark]
        beacon("beacon", (b.x, b.y, b.top))
    else:
        b = layout.buildings[layout.landmark]
        beacon("beacon", (b.x, b.y, spire("spire", b)))


# ===========================================
# Egg overlay builders
# ===========================================


def egg(name: str, at: tuple[float, float, float], radius: float) -> None:
    """One ovoid egg standing on ``at`` with a magenta glow spot on its crown.

    Six segments and three rings keep an egg at 24 triangles; the glow is a
    16-triangle bead so a cluster of three stays under 130 triangles.
    """
    x, y, z = at
    height = radius * 1.35
    sphere(name, radius, (x, y, z + height), "bug-flesh-light", segments=6, rings=3, scale=(1, 1, height / radius), smooth=True)
    sphere(f"{name}_glow", radius * 0.42, (x, y, z + height * 1.75), "bug-bio-magenta", segments=4, rings=3, scale=(1, 1, 0.55))


def cluster(name: str, at: tuple[float, float, float], radius: float, mound: bool) -> None:
    """Three eggs of falling size around a centre, optionally on a flesh mound.

    Street clusters get a flattened `bug-flesh` mound cut at the plate so they
    root into the ground; rooftop clusters stand directly on the roof cap.
    """
    x, y, z = at
    if mound:
        m = sphere(f"{name}_mound", radius * 2.2, (x, y, z), "bug-flesh", segments=8, rings=4, scale=(1, 0.9, 0.22), smooth=True)
        cut_below(m, z)
    spread = radius * 0.95
    for i, (angle, scale) in enumerate(((0.9, 1.0), (3.0, 0.8), (5.1, 0.7))):
        egg(f"{name}_egg{i}", (x + math.cos(angle) * spread, y + math.sin(angle) * spread, z), radius * scale)


def strand(name: str, a: Vector, b: Vector, radius: float = 0.007) -> None:
    """A webbing strand from ``a`` to ``b``: a three-sided rod aligned along the span."""
    span = b - a
    mid = a + span / 2
    rot = span.to_track_quat("Z", "Y").to_euler()
    cylinder(name, radius, radius, span.length, 3, tuple(mid), "bug-chitin-dark", rot=tuple(rot))


def roof_edge(b: Building, toward: Building) -> Vector:
    """The point on ``b``'s roof edge facing ``toward``, pulled in a little so the strand roots."""
    dx, dy = toward.x - b.x, toward.y - b.y
    inset = 0.015
    if abs(dx) >= abs(dy):
        return Vector((b.x + math.copysign(b.w / 2 - inset, dx), b.y, b.top))
    return Vector((b.x, b.y + math.copysign(b.d / 2 - inset, dy), b.top))


def web(name: str, a: Building, b: Building) -> None:
    """Bridge the street gap between two roofs from the edges that face each other.

    Starting on the edges rather than the roof centres keeps the strand out of
    the taller building's walls; a small lift at each end sits it on the cap.
    """
    lift = Vector((0, 0, 0.006))
    strand(name, roof_edge(a, b) + lift, roof_edge(b, a) + lift)


def build_settlement_eggs(scale: str) -> None:
    """Build the egg overlay for one scale over the matching base layout.

    Nothing here touches the plate or the buildings: clusters stand on roof
    caps or on the plate in a street gap, and strands span only the gaps.
    """
    layout = LAYOUTS[scale]
    for i, site in enumerate(layout.eggs):
        if site.building is None:
            cluster(f"cluster{i}", (site.x, site.y, PLATE_HEIGHT), site.radius, mound=True)
        else:
            cluster(f"cluster{i}", (site.x, site.y, layout.buildings[site.building].top), site.radius, mound=False)
    for i, (a, b) in enumerate(layout.webs):
        web(f"web{i}", layout.buildings[a], layout.buildings[b])
