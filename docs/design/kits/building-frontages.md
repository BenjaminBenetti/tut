# Building frontage kit (#960)

The building record already knows its use. These attachments make that use
visible outside while retaining the existing walls, openings and roofs.
`building-frontage-styles.ts` selects the kit for town/city buildings; the rural
control keeps its existing treatment. There is no change to simulation tiles,
cover, entrances or pathfinding.

| Module id | Use | Width × outward reach | Mount above floor |
| --- | --- | --- | --- |
| `building.shop-awning` | Striped retail awning over an existing entrance | 3 × 0.66 u | 1.21 u |
| `building.shop-awning-narrow` | One-bay fallback beside a ladder or corner | 1 × 0.66 u | 1.21 u |
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

Entrances try the wide module first, then the narrow retail module if needed.
On `mc-resume-01`, shop `building-12` has its door at `(24,2,36)` and an exterior
ladder from `(25,2,37)` to `(25,6,36)`. The three-bay awning would cover that
ladder; the one-bay version stays over the door. The ladder and the doorway
retain their original positions and clearance.

Placement rejects a canopy that crosses a building corner, an internal edge
inside a union footprint, another building/raised ground, or the vertical route
of an exterior ladder. A taller prop in an outward column also rejects a mount.
Every attachment belongs to a real interior tile at its floor: fog, unit
cutaway and level cuts follow that tile. The `building.` id prefix applies the
existing cutaway material; these add no new shader or material allocation path.

The flat cloth palette is `env-awning-green #56735F` and
`env-awning-cream #D8D0B8`. Other surfaces reuse the environment atlas. An early
awning sampled grass/snow texels; the flat cloth version is the intended asset.

The native Blender inspection angles are committed for every module:

| Module | 45° | 135° | 225° |
| --- | --- | --- | --- |
| shop-awning | [45°](../renders/building.shop-awning_045.png) | [135°](../renders/building.shop-awning_135.png) | [225°](../renders/building.shop-awning_225.png) |
| shop-awning-narrow | [45°](../renders/building.shop-awning-narrow_045.png) | [135°](../renders/building.shop-awning-narrow_135.png) | [225°](../renders/building.shop-awning-narrow_225.png) |
| residential-entry | [45°](../renders/building.residential-entry_045.png) | [135°](../renders/building.residential-entry_135.png) | [225°](../renders/building.residential-entry_225.png) |
| residential-window | [45°](../renders/building.residential-window_045.png) | [135°](../renders/building.residential-window_135.png) | [225°](../renders/building.residential-window_225.png) |
| mailbox-bank | [45°](../renders/building.mailbox-bank_045.png) | [135°](../renders/building.mailbox-bank_135.png) | [225°](../renders/building.mailbox-bank_225.png) |
| workplace-entry | [45°](../renders/building.workplace-entry_045.png) | [135°](../renders/building.workplace-entry_135.png) | [225°](../renders/building.workplace-entry_225.png) |

Sources are `tools/art/models/building-*.py` wrappers over `frontage_parts.py`.
Rebuild one with:

```sh
blender -b --threads 4 --python-exit-code 1 --python tools/art/make_model.py -- \
  --script tools/art/models/building-shop-awning.py \
  --id building.shop-awning --category buildings \
  --file building-shop-awning.glb --quality final --max-triangles 800
```

The Blender loop writes three fixed angles under `docs/design/renders/` and
updates the art manifest. The content/graphics manifests register all six ids.
The scene consumer is `resolveBuildingFrontages`; generated before/after
frames use the normal Map Lab entry point and the existing renderer.

The issue also identifies generic outdoor clutter as part of the missing use
context. MapGen owns the supporting yard arrangement. The attachment kit alone
is not a claim that that separate part has been completed.
