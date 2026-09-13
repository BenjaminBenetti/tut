# Brown bug family — distinct species

The Executive Director selected [brown Crescent B](../concepts/swarmer-redesign/b-crescent-brown.md) for the swarmer and asked for a related brown bug family. The silhouette revision keeps the swarmer unchanged and gives the lurker, brute and spawner their own body plans. Shared materials and anatomy establish kinship; the crescent hood belongs to the swarmer. These are the actual exported game assets, built in Blender from reproducible Python sources.

![Four distinct brown bug models in the browser gallery](../diagnostics/crescent-bugs/family.png)

## Review the models

Run `pnpm dev`, then open **[/tools/art/preview/crescent-bugs.html](../../../tools/art/preview/crescent-bugs.html)** on the local Vite server. Drag to orbit, scroll to inspect, or use the shared turntable. Rest, Walk and Strike use the production `UnitMotionRig`; the rooted egg spawner stays stationary. Detail frames each creature individually. Relative scale uses one camera scale across all four, and 64 px / tile shows their tactical size.

| Swarmer | Lurker | Brute | Egg spawner |
|---|---|---|---|
| [![Swarmer](../renders/bug.swarmer_045.png)](../renders/bug.swarmer_045.png) | [![Lurker](../renders/bug.lurker_045.png)](../renders/bug.lurker_045.png) | [![Brute](../renders/bug.brute_045.png)](../renders/bug.brute_045.png) | [![Egg spawner](../renders/bug.egg-spawner_045.png)](../renders/bug.egg-spawner_045.png) |
| [135°](../renders/bug.swarmer_135.png) · [225°](../renders/bug.swarmer_225.png) | [135°](../renders/bug.lurker_135.png) · [225°](../renders/bug.lurker_225.png) | [135°](../renders/bug.brute_135.png) · [225°](../renders/bug.brute_225.png) | [135°](../renders/bug.egg-spawner_135.png) · [225°](../renders/bug.egg-spawner_225.png) |

Browser captures: [relative scale](../diagnostics/crescent-bugs/relative-scale.png), [walking](../diagnostics/crescent-bugs/walking.png), [striking](../diagnostics/crescent-bugs/striking.png), [rear](../diagnostics/crescent-bugs/rear.png).

## Family language

Walnut primary shells, chestnut armour, tan chitin markings, dark umber joints, paired eye clusters and pale horn cutting edges unite the family. Tan markings can follow a face, wing case or egg rib; their placement is species-specific. A repeated head shape or hood is not required. Green eyes/gills remain on the swarmer and brute; magenta identifies the lurker and the spawner's central hatch. Broad shapes carry the tactical silhouette; small growth seams and cuff edges reward inspection up close.

