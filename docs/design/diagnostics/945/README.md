# #945 — natural material contacts

The generator thresholds continuous terrain noise into one surface per two-metre column. The renderer previously assigned that column's complete texture to its top and slope. That made natural contacts follow square tile outlines. The cause was posted [before implementation](https://github.com/BenjaminBenetti/tut/issues/945#issuecomment-5591598475).

Pass-by-pass tracing of the actual recipes finds 524 exposed natural-material edges on the coastal example (445 terrain/terrain, 27 terrain/beach paint, 52 trail/terrain) and 142 on the snowy city example (all terrain/terrain). Lot/building passes repaint no ground columns in either example. These are natural surface ownership boundaries, not a lot-grading defect or missing art. `provenance.json` records the complete trace and map hashes.

## Change and limits

Natural tops and fitted slopes now sample the existing environment atlas through a continuous world-space material field. Seeded, bounded displacement breaks the straight contour; a narrow transition keeps distinct interiors. The same world coordinates meet across neighboring flat and sloping meshes. Explicit unwrapped texture derivatives prevent atlas mip seams where the repeating texture coordinate wraps.

The weights are baked once when authored models load, at 16 samples per tile (12.5 cm). Maximum contour displacement is 0.55 tile (1.1 m); this is a visual boundary, not a moved tactical tile. Grass/dirt/sand/snow weights occupy RGBA and rock is their exact quantized remainder. Three-way contacts cannot introduce an absent palette color. Pavement, water, building floors and walled ground retain their deliberate boundaries. Vertical faces keep their authored material. The implementation borrows all textures and geometry; it adds no assets, pillars, slope shapes or tile overlays.

No generator, surface ownership, height, slope, road width, cover, hook, prop or building changes. Full frozen-map hashes match the saved baseline for both reported recipes and the trail control. The map is unchanged by constructing the contact field. This does not repair the separately reported temperate trail identity (#959), change the straight water strip, or reopen judged slope geometry.

## Committed before/after

Baseline: `b315d5c`. Runtime: `4b45c46`. Both use the real Map Lab scene at 2400×1500, models and units on, slopes 100%, all levels. Each PNG has its recipe, URL, crop, exact camera state and renderer counts in the adjacent JSON. The second view is one E turn at the same focus. Pointer is moved off the scene after framing, preventing the new pointer cutaway from changing the subject.

| Case | Before | After |
| --- | --- | --- |
| Coastal rural small, `mc-opening-01`, (5,2,22), 45 px/tile | [M01](before/01-coastal.png) | [M01](after/01-coastal.png) |
| Same contact, one E turn | [M02](before/02-coastal-rotated.png) | [M02](after/02-coastal-rotated.png) |
| Snowy city medium, `mc-opening-02`, (56,2,62), 45 px/tile | [V01](before/03-snowy.png) | [V01](after/03-snowy.png) |
| Same yard, one E turn | [V02](before/04-snowy-rotated.png) | [V02](after/04-snowy-rotated.png) |
| Known-good snowy rural trail: small, `mc-resume-01`, (13,3,24), 45 px/tile | [Trail](before/05-snowy-trail-control.png) | [Trail](after/05-snowy-trail-control.png) |
| Accepted waterfront: coastal city medium, `mc-opening-03`, (51,1,40), 55 px/tile | [Waterfront](before/06-waterfront-control.png) | [Waterfront](after/06-waterfront-control.png) |

The primary control is the already distinct brown trail through snow in the critic's resume survey P03. Its sidecar records actual focus **(13,3,24)**; this reproduces that frame rather than the (13,2,24) textual request. The accepted waterfront is an additional control for hard pavement, broad carriageway, restrained markings and barrier boundaries.

## Cost and verification

The material field adds two textures: 2.26 MiB at 48², 5.08 MiB at 72², 9.04 MiB at 96², plus small shared material clones. The weights are allocated only for modelled views. Baking the three recipes measured roughly 150–320 ms on this shared host; this is a load cost, not a per-frame calculation. The reproducible diagnostic records its own timing with no timing assertion.

Capture sidecars record geometry, draw counts, programs and twelve RAF intervals with explicit `gl.finish()`, discarding the first four. SwiftShader completion times are heavily affected by shared CPU load and are **not hardware FPS benchmarks**. The previous unsynchronized RAF timing could report 16 ms while queued work stalled later; it is not used to claim this shader is free. The baked version avoids per-fragment noise and categorical interpolation. Final paired render counts and complete verification are recorded with the PR.

Reproduce the cause and the current map hashes:

```sh
node tools/mapgen/diagnose-material-boundaries.mjs
```

Run separate Vite servers from the baseline and fix checkouts with separate cache directories. Then, from this checkout:

```sh
CAPTURE_BASE_URL=http://127.0.0.1:5178 node tools/mapgen/capture-material-boundaries.mjs before
CAPTURE_BASE_URL=http://127.0.0.1:5177 node tools/mapgen/capture-material-boundaries.mjs after
```

`CAPTURE_ONLY=01-coastal` selects an individual case; the final sweep uses a fresh browser per case, alternating before and after. All captures use the actual camera rig and renderer, exposed only by capture-time instrumentation. No map data, geometry, lighting or gameplay module is substituted. Director frame judgment is required before the Tech Lead merges; the Map Critic re-checks afterwards.
