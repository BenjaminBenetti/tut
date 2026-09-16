"""The ten regional architectural families for the settlement markers (#1155).

Each `Style` here matches a concept sheet under `docs/design/concepts/`
(`overworld-settlement-<style>.md`) and is applied to the three scale
templates by `settlement_parts.dress`. What a family keeps at 30 px:

    style             rural                 town                  city landmark
    ─────────────────────────────────────────────────────────────────────────────
    north-american    clapboard, barn, silo brick boxes, tanks    stepped tower + needle
    european          ochre roofs, church   cathedral twin spires iron lattice tower
    slavic            log houses, onion     panel slabs, onion    wedding-cake tower + spire
    middle-eastern    sand cubes, dome      mosque + 2 minarets   tapering needle, 4 minarets
    african           thatched huts, acacia tin roofs, radio mast drum tower, rounded crown
    south-asian       pastel, shikhara      gopuram, white dome   lotus-crown glass tower
    east-asian        pagoda roofs, torii   castle keep           red-white lattice tower, neon
    southeast-asian   stilt houses, stupa   tiered temple, stupa  twin towers with sky bridge
    latin-american    bright cubes, church  cathedral + dome      summit monument on a hill
    oceanian          veranda, windmill     tin-roof sprawl       needle with disc, sail shells

Region → style lives in `src/graphics/data/settlement-styles.ts`.
"""

from __future__ import annotations

from settlement_parts import (
    GROUND,
    RURAL_COMPANION,
    RURAL_LANDMARK,
    Building,
    Layout,
    Style,
    box,
    cylinder,
    dome,
    onion,
    prism,
    pyramid,
    sphere,
    spire,
)

# ===========================================
# Shared landmark pieces
# ===========================================


def water_tower(name: str, x: float, y: float) -> float:
    """A water tower: four legs, a steel tank, a cone lid. Returns the lid apex Z."""
    z0, z1 = 0.09, 0.14
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        box(f"{name}_leg{sx:+}{sy:+}", (0.010, 0.010, z0), (x + sx * 0.026, y + sy * 0.026, GROUND + z0 / 2), "env-metal")
    cylinder(f"{name}_tank", 0.04, 0.04, z1 - z0, 8, (x, y, GROUND + (z0 + z1) / 2), "env-metal")
    lid = 0.018
    cylinder(f"{name}_lid", 0.005, 0.042, lid, 8, (x, y, GROUND + z1 + lid / 2), "env-roof")
    return GROUND + z1 + lid


def silo(name: str, x: float, y: float) -> None:
    """A steel grain silo: a tall drum with a shallow cone lid."""
    height = 0.12
    cylinder(f"{name}_drum", 0.026, 0.026, height, 8, (x, y, GROUND + height / 2), "env-metal")
    cylinder(f"{name}_lid", 0.004, 0.028, 0.016, 8, (x, y, GROUND + height + 0.008), "env-roof")


def church(name: str, x: float, y: float, body: str, roof_token: str, tower_h: float, spire_h: float, spire_token: str) -> float:
    """A nave under a pitched roof with one square tower and a spire on the front corner. Returns the tip Z."""
    box(f"{name}_nave", (0.05, 0.09, 0.045), (x, y, GROUND + 0.0225), body)
    prism(f"{name}_roof", (x, y, GROUND + 0.045), 0.06, 0.1, 0.03, roof_token)
    tx, ty = x, y - 0.055
    box(f"{name}_tower", (0.03, 0.03, tower_h), (tx, ty, GROUND + tower_h / 2), body)
    return spire(f"{name}_spire", (tx, ty, GROUND + tower_h), 0.034, spire_h, spire_token)


def twin_tower_cathedral(name: str, x: float, y: float, body: str, roof_token: str, spire_token: str, with_dome: bool) -> float:
    """A cathedral: a nave, two front towers with spires and optionally a crossing dome. Returns the taller tip Z."""
    box(f"{name}_nave", (0.07, 0.11, 0.06), (x, y, GROUND + 0.03), body)
    prism(f"{name}_roof", (x, y, GROUND + 0.06), 0.08, 0.12, 0.03, roof_token)
    tip = GROUND
    for i, sx in enumerate((-1, 1)):
        tx, ty = x + sx * 0.026, y - 0.062
        box(f"{name}_tower{i}", (0.026, 0.026, 0.1), (tx, ty, GROUND + 0.05), body)
        tip = spire(f"{name}_spire{i}", (tx, ty, GROUND + 0.1), 0.03, 0.045, spire_token)
    if with_dome:
        dome(f"{name}_dome", (x, y + 0.01, GROUND + 0.09), 0.026, roof_token)
        box(f"{name}_drum", (0.04, 0.04, 0.03), (x, y + 0.01, GROUND + 0.075), body)
    return tip


