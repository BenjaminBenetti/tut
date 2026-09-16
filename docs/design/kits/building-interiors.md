# Building interiors

Generated buildings have room programs, architectural plans and furniture tied to their use. Shops include grocery stores, bakery/cafés, pharmacies, clothing shops, electronics stores, hardware stores and bookshops. Towers have offices, reception, meeting rooms and break rooms. Houses and apartments have living rooms, bedrooms, kitchens and bathrooms. Warehouses keep stock aisles and work areas.

Matching [exterior business signs](business-signs.md) carry each shop's identity onto its entrance canopy. Offices and depots have their own signs too.

The building mix now gives shops and workplaces comparable space to residential buildings. Across 80 large maps in each settlement scale (20 seeds × four biomes), cities produced approximately 40% shops, 30% offices and 29% residential buildings; towns added 5% warehouses. Rural maps mix shops, homes and warehouses. Compact storefronts fit seven-tile frontages. Business identities are drawn from a seeded, balanced bag: every available identity appears before another repeats.

Partitions follow the entrance and building use. Shops retain a broad sales floor with a shallow rear service strip. Offices connect reception to a larger workfloor through a wide opening, with enclosed support rooms alongside. Homes place public rooms at the front and private rooms behind a short hall. Warehouse service blocks leave a large open work area around them. The same partition geometry stacks between floors so doors, circulation and stair landings align. Small rooms receive essentials first; larger rooms add storage, seating and plants.

| Building | Ground floor | Upper floors |
|---|---|---|
| Shop | Retail and stockrooms | Office, storage and staff break room |
| Tower | Reception, offices, meeting and break rooms | Offices, meeting and break rooms |
| House | Living, sleeping, kitchen; bathroom where space permits | Bedrooms, bathroom and study |
| Apartment | Living, sleeping, kitchen and bathroom | Living, sleeping, kitchen and bathroom |
| Warehouse | Storage bays, workshop; office where space permits | Storage and workshop for custom templates |

Furniture faces into its room, with shallow cabinets and seating fitted against their rear walls inside the occupied tile. Shop and warehouse shelving forms parallel runs with open end caps; desks are spaced along walls or in work rows; dining and meeting tables sit centrally. Door thresholds and approaches, stair landings, and the usable side of each furniture piece stay clear. Each placement is rejected if it makes any remaining floor or roof tile unreachable. Checkouts retain working space on both sides. Small meeting rooms fall back to a safe wall-side table when their centre is needed for circulation. A few very tight rooms containing doors or stairs may retain fewer pieces to keep them traversable.

## Furniture kit

All twenty-five pieces are authored in Blender, with base-centred pivots and +Z forward in GLTF. Each stays inside its one-tile collision footprint at every quarter turn. Each has a source script under `tools/art/models/prop-<name>.py`, a final GLB under `public/assets/models/props/`, and three inspected renders under `docs/design/renders/prop.<name>_{045,135,225}.png`. Materials reuse the environment palette. The budget is 300 triangles and 60 KiB per model.

| Model | Readable details | Cover |
|---|---|---|
| `prop.produce-bin` | Timber bins with contrasting produce piles | Low |
| `prop.chilled-display` | Tall glazed chiller with visible cartons and cans | High |
| `prop.bakery-case` | Glazed pastry trays and timber service cabinet | Low |
| `prop.cafe-table` | Small round table, cup and paired seats | Low |
| `prop.coffee-counter` | Espresso machine, cups and working counter | Low |
| `prop.clothing-rack` | Hanging garments, hangers and folded stock | High |
| `prop.electronics-display` | Demo screens and small devices | Low |
| `prop.hardware-shelf` | Pegboard tools, paint cans and toolboxes | High |
| `prop.pharmacy-shelf` | Medicine cartons, bottles and green pharmacy marker | High |
| `prop.retail-shelf` | Stocked shelves, muted product cartons and labels | High |
| `prop.checkout` | Conveyor counter, register and payment terminal | Low |
| `prop.desk-computer` | Monitor, keyboard, mouse, paperwork and tucked chair | Low |
| `prop.filing-cabinet` | Drawer fronts, handles and labels | High |
| `prop.meeting-table` | Four seats and tabletop documents | Low |
| `prop.workbench` | Tool board and working surface | Low |
| `prop.sofa` | Upholstered arms, cushions and throw pillow | Low |
| `prop.bed` | Headboard, pillows and contrasting blanket | Low |
| `prop.kitchen-counter` | Sink, tap, hob, oven and cupboard doors | Low |
| `prop.dining-table` | Compact table and chairs | Low |
| `prop.bathroom-vanity` | Basin, cabinet and mirror | Low |
| `prop.planter` | Pot and layered leaves | Low |
| `prop.bookcase` | Timber frame and varied book spines | High |
| `prop.wardrobe` | Tall cupboard doors and handles | High |
| `prop.refrigerator` | Freezer compartment and handles | High |
| `prop.toilet` | Cistern, bowl and seat | Low |