- **Swarmer:** thin swept hood over a low body; five overlapping abdominal plates; four running legs and two short hooks.
- **Lurker:** exposed wedge-shaped face, raised feelers, swept shoulder fins and a slender ringed thorax. Long sickles and four fine legs give it a mantis silhouette; it has no hood.
- **Brute:** a low, wide beetle authored at its 2×2 tactical footprint (#1134, `brute_parts.py`): one domed vault of paired wing cases over a segmented abdomen, six jointed legs planted wide, a low forward head with mandibles between two heavy cleavers. Two broken rows of tan back markings replace the swarmer crest. About 1.6 × 1.8 tiles and 0.9 tall, so it never towers over a mech.
- **Egg spawner:** an asymmetric root web, four ribbed eggs of different sizes and a fleshy central bulb with four rounded hatch lobes. The old crescent base and pointed crown are removed. The `socket_hatch` anchor remains available to gameplay effects.

The shared [style guide](../style-guide.md) records the brown palette and revised detailed-model budgets. Gameplay species, abilities and occupied tile counts remain unchanged.

## Geometry, materials and motion

Each GLB is below 500 KiB. The selected detail pass replaces the original 600 / 1,000 / 2,000 triangle bug budgets and 1,200 triangle spawner budget. Current budgets are 16,000 / 18,000 / 20,000 / 16,000 respectively. This increases geometry cost; these are detailed game meshes without a separate LOD tier. File caps and functional browser checks are not a hardware performance benchmark.

| Model | Height | Triangles | GLB | Budget |
|---|---:|---:|---:|---:|
| Swarmer | 0.5 u | 12,464 | 339,028 bytes (331.1 KiB) | 16,000 |
| Lurker | 1.3 u | 13,668 | 372,004 bytes (363.3 KiB) | 18,000 |
| Brute | 0.9 u (2×2 footprint) | 15,640 | 419,844 bytes (410.0 KiB) | 20,000 |
| Egg-Spawner | 1.4 u | 11,264 | 295,136 bytes (288.2 KiB) | 16,000 |

[Validation report, bounds and SHA-256 hashes](../diagnostics/crescent-bugs/validation.json).

Dimensions use 1 u = 1 tile = 2 m, +Y up and +Z authored front. Pivots sit at the ground centre. Every exported mesh component is closed and passes the trimesh validator. The models share the external bug atlas rather than embedding four copies. Continuous authored UVs map each sculpted surface into its material cell; domes/cuffs use smooth shading and dorsal scutes retain hard edges. Chitin roughness is 0.74.

Each moving bug exports four `leg_[lr][01]` nodes and two `blade_`, `scythe_` or `cleaver_` nodes. Their origins sit at the hips/shoulders and carry `motion_joint: true` in glTF extras. `UnitMotionRig` uses these authored attachments instead of estimating a joint from a curved limb's bounds. Existing models without this marker retain their existing pivot behavior. Regression tests load the actual GLBs and check all six pivots, movement, attack, reset, facing, prototype isolation and ground/height alignment. The assets use rigid procedural motion rather than skeletal animation clips.

## Read checks and reproduction

All twelve Blender angles were inspected. The browser gallery uses the game's ambient/key intensities (0.55 / 2.9), with a tighter shadow frustum for close inspection. The existing scene harness retains the production shadow frustum for ground comparisons at 64 px / tile: [asphalt](../diagnostics/crescent-bugs/scene-asphalt.png), [grass](../diagnostics/crescent-bugs/scene-grass.png), [rock](../diagnostics/crescent-bugs/scene-rock.png). The gallery also records [brown earth](../diagnostics/crescent-bugs/tactical-earth.png). At tactical size, shell seams recede; the low crescent swarmer, open mantis lurker, broad beetle brute and clustered spawner remain identifiable through their outlines and tan/dark contrast.

The builders are [bug_parts.py](../../../tools/art/models/bug_parts.py) and [crescent_geometry.py](../../../tools/art/models/crescent_geometry.py). Rebuild from the repository root:

```sh
node tools/art/build-textures.mjs
blender -b --python tools/art/make_model.py -- --script tools/art/models/bug-swarmer.py --id bug.swarmer --category bugs --file bug-swarmer.glb --quality final --max-triangles 16000 --size 1024 --samples 48
blender -b --python tools/art/make_model.py -- --script tools/art/models/bug-lurker.py --id bug.lurker --category bugs --file bug-lurker.glb --quality final --max-triangles 18000 --size 1024 --samples 48
blender -b --python tools/art/make_model.py -- --script tools/art/models/bug-brute.py --id bug.brute --category bugs --file bug-brute.glb --quality final --max-triangles 20000 --size 1024 --samples 48
blender -b --python tools/art/make_model.py -- --script tools/art/models/egg-spawner.py --id bug.egg-spawner --category props --file egg-spawner.glb --quality final --max-triangles 16000 --size 1024 --samples 48
node tools/art/preview/render-thumbnails.mjs bug.
# With pnpm dev running:
node tools/art/preview/capture-crescent-bugs.mjs
```

The exporter writes the JSON manifest; `src/graphics/data/model-manifest.ts` records matching heights and paths. Thumbnails keep their existing IDs. Captures are actual Blender/Three.js renders, with no generated paint-over. The swarmer remains byte-for-byte unchanged by this silhouette revision. The selected concept and the archived A/C concepts preserve their original image-generation provenance.
