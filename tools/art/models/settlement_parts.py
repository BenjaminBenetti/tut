"""Shared builders for the strategic-map settlement markers (issues #1152, #1155).

Six models share one module so the egg overlays can read the building layout
of the base they stack on. Everything stands on a round asphalt pad inside a
0.6 × 0.6 u plot with the pivot at the base centre. Since ADR 0005 §5 the map
camera sits to the south, pitched 35° back from vertical, so the models are
authored for that view: a skyline of varied heights, building fronts facing
the camera, and the whole cluster yawed 15° so a second face of every block
catches the key light. Windows are small emissive boxes on the two faces the
camera sees, lit at random so a settlement reads as a city at night.

    rural                town                 city
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │ ⌂  ♣  ◯   │        │ ▄▄ ██ ▄▄  │        │ ▄ ██ ▲█ ▄ │  ⌂ house, pitched roof
    │  ⌂ ▄▄▄ ⌂  │        │ ▄▄ ▄▄ ▄▄  │        │ ██ ██ ██  │  ▄ low block   █ tower
    │ ♣   ⌂  ♣  │        │  ▄▄  ▄▄   │        │ ▄  ██  ▄  │  ♣ tree   ◯ water tower
    └───────────┘        └───────────┘        └───────────┘  ▲ spire (beacon)
    height ≈ 0.16        height ≈ 0.22        height ≈ 0.40

Blender axes: Z up, the front faces -Y (the export turns that into +Z, the
side the map camera looks from).
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cut_below, cylinder, join, material, mesh_objects, sphere  # noqa: E402

# ===========================================
# Plot constants
# ===========================================

#: Plot edge in tiles; the marker is drawn at 20 to 40 px for the whole plot.
PLOT = 0.6

#: Radius of the round asphalt pad; inside the halo ring the marker draws.
PAD_RADIUS = 0.29

#: Pad thickness; every building stands on its top.
PAD_HEIGHT = 0.02

#: Yaw of the whole cluster about Z, so the camera due south sees two faces.
#: Negative turns the fronts toward the south-west and shows the east faces,
#: which the key light (from the south-east) still reaches.
CLUSTER_YAW = math.radians(-15)

#: Beacon block on the tallest structure; the one `tdf-orange` accent per plot.
BEACON = 0.035

#: Lit windows: the token, their size, their grid pitch and how many are lit.
WINDOW_TOKEN = "env-window-lit"
WINDOW_W, WINDOW_H, WINDOW_D = 0.014, 0.011, 0.006
WINDOW_PITCH_ACROSS, WINDOW_PITCH_UP = 0.028, 0.026
WINDOW_LIT_FRACTION = 0.42


# ===========================================
# Layout data
# ===========================================


@dataclass(frozen=True)
class Building:
    """One block on the plot, centred at (x, y) on the pad, before the cluster yaw.

    @param x - Centre along X (tiles, plot centre at 0).
    @param y - Centre along Y.
    @param w - Width along X.
    @param d - Depth along Y.
    @param h - Wall height above the pad (to the eaves for a pitched roof).
    @param body - Palette token for the walls.
    @param roof - Palette token for the roof.
    @param pitched - Rise of a pitched roof above the eaves; 0 for a flat cap.
    @param windows - Whether the visible faces get lit windows.
    """

    x: float
    y: float
    w: float
    d: float
    h: float
    body: str = "env-concrete"
    roof: str = "tdf-grey-mid"
    pitched: float = 0.0
    windows: bool = True

    @property
    def top(self) -> float:
        """World Z of the flat roof surface, or of the eaves for a pitched roof."""
        return PAD_HEIGHT + self.h


@dataclass(frozen=True)
class EggSite:
    """Where an egg cluster sits: on a flat roof or on the pad in a gap.

    @param x - Cluster centre along X, before the cluster yaw.
    @param y - Cluster centre along Y.
    @param building - Index into the layout's buildings (flat-roofed), or None for ground level.
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
    @param landmark - Index of the structure that carries the beacon, or None for a built landmark.
    @param eggs - Egg cluster sites for the overlay.
    @param webs - Pairs of building indices that a webbing strand bridges.
    @param trees - Tree positions on the pad.
    """

    buildings: tuple[Building, ...]
    landmark: int | None
    eggs: tuple[EggSite, ...]
    webs: tuple[tuple[int, int], ...]
    trees: tuple[tuple[float, float], ...] = ()


#: Rural: a barn and silo, six houses under pitched roofs, trees, and a water
#: tower as the landmark (built separately; it carries the beacon).
RURAL = Layout(
    buildings=(
        Building(-0.10, 0.02, 0.09, 0.14, 0.06, body="env-brick", roof="env-roof", pitched=0.045),
        Building(0.06, -0.12, 0.06, 0.05, 0.04, body="env-plaster-warm", roof="env-brick", pitched=0.03),
        Building(0.15, -0.04, 0.05, 0.06, 0.04, body="env-concrete", roof="env-roof", pitched=0.03),
        Building(0.05, 0.08, 0.07, 0.05, 0.045, body="env-plaster-warm", roof="env-roof", pitched=0.032),
        Building(0.17, 0.12, 0.05, 0.05, 0.04, body="env-plaster-warm", roof="env-brick", pitched=0.03),
        Building(-0.05, -0.17, 0.05, 0.05, 0.04, body="env-concrete", roof="env-roof", pitched=0.03),
        Building(0.20, -0.15, 0.05, 0.04, 0.035, body="env-brick", roof="env-roof", pitched=0.028),
        Building(-0.14, -0.13, 0.06, 0.05, 0.04, body="env-plaster-warm", roof="env-roof", pitched=0.03),
    ),
    landmark=None,
    eggs=(
        EggSite(0.02, -0.02, None, 0.036),
        EggSite(0.11, 0.03, None, 0.030),
        EggSite(-0.19, -0.06, None, 0.030),
    ),
    webs=((0, 3), (1, 2), (0, 7)),
    trees=((0.23, 0.04), (-0.21, -0.14), (0.11, 0.20), (-0.02, 0.15), (-0.20, 0.12), (0.00, -0.23)),
)

#: Silo beside the barn and the water tower that is the rural landmark.
RURAL_SILO = (-0.19, 0.08)
RURAL_TOWER = (-0.03, 0.20)
RURAL_TOWER_TANK_Z = (0.09, 0.14)

#: Town: one glass mid-rise as the landmark over a low skyline of concrete,
#: plaster and brick, with a couple of trees in the gaps.
TOWN = Layout(
    buildings=(
        Building(0.02, -0.03, 0.10, 0.10, 0.20, body="env-glass", roof="tdf-grey-mid"),
        Building(-0.12, 0.04, 0.10, 0.08, 0.13, body="env-concrete", roof="env-roof"),
        Building(0.14, 0.08, 0.08, 0.10, 0.11, body="env-plaster-warm", roof="env-roof"),
        Building(-0.13, -0.10, 0.09, 0.07, 0.08, body="env-brick", roof="env-roof"),
        Building(0.15, -0.10, 0.09, 0.07, 0.07, body="env-concrete", roof="tdf-grey-mid"),
        Building(0.00, 0.12, 0.11, 0.06, 0.07, body="env-plaster-warm", roof="env-roof"),
        Building(-0.03, -0.17, 0.12, 0.06, 0.06, body="env-brick", roof="env-roof"),
        Building(-0.21, -0.01, 0.05, 0.08, 0.06, body="env-concrete", roof="env-roof"),
        Building(0.20, -0.01, 0.05, 0.06, 0.05, body="env-plaster-warm", roof="env-roof"),
        Building(-0.10, 0.16, 0.08, 0.05, 0.05, body="env-brick", roof="env-roof"),
        Building(0.10, 0.19, 0.07, 0.05, 0.05, body="env-concrete", roof="env-roof"),
        Building(0.12, -0.20, 0.07, 0.05, 0.05, body="env-brick", roof="env-roof"),
    ),
    landmark=0,
    eggs=(
        EggSite(-0.12, 0.04, 1, 0.032),
        EggSite(0.14, 0.08, 2, 0.030),
        EggSite(0.12, -0.02, None, 0.038),
        EggSite(-0.03, -0.17, 6, 0.028),
    ),
    webs=((0, 1), (0, 2), (1, 5), (2, 4), (3, 6)),
    trees=((-0.20, 0.11), (0.21, 0.16), (-0.22, -0.13)),
)

#: City: three towers over a ring of mid-rises and low blocks, the tallest
#: carrying the spire; heights fall away from it so the skyline peaks
#: off-centre from every side.
CITY = Layout(
    buildings=(
        Building(0.03, -0.02, 0.11, 0.11, 0.36, body="env-glass", roof="tdf-grey-mid"),
        Building(-0.11, 0.05, 0.10, 0.10, 0.30, body="tdf-grey-light", roof="tdf-grey-mid"),
        Building(0.14, 0.10, 0.09, 0.09, 0.26, body="env-concrete", roof="env-roof"),
        Building(-0.13, -0.10, 0.10, 0.09, 0.22, body="env-glass", roof="tdf-grey-mid"),
        Building(0.15, -0.10, 0.09, 0.10, 0.20, body="tdf-grey-light", roof="tdf-grey-mid"),
        Building(0.00, 0.14, 0.10, 0.08, 0.17, body="env-concrete", roof="env-roof"),
        Building(0.00, -0.15, 0.12, 0.07, 0.15, body="env-concrete", roof="env-roof"),
        Building(-0.16, 0.14, 0.07, 0.07, 0.11, body="env-plaster-warm", roof="env-roof"),
        Building(0.18, 0.00, 0.06, 0.09, 0.10, body="env-concrete", roof="env-roof"),
        Building(-0.21, 0.00, 0.06, 0.08, 0.13, body="tdf-grey-light", roof="tdf-grey-mid"),
        Building(0.12, -0.19, 0.08, 0.06, 0.09, body="env-brick", roof="env-roof"),
        Building(-0.10, -0.20, 0.07, 0.05, 0.08, body="env-plaster-warm", roof="env-roof"),
        Building(0.05, 0.22, 0.09, 0.05, 0.08, body="env-concrete", roof="env-roof"),
        Building(0.15, 0.18, 0.06, 0.05, 0.07, body="env-brick", roof="env-roof"),
    ),
    landmark=0,
    eggs=(
        EggSite(0.00, 0.14, 5, 0.030),
        EggSite(-0.21, 0.00, 9, 0.028),
        EggSite(0.12, -0.19, 10, 0.028),
        EggSite(-0.05, -0.07, None, 0.030),
        EggSite(0.22, 0.10, None, 0.030),
        EggSite(0.00, -0.15, 6, 0.030),
    ),
    webs=((0, 1), (0, 2), (1, 7), (2, 8), (3, 6), (4, 10), (1, 9)),
)

#: Every scale by id, sparsest first (mirrors `SETTLEMENT_SCALES`).
LAYOUTS: dict[str, Layout] = {"rural": RURAL, "town": TOWN, "city": CITY}


# ===========================================
# Base builders
# ===========================================


def pad() -> None:
    """The round asphalt pad every scale stands on; not yawed, being round."""
    cylinder("pad", PAD_RADIUS, PAD_RADIUS, PAD_HEIGHT, 12, (0, 0, PAD_HEIGHT / 2), "env-asphalt")


def prism(name: str, at: tuple[float, float, float], width: float, length: float, rise: float, token: str) -> bpy.types.Object:
    """A ridged roof: a triangular prism along Y with its flat base at ``at`` and its ridge ``rise`` above.

    Built from vertices rather than a rotated cone so the ridge is on top
    and the pitch can be shallow; every face winds outward.
    """
    x, y, z = at
    hw, hl = width / 2, length / 2
    verts = [
        (x - hw, y - hl, z),
        (x + hw, y - hl, z),
        (x + hw, y + hl, z),
        (x - hw, y + hl, z),
        (x, y - hl, z + rise),
        (x, y + hl, z + rise),
    ]
    faces = [(0, 3, 2, 1), (0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    mesh.materials.append(material(token))
    for poly in mesh.polygons:
        poly.use_smooth = False
    return ob


def block(name: str, b: Building) -> None:
    """A building: walls up to the eaves, then a thin flat cap or a pitched roof."""
    if b.pitched > 0:
        box(f"{name}_body", (b.w, b.d, b.h), (b.x, b.y, PAD_HEIGHT + b.h / 2), b.body)
        prism(f"{name}_roof", (b.x, b.y, b.top), b.w + 0.012, b.d + 0.012, b.pitched, b.roof)
    else:
        cap = 0.012
        box(f"{name}_body", (b.w, b.d, b.h - cap), (b.x, b.y, PAD_HEIGHT + (b.h - cap) / 2), b.body)
        box(f"{name}_roof", (b.w, b.d, cap), (b.x, b.y, b.top - cap / 2), b.roof)


def windows(name: str, b: Building, seed: int) -> None:
    """Lit windows on the two faces the map camera sees: the front (-Y) and the east (+X).

    Each face carries a grid of cells; a deterministic LCG seeded per
    building lights `WINDOW_LIT_FRACTION` of them, so no two blocks share
    a pattern and the pattern never changes between runs. Every lit window
    is a small box sunk 0.002 into the wall, so it stays watertight on its
    own and the join leaves it a closed shell.
    """
    state = seed * 7919 + 17

    def rand() -> float:
        nonlocal state
        state = (state * 1103515245 + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF

    rows = max(1, int((b.h - 0.025) // WINDOW_PITCH_UP))
    for face, span in (("f", b.w), ("e", b.d)):
        cols = max(1, int((span - 0.016) // WINDOW_PITCH_ACROSS))
        start = -(cols - 1) / 2 * WINDOW_PITCH_ACROSS
        for row in range(rows):
            z = PAD_HEIGHT + 0.012 + row * WINDOW_PITCH_UP + WINDOW_H / 2
            if z + WINDOW_H / 2 > b.top - 0.008:
                break
            for col in range(cols):
                if rand() > WINDOW_LIT_FRACTION:
                    continue
                along = start + col * WINDOW_PITCH_ACROSS
                if face == "f":
                    at = (b.x + along, b.y - b.d / 2 - WINDOW_D / 2 + 0.002, z)
                    size = (WINDOW_W, WINDOW_D, WINDOW_H)
                else:
                    at = (b.x + b.w / 2 + WINDOW_D / 2 - 0.002, b.y + along, z)
                    size = (WINDOW_D, WINDOW_W, WINDOW_H)
                box(f"{name}_w{face}{row}{col}", size, at, WINDOW_TOKEN)


def beacon(name: str, at: tuple[float, float, float]) -> None:
    """The plot's single orange accent, centred on the top of its landmark."""
    box(name, (BEACON, BEACON, BEACON * 0.6), (at[0], at[1], at[2] + BEACON * 0.3), "tdf-orange")


