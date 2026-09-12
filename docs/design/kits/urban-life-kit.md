# Urban life kit

Nine modules for the second art pass on #1110. Source:
`tools/art/models/urban_life_parts.py`, with one kebab-case entry script per
model. These use existing environment palette tokens and flat shading.

| Model | Footprint (u) | Height (u) | Triangles | Use |
| --- | --- | ---: | ---: | --- |
| `building.chimney` | 0.44 × 0.44 | 0.89 | 184 | Nonwalkable pitched roof, sunk into roof profile |
| `building.wall-ac-unit` | 0.70 × 0.32 | 0.42 | 144 | Solid upper wall bay |
| `building.residential-window-shutters` | 1 × 0.15 | 0.60 | 108 | Open window sides; replaces planter module |
| `building.warehouse-entry` | 2.40 × 0.66 | 0.24 | 156 | Canopy above a real service door |
| `building.shop-awning-sign` | 3 × 0.67 | 0.26 | 96 | Alternate shop canopy with geometric stock symbols |
| `prop.rooftop-hvac` | 1 × 1 | 0.84 | 276 | Real high cover on a walkable roof |
| `prop.rooftop-water-tank` | 1 × 1 | 1.25 | 288 | Real high cover on a walkable roof |
| `prop.manhole` | 0.56 × 0.56 | 0.02 | 124 | Flush detail on level asphalt |
| `prop.curb-drain` | 0.26 × 0.62 | 0.03 | 84 | Flush detail parallel to curb |

Each model is watertight and below 30 KB. All three fixed-angle renders live
under `docs/design/renders/<model-id>_{045,135,225}.png`.

Roof and street pieces pivot at their base centre. Wall attachments pivot at
the wall and extend towards +Z in glTF, with the bottom at the documented mount
height. The shutter aperture is 0.62u wide and never seals the existing window.
Door canopies have no ground posts or invented traversable platform.

Roof equipment placement reserves actual tiles, keeps approaches clear, and
checks connectivity after each proposed cluster. Chimneys follow the analytic
pitched/hipped profile and share the supporting building tile's fog/cutaway.
Street details sit above the road slab, remain inside their owner cell, avoid
slopes, junctions and existing road props, and add no movement/LOS restriction.

Rebuild a module using the standard Blender loop, for example:

```sh
blender -b -t 4 --python tools/art/make_model.py -- \
  --script tools/art/models/prop-rooftop-hvac.py \
  --id prop.rooftop-hvac --category props --file prop-rooftop-hvac.glb \
  --quality final --max-triangles 300 --no-textured
```
