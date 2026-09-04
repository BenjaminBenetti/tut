# Kit: cover props

![Cover props](cover-props.png)

The six props a squad takes cover behind, as Blender models (style guide §7, epic #274 batch F). Sources are `tools/art/models/prop-*.py` on the shared builders in `tools/art/models/prop_parts.py`; they replaced the three.js placeholders of the same ids, so mapgen's prop kinds resolve exactly as before.

| Prop | Id | Footprint | Height | Triangles | Cover it reads as |
|---|---|---|---|---|---|
| Crate | `prop.crate` | 1 × 1 | 0.6 | 148 | Full, waist-high stack |
| Sandbags | `prop.sandbags` | 1 × 1 | 0.47 | 196 | Low, built emplacement |
| Jersey barrier | `prop.barrier-concrete` | 1 × 1 | 0.5 | 156 | Low, hard |
| Dumpster | `prop.dumpster` | 1 × 1 | 0.79 | 216 | Full, soft (a bin stops rifle fire badly) |
| Compact car | `prop.car-compact` | 1 × 1 | 0.74 | 240 | Full, hard at the body, glass above |
| Sedan | `prop.car-sedan` | 2 × 1 | 0.8 | 284 | Full, two tiles |

## Rules the kit follows

- **Silhouette over surface.** These are read at 64 px per tile from four yaw stops. What survives is the outline: a barrier's taper, a bin's tilted lid, a car's glasshouse between a bonnet and a boot. Detail under about 0.04 u is invisible and only spends triangles.
- **Wheels start at hub height.** The body sits at `wheel_radius`, so wheels show below it from the side and as four dark corners from overhead. Tucked under a low sill, a car reads as a flatbed truck — which is exactly what the first two passes looked like.
- **A long car needs a boot.** With a cabin and one flat deck the sedan read as a pickup; `car_body(boot=True)` raises a boot deck behind the cabin, and the profile becomes low-high-mid.
- **Chamfer only what is seen.** A bevelled sandbag costs 44 triangles against a 300-triangle prop budget, so only the top course passes `soft=True`; lower bags are half-buried in their neighbours and their corners never read. Twelve chamfered bags came to 1 296 triangles, four times the budget.
- **Bags are boxes, not cylinders.** The first sandbag stack used six-sided cylinders and read as a pile of pipes. A yawed, heavily chamfered box keeps the soft corner without the barrel profile.
- **Hazard orange is a marker, not a colour scheme** (style guide §4): one `tdf-orange-dim` band on the barrier and one stencil on the crate, nothing more.

## Rebuild

```
blender -b --python tools/art/make_model.py -- \
  --script tools/art/models/prop-crate.py --id prop.crate \
  --category props --file crate.glb --quality final --footprint 1x1 --max-triangles 300
node tools/art/build-placeholders.mjs      # keeps the records it did not create
```

Renders for review are under `docs/design/renders/prop.*_{045,135,225}.png`.