def minaret(name: str, x: float, y: float, height: float, body: str, cap: str) -> float:
    """A slender six-sided minaret with a balcony ring and a cone cap. Returns the cap tip Z."""
    cylinder(f"{name}_shaft", 0.009, 0.011, height, 6, (x, y, GROUND + height / 2), body)
    cylinder(f"{name}_balcony", 0.014, 0.014, 0.008, 6, (x, y, GROUND + height * 0.8), body)
    cylinder(f"{name}_cap", 0.0, 0.012, 0.03, 6, (x, y, GROUND + height + 0.015), cap)
    return GROUND + height + 0.03


def mosque(name: str, x: float, y: float, size: float, minarets: int, body: str, dome_token: str) -> float:
    """A prayer hall with a big dome and ``minarets`` (2 or 4) at its corners. Returns the tallest tip Z."""
    h = size * 0.5
    box(f"{name}_hall", (size, size, h), (x, y, GROUND + h / 2), body)
    dome(f"{name}_dome", (x, y, GROUND + h), size * 0.42, dome_token)
    corners = ((-1, -1), (1, -1)) if minarets == 2 else ((-1, -1), (1, -1), (-1, 1), (1, 1))
    tip = GROUND
    for i, (sx, sy) in enumerate(corners):
        tip = minaret(f"{name}_min{i}", x + sx * size * 0.55, y + sy * size * 0.55, size * 1.6, body, dome_token)
    return tip


def lattice_tower(name: str, x: float, y: float, height: float, base: float, token: str, bands: tuple[str, ...] = ()) -> float:
    """A four-sided tapering lattice tower with two platforms; ``bands`` recolour the tiers. Returns the tip Z."""
    tiers = ((0.0, 0.35, 1.0, 0.45), (0.35, 0.7, 0.45, 0.2), (0.7, 1.0, 0.2, 0.06))
    for i, (z0, z1, w0, w1) in enumerate(tiers):
        token_i = bands[i % len(bands)] if bands else token
        sink = 0.004 if i else 0.0  # each tier roots inside the one below, so no seam shares vertices
        pyramid(f"{name}_tier{i}", (x, y, GROUND + height * z0 - sink), base * w0, base * w0, height * (z1 - z0) + sink, token_i, top=w1 / w0)
        if i < 2:
            box(f"{name}_deck{i}", (base * w1 * 1.3, base * w1 * 1.3, 0.01), (x, y, GROUND + height * z1 + 0.005), token)
    return GROUND + height


def stepped_pyramid(name: str, x: float, y: float, base: float, tiers: int, height: float, token: str) -> float:
    """A tiered pyramid (a shikhara or gopuram): ``tiers`` shrinking boxes. Returns the top Z."""
    z = GROUND
    for i in range(tiers):
        shrink = 1 - i / tiers * 0.75
        h = height / tiers
        box(f"{name}_tier{i}", (base * shrink, base * shrink, h), (x, y, z + h / 2), token)
        z += h
    return z


def pagoda(name: str, x: float, y: float, tiers: int, base: float, tier_h: float, body: str, roof_token: str) -> float:
    """A multi-storey pagoda: a square core and stacked wide-eave roofs shrinking upward. Returns the finial tip Z."""
    z = GROUND
    for i in range(tiers):
        shrink = 1 - i * 0.12
        box(f"{name}_core{i}", (base * shrink * 0.6, base * shrink * 0.6, tier_h), (x, y, z + tier_h / 2), body)
        z += tier_h
        pyramid(f"{name}_roof{i}", (x, y, z), base * shrink, base * shrink, tier_h * 0.5, roof_token, top=0.35)
        z += tier_h * 0.5
    return spire(f"{name}_finial", (x, y, z), base * 0.2, 0.03, "env-metal")


def stupa(name: str, x: float, y: float, radius: float, token: str) -> float:
    """A bell-shaped golden stupa on a square plinth with a tapering spire. Returns the tip Z."""
    box(f"{name}_plinth", (radius * 2.6, radius * 2.6, 0.012), (x, y, GROUND + 0.006), "env-sidewalk")
    s = sphere(f"{name}_bell", radius, (x, y, GROUND + 0.012 + radius * 0.65), token, segments=8, rings=4, scale=(1, 1, 1.15))
    from settlement_parts import cut_below

    cut_below(s, GROUND + 0.012)
    z = GROUND + 0.012 + radius * 1.75
    cylinder(f"{name}_spire", 0.0, radius * 0.5, radius * 1.6, 6, (x, y, z + radius * 0.8), token)
    return z + radius * 1.6


def mound(name: str, x: float, y: float, radius: float, height: float, token: str) -> None:
    """A low hill: a squashed sphere cut at the ground."""
    from settlement_parts import cut_below

    m = sphere(name, radius, (x, y, GROUND), token, segments=8, rings=4, scale=(1, 1, height / radius))
    cut_below(m, GROUND)


