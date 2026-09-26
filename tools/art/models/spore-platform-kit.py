"""The spore platform's hull plates (#1179): three 1x1 ground tiles.

A plate is a chitin slab with a darker seam along its west and south
edges, so a field of plates reads as a riveted hull, and a low scute
panel standing proud of its middle. Build one with make_model.py
--build-arg kind=<plate|plate-dark|rim> --category tiles.

    +-----------+      top view, north up
    |  +-----+  |      scute: the slab's own chitin, 6 mm proud
    |  |     |  |      seam:  bug-chitin-black strips on west and south,
    |  +-----+  |             so each edge is drawn by exactly one tile
    #===========+
"""

from bpy_kit import box

FOOTPRINT = (1, 1)

SLAB = 0.05
SEAM = 0.035
SCUTE = 0.74

# kind -> (slab token, scute token)
TOKENS = {
    "plate": ("bug-chitin-mid", "bug-chitin-mid"),
    "plate-dark": ("bug-chitin-dark", "bug-chitin-dark"),
    "rim": ("bug-chitin-dark", "bug-chitin-tan"),
}


def build(kind: str = "plate") -> None:
    """A closed slab, two seam strips and a scute: 48 triangles."""
    if kind not in TOKENS:
        raise ValueError(f"unknown spore platform tile: {kind}")
    slab, scute = TOKENS[kind]
    box("hull_slab", (1, 1, SLAB), (0, 0, SLAB / 2), slab)
    box("seam_west", (SEAM, 1, SLAB + 0.004), (-0.5 + SEAM / 2, 0, (SLAB + 0.004) / 2),
        "bug-chitin-black")
    box("seam_south", (1 - SEAM, SEAM, SLAB + 0.004),
        (SEAM / 2, -0.5 + SEAM / 2, (SLAB + 0.004) / 2), "bug-chitin-black")
    box("hull_scute", (SCUTE, SCUTE, 0.006), (SEAM / 2, SEAM / 2, SLAB + 0.003), scute)
