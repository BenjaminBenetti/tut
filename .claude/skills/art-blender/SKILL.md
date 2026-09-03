---
name: art-blender
description: Make a real low-poly game model for Terra Under Threat with headless Blender: write a bpy script, export GLB, validate with trimesh, render three fixed isometric angles, look at them, iterate, then register the model in the asset manifests. Use for any new or replacement 3D model (units, mech parts, bugs, props, tiles, buildings).
---

# art-blender: model loop for Terra Under Threat

Headless, GPU-free. Every model is a Python script under `tools/art/models/` that builds geometry with `bpy_kit`, so models are reproducible and diffable. One command exports, validates, renders and records it.

```
tools/art/models/<name>.py ──► make_model.py ──► public/assets/models/<category>/<file>.glb
        ▲                          │                    ├── trimesh report (watertight, base on y=0, budgets)
        │  edit, re-run            ├──► docs/design/renders/<id>_{045,135,225}.png  ◄── Read these
        └──────────────────────────┘                    └── tools/art/placeholders.manifest.json record
                                                             then: model-ids.ts + model-manifest.ts, pnpm test
```

## Prerequisites (devcontainer, #190)

- `blender` 4.5 LTS on PATH (`blender -b --version`), trimesh inside Blender's Python.
- `art-python` (trimesh + cadquery venv) for standalone validation or CadQuery/OpenSCAD side work.
- No display needed: Cycles renders on the CPU in `-b` mode. Only Eevee/Workbench would need `xvfb-run`.

## The loop

1. **Read the brief**: style guide (`docs/design/style-guide.md`) §3 scale and silhouette, §4 palette, §6 conventions and budgets, §9 naming; the concept sheet under `docs/design/concepts/` if one exists; the existing placeholder in `tools/art/build-placeholders.mjs` for proportions and socket positions.
2. **Write the script** `tools/art/models/<kebab-name>.py` (copy `example-supply-crate.py`). Define `build()`; use `bpy_kit.box / cylinder / sphere / bevel / cut_below / join / socket`; optional `FOOTPRINT = (w, d)`.
3. **Run the loop**:
   ```
   blender -b --python tools/art/make_model.py -- \
     --script tools/art/models/<name>.py --id <faction.subject.variant> \
     --category <units|bugs|props|tiles|buildings> --file <kebab-name>.glb --quality final
   ```
   It exports the GLB, validates (exit 1 on failure), renders `docs/design/renders/<id>_{045,135,225}.png`, updates the JSON record, and prints the TypeScript manifest entry.
4. **Look**: `Read` the three PNGs. Check silhouette at a glance, palette, that the front faces the 45° camera's lower-left, nothing floats or clips, sockets sit where parts attach. Fix the script and re-run; each run is a few seconds.
5. **Register**: add the id to `src/content/data/model-ids.ts` and the printed entry to `src/graphics/data/model-manifest.ts`; if a screen shows it, add a thumbnail (`node tools/art/preview/render-thumbnails.mjs`, then `src/ui/data/thumbnail-manifest.ts`). Run `pnpm typecheck && pnpm lint && pnpm test` (the manifest sync test compares the JSON record to the TS entry).
6. **PR**: one model or one coherent kit per PR; include the renders under `docs/design/renders/` so review needs no tooling. Sidecars are not needed for scripted models: the script is the source.

Review any GLB (including the three.js placeholders) the same way: `blender -b --python tools/art/render_glb.py -- --glb <file> --out <dir>`.

## Conventions the kit enforces or expects