def landmark_slot(layout: Layout) -> Building:
    """The building the landmark stands on or replaces."""
    assert layout.landmark is not None
    return layout.buildings[layout.landmark]


# ===========================================
# North American
# ===========================================


def na_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural water tower; town beacon on the glass slab; city a stepped tower with a needle."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, water_tower("tower", x, y))
    b = landmark_slot(layout)
    if layout.scale == "town":
        return (b.x, b.y, b.top)
    z = GROUND
    for i, (shrink, share) in enumerate(((1.0, 0.5), (0.72, 0.28), (0.5, 0.17))):
        h = b.h * share * 1.15
        box(f"landmark_tier{i}", (b.w * shrink, b.d * shrink, h), (b.x, b.y, z + h / 2), "tdf-grey-light")
        from settlement_parts import Rng, windows

        windows(f"landmark_t{i}", b.x, b.y, b.w * shrink, b.d * shrink, z, z + h, Rng(style.seed + i))
        z += h
    return (b.x, b.y, spire("landmark_needle", (b.x, b.y, z), b.w * 0.3, 0.07, "tdf-grey-light"))


def na_extras(style: Style, layout: Layout) -> None:
    """A barn and silo on the farm; rooftop water tanks in town and city."""
    if layout.scale == "rural":
        silo("silo", *RURAL_COMPANION)
        return
    for i, b in enumerate(layout.buildings):
        if b.role == "block" and i % 3 == 1 and not b.skip:
            cylinder(f"tank{i}", 0.01, 0.01, 0.02, 6, (b.x + b.w * 0.2, b.y, b.top + 0.014), "env-metal")


NORTH_AMERICAN = Style(
    id="north-american",
    seed=11,
    house="box",
    house_roof="pitched",
    house_bodies=("env-plaster-warm", "env-sidewalk", "env-brick"),
    house_roofs=("env-roof", "tdf-grey-mid"),
    block_roof="flat",
    block_bodies=("env-brick", "env-concrete", "env-brick", "env-sidewalk"),
    block_roofs=("env-roof", "tdf-grey-mid"),
    tower="box",
    tower_bodies=("env-glass", "tdf-grey-light", "env-glass", "env-concrete"),
    tower_roofs=("tdf-grey-mid",),
    tree="round",
    heights={"tower": 1.1},
    landmark=na_landmark,
    extras=na_extras,
    replaces=frozenset({"city"}),
)


# ===========================================
# European
# ===========================================


def eu_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural village church; town cathedral with twin spires; city iron lattice tower."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, church("church", x, y, "env-sidewalk", "env-rust", 0.07, 0.05, "tdf-grey-mid"))
    b = landmark_slot(layout)
    if layout.scale == "town":
        return (b.x, b.y, twin_tower_cathedral("cathedral", b.x, b.y, "env-sidewalk", "env-roof", "tdf-grey-mid", with_dome=False))
    return (b.x, b.y, lattice_tower("lattice", b.x, b.y, 0.4, 0.13, "env-metal"))


def eu_extras(style: Style, layout: Layout) -> None:
    """A copper dome over one mid-rise in the city; a windmill on the farm."""
    if layout.scale == "rural":
        x, y = RURAL_COMPANION
        cylinder("mill_body", 0.014, 0.02, 0.06, 6, (x, y, GROUND + 0.03), "env-sidewalk")
        for i in range(2):
            box(f"mill_sail{i}", (0.004, 0.07 if i == 0 else 0.004, 0.004 if i == 0 else 0.07), (x, y - 0.024, GROUND + 0.062), "env-bark")
        return
    if layout.scale == "city":
        b = layout.buildings[5]
        dome("dome", (b.x, b.y, b.top), min(b.w, b.d) * 0.42, "env-roof-green")


EUROPEAN = Style(
    id="european",
    seed=23,
    house="box",
    house_roof="pitched",
    house_bodies=("env-plaster-warm", "env-sidewalk", "env-limestone"),
    house_roofs=("env-rust", "env-rust", "tdf-orange-dim"),
    block_roof="pitched",
    block_bodies=("env-plaster-warm", "env-sidewalk", "env-limestone", "env-concrete"),
    block_roofs=("env-rust", "tdf-orange-dim", "env-roof"),
    tower="box",
    tower_bodies=("env-glass", "env-concrete"),
    tower_roofs=("tdf-grey-mid",),
    tree="round",
    heights={"tower": 0.72, "mid": 0.75},
    landmark=eu_landmark,
    extras=eu_extras,
    replaces=frozenset({"town", "city"}),
)


# ===========================================
# Slavic (Eastern Europe, Russia, Central Asia)
# ===========================================