The chiller and bakery case use the existing `env-glass` colour with 16% alpha so their stock remains visible through glazing. All other furniture materials remain opaque.

High-cover furniture blocks sight and requires demolition force 2. The remaining pieces provide low cover without blocking sight and require force 1. These props are restricted to interiors, so they do not enter roadside or yard clutter pools. Existing saves retain their recorded prop placements and legacy room labels.

## Floor finishes

Shop finishes reinforce their identity: grocery/pharmacy/electronics use ceramic, cafés/bookshops use timber, clothing shops use carpet, and hardware stores use concrete. The renderer gives whole rooms a consistent finish: timber in living rooms and bedrooms, muted carpet in offices and meeting rooms, ceramic in kitchens/bathrooms/retail/circulation, and concrete in storage and workshops. Two subdued colour variants are picked per room from its seed and identity. Timber seams, ceramic grout and carpet weave use small shared procedural textures on the existing floor slab; the slab's geometry and walkable height remain unchanged. Floor materials follow fog, storey cuts and disposal just like the original floor.

## Review

Run `node tools/art/preview/capture-building-interiors.mjs` to regenerate the production-renderer captures below. They use the ordinary generator and storey cut, with camera framing exposed only by the capture script. No furniture is hand-placed for these scenes.

- [Grocery](../diagnostics/building-interiors/shops-review-grocery-floor-0.png)
- [Bakery/café](../diagnostics/building-interiors/shops-review-bakery-cafe-floor-0.png)
- [Pharmacy](../diagnostics/building-interiors/shops-review-pharmacy-floor-0.png)
- [Clothing](../diagnostics/building-interiors/shops-review-clothing-floor-0.png)
- [Electronics](../diagnostics/building-interiors/shops-review-electronics-floor-0.png)
- [Hardware](../diagnostics/building-interiors/shops-review-hardware-floor-0.png)
- [Bookshop](../diagnostics/building-interiors/shops-review-bookshop-floor-0.png)
- [Shop and stockroom](../diagnostics/building-interiors/interiors-second-shop-floor-0.png)
- [Office upper floor](../diagnostics/building-interiors/interiors-second-tower-floor-1.png)
- [House](../diagnostics/building-interiors/interiors-review-house-floor-0.png)
- [Apartment](../diagnostics/building-interiors/interiors-review-apartment-floor-1.png)
- [Warehouse](../diagnostics/building-interiors/warehouse-review-warehouse-floor-0.png)
- [Second shop layout](../diagnostics/building-interiors/interiors-review-shop-floor-0.png)
- [Tower reception floor](../diagnostics/building-interiors/interiors-second-tower-floor-0.png)

The accompanying `captures.json` records seeds, building rooms, placed props and camera states. Map Lab accepts the same seed with `models=1`; use its floor control to inspect the interiors.

Rebuild an individual piece:

```sh
blender -b --python tools/art/make_model.py -- \
  --script tools/art/models/prop-desk-computer.py --id prop.desk-computer \
  --category props --file prop-desk-computer.glb --quality final \
  --max-triangles 300 --no-textured
```

## Verification notes

The six ASCII generation checksums were intentionally repinned because business selection, architectural partitions and furnishings change generated maps. The building, floor and terrain invariants remain covered by the generation sweep. More furniture also exposed an existing objective fallback that could put the nearest target too far from deployment; the outdoor fallback now searches the nearby eligible pool first, while retaining shootability and hatch-space checks.

The shop review audit covers 75 sales rooms over eight large city seeds. Each contains its business-specific fixtures and checkout; cafés contain coffee service, pastry displays and seating. Compact grocery aisles fall back to usable wall positions when stairs occupy their display row. Separate compact-room checks preserve a counter and refrigerator in 2×3 kitchens, and a vanity and toilet in 2×3 bathrooms. Architectural tests cover all four frontages, room coverage, public/private connections and aligned stair access.