def tree(name: str, x: float, y: float) -> None:
    """A round-crowned tree on the pad: a short trunk and a six-segment crown."""
    trunk = 0.03
    cylinder(f"{name}_trunk", 0.006, 0.007, trunk, 5, (x, y, PAD_HEIGHT + trunk / 2), "env-bark")
    sphere(f"{name}_crown", 0.026, (x, y, PAD_HEIGHT + trunk + 0.018), "env-foliage", segments=6, rings=4, scale=(1, 1, 0.9))


def silo(name: str, x: float, y: float) -> None:
    """A steel grain silo: a tall drum with a shallow cone lid."""
    height = 0.12
    cylinder(f"{name}_drum", 0.026, 0.026, height, 8, (x, y, PAD_HEIGHT + height / 2), "env-metal")
    cylinder(f"{name}_lid", 0.004, 0.028, 0.016, 8, (x, y, PAD_HEIGHT + height + 0.008), "env-roof")


def water_tower(name: str, x: float, y: float) -> float:
    """A rural water tower: four legs, a steel tank, a cone lid. Returns the lid apex Z."""
    z0, z1 = RURAL_TOWER_TANK_Z
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        box(f"{name}_leg{sx:+}{sy:+}", (0.010, 0.010, z0), (x + sx * 0.026, y + sy * 0.026, PAD_HEIGHT + z0 / 2), "env-metal")
    cylinder(f"{name}_tank", 0.04, 0.04, z1 - z0, 8, (x, y, PAD_HEIGHT + (z0 + z1) / 2), "env-metal")
    lid = 0.018
    cylinder(f"{name}_lid", 0.005, 0.042, lid, 8, (x, y, PAD_HEIGHT + z1 + lid / 2), "env-roof")
    return PAD_HEIGHT + z1 + lid