def onion_church(name: str, x: float, y: float, size: float, tokens: tuple[str, ...]) -> float:
    """A white church with a cluster of onion domes: one large central, small ones at the corners. Returns the tip Z."""
    h = size * 0.7
    box(f"{name}_hall", (size, size, h), (x, y, GROUND + h / 2), "env-snow")
    tip = onion(f"{name}_dome", (x, y, GROUND + h), size * 0.28, tokens[0])
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        onion(f"{name}_dome{i}", (x + sx * size * 0.34, y + sy * size * 0.34, GROUND + h), size * 0.12, tokens[(i + 1) % len(tokens)])
    return tip


def sl_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural and town onion-domed church; city a wedding-cake tower with a spire."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, onion_church("church", x, y, 0.07, ("bug-bone", "tdf-visor")))
    b = landmark_slot(layout)
    if layout.scale == "town":
        return (b.x, b.y, onion_church("church", b.x, b.y, 0.1, ("bug-bone", "tdf-visor", "env-rust")))
    z = GROUND
    for i, (shrink, share) in enumerate(((1.15, 0.42), (0.8, 0.3), (0.5, 0.18))):
        h = b.h * share
        box(f"landmark_tier{i}", (b.w * shrink, b.d * shrink, h), (b.x, b.y, z + h / 2), "env-plaster-warm")
        from settlement_parts import Rng, windows

        windows(f"landmark_t{i}", b.x, b.y, b.w * shrink, b.d * shrink, z, z + h, Rng(style.seed + i))
        z += h
    return (b.x, b.y, spire("landmark_spire", (b.x, b.y, z), b.w * 0.36, 0.09, "env-plaster-warm"))


def sl_extras(style: Style, layout: Layout) -> None:
    """A small onion cathedral among the city slabs."""
    if layout.scale == "city":
        b = layout.buildings[11]
        onion_church("cathedral", b.x, b.y - 0.01, 0.075, ("tdf-visor", "bug-bone", "env-rust"))


SLAVIC = Style(
    id="slavic",
    seed=37,
    house="log",
    house_roof="pitched",
    house_bodies=("env-bark", "env-dirt", "env-bark"),
    house_roofs=("env-roof", "env-roof-green", "env-rust"),
    block_roof="flat",
    block_bodies=("tdf-grey-light", "env-sidewalk", "env-concrete"),
    block_roofs=("env-roof", "tdf-grey-mid"),
    tower="slab",
    tower_bodies=("tdf-grey-light", "env-plaster-warm", "env-concrete"),
    tower_roofs=("tdf-grey-mid",),
    tree="pine",
    heights={"tower": 0.8, "mid": 0.9},
    landmark=sl_landmark,
    extras=sl_extras,
    replaces=frozenset({"town", "city"}),
    skips={"city": (11,)},
)


# ===========================================
# Middle Eastern
# ===========================================


def me_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural domed shrine; town mosque with two minarets; city a tapering needle tower."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, mosque("shrine", x, y, 0.06, 2, "env-sand", "env-water-shallow"))
    b = landmark_slot(layout)
    if layout.scale == "town":
        return (b.x, b.y, mosque("mosque", b.x, b.y, 0.09, 2, "env-limestone", "env-water-shallow"))
    z = GROUND
    r = b.w * 0.5
    for i, (radius, share) in enumerate(((1.0, 0.4), (0.7, 0.3), (0.45, 0.2))):
        h = b.h * share * 1.35
        cylinder(f"landmark_tier{i}", r * radius * 0.85, r * radius, h, 8, (b.x, b.y, z + h / 2), "env-glass")
        z += h
    cylinder("landmark_needle", 0.0, r * 0.35, 0.09, 8, (b.x, b.y, z + 0.045), "tdf-grey-light")
    return (b.x, b.y, z + 0.09)


def me_extras(style: Style, layout: Layout) -> None:
    """A courtyard wall on the farm; a grand mosque with four minarets in the city; small domes on blocks."""
    if layout.scale == "rural":
        x, y = RURAL_COMPANION
        box("wall_s", (0.08, 0.006, 0.018), (x, y - 0.03, GROUND + 0.009), "env-sand")
        box("wall_w", (0.006, 0.06, 0.018), (x - 0.04, y, GROUND + 0.009), "env-sand")
        return
    if layout.scale == "city":
        b = layout.buildings[11]
        mosque("grand", b.x, b.y, 0.08, 4, "env-limestone", "env-water-shallow")
    for i, b in enumerate(layout.buildings):
        if b.role == "block" and i % 2 == 0 and not b.skip:
            dome(f"dome{i}", (b.x, b.y, b.top), min(b.w, b.d) * 0.3, "env-sand")


