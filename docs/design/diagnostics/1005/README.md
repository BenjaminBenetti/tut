# Continuous coastal water (#1005)

[MapGen established the cause before production work](https://github.com/BenjaminBenetti/tut/issues/1005#issuecomment-5594628927), with [source-pinned isolation frames at `0b49492`](https://github.com/BenjaminBenetti/tut/blob/0b49492/docs/design/diagnostics/1005/assessment/README.md). In the reported recipe all 577 water columns are at layer zero. Their retained ground boxes cover the lower water GLB, and coincident internal box sides produce the regular grid. Removing only the diagnostic boxes' sides/bottoms removed the grid while retaining the shore shadow. Those frames remain MapGen's diagnosis, not this repair's after evidence.

[Art's production boundary was posted before the edit](https://github.com/BenjaminBenetti/tut/issues/1005#issuecomment-5594865939): keep the current visible blue top, material, height and per-tile vision/layer handling, and remove a side only when another flat, non-building water tile meets it at the same level. Top, bottom, shore faces, map edges and height-change sides remain. Geometry is shared by boundary mask across tiles and levels. The lower water asset remains as before; exposing its rippled appearance is a separate visual change, and MapGen's exposure probe still showed seams.

The regression casts rays from inside a 3×3 water body to all four outside edges and its top/bottom. It failed on the unmodified runtime because it hit an internal tile side one tile before the outer boundary. It passes after repair, with additional shore and unequal-water-height checks. All 40 map-view tests pass. No generation data or other ground geometry is changed.

These are fresh paired captures on baseline main **`cd37ce973bdfd5d41af4529fd98efdc3dee30ece`** and repair **`d7403df5835d099efa3b8588399f37ba97e82cd6`**, using the real Map Lab generator, model/unit readiness and camera rig. The same recipe/focus and pixels-per-tile are retained from the reported water views and #915 waterfront controls; these are not claims of pixel identity to older historical crops. Viewport 2400×1500, native 1200-wide crops, all levels, models/units on and slopes100%. Each phase repeats in two independent browsers, failing on drift, page errors or asset fallbacks. Exact camera, clip, source and renderer counters are in `before/captures.json` and `after/captures.json`.

| View | Recipe / focus / yaw / px per tile | Before | After |
| --- | --- | --- | --- |
| S1 water | mc-opening-01, coastal/rural/small, (40,0,4), 0,55 | [Frame](before/S1-water-surface.png) | [Frame](after/S1-water-surface.png) |
| S2 rotated water | same, yaw1 | [Frame](before/S2-water-surface.png) | [Frame](after/S2-water-surface.png) |
| W1 paved/railed city waterfront | mc-opening-03, coastal/city/medium, (51,1,40), 0,55 | [Frame](before/W1-city-waterfront.png) | [Frame](after/W1-city-waterfront.png) |
| W2 town waterfront | mc-opening-01, coastal/town/small, (37,2,14), 0,60 | [Frame](before/W2-town-waterfront.png) | [Frame](after/W2-town-waterfront.png) |
| P1 dry-ground control | mc-resume-01, temperate/rural/small, (13,2,24), 0,45 | [Frame](before/P1-dry-ground-control.png) | [Frame](after/P1-dry-ground-control.png) |

Art judgment: open water now reads as one body from both camera sides. The existing coast, blue/land distinction and shore shadows remain, as do the purposeful pavement and rails in the two waterfront controls. The dry-ground pair is PNG-byte-identical, zero changed pixels. All ten native frames were opened. Director judgment and Critic re-check are requested on this repair.

`comparisons.json` records all PNG hashes, exact camera/clip equality, pixel comparisons and renderer counters. All four complete generated-map JSON pairs are byte-identical. Changed RGBA pixels are S1 10,351; S2 10,858; W1 9,272; W2 8,213; dry control zero. Each phase also reproduced byte-for-byte in its second independent browser.

Splitting water instances by boundary mask adds 12 draw calls in S1/S2, 10 in the city waterfront and 13 in the town waterfront. Measured rendered triangles fall by 8,848 / 22,494 / 8,800 respectively, with 8 / 6 / 8 additional shared geometries and no additional textures or shader programs. Dry-control counters are unchanged. These are renderer counters for the captured cameras, including their render passes; they are not frame-time measurements. The map-level ground-water geometry falls from 6,924 to 2,556 triangles for the rural/town coast and from 17,268 to 6,148 for the city coast. Exterior water sides remain: 124 and 196 respectively.

Validation on runtime `d7403df`: typecheck, full ESLint/Prettier, build, **2,292 unit tests (one skip), seven simulation checks (one skip), and 66 Chromium tests (35 opt-in skips, zero flaky)** pass. The browser suite logged two city-road-straight fetch warnings; all twenty paired capture executions passed their asset-fallback/page/console-error checks. `validation.json` records the results. No timeout, loader or test budget was changed.

```sh
WATER_CAPTURE_ROOT=/workspaces/tut/.git/art-1005/baseline \
  node tools/art/preview/capture-water-continuity.mjs before
node tools/art/preview/capture-water-continuity.mjs after
```

The helper owns port8797 with HMR/watch disabled and closes browser/server in `finally`. Full-map dumps and local logs are under `.git/art-1005/`. Existing historical accepted PNGs elsewhere are left as dated records; later combined-main runtime remains the Tech Lead's merge gate.