| Rule | Detail |
|---|---|
| Axes | Build in Blender with Z up and the **front facing −Y**; `export_glb` writes +Y up so the front becomes +Z (three.js/glTF). |
| Scale | 1 unit = 1 tile = 2 m. Infantry figure 0.9 u, mech 2.4–3.2 u, swarmer 0.5, lurker 1.3, brute 1.8, spawner 1.4, wall 1.5 × 1 × 0.1, floor 1.5 u per level. |
| Pivot | Base centre: feet on z = 0, footprint centred on the origin. Walls pivot at the base midpoint along +X. Sub-parts (arms, weapons) pivot at their socket. A mound or boulder sunk into the ground gets `cut_below(ob)` so nothing hangs under z = 0 (the validator rejects it). |
| Materials | One flat Principled material per palette token, named after the token (`bpy_kit.material`). No textures on scripted models; units pick up the atlases later via material name. |
| Shading | Flat. `bpy_kit` primitives are flat by default; organic bug flesh may pass `smooth=True`. `bevel(ob, 0.03)` chamfers armour plates (about 2× the triangles of a plain box; keep it for hero parts). |
| Sockets | `socket("arm_l", (x, y, z))` creates an empty `socket_arm_l`; mechs expose `chassis`, `arm_l`, `arm_r`, `back`, `weapon`, `muzzle`; spawners `hatch`; door walls `door`. |
| Naming | Files kebab-case with faction/kit prefix (`tdf-mech-chassis-bulwark.glb`, `bug-lurker.glb`, `city-road-corner.glb`); ids dot-separated `faction.subject.variant`. |
| Watertight | Every mesh closed. The validator merges the exporter's split flat-shading vertices before checking, so only real holes fail. |

Triangle and file budgets (style guide §6, `--max-triangles` per class):

| Class | Triangles | File |
|---|---|---|
| Infantry figure / squad | 300 / 1 500 | 100 KB |
| Mech chassis / legs / arm / weapon | 1 200 / 800 / 400 / 300 | 150 KB per part |
| Swarmer / lurker / brute | 600 / 1 000 / 2 000 | 100 KB |
| Egg spawner | 1 200 | 100 KB |
| Tile piece | 60 | 20 KB |
| Building module | 800 | 100 KB |
| Prop | 300 | 60 KB |

Hard cap for anything: 500 KB (the validator's default).

## Manifest registration

`src/content/data/model-ids.ts` holds `MODEL_IDS` (declare first); `src/graphics/data/model-manifest.ts` holds `MODEL_MANIFEST` typed against `ModelAssetEntry` (`category`, `path`, `footprint`, `height`, `sockets`, `quality`; no `id` field). `tools/art/placeholders.manifest.json` must carry the same record plus `triangles` and `bytes`; `make_model.py` writes it, and `build-placeholders.mjs` preserves records it did not create. The sync test in `src/graphics/data/model-manifest.test.ts` fails on any mismatch, which is the intended guard. Replacing a placeholder: keep the id, overwrite the GLB, set `quality: "final"`, remove the id's definition from `MODEL_DEFS` in `build-placeholders.mjs` so the two pipelines do not fight over the file.

## CadQuery and OpenSCAD

For parts that are easier as CSG: build with `art-python` (CadQuery) or `openscad -o part.stl part.scad`, then in the model script `bpy.ops.wm.stl_import(filepath=...)` and assign materials with `bpy_kit.material`. Keep the source next to the model script.

## Gotchas

- Script arguments go after `--` on the Blender command line; `sys.argv` before it belongs to Blender.
- `bpy.ops.wm.read_factory_settings(use_empty=True)` first, or the default cube ships in your GLB.
- `export_apply=True` bakes modifiers and scale; the kit applies scale on primitives so `ob.scale` never leaks into the file.
- Blender's cone operator is `primitive_cone_add(radius1=bottom, radius2=top)`; `bpy_kit.cylinder(radius_top, radius_bottom, ...)` wraps it.
- Cycles CPU: 32 samples at 640 px takes about a second per angle on this hardware; raise samples only for a final hero render.
- Renders are not byte-stable across machines; commit them as review artefacts, never assert on them in tests.
- The GitHub API budget is shared: poll at most every 5 minutes and use `gh api` (REST).