MIDDLE_EASTERN = Style(
    id="middle-eastern",
    seed=41,
    house="box",
    house_roof="flat",
    house_bodies=("env-sand", "env-limestone", "env-sand", "env-plaster-warm"),
    house_roofs=("env-sand", "env-limestone"),
    block_roof="flat",
    block_bodies=("env-sand", "env-limestone", "env-plaster-warm"),
    block_roofs=("env-sand", "env-limestone"),
    tower="box",
    tower_bodies=("env-limestone", "env-glass", "env-sand"),
    tower_roofs=("env-limestone",),
    tree="palm",
    heights={"tower": 0.95},
    landmark=me_landmark,
    extras=me_extras,
    replaces=frozenset({"town", "city"}),
    skips={"city": (11,)},
)


# ===========================================
# African
# ===========================================


def af_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural water tank on a stand; town radio mast; city drum tower with a rounded crown."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            box(f"stand{sx:+}{sy:+}", (0.008, 0.008, 0.05), (x + sx * 0.018, y + sy * 0.018, GROUND + 0.025), "env-metal")
        cylinder("tank", 0.028, 0.028, 0.03, 8, (x, y, GROUND + 0.065), "env-metal")
        return (x, y, GROUND + 0.08)
    b = landmark_slot(layout)
    if layout.scale == "town":
        cylinder("mast", 0.003, 0.012, 0.2, 4, (b.x, b.y, GROUND + 0.1), "env-metal")
        for i, z in enumerate((0.07, 0.13)):
            box(f"mast_cross{i}", (0.04, 0.006, 0.004), (b.x, b.y, GROUND + z), "env-metal")
        return (b.x, b.y, GROUND + 0.2)
    r = min(b.w, b.d) * 0.55
    cylinder("landmark_drum", r, r, b.h, 8, (b.x, b.y, GROUND + b.h / 2), "env-glass")
    dome("landmark_crown", (b.x, b.y, GROUND + b.h - 0.004), r * 0.96, "tdf-grey-light", squash=0.6)
    return (b.x, b.y, GROUND + b.h + r * 0.6)


def af_extras(style: Style, layout: Layout) -> None:
    """A stick fence around the compound; a stadium ring in the city."""
    if layout.scale == "rural":
        x, y = RURAL_COMPANION
        box("fence_n", (0.1, 0.005, 0.012), (x + 0.02, y + 0.05, GROUND + 0.006), "env-bark")
        box("fence_w", (0.005, 0.1, 0.012), (x - 0.03, y, GROUND + 0.006), "env-bark")
        return
    if layout.scale == "city":
        b = layout.buildings[12]
        cylinder("stadium", 0.045, 0.045, 0.025, 8, (b.x, b.y, GROUND + 0.0125), "env-concrete")
        cylinder("stadium_bowl", 0.03, 0.03, 0.008, 8, (b.x, b.y, GROUND + 0.029), "env-grass")


AFRICAN = Style(
    id="african",
    seed=53,
    house="hut",
    house_roof="thatch",
    house_bodies=("env-rust", "env-dirt", "env-sand"),
    house_roofs=("bug-chitin-tan", "bug-chitin-light"),
    block_roof="tin",
    block_bodies=("env-concrete", "tdf-orange", "env-water-shallow", "env-plaster-warm", "env-sidewalk"),
    block_roofs=("env-rust", "env-metal", "env-rust"),
    tower="box",
    tower_bodies=("env-glass", "env-concrete", "env-plaster-warm"),
    tower_roofs=("tdf-grey-mid",),
    tree="acacia",
    heights={"tower": 0.9, "mid": 0.9},
    landmark=af_landmark,
    extras=af_extras,
    replaces=frozenset({"town", "city"}),
    skips={"city": (12,)},
)


# ===========================================
# South Asian
# ===========================================


def sa_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural stepped shikhara; town tall gopuram; city glass tower with a stepped lotus crown."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, stepped_pyramid("shikhara", x, y, 0.05, 5, 0.1, "tdf-orange-dim"))
    b = landmark_slot(layout)
    if layout.scale == "town":
        return (b.x, b.y, stepped_pyramid("gopuram", b.x, b.y, 0.09, 6, 0.2, "tdf-orange-dim"))
    h = b.h * 0.9
    box("landmark_body", (b.w, b.d, h), (b.x, b.y, GROUND + h / 2), "env-glass")
    from settlement_parts import Rng, windows

    windows("landmark", b.x, b.y, b.w, b.d, GROUND, GROUND + h, Rng(style.seed))
    z = GROUND + h
    for i, shrink in enumerate((1.15, 0.85, 0.55)):
        box(f"landmark_crown{i}", (b.w * shrink, b.d * shrink, 0.02), (b.x, b.y, z + 0.01), "env-plaster-warm")
        z += 0.02
    return (b.x, b.y, z)


