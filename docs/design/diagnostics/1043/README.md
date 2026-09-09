# Coastal rural route identity (#1043)

[Cause before production edits](https://github.com/BenjaminBenetti/tut/issues/1043#issuecomment-5594274929): coastal trails and natural bare earth share `dirt` and `tile.ground.dirt`. In `mc-resume-03 / coastal / rural / small`, 29 of 108 road columns already have the road paint before RoadPass, and 41 road-to-ground edges share it afterwards. `cause.json` records the real road-mask distinction at z10: x14–15 are road, x13/x16 are natural ground. Camera focus (21,2,10) is natural ground, not a road coordinate.

The proposed bounded repair is coastal's rural trail paint using existing `rock`, absent from the coastal natural grass/sand/dirt palette. Before/control evidence and the 108-map baseline survey are recorded before that production edit. No finished repair or visual acceptance is claimed yet.

Baseline main `1b0ff8d` has the same runtime as reported `9d9ea01`; its later commits are docs only. The original D1/E1/E2 Critic crops at `ce1ea0c` were opened. Fresh paired views retain their recipes, focus, two angles and 45 ground-axis pixels per tile, in a 2400×1500 viewport with native 1300×1050 crops centred on the focus. This is a fresh pair, not a claim of identical pixels to the older crop.

`capture-coastal-trails.mjs` owns port8797 with HMR/watch disabled and closes browser/server in finally. It uses the real generator, model/unit readiness and camera rig; diagnostic access only records map and renderer counters. All seven views repeat in two browsers; PNG hashes and source commits are in each phase's `captures.json`. The temperate two-angle, snowy y3 and desert y2 controls use the accepted `mc-resume-01` recipes. Full maps go to `.git/art-1043/`.

```sh
ROAD_CAPTURE_ROOT=/workspaces/tut/.git/art-1043/baseline \
  node tools/art/preview/capture-coastal-trails.mjs before
node tools/art/preview/capture-coastal-trails.mjs after
node tools/mapgen/survey-trail-identity.mjs .git/art-1043/before-survey.json
```

The existing survey observes actual RoadPass paint, full maps, non-surface map data, complete off-road tiles, road segments, metrics and relocations across four biomes × three settlements × three sizes × three seeds. It will be paired after the proposed paint edit, rather than reconstructing a baseline from final dirt tiles.
