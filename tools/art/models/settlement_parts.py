"""Parametrised builders for the strategic-map settlement markers (#1152, #1155).

A settlement is a *style* (one of ten regional architectural families,
see `settlement_styles.py`) applied to a *scale template* (rural, town,
city). The template fixes where the blocks stand and how tall each is
relative to its neighbours; the style dresses every block (wall and roof
tokens, roof shape, tower profile, tree kind) and builds the landmark.
The egg overlays read the same dressed layout, so they still stack on the
roofs and in the gaps of the base they belong to.

    template (scale)          style (region family)           model
    ┌───────────┐             palette · roof kind · tower       ┌───────────┐
    │ ▄ ██ ▲█ ▄ │   dress()   profile · tree · landmark  build  │ ▄ ▟▙ ◭▟ ▄ │
    │ ██ ██ ██  │ ──────────▶ ─────────────────────────▶ ─────▶ │ ▟▙ ▟▙ ▟▙  │
    │ ▄  ██  ▄  │             seeded jitter per style           │ ▄  ▟▙  ▄  │
    └───────────┘                                               └───────────┘

Nothing stands on a pad any more: every block sits directly on z = 0, so
on the map the buildings rise straight from the ground plane. Since ADR
0005 §5 the map camera sits to the south, pitched 35° back from vertical,
so the cluster is yawed 15° and windows are lit on the front and both
side faces (the map mirrors some cities, so either side may face the
light).

Blender axes: Z up, the front faces -Y (the export turns that into +Z, the
side the map camera looks from).
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass, field, replace
from typing import Callable

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from bpy_kit import box, cut_below, cylinder, join, material, mesh_objects, sphere  # noqa: E402

# ===========================================
# Plot constants
# ===========================================

#: Plot edge in tiles; the marker is drawn at 20 to 40 px for the whole plot.
PLOT = 0.6

#: Ground level every building stands on.
GROUND = 0.0

#: Yaw of the whole cluster about Z, so the camera due south sees two faces.
CLUSTER_YAW = math.radians(-15)

#: Beacon block on the tallest structure; the one `tdf-orange` accent per plot.
BEACON = 0.035

#: Lit windows: the token, their size, their grid pitch and how many are lit.
WINDOW_TOKEN = "env-window-lit"
WINDOW_W, WINDOW_H, WINDOW_D = 0.014, 0.011, 0.006
WINDOW_PITCH_ACROSS, WINDOW_PITCH_UP = 0.028, 0.026
WINDOW_LIT_FRACTION = 0.36

#: Flat roof cap thickness, and how far it overhangs the walls. Every
#: stacked seam either overlaps or differs in size: two same-size faces
#: meeting exactly share vertices once the exporter's split vertices are
#: merged, and the validator then reads the seam as non-manifold.
CAP = 0.012
CAP_LIP = 0.004
SEAM = 0.003


# ===========================================
# Seeded randomness
# ===========================================


class Rng:
    """A tiny LCG so a style's jitter and window pattern never change between runs."""

    def __init__(self, seed: int) -> None:
        self.state = (seed * 7919 + 17) & 0x7FFFFFFF

    def next(self) -> float:
        """Uniform float in [0, 1)."""
        self.state = (self.state * 1103515245 + 12345) & 0x7FFFFFFF
        return self.state / 0x7FFFFFFF

    def between(self, lo: float, hi: float) -> float:
        """Uniform float in [lo, hi)."""
        return lo + (hi - lo) * self.next()

    def pick(self, options: tuple[str, ...]) -> str:
        """One of ``options``."""
        return options[min(len(options) - 1, int(self.next() * len(options)))]


# ===========================================
# Template data
# ===========================================


@dataclass(frozen=True)
class Slot:
    """One block position on a scale template, before any style dressing.

    @param x - Centre along X (tiles, plot centre at 0).
    @param y - Centre along Y.
    @param w - Width along X.
    @param d - Depth along Y.
    @param h - Nominal wall height.
    @param role - `house` (rural), `block` (low), `mid` (mid-rise) or `tower`.
    """

    x: float
    y: float
    w: float
    d: float
    h: float
    role: str = "block"