def sa_extras(style: Style, layout: Layout) -> None:
    """A white dome with four small minarets in town; a shikhara among the city towers; rooftop tanks."""
    if layout.scale == "town":
        b = layout.buildings[6]
        mosque("tomb", b.x, b.y, 0.07, 4, "env-snow", "env-snow")
    if layout.scale == "city":
        b = layout.buildings[10]
        stepped_pyramid("shikhara", b.x, b.y, 0.055, 5, 0.11, "tdf-orange-dim")
    for i, b in enumerate(layout.buildings):
        if b.role in ("block", "mid") and i % 2 == 1 and not b.skip:
            box(f"tank{i}", (0.014, 0.014, 0.014), (b.x - b.w * 0.25, b.y + b.d * 0.2, b.top + 0.007), "tdf-grey-dark")


SOUTH_ASIAN = Style(
    id="south-asian",
    seed=67,
    house="box",
    house_roof="flat",
    house_bodies=("env-plaster-warm", "env-sidewalk", "env-snow", "env-sand"),
    house_roofs=("env-plaster-warm", "env-sidewalk"),
    block_roof="flat",
    block_bodies=("env-plaster-warm", "env-sand", "env-glass", "tdf-orange", "env-sidewalk", "env-water-shallow"),
    block_roofs=("env-plaster-warm", "env-concrete"),
    tower="slender",
    tower_bodies=("env-plaster-warm", "env-glass", "env-sidewalk"),
    tower_roofs=("env-plaster-warm",),
    tree="round",
    heights={"tower": 1.0},
    landmark=sa_landmark,
    extras=sa_extras,
    replaces=frozenset({"town", "city"}),
    skips={"town": (6,), "city": (10,)},
)


# ===========================================
# East Asian
# ===========================================


def ea_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural five-storey pagoda; town castle keep; city red-and-white lattice tower."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, pagoda("pagoda", x, y, 5, 0.07, 0.02, "env-bark", "tdf-grey-dark"))
    b = landmark_slot(layout)
    if layout.scale == "town":
        pyramid("keep_base", (b.x, b.y, GROUND), 0.12, 0.12, 0.05, "env-rock", top=0.7)
        z = GROUND + 0.05
        for i, shrink in enumerate((1.0, 0.8, 0.6)):
            box(f"keep_floor{i}", (0.08 * shrink, 0.08 * shrink, 0.035), (b.x, b.y, z + 0.0175), "env-snow")
            z += 0.035
            pyramid(f"keep_roof{i}", (b.x, b.y, z), 0.08 * shrink + 0.03, 0.08 * shrink + 0.03, 0.02, "tdf-grey-dark", top=0.45 if i < 2 else 0.0)
            z += 0.02 if i < 2 else 0.02
        return (b.x, b.y, z)
    tip = lattice_tower("lattice", b.x, b.y, 0.46, 0.13, "tdf-orange", bands=("tdf-orange", "env-snow", "tdf-orange"))
    return (b.x, b.y, tip)


def ea_extras(style: Style, layout: Layout) -> None:
    """A torii gate and rice paddy on the farm; a shrine with a pagoda roof in town and city."""
    if layout.scale == "rural":
        x, y = RURAL_COMPANION
        for sx in (-1, 1):
            box(f"torii_post{sx:+}", (0.006, 0.006, 0.04), (x + sx * 0.02, y, GROUND + 0.02), "tdf-orange-dim")
        box("torii_beam", (0.06, 0.008, 0.006), (x, y, GROUND + 0.04), "tdf-orange-dim")
        box("torii_tie", (0.05, 0.007, 0.005), (x, y, GROUND + 0.03), "tdf-orange-dim")
        box("paddy", (0.1, 0.07, 0.004), (0.13, 0.19, GROUND + 0.002), "env-water-shallow")
        return
    i = 9 if layout.scale == "town" else 12
    b = layout.buildings[i]
    box("shrine_hall", (0.05, 0.04, 0.03), (b.x, b.y, GROUND + 0.015), "env-bark")
    pyramid("shrine_roof", (b.x, b.y, GROUND + 0.03), 0.075, 0.065, 0.02, "tdf-grey-dark", top=0.3)


EAST_ASIAN = Style(
    id="east-asian",
    seed=79,
    house="box",
    house_roof="pagoda",
    house_bodies=("env-bark", "env-plaster-warm", "env-bark"),
    house_roofs=("tdf-grey-dark", "tdf-grey-mid"),
    block_roof="flat",
    block_bodies=("env-concrete", "tdf-grey-light", "env-sidewalk"),
    block_roofs=("tdf-grey-mid", "tdf-grey-dark"),
    tower="slender",
    tower_bodies=("env-glass", "env-glass", "tdf-grey-light"),
    tower_roofs=("tdf-grey-light",),
    tree="pine",
    heights={"tower": 1.2, "mid": 1.1},
    accent="tdf-visor",
    landmark=ea_landmark,
    extras=ea_extras,
    replaces=frozenset({"town", "city"}),
    skips={"town": (9,), "city": (12,)},
)


