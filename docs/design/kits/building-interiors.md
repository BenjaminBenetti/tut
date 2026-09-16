# Building interiors

Generated buildings now have room programs and furniture arrangements tied to their use. Shops have a sales floor, checkout, stocked shelves and back-room storage. Towers have offices, reception, meeting rooms and break rooms. Houses and apartments have living rooms, bedrooms, kitchens and bathrooms. Warehouses keep stock aisles and work areas.

Rooms keep the existing building footprints and partition walls. The change gives those spaces a purpose and arranges furniture around it. Small rooms receive their essential pieces first; larger rooms add storage, seating and plants. Seeded alternatives vary furniture arrangements between rooms and maps.

| Building | Ground floor | Upper floors |
|---|---|---|
| Shop | Retail and stockrooms | Office, storage and staff break room |
| Tower | Reception, offices, meeting and break rooms | Offices, meeting and break rooms |
| House | Living, sleeping, kitchen; bathroom where space permits | Bedrooms, bathroom and study |
| Apartment | Living, sleeping, kitchen and bathroom | Living, sleeping, kitchen and bathroom |
| Warehouse | Storage bays, workshop; office where space permits | Storage and workshop for custom templates |

Furniture faces into its room, with shallow cabinets and seating fitted against their rear walls inside the occupied tile. Shop and warehouse shelving forms parallel runs with open end caps; desks are spaced along walls or in work rows; dining and meeting tables sit centrally. Door thresholds and approaches, stair landings, and the usable side of each furniture piece stay clear. Each placement is rejected if it makes any remaining floor or roof tile unreachable. Checkouts retain working space on both sides. Small meeting rooms fall back to a safe wall-side table when their centre is needed for circulation. A few very tight rooms containing doors or stairs may retain fewer pieces to keep them traversable.

## Furniture kit

All sixteen pieces are authored in Blender, with base-centred pivots and +Z forward in GLTF. Each stays inside its one-tile collision footprint at every quarter turn. Each has a source script under `tools/art/models/prop-<name>.py`, a final GLB under `public/assets/models/props/`, and three inspected renders under `docs/design/renders/prop.<name>_{045,135,225}.png`. Materials reuse the environment palette. The budget is 300 triangles and 60 KiB per model.

| Model | Readable details | Cover |
|---|---|---|
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

High-cover furniture blocks sight and requires demolition force 2. The remaining pieces provide low cover without blocking sight and require force 1. These props are restricted to interiors, so they do not enter roadside or yard clutter pools. Existing saves retain their recorded prop placements and legacy room labels.

## Floor finishes

The renderer gives whole rooms a consistent finish: timber in living rooms and bedrooms, muted carpet in offices and meeting rooms, ceramic in kitchens/bathrooms/retail/circulation, and concrete in storage and workshops. Two subdued colour variants are picked per room from its seed and identity. Timber seams, ceramic grout and carpet weave use small shared procedural textures on the existing floor slab; the slab's geometry and walkable height remain unchanged. Floor materials follow fog, storey cuts and disposal just like the original floor.

## Review

Run `node tools/art/preview/capture-building-interiors.mjs` to regenerate the production-renderer captures below. They use the ordinary generator and storey cut, with camera framing exposed only by the capture script. No furniture is hand-placed for these scenes.

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

The six ASCII generation checksums were intentionally repinned because furnishings and room purposes change generated maps. The building, floor and terrain invariants remain covered by the generation sweep. More furniture also exposed an existing objective fallback that could put the nearest target too far from deployment; the outdoor fallback now searches the nearby eligible pool first, while retaining shootability and hatch-space checks.