@dataclass(frozen=True)
class EggSite:
    """Where an egg cluster sits: on a roof or on the ground in a gap.

    @param x - Cluster centre along X, before the cluster yaw.
    @param y - Cluster centre along Y.
    @param building - Index into the layout's buildings, or None for ground level.
    @param radius - Radius of the largest egg in the cluster.
    """

    x: float
    y: float
    building: int | None
    radius: float


@dataclass(frozen=True)
class Template:
    """A settlement scale: block slots, the landmark slot, egg sites, web spans and tree spots."""

    slots: tuple[Slot, ...]
    landmark: int | None
    eggs: tuple[EggSite, ...]
    webs: tuple[tuple[int, int], ...]
    trees: tuple[tuple[float, float], ...] = ()


#: Rural: eight houses around open ground, trees between; the landmark
#: (water tower, church, pagoda...) stands at `RURAL_LANDMARK`.
RURAL = Template(
    slots=(
        Slot(-0.10, 0.02, 0.09, 0.14, 0.06, "house"),
        Slot(0.06, -0.12, 0.06, 0.05, 0.04, "house"),
        Slot(0.15, -0.04, 0.05, 0.06, 0.04, "house"),
        Slot(0.05, 0.08, 0.07, 0.05, 0.045, "house"),
        Slot(0.17, 0.12, 0.05, 0.05, 0.04, "house"),
        Slot(-0.05, -0.17, 0.05, 0.05, 0.04, "house"),
        Slot(0.20, -0.15, 0.05, 0.04, 0.035, "house"),
        Slot(-0.14, -0.13, 0.06, 0.05, 0.04, "house"),
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

#: Where the rural landmark and its companion (silo, tank, shrine) stand.
RURAL_LANDMARK = (-0.03, 0.20)
RURAL_COMPANION = (-0.19, 0.08)

#: Town: one mid-rise landmark over a low skyline with a couple of trees.
TOWN = Template(
    slots=(
        Slot(0.02, -0.03, 0.10, 0.10, 0.20, "tower"),
        Slot(-0.12, 0.04, 0.10, 0.08, 0.13, "mid"),
        Slot(0.14, 0.08, 0.08, 0.10, 0.11, "mid"),
        Slot(-0.13, -0.10, 0.09, 0.07, 0.08),
        Slot(0.15, -0.10, 0.09, 0.07, 0.07),
        Slot(0.00, 0.12, 0.11, 0.06, 0.07),
        Slot(-0.03, -0.17, 0.12, 0.06, 0.06),
        Slot(-0.21, -0.01, 0.05, 0.08, 0.06),
        Slot(0.20, -0.01, 0.05, 0.06, 0.05),
        Slot(-0.10, 0.16, 0.08, 0.05, 0.05),
        Slot(0.10, 0.19, 0.07, 0.05, 0.05),
        Slot(0.12, -0.20, 0.07, 0.05, 0.05),
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

#: City: five towers over mid-rises and low blocks, the landmark on slot 0.
CITY = Template(
    slots=(
        Slot(0.03, -0.02, 0.11, 0.11, 0.36, "tower"),
        Slot(-0.11, 0.05, 0.10, 0.10, 0.30, "tower"),
        Slot(0.14, 0.10, 0.09, 0.09, 0.26, "tower"),
        Slot(-0.13, -0.10, 0.10, 0.09, 0.22, "tower"),
        Slot(0.15, -0.10, 0.09, 0.10, 0.20, "tower"),
        Slot(0.00, 0.14, 0.10, 0.08, 0.17, "mid"),
        Slot(0.00, -0.15, 0.12, 0.07, 0.15, "mid"),
        Slot(-0.16, 0.14, 0.07, 0.07, 0.11),
        Slot(0.18, 0.00, 0.06, 0.09, 0.10),
        Slot(-0.21, 0.00, 0.06, 0.08, 0.13, "mid"),
        Slot(0.12, -0.19, 0.08, 0.06, 0.09),
        Slot(-0.10, -0.20, 0.07, 0.05, 0.08),
        Slot(0.05, 0.22, 0.09, 0.05, 0.08),
        Slot(0.15, 0.18, 0.06, 0.05, 0.07),
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
TEMPLATES: dict[str, Template] = {"rural": RURAL, "town": TOWN, "city": CITY}


# ===========================================
# Dressed layout
# ===========================================


@dataclass(frozen=True)
class Building:
    """One dressed block: a slot with its tokens, roof shape and tower profile decided.

    @param roof - `flat`, `pitched`, `hip`, `tin`, `pagoda`, `thatch`, `dome`, `onion` or `none`.
    @param rise - Height of the roof above the eaves (0 for flat).
    @param profile - `box`, `slender`, `stepped`, `slab`, `drum`, `hut`, `stilt` or `veranda`.
    @param accent - Whether this block gets the style's neon accent strip.
    @param skip - True when the landmark replaces the block; nothing is built for it.
    """

    x: float
    y: float
    w: float
    d: float
    h: float
    role: str
    body: str
    roof_token: str
    roof: str
    rise: float
    profile: str = "box"
    accent: bool = False
    skip: bool = False

    @property
    def top(self) -> float:
        """World Z of the eaves / flat roof surface."""
        return GROUND + self.h

    @property
    def crest(self) -> float:
        """World Z of the highest roof point."""
        return self.top + self.rise


@dataclass(frozen=True)
class Layout:
    """A template dressed by a style: what the base and the egg overlay both build from."""

    scale: str
    buildings: tuple[Building, ...]
    landmark: int | None
    eggs: tuple[EggSite, ...]
    webs: tuple[tuple[int, int], ...]
    trees: tuple[tuple[float, float], ...]


@dataclass(frozen=True)
class Style:
    """One regional architectural family.

    @param id - Style id as used in the model id (`overworld.settlement.<id>.<scale>`).
    @param seed - Seed for the style's jitter and window pattern.
    @param house - House profile for rural slots: `box`, `hut`, `stilt`, `veranda` or `log`.
    @param house_roof - Roof kind for houses.
    @param house_bodies - Wall tokens houses are drawn from.
    @param house_roofs - Roof tokens houses are drawn from.
    @param block_roof - Roof kind for low blocks and mid-rises.
    @param block_bodies - Wall tokens low blocks and mid-rises are drawn from.
    @param block_roofs - Roof tokens for those.
    @param tower - Tower profile: `box`, `slender`, `stepped` or `slab`.
    @param tower_bodies - Wall tokens towers are drawn from.
    @param tower_roofs - Cap tokens for towers.
    @param tree - Tree kind: `round`, `pine`, `palm`, `acacia`, `eucalyptus`, `birch` or `none`.
    @param heights - Height multiplier per role.
    @param accent - Neon strip token on some towers, or None.
    @param landmark - Builds the landmark for a scale and returns the beacon point.
    @param extras - Adds style dressing (water tanks, domes, shrines) after the blocks.
    @param replaces - Scales whose landmark slot is left empty for the landmark builder.
    @param skips - Slot indices per scale the style leaves open (a pier, a plaza).
    """

    id: str
    seed: int
    house: str
    house_roof: str
    house_bodies: tuple[str, ...]
    house_roofs: tuple[str, ...]
    block_roof: str
    block_bodies: tuple[str, ...]
    block_roofs: tuple[str, ...]
    tower: str
    tower_bodies: tuple[str, ...]
    tower_roofs: tuple[str, ...]
    tree: str
    landmark: Callable[["Style", Layout], tuple[float, float, float]]
    heights: dict[str, float] = field(default_factory=dict)
    accent: str | None = None
    extras: Callable[["Style", Layout], None] | None = None
    replaces: frozenset[str] = frozenset()
    skips: dict[str, tuple[int, ...]] = field(default_factory=dict)


#: Roof rise as a share of the smaller footprint side, per roof kind.
ROOF_RISE = {
    "flat": 0.0,
    "pitched": 0.55,
    "hip": 0.5,
    "tin": 0.28,
    "pagoda": 0.45,
    "thatch": 0.8,
    "dome": 0.55,
    "onion": 0.7,
    "none": 0.0,
}


def dress(style: Style, scale: str) -> Layout:
    """Apply a style to a scale template: tokens, roof shapes, profiles and seeded jitter.

    Every style jitters block positions and heights from its own seed, so
    two styles on the same template never share a block layout either.
    """
    template = TEMPLATES[scale]
    rng = Rng(style.seed * 31 + len(scale))
    skipped = set(style.skips.get(scale, ()))
    buildings = []
    for i, slot in enumerate(template.slots):
        role = slot.role
        if role == "house":
            bodies, roofs, roof, profile = style.house_bodies, style.house_roofs, style.house_roof, style.house
        elif role == "tower":
            bodies, roofs, roof, profile = style.tower_bodies, style.tower_roofs, "flat", style.tower
        else:
            bodies, roofs, roof, profile = style.block_bodies, style.block_roofs, style.block_roof, "box"
        if profile in ("hut", "stilt", "veranda", "log"):
            roof = {"hut": "thatch", "stilt": "pitched", "veranda": "tin", "log": "pitched"}[profile]
        h = slot.h * style.heights.get(role, 1.0) * rng.between(0.88, 1.14)
        jitter = 0.012 if role != "tower" else 0.006
        x = slot.x + rng.between(-jitter, jitter)
        y = slot.y + rng.between(-jitter, jitter)
        replaced = i == template.landmark and scale in style.replaces
        buildings.append(
            Building(
                x=x,
                y=y,
                w=slot.w,
                d=slot.d,
                h=h,
                role=role,
                body=rng.pick(bodies),
                roof_token=rng.pick(roofs),
                roof=roof,
                rise=min(slot.w, slot.d) * ROOF_RISE[roof],
                profile=profile,
                accent=style.accent is not None and role == "tower" and rng.next() < 0.6,
                skip=replaced or i in skipped,
            )
        )
    return Layout(scale, tuple(buildings), template.landmark, template.eggs, template.webs, template.trees)


# ===========================================
# Mesh primitives
# ===========================================


def _mesh(name: str, verts: list[tuple[float, float, float]], faces: list[tuple[int, ...]], token: str) -> bpy.types.Object:
    """A flat-shaded mesh from explicit vertices and outward-wound faces."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    mesh.materials.append(material(token))
    for poly in mesh.polygons:
        poly.use_smooth = False
    return ob


def prism(name: str, at: tuple[float, float, float], width: float, length: float, rise: float, token: str) -> bpy.types.Object:
    """A ridged roof: a triangular prism along Y with its flat base at ``at`` and its ridge ``rise`` above."""
    x, y, z = at
    hw, hl = width / 2, length / 2
    verts = [(x - hw, y - hl, z), (x + hw, y - hl, z), (x + hw, y + hl, z), (x - hw, y + hl, z), (x, y - hl, z + rise), (x, y + hl, z + rise)]
    faces = [(0, 3, 2, 1), (0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5)]
    return _mesh(name, verts, faces, token)


def pyramid(name: str, at: tuple[float, float, float], width: float, length: float, rise: float, token: str, top: float = 0.0) -> bpy.types.Object:
    """A hipped roof or spire: a rectangular pyramid, optionally truncated to a ``top`` square."""
    x, y, z = at
    hw, hl = width / 2, length / 2
    if top <= 0:
        verts = [(x - hw, y - hl, z), (x + hw, y - hl, z), (x + hw, y + hl, z), (x - hw, y + hl, z), (x, y, z + rise)]
        faces = [(0, 3, 2, 1), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    else:
        tw, tl = top * hw, top * hl
        verts = [
            (x - hw, y - hl, z), (x + hw, y - hl, z), (x + hw, y + hl, z), (x - hw, y + hl, z),
            (x - tw, y - tl, z + rise), (x + tw, y - tl, z + rise), (x + tw, y + tl, z + rise), (x - tw, y + tl, z + rise),
        ]
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return _mesh(name, verts, faces, token)


def dome(name: str, at: tuple[float, float, float], radius: float, token: str, squash: float = 1.0, segments: int = 8) -> None:
    """A half sphere standing on ``at``, cut flat so it stays watertight."""
    x, y, z = at
    d = sphere(name, radius, (x, y, z), token, segments=segments, rings=4, scale=(1, 1, squash), smooth=False)
    cut_below(d, z)


def onion(name: str, at: tuple[float, float, float], radius: float, token: str) -> float:
    """An onion dome with its spike; returns the spike tip Z."""
    x, y, z = at
    d = sphere(name, radius, (x, y, z + radius * 0.75), token, segments=6, rings=4, scale=(1, 1, 1.25), smooth=False)
    cut_below(d, z)
    tip = z + radius * 2.05
    cylinder(f"{name}_spike", 0.0, radius * 0.35, radius * 0.9, 4, (x, y, tip - radius * 0.45), token)
    return tip + radius * 0.0


def spire(name: str, at: tuple[float, float, float], base: float, height: float, token: str) -> float:
    """A four-sided tapering spire; returns the tip Z."""
    x, y, z = at
    pyramid(name, (x, y, z), base, base, height, token)
    return z + height


def beacon(name: str, at: tuple[float, float, float]) -> None:
    """The plot's single orange accent, centred on the top of its landmark."""
    box(name, (BEACON, BEACON, BEACON * 0.6), (at[0], at[1], at[2] + BEACON * 0.3), "tdf-orange")


# ===========================================
# Windows
# ===========================================


def windows(name: str, x: float, y: float, w: float, d: float, z0: float, z1: float, rng: Rng, accent: str | None = None) -> None:
    """Lit windows on the front (-Y), east (+X) and west (-X) faces of a box between ``z0`` and ``z1``.

    A deterministic generator lights `WINDOW_LIT_FRACTION` of the cells;
    every lit window is a small box sunk 0.002 into the wall so the join
    stays a closed shell. ``accent`` adds a vertical neon strip on the front.
    """
    rows = max(0, int((z1 - z0 - 0.02) // WINDOW_PITCH_UP))
    for face, span in (("f", w), ("e", d), ("w", d)):
        cols = max(1, int((span - 0.016) // WINDOW_PITCH_ACROSS))
        start = -(cols - 1) / 2 * WINDOW_PITCH_ACROSS
        for row in range(rows):
            z = z0 + 0.012 + row * WINDOW_PITCH_UP + WINDOW_H / 2
            if z + WINDOW_H / 2 > z1 - 0.006:
                break
            for col in range(cols):
                if rng.next() > WINDOW_LIT_FRACTION:
                    continue
                along = start + col * WINDOW_PITCH_ACROSS
                if face == "f":
                    at, size = (x + along, y - d / 2 - WINDOW_D / 2 + 0.002, z), (WINDOW_W, WINDOW_D, WINDOW_H)
                elif face == "e":
                    at, size = (x + w / 2 + WINDOW_D / 2 - 0.002, y + along, z), (WINDOW_D, WINDOW_W, WINDOW_H)
                else:
                    at, size = (x - w / 2 - WINDOW_D / 2 + 0.002, y + along, z), (WINDOW_D, WINDOW_W, WINDOW_H)
                box(f"{name}_w{face}{row}{col}", size, at, WINDOW_TOKEN)
    if accent and z1 - z0 > 0.1:
        strip = (z1 - z0) * 0.7
        box(f"{name}_neon", (0.008, WINDOW_D, strip), (x + w * 0.3, y - d / 2 - WINDOW_D / 2 + 0.002, z0 + (z1 - z0) * 0.55), accent)


# ===========================================
# Block builders
# ===========================================


def roof(name: str, b: Building, x: float, y: float, w: float, d: float, z: float, token: str) -> None:
    """The roof for a block of the given footprint at eaves height ``z``, by the block's roof kind."""
    kind = b.roof
    if kind == "flat":
        box(f"{name}_roof", (w + CAP_LIP, d + CAP_LIP, CAP), (x, y, z - CAP / 2), token)
    elif kind == "pitched":
        prism(f"{name}_roof", (x, y, z), w + 0.012, d + 0.012, b.rise, token)
    elif kind == "hip":
        pyramid(f"{name}_roof", (x, y, z), w + 0.012, d + 0.012, b.rise, token, top=0.18)
    elif kind == "tin":
        prism(f"{name}_roof", (x, y, z), w + 0.028, d + 0.02, b.rise, token)
    elif kind == "pagoda":
        pyramid(f"{name}_roof", (x, y, z), w + 0.03, d + 0.03, b.rise * 0.55, token, top=0.35)
        box(f"{name}_loft", (w * 0.62, d * 0.62, b.rise * 0.3), (x, y, z + b.rise * 0.55 + b.rise * 0.15), b.body)
        pyramid(f"{name}_roof2", (x, y, z + b.rise * 0.85), w * 0.62 + 0.024, d * 0.62 + 0.024, b.rise * 0.4, token, top=0.2)
    elif kind == "thatch":
        cylinder(f"{name}_roof", 0.0, max(w, d) * 0.62, b.rise, 6, (x, y, z + b.rise / 2), token)
    elif kind == "dome":
        box(f"{name}_cap", (w + CAP_LIP, d + CAP_LIP, CAP), (x, y, z - CAP / 2), b.body)
        dome(f"{name}_roof", (x, y, z), min(w, d) * 0.5, token, squash=0.9)
    elif kind == "onion":
        box(f"{name}_cap", (w + CAP_LIP, d + CAP_LIP, CAP), (x, y, z - CAP / 2), b.body)
        onion(f"{name}_roof", (x, y, z), min(w, d) * 0.4, token)


def house(name: str, b: Building, rng: Rng) -> None:
    """A rural house by profile: a box under its roof, a round hut, a stilt house or a veranda house."""
    if b.profile == "hut":
        r = min(b.w, b.d) * 0.55
        cylinder(f"{name}_body", r, r, b.h, 6, (b.x, b.y, GROUND + b.h / 2), b.body)
        cylinder(f"{name}_roof", 0.0, r + 0.008, b.rise, 6, (b.x, b.y, b.top + b.rise / 2), b.roof_token)
        return
    z0 = GROUND
    if b.profile == "stilt":
        z0 = GROUND + 0.02
        for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            box(f"{name}_post{sx:+}{sy:+}", (0.008, 0.008, 0.022), (b.x + sx * b.w * 0.38, b.y + sy * b.d * 0.38, GROUND + 0.011), "env-bark")
    body_h = b.h - CAP + SEAM if b.roof == "flat" else b.h
    box(f"{name}_body", (b.w, b.d, body_h), (b.x, b.y, z0 + body_h / 2), b.body)
    roof(name, b, b.x, b.y, b.w, b.d, z0 + b.h, b.roof_token)
    if b.profile == "veranda":
        box(f"{name}_deck", (b.w + 0.03, 0.012, 0.01), (b.x, b.y - b.d / 2 - 0.006, z0 + 0.005), "env-bark")
    windows(name, b.x, b.y, b.w, b.d, z0, z0 + b.h, rng)


def block(name: str, b: Building, rng: Rng, accent: str | None) -> None:
    """A low block, mid-rise or tower by profile, with its roof and lit windows."""
    if b.role == "house":
        house(name, b, rng)
        return
    if b.profile == "slender":
        w, d, h = b.w * 0.74, b.d * 0.74, b.h * 1.12
        box(f"{name}_body", (w, d, h), (b.x, b.y, GROUND + h / 2), b.body)
        pyramid(f"{name}_cap", (b.x, b.y, GROUND + h - SEAM), w + CAP_LIP, d + CAP_LIP, 0.03, b.roof_token, top=0.3)
        windows(name, b.x, b.y, w, d, GROUND, GROUND + h, rng, accent if b.accent else None)
    elif b.profile == "stepped":
        tiers = ((1.0, 0.55), (0.76, 0.3), (0.52, 0.15))
        z = GROUND
        for i, (shrink, share) in enumerate(tiers):
            w, d, h = b.w * shrink, b.d * shrink, b.h * share
            box(f"{name}_tier{i}", (w, d, h), (b.x, b.y, z + h / 2), b.body)
            windows(f"{name}_t{i}", b.x, b.y, w, d, z, z + h, rng)
            z += h
        box(f"{name}_roof", (b.w * 0.52 + CAP_LIP, b.d * 0.52 + CAP_LIP, CAP), (b.x, b.y, z + CAP / 2 - SEAM), b.roof_token)
    elif b.profile == "slab":
        w, d, h = b.w * 1.3, b.d * 0.68, b.h * 0.85
        box(f"{name}_body", (w, d, h - CAP + SEAM), (b.x, b.y, GROUND + (h - CAP + SEAM) / 2), b.body)
        box(f"{name}_roof", (w + CAP_LIP, d + CAP_LIP, CAP), (b.x, b.y, GROUND + h - CAP / 2), b.roof_token)
        windows(name, b.x, b.y, w, d, GROUND, GROUND + h - CAP, rng)
    else:
        flat = b.roof == "flat"
        h = b.h - CAP + SEAM if flat else b.h
        box(f"{name}_body", (b.w, b.d, h), (b.x, b.y, GROUND + h / 2), b.body)
        roof(name, b, b.x, b.y, b.w, b.d, GROUND + b.h, b.roof_token)
        windows(name, b.x, b.y, b.w, b.d, GROUND, GROUND + b.h - CAP, rng, accent if b.accent else None)


# ===========================================
# Trees
# ===========================================


def tree(name: str, kind: str, x: float, y: float) -> None:
    """A tree of the style's kind at ``(x, y)`` on the ground."""
    if kind == "none":
        return
    if kind == "pine":
        cylinder(f"{name}_trunk", 0.005, 0.006, 0.02, 5, (x, y, GROUND + 0.01), "env-bark")
        cylinder(f"{name}_crown", 0.0, 0.02, 0.05, 6, (x, y, GROUND + 0.02 + 0.025), "env-foliage")
    elif kind == "palm":
        cylinder(f"{name}_trunk", 0.005, 0.007, 0.05, 5, (x, y, GROUND + 0.025), "env-palm-trunk")
        sphere(f"{name}_crown", 0.026, (x, y, GROUND + 0.052), "env-tropical-leaf", segments=6, rings=3, scale=(1, 1, 0.45))
    elif kind == "acacia":
        cylinder(f"{name}_trunk", 0.005, 0.006, 0.04, 5, (x, y, GROUND + 0.02), "env-bark")
        sphere(f"{name}_crown", 0.03, (x, y, GROUND + 0.046), "env-scrub", segments=6, rings=3, scale=(1.2, 1.2, 0.35))
    elif kind == "eucalyptus":
        cylinder(f"{name}_trunk", 0.005, 0.006, 0.04, 5, (x, y, GROUND + 0.02), "env-tuart-bark")
        sphere(f"{name}_crown", 0.022, (x, y, GROUND + 0.055), "env-sclerophyll-leaf", segments=6, rings=4, scale=(1, 1, 1.1))
    elif kind == "birch":
        cylinder(f"{name}_trunk", 0.005, 0.006, 0.035, 5, (x, y, GROUND + 0.0175), "env-snow")
        sphere(f"{name}_crown", 0.022, (x, y, GROUND + 0.05), "env-foliage", segments=6, rings=4, scale=(0.8, 0.8, 1.1))
    else:
        cylinder(f"{name}_trunk", 0.006, 0.007, 0.03, 5, (x, y, GROUND + 0.015), "env-bark")
        sphere(f"{name}_crown", 0.026, (x, y, GROUND + 0.048), "env-foliage", segments=6, rings=4, scale=(1, 1, 0.9))


# ===========================================
# Cluster yaw and join
# ===========================================


def yaw_and_join(name: str) -> None:
    """Turn every mesh by `CLUSTER_YAW` about the plot centre and join them into one object.

    One object per model keeps the scene to a handful of draw calls per
    settlement: the exporter writes one primitive per material, not one
    per window.
    """
    turn = Matrix.Rotation(CLUSTER_YAW, 4, "Z")
    bpy.ops.object.select_all(action="DESELECT")
    turned = []
    for ob in mesh_objects():
        ob.matrix_world = turn @ ob.matrix_world
        ob.select_set(True)
        turned.append(ob)
    if not turned:
        return
    bpy.context.view_layer.objects.active = turned[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    join(turned, name)


def build_settlement(style: Style, scale: str) -> None:
    """Build the base model for one style and scale: blocks with windows, trees, extras, landmark, beacon."""
    layout = dress(style, scale)
    rng = Rng(style.seed * 131 + len(scale) * 7)
    for i, b in enumerate(layout.buildings):
        if not b.skip:
            block(f"block{i}", b, rng, style.accent)
    for i, (x, y) in enumerate(layout.trees):
        tree(f"tree{i}", style.tree, x, y)
    if style.extras:
        style.extras(style, layout)
    beacon("beacon", style.landmark(style, layout))
    yaw_and_join("settlement")


# ===========================================
# Egg overlay builders
# ===========================================


def egg(name: str, at: tuple[float, float, float], radius: float) -> None:
    """One ovoid egg standing on ``at`` with a magenta glow spot on its crown."""
    x, y, z = at
    height = radius * 1.35
    sphere(name, radius, (x, y, z + height), "bug-flesh-light", segments=6, rings=3, scale=(1, 1, height / radius), smooth=True)
    sphere(f"{name}_glow", radius * 0.42, (x, y, z + height * 1.75), "bug-bio-magenta", segments=4, rings=3, scale=(1, 1, 0.55))


def cluster(name: str, at: tuple[float, float, float], radius: float, mound: bool) -> None:
    """Three eggs of falling size around a centre, optionally on a flesh mound rooted in the ground."""
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


def roost(b: Building) -> float:
    """The Z an egg cluster stands at on a building: the flat roof, or part-way up a shaped roof."""
    return b.top if b.roof == "flat" else b.top + b.rise * 0.35


def roof_edge(b: Building, toward: Building) -> Vector:
    """The point on ``b``'s roof edge facing ``toward``, pulled in a little so the strand roots."""
    dx, dy = toward.x - b.x, toward.y - b.y
    inset = 0.012
    if b.roof != "flat":
        return Vector((b.x, b.y, b.crest * 0.97))
    if abs(dx) >= abs(dy):
        return Vector((b.x + math.copysign(b.w / 2 - inset, dx), b.y, b.top))
    return Vector((b.x, b.y + math.copysign(b.d / 2 - inset, dy), b.top))


def web(name: str, a: Building, b: Building) -> None:
    """Bridge the gap between two roofs from the edges that face each other."""
    lift = Vector((0, 0, 0.005))
    strand(name, roof_edge(a, b) + lift, roof_edge(b, a) + lift)


def build_settlement_eggs(style: Style, scale: str) -> None:
    """Build the egg overlay for one style and scale over the matching dressed layout.

    Nothing here touches the buildings: clusters stand on roofs or on the
    ground in a gap, and strands span only the gaps. The overlay is yawed
    exactly as the base, so it lands where the base's roofs and gaps are.
    A site on a block the style left open drops to the ground there.
    """
    layout = dress(style, scale)
    for i, site in enumerate(layout.eggs):
        b = None if site.building is None else layout.buildings[site.building]
        if b is None or b.skip:
            cluster(f"cluster{i}", (site.x, site.y, GROUND), site.radius, mound=True)
        else:
            cluster(f"cluster{i}", (b.x, b.y, roost(b)), site.radius, mound=False)
    for i, (a, b) in enumerate(layout.webs):
        web(f"web{i}", layout.buildings[a], layout.buildings[b])
    yaw_and_join("settlement_eggs")


__all__ = [
    "Building",
    "GROUND",
    "Layout",
    "RURAL_COMPANION",
    "RURAL_LANDMARK",
    "Rng",
    "Style",
    "beacon",
    "box",
    "build_settlement",
    "build_settlement_eggs",
    "cylinder",
    "dome",
    "dress",
    "onion",
    "prism",
    "pyramid",
    "replace",
    "sphere",
    "spire",
    "tree",
]