# ===========================================
# Southeast Asian
# ===========================================


def sea_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural golden stupa; town tiered temple; city twin towers with a sky bridge."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, stupa("stupa", x, y, 0.028, "bug-bone"))
    b = landmark_slot(layout)
    if layout.scale == "town":
        box("temple_hall", (0.08, 0.1, 0.05), (b.x, b.y, GROUND + 0.025), "env-plaster-warm")
        z = GROUND + 0.05
        for i, (w, d) in enumerate(((0.1, 0.12), (0.075, 0.09), (0.05, 0.06))):
            prism(f"temple_roof{i}", (b.x, b.y, z), w, d, 0.03, "tdf-orange-dim")
            z += 0.022
        return (b.x, b.y, z + 0.008 + stupa("temple_stupa", b.x + 0.06, b.y - 0.06, 0.016, "bug-bone") - GROUND)
    tip = GROUND
    r = b.w * 0.3
    for sx in (-1, 1):
        x = b.x + sx * b.w * 0.42
        z = GROUND
        for i, (radius, share) in enumerate(((1.0, 0.55), (0.78, 0.28), (0.55, 0.12))):
            h = b.h * share * 1.2
            cylinder(f"twin{sx:+}_tier{i}", r * radius * 0.9, r * radius, h, 8, (x, b.y, z + h / 2), "env-glass")
            z += h
        cylinder(f"twin{sx:+}_spire", 0.0, r * 0.4, 0.05, 8, (x, b.y, z + 0.025), "tdf-grey-light")
        tip = z + 0.05
    box("skybridge", (b.w * 0.5, 0.012, 0.01), (b.x, b.y, GROUND + b.h * 0.5), "tdf-grey-light")
    return (b.x + b.w * 0.42, b.y, tip)


def sea_extras(style: Style, layout: Layout) -> None:
    """A boat on the water by the stilt village; a golden temple roof between the city towers."""
    if layout.scale == "rural":
        x, y = RURAL_COMPANION
        box("water", (0.1, 0.08, 0.004), (x, y, GROUND + 0.002), "env-water-shallow")
        box("boat", (0.03, 0.01, 0.008), (x + 0.01, y + 0.01, GROUND + 0.006), "env-bark")
        return
    if layout.scale == "city":
        b = layout.buildings[11]
        box("temple_hall", (0.05, 0.05, 0.03), (b.x, b.y, GROUND + 0.015), "env-plaster-warm")
        prism("temple_roof", (b.x, b.y, GROUND + 0.03), 0.06, 0.06, 0.025, "tdf-orange-dim")
        stupa("stupa", b.x + 0.04, b.y - 0.03, 0.014, "bug-bone")


SOUTHEAST_ASIAN = Style(
    id="southeast-asian",
    seed=83,
    house="stilt",
    house_roof="pitched",
    house_bodies=("env-palm-trunk", "env-bark", "env-plaster-warm"),
    house_roofs=("env-roof", "bug-chitin-tan", "env-rust"),
    block_roof="pitched",
    block_bodies=("env-plaster-warm", "env-sidewalk", "env-concrete", "env-sand"),
    block_roofs=("env-rust", "env-roof", "tdf-orange-dim"),
    tower="slender",
    tower_bodies=("env-glass", "env-concrete"),
    tower_roofs=("tdf-grey-light",),
    tree="palm",
    heights={"tower": 1.05},
    landmark=sea_landmark,
    extras=sea_extras,
    replaces=frozenset({"town", "city"}),
    skips={"city": (11,)},
)


# ===========================================
# Latin American
# ===========================================


def la_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural white church with a bell tower; town cathedral with dome; city monument on a summit."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        return (x, y, church("church", x, y, "env-snow", "env-rust", 0.06, 0.03, "env-snow"))
    b = landmark_slot(layout)
    if layout.scale == "town":
        return (b.x, b.y, twin_tower_cathedral("cathedral", b.x, b.y, "env-plaster-warm", "env-rust", "env-snow", with_dome=True))
    hx, hy = -0.19, 0.16
    mound("hill", hx, hy, 0.11, 0.06, "env-foliage")
    box("monument_pedestal", (0.03, 0.03, 0.03), (hx, hy, GROUND + 0.06 + 0.015), "env-sidewalk")
    box("monument_statue", (0.012, 0.012, 0.07), (hx, hy, GROUND + 0.09 + 0.035), "env-snow")
    box("monument_arms", (0.05, 0.008, 0.008), (hx, hy, GROUND + 0.145), "env-snow")
    return (hx, hy, GROUND + 0.16)


