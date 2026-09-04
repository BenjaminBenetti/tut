# Kit: city buildings

![City building kit](city-building-kit.png)

Eight Blender pieces that map generation assembles into city buildings (style guide §7, epic #274 batch E). Sources are `tools/art/models/building-*.py` on the shared builders in `tools/art/models/city_kit_parts.py`; they replaced the three.js placeholders of the same ids, so nothing downstream changes.

| Piece | Id | Footprint | Height | Snaps to | Tokens |
|---|---|---|---|---|---|
| Wall | `building.wall` | 1 × 0 | 1.5 | tile edge, runs along local +X | `env-brick`, `env-concrete` |
| Wall, window | `building.wall-window` | 1 × 0 | 1.5 | tile edge | + `env-glass`, `env-metal` |
| Wall, door | `building.wall-door` | 1 × 0 | 1.5 | tile edge, `socket_door` at the opening | + `env-metal` |
| Wall, half | `building.wall-half` | 1 × 0 | 0.5 | tile edge, low cover | `env-brick`, `env-concrete` |
| Floor | `building.floor` | 1 × 1 | 0.05 | tile centre, one per level | `env-concrete`, `env-sidewalk` |
| Roof | `building.roof` | 1 × 1 | 0.05 | tile centre, top level | `env-roof` |
| Roof parapet | `building.roof-parapet` | 1 × 0 | 0.15 | roof edge, runs along local +X | `env-concrete`, `env-sidewalk` |
| Stairs | `building.stairs` | 1 × 1 | 1.5 | tile centre, climbs toward +Z | `env-concrete`, `env-sidewalk` |

## Rules the kit follows

- **Bands line up.** Every full-height wall piece carries the same concrete plinth (0.16 u) and cornice (0.10 u), and the brick field between them starts and ends at the same heights, so a run of mixed pieces reads as one wall rather than eight stamps. `city_kit_parts.wall_bands()` is the single place those numbers live.
- **Openings are cut, not overlaid.** Jambs, lintels and spandrels are separate brick panels that meet edge to edge. An early version overlapped the lintel with the jambs; the coincident faces z-fought into black patches at the corners of every doorway.
- **No applied frames.** At 64 px per tile a metal frame around a door reads as noise; the opening itself is what has to be legible. The door keeps only a threshold plate.
- **Decks are flat.** The floor's trim ring and its centre sit at the same height and differ only in token. Recessing the centre a few millimetres looked better in isolation, but a floor is laid over a 0.05 u ground tile, so the recess let grass poke through every interior square.
- **The roof has no border.** Roof tiles cover whole rooftops, so a per-tile border would draw a grid over the building; `building.roof-parapet` is what edges a roof.
- **Nothing rises above its storey.** The staircase covers exactly 1.5 u; its side kerbs stop on the last step instead of continuing as a handrail into the floor above.
- **Brick courses run horizontally.** Vertical panels get `uv_rot=90` (`bpy_kit.box`), because `bpy.ops.uv.reset` orients u along whichever edge a face's loop starts on and an upright panel otherwise samples the brick cell sideways.

## Rebuild

```
blender -b --python tools/art/make_model.py -- \
  --script tools/art/models/building-wall.py --id building.wall \
  --category buildings --file wall.glb --quality final --footprint 1x0 --max-triangles 800
node tools/art/build-placeholders.mjs      # keeps the records it did not create
```

Renders for review are under `docs/design/renders/building.*_{045,135,225}.png`.
