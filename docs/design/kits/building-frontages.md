# Building frontage kit (#960)

The building record already knows its use. These attachments make that use
visible outside while retaining the existing walls, openings and roofs.
`building-frontage-styles.ts` selects the kit for town/city buildings; the rural
control keeps its existing treatment. There is no change to simulation tiles,
cover, entrances or pathfinding.

| Module id | Use | Width × outward reach | Mount above floor |
| --- | --- | --- | --- |
| `building.shop-awning` | Striped retail awning over an existing entrance | 3 × 0.66 u | 1.21 u |
| `building.residential-entry` | Small porch roof and paired lights | 1.35 × 0.43 u | 1.10 u |
| `building.residential-window` | Shallow window guard and sill planter | 0.74 × 0.29 u | 0.40 u |
| `building.mailbox-bank` | Six shared apartment mailboxes on a solid wall bay | 0.62 × 0.12 u | 0.42 u |
| `building.workplace-entry` | Broad metal canopy and strip light on a tower entrance | 2.4 × 0.56 u | 1.12 u |

Each model pivots at the wall attachment, +Y up and +Z outdoors. The source
builds +Z up / −Y outdoors, and `make_model.py` exports glTF axes. The
`socket_wall` locator is the origin. Mounts sit 0.045 u outside the wall's
centreline, intersecting its 0.05 u face slightly so brackets meet the wall.
Outward quarter turns are south=0, west=1, north=2, east=3, matching the existing
negative-Y rotation in `placementMatrix`.

The awning's lowest fabric is above the existing 1.20 u doorway head. Porch
lights sit outside its 0.60 u clear aperture. The guards have **no standing
platform**: they are shallow Juliet guards and planters, not traversable
balconies. Mailboxes require a solid bay beside the real entrance. No model
pretends a closed wall is an entrance or a vehicle loading door.

Houses receive a porch and upper-window details; apartments additionally get
shared mail where a solid bay is available. Shops receive the awning. Towers
receive a broad work entrance. Unknown kinds and warehouses retain their
existing shells. Selection follows `Building.kind`; it never relabels the
second reported seed's apartments as different businesses merely for variety.

Placement rejects a canopy that crosses a building corner, an internal edge
inside a union footprint, another building/raised ground, or the vertical route
of an exterior ladder. A taller prop in an outward column also rejects a mount.
Every attachment belongs to a real interior tile at its floor: fog, inspection,
cutaway and level cuts follow that tile. The `building.` id prefix applies the
existing cutaway material; these add no new shader or material allocation path.

The flat cloth palette is `env-awning-green #56735F` and
`env-awning-cream #D8D0B8`. Other surfaces reuse the environment atlas. An early
awning sampled grass/snow texels; the flat cloth version is the intended asset.

Sources are `tools/art/models/building-*.py` wrappers over `frontage_parts.py`.
Rebuild one with:

```sh
blender -b --threads 4 --python tools/art/make_model.py -- \
  --script tools/art/models/building-shop-awning.py \
  --id building.shop-awning --category buildings \
  --file building-shop-awning.glb --quality final --max-triangles 800
```

The Blender loop writes three fixed angles under `docs/design/renders/` and
updates the art manifest. The content/graphics manifests register all five ids.
The scene consumer is `resolveBuildingFrontages`; generated before/after
frames use the normal Map Lab entry point and the existing renderer.

The issue also identifies generic outdoor clutter as part of the missing use
context. MapGen owns the supporting yard arrangement. The attachment kit alone
is not a claim that that separate part has been completed.