def la_extras(style: Style, layout: Layout) -> None:
    """Terraced hillside houses on the flank of the summit hill."""
    if layout.scale == "city":
        for i, (dx, dy) in enumerate(((0.06, -0.04), (0.08, 0.03), (0.02, 0.07), (-0.02, -0.08))):
            box(f"hillside{i}", (0.025, 0.02, 0.02), (-0.19 + dx, 0.16 + dy, GROUND + 0.035), ("env-rust", "env-sand", "env-water-shallow", "tdf-orange-dim")[i])


LATIN_AMERICAN = Style(
    id="latin-american",
    seed=97,
    house="box",
    house_roof="hip",
    house_bodies=("env-rust", "env-sand", "env-water-shallow", "env-plaster-warm", "tdf-orange-dim"),
    house_roofs=("env-rust", "tdf-orange-dim"),
    block_roof="flat",
    block_bodies=("env-plaster-warm", "env-rust", "env-water-shallow", "env-sand", "env-concrete"),
    block_roofs=("env-rust", "env-concrete"),
    tower="slab",
    tower_bodies=("env-concrete", "env-glass", "env-sidewalk"),
    tower_roofs=("tdf-grey-mid",),
    tree="palm",
    heights={"tower": 0.9},
    landmark=la_landmark,
    extras=la_extras,
    replaces=frozenset({"town"}),
    skips={"city": (7, 9)},
)


# ===========================================
# Oceanian
# ===========================================


def oc_landmark(style: Style, layout: Layout) -> tuple[float, float, float]:
    """Rural windmill pump; town beacon on the tallest block; city needle tower with a disc."""
    if layout.scale == "rural":
        x, y = RURAL_LANDMARK
        cylinder("pump_mast", 0.004, 0.012, 0.08, 4, (x, y, GROUND + 0.04), "env-metal")
        cylinder("pump_wheel", 0.018, 0.018, 0.004, 8, (x, y - 0.008, GROUND + 0.075), "env-metal", rot=(1.5708, 0, 0))
        return (x, y, GROUND + 0.08)
    b = landmark_slot(layout)
    if layout.scale == "town":
        return (b.x, b.y, b.top)
    cylinder("needle_shaft", 0.012, 0.018, b.h, 8, (b.x, b.y, GROUND + b.h / 2), "env-metal")
    cylinder("needle_disc", 0.03, 0.035, 0.04, 8, (b.x, b.y, GROUND + b.h * 0.85), "tdf-grey-light")
    cylinder("needle_top", 0.0, 0.008, 0.06, 6, (b.x, b.y, GROUND + b.h + 0.03), "env-metal")
    return (b.x, b.y, GROUND + b.h + 0.06)


def oc_extras(style: Style, layout: Layout) -> None:
    """A water tank on the station; sail shells on the city waterfront."""
    if layout.scale == "rural":
        x, y = RURAL_COMPANION
        cylinder("tank", 0.02, 0.02, 0.025, 8, (x, y, GROUND + 0.0125), "env-metal")
        return
    if layout.scale == "city":
        b = layout.buildings[10]
        box("pier", (0.1, 0.07, 0.008), (b.x, b.y, GROUND + 0.004), "env-sidewalk")
        for i, (dx, h) in enumerate(((-0.03, 0.05), (0.0, 0.065), (0.03, 0.05))):
            prism(f"sail{i}", (b.x + dx, b.y, GROUND + 0.008), 0.026, 0.05, h, "env-snow")


OCEANIAN = Style(
    id="oceanian",
    seed=101,
    house="veranda",
    house_roof="tin",
    house_bodies=("env-plaster-warm", "env-sidewalk", "env-brick"),
    house_roofs=("env-metal", "env-rust", "env-roof-green"),
    block_roof="tin",
    block_bodies=("env-plaster-warm", "env-concrete", "env-brick", "env-sidewalk"),
    block_roofs=("env-metal", "env-roof-green", "env-rust"),
    tower="box",
    tower_bodies=("env-glass", "env-concrete"),
    tower_roofs=("tdf-grey-mid",),
    tree="eucalyptus",
    heights={"tower": 0.85, "mid": 0.8, "block": 0.85},
    landmark=oc_landmark,
    extras=oc_extras,
    replaces=frozenset({"city"}),
    skips={"city": (10,)},
)


# ===========================================
# Registry
# ===========================================

#: Every style by id, matching `SETTLEMENT_STYLE_IDS` in `src/graphics/model/settlement-style.ts`.
STYLES: dict[str, Style] = {
    style.id: style
    for style in (
        NORTH_AMERICAN,
        EUROPEAN,
        SLAVIC,
        MIDDLE_EASTERN,
        AFRICAN,
        SOUTH_ASIAN,
        EAST_ASIAN,
        SOUTHEAST_ASIAN,
        LATIN_AMERICAN,
        OCEANIAN,
    )
}
