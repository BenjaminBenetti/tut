# Kit: terrain slopes (#798)

![Grass and sand terraces](terrain-slopes-terrace.png)

Three meshes share the ground material selected by the scene. Straight runs
meet a concave notch and a convex hip; rotation supplies the four directions.
The composite uses the actual GLBs through `TerrainSlopeModelFactory`, the
existing grass/sand atlas materials, and the game's camera and lighting.
The exposed side faces borrow the same solid material as adjoining terrace
pillars. There is no bevel, skirt, inset, or gap at the shared edges.

## Shape contract for #799

All three footprints are **1 × 1**, centred on local X/Z, with bounds
`[-0.5, 0, -0.5]` to `[0.5, 1.5, 0.5]` in glTF/three coordinates. The origin
is the **base centre at the low surface plane**, not the centre of the wedge.
One current elevation layer is 1.5 world units. The single authoring control
is `RISE = 1.5` in `tools/art/models/terrain_slope_parts.py`. The separate
layer-height follow-up can change that parameter and re-emit all three assets;
this PR deliberately retains today's scale.

For local `u = x + 0.5`, `v = z + 0.5`:

| Kind | Model id | Height field | High/low features | Triangles | GLB bytes |
| --- | --- | --- | --- | --- | --- |
| Straight | `tile.slope.straight` | `RISE × v` | Low −Z edge, high +Z edge | 8 | 1,792 |
| Inner | `tile.slope.inner` | `RISE × max(u, v)` | Low (−X, −Z) corner; +X and +Z high edges | 10 | 1,992 |
| Outer | `tile.slope.outer` | `RISE × min(u, v)` | High (+X, +Z) corner; −X and −Z low edges | 6 | 1,712 |

Corners split along the (−X, −Z) → (+X, +Z) diagonal. All sloping faces have
upward normals, every exported mesh is watertight, and each is below the
60-triangle / 20 KB ground-piece budget. Rotate the **whole group** around Y
by multiples of π/2. No scale adjustment is needed at today's layer height.
The resolver follows #799's clockwise `slope.turns`: straight uses that value;
inner and outer use `(turns + 1) % 4` because the map-data corner starts high
to the west/south, while the exported corner starts high to the east/south.

For a tile at lower level `y`, place the pivot at
`(tile.x + 0.5, y * LEVEL_HEIGHT + SLAB_HEIGHT, tile.z + 0.5)`.
The high endpoint then meets the next level's surface. A slope replaces the
flat top at that cell; keep the ground pillar beneath the low plane. The
flat ground model's centre-pivot slab offset does not apply to this wedge.

## Material consumer

`SLOPE_MODELS` in `graphics/data/map-model-table.ts` is the kind-to-id mapping.
`graphics/service/terrain-slope-model-factory.ts` loads those registered GLBs:

```ts
const factory = new TerrainSlopeModelFactory(models);
const prototype = await factory.create("inner", {
  surface: groundTopMaterial,
  sides: terraceSideMaterial,
  uv: { u0, v0, u1, v1 }, // the existing ground atlas cell; omit for full UVs
});
```

The returned group contains `slope-surface` and `slope-sides`, each with one
material, ready for the map's per-part instanced batching. Cache this group
per kind/material in the scene. Returned geometries belong to the caller;
dispose them on scene teardown. Supplied materials and loader prototypes
remain borrowed and unchanged. The factory does not own or dispose them.

The GLBs have neutral materials and projected 0–1 top UVs, with **no embedded
texture or material variant files**. Grass, dirt, sand, snow, rock, and asphalt
all use the same three meshes. Pass the chosen top material/atlas region and
the existing cliff material; road markings are a separate renderer decision.
`slopeMaterialsFromGround` borrows the broadest upward face's material and
UV region from the existing surface model. It selects the road deck over
small road markings, or the rock slab over its lumps. The composite uses
the same helper, so no atlas-cell coordinates are duplicated.

#799's scene mapping landed while this kit was being built. `resolveMapModels`
now maps its slope metadata to these assets; `TacticalMapView` replaces the
initial wedges with the materialised art and retires those placeholders.
It caches one prototype per shape/surface, batches instances by level and
surface, and applies the existing visibility and mist treatment to both
parts. The ground pillars remain. Generation, map data and traversal remain
as supplied by #799.

In-game review controls: [city seed 730982385](../shots/799-preview-control-seed730982385.png)
and [snowy rural hills-1](../shots/799-preview-terrain-heavy-snowy-rural-hills-1.png).

## Review and reproduce

The nine neutral renders show the geometry independently of material choice:

| Shape | 45° | 135° | 225° |
| --- | --- | --- | --- |
| Straight | [view](../renders/tile.slope.straight_045.png) | [view](../renders/tile.slope.straight_135.png) | [view](../renders/tile.slope.straight_225.png) |
| Inner | [view](../renders/tile.slope.inner_045.png) | [view](../renders/tile.slope.inner_135.png) | [view](../renders/tile.slope.inner_225.png) |
| Outer | [view](../renders/tile.slope.outer_045.png) | [view](../renders/tile.slope.outer_135.png) | [view](../renders/tile.slope.outer_225.png) |

```bash
for shape in straight inner outer; do
  blender -b --python-exit-code 1 --python tools/art/make_model.py -- \
    --script tools/art/models/terrain-slope-$shape.py --id tile.slope.$shape \
    --category tiles --file terrain-slope-$shape.glb --quality final \
    --max-triangles 60 --no-textured
done
CAPTURE=1 pnpm exec playwright test e2e/terrain-slope-screenshot.spec.ts e2e/slope-screenshot.spec.ts e2e/fog-screenshot.spec.ts
```

After a future rise change, copy the emitted heights into the TypeScript
manifest along with the generated JSON metadata. The geometry tests compare
the actual exported bounds to `LEVEL_HEIGHT`, so stale exports fail.

The browser harness is `/tools/art/preview/terrain-slopes.html` on the Vite
server. Its 1440 × 880 composite uses two matching L-shaped terraces, including
a straight run, concave and convex turns, and a slope side abutting a sheer
cliff. All nine angles and the final composite were opened and inspected.

Validation on the integrated tree: all three Blender/trimesh loops, manifest
guard, typecheck, lint, 1,954 unit tests, build, all four capture tests and
59 browser tests pass (one unit test and nine opt-in captures skipped in
the ordinary suites). The regenerated seed-4242 turn-1 and turn-7 PNGs are
byte-identical to main. The city control's only pixel changes are timing
text; the snowy control shows the slope kit in generated terrain.