def spire(name: str, b: Building) -> float:
    """A landmark spire on a city tower: a stepped crown and a tapered pyramid. Returns its tip Z."""
    crown = 0.016
    box(f"{name}_crown", (b.w * 0.55, b.d * 0.55, crown), (b.x, b.y, b.top + crown / 2), "tdf-grey-light")
    height = 0.028
    cylinder(f"{name}_pyramid", 0.004, b.w * 0.22, height, 4, (b.x, b.y, b.top + crown + height / 2), "tdf-grey-light")
    return b.top + crown + height


# ===========================================
# Cluster yaw and join
# ===========================================


def yaw_and_join(name: str, exclude: tuple[str, ...] = ()) -> None:
    """Turn every mesh but ``exclude`` by `CLUSTER_YAW` about the plot centre and join them into one object.

    The yaw is baked into the geometry, so the GLB is what the map shows
    and the review renders show. One object per model keeps the scene to a
    handful of draw calls per settlement: the exporter writes one primitive
    per material, not one per window.
    """
    turn = Matrix.Rotation(CLUSTER_YAW, 4, "Z")
    bpy.ops.object.select_all(action="DESELECT")
    turned = []
    for ob in mesh_objects():
        if ob.name in exclude:
            continue
        ob.matrix_world = turn @ ob.matrix_world
        ob.select_set(True)
        turned.append(ob)
    if not turned:
        return
    bpy.context.view_layer.objects.active = turned[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    join(turned, name)


def build_settlement(scale: str) -> None:
    """Build the base model for one scale: pad, blocks with windows, landmark, beacon, trees."""
    layout = LAYOUTS[scale]
    pad()
    for i, b in enumerate(layout.buildings):
        block(f"block{i}", b)
        if b.windows:
            windows(f"block{i}", b, i + 1)
    for i, (x, y) in enumerate(layout.trees):
        tree(f"tree{i}", x, y)
    if scale == "rural":
        silo("silo", *RURAL_SILO)
        tip = water_tower("tower", *RURAL_TOWER)
        beacon("beacon", (RURAL_TOWER[0], RURAL_TOWER[1], tip))
    elif scale == "town":
        b = layout.buildings[layout.landmark]
        beacon("beacon", (b.x, b.y, b.top))
    else:
        b = layout.buildings[layout.landmark]
        beacon("beacon", (b.x, b.y, spire("spire", b)))
    yaw_and_join("settlement", exclude=("pad",))


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

    Street clusters get a flattened `bug-flesh` mound cut at the pad so they
    root into the ground; rooftop clusters stand directly on the roof cap.
    """
    x, y, z = at
    if mound:
        m = sphere(f"{name}_mound", radius * 2.2, (x, y, z), "bug-flesh", segments=8, rings=4, scale=(1, 0.9, 0.22), smooth=True)
        cut_below(m, z)
    spread = radius * 0.95
    for i, (angle, scale) in enumerate(((0.9, 1.0), (3.0, 0.8), (5.1, 0.7))):
        egg(f"{name}_egg{i}", (x + math.cos(angle) * spread, y + math.sin(angle) * spread, z), radius * scale)


def strand(name: str, a: Vector, b: Vector, radius: float = 0.006) -> None:
    """A webbing strand from ``a`` to ``b``: a three-sided rod aligned along the span."""
    span = b - a
    mid = a + span / 2
    rot = span.to_track_quat("Z", "Y").to_euler()
    cylinder(name, radius, radius, span.length, 3, tuple(mid), "bug-chitin-dark", rot=tuple(rot))


def roof_edge(b: Building, toward: Building) -> Vector:
    """The point on ``b``'s eaves edge facing ``toward``, pulled in a little so the strand roots."""
    dx, dy = toward.x - b.x, toward.y - b.y
    inset = 0.012
    if b.pitched > 0:
        # A pitched roof is strung from its ridge, which runs along Y.
        ridge = b.top + b.pitched
        if abs(dy) >= abs(dx):
            return Vector((b.x, b.y + math.copysign(b.d / 2 - inset, dy), ridge))
        return Vector((b.x, b.y, ridge))
    if abs(dx) >= abs(dy):
        return Vector((b.x + math.copysign(b.w / 2 - inset, dx), b.y, b.top))
    return Vector((b.x, b.y + math.copysign(b.d / 2 - inset, dy), b.top))


def web(name: str, a: Building, b: Building) -> None:
    """Bridge the gap between two roofs from the edges that face each other.

    Starting on the edges rather than the roof centres keeps the strand out of
    the taller building's walls; a small lift at each end sits it on the cap.
    """
    lift = Vector((0, 0, 0.005))
    strand(name, roof_edge(a, b) + lift, roof_edge(b, a) + lift)


def build_settlement_eggs(scale: str) -> None:
    """Build the egg overlay for one scale over the matching base layout.

    Nothing here touches the pad or the buildings: clusters stand on flat
    roof caps or on the pad in a gap, and strands span only the gaps. The
    overlay is yawed exactly as the base, so it lands where the base's
    roofs and gaps are.
    """
    layout = LAYOUTS[scale]
    for i, site in enumerate(layout.eggs):
        if site.building is None:
            cluster(f"cluster{i}", (site.x, site.y, PAD_HEIGHT), site.radius, mound=True)
        else:
            cluster(f"cluster{i}", (site.x, site.y, layout.buildings[site.building].top), site.radius, mound=False)
    for i, (a, b) in enumerate(layout.webs):
        web(f"web{i}", layout.buildings[a], layout.buildings[b])
    yaw_and_join("settlement_eggs")
