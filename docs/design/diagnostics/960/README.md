# Building-use frontages (#960)

[Cause assessment before implementation](https://github.com/BenjaminBenetti/tut/issues/960#issuecomment-5592338100):
use already exists in `Building.kind`, but wall selection and generic outdoor
clutter do not express it. This work develops wall-mounted use cues and tests
them against both reported seeds. MapGen supports the outdoor arrangement.

The final paired baseline is main `9d9ea012e97292ae3f96e2500f1609a1cfdbf412`,
including the material-contact, rural-track and roof-control repairs. All six
baseline views repeated byte-identically in a second browser and were inspected.
All six after views also repeated byte-identically and were inspected, on
`2a979c7` with the accepted #1032 unit-only reveal integrated. The rural PNG
is byte-identical to its current-main control (zero changed pixels), and all
three complete map JSONs are unchanged. Sidecars identify the source commits.
The camera focuses on the reported coordinate before computing the native
crop so Map Lab's timing panel cannot enter the scene comparison. These retain
the reported 45 px/tile, viewport, focus and two angles; this is a fresh
before/after pair, not a claim of pixel identity to the older Critic PNGs.

| Views | Recipe | Focus `(x, layer, z)` |
| --- | --- | --- |
| I01/I02 | mc-resume-01, temperate/city/medium (72²), initial/right turn | (43,2,39) |
| I03/I04 | mc-opening-02, temperate/city/medium (72²), initial/right turn | (23,1,34) |
| S01 nearby shop/workplace/home | mc-resume-01, temperate/city/medium (72²), initial | (24,2,37) |
| C01 rural control | mc-opening-01, temperate/rural/small (48²), initial | (23,4,13) |

Models and preview units are on, slope is 100%, all levels shown. Each crop is
1300×1050 from a 2400×1500 viewport; exact camera state, clip and hashes are in
`captures.json`. The helper waits separately for actual map models and preview
unit models, then a rendered frame. Rotation calls the real rig directly;
there is no delayed DOM keyup and no assumed camera easing.

```sh
# FRONTAGE_ROOT is a clean comparison checkout within this workspace.
FRONTAGE_ROOT=/workspaces/tut/.git/art-960/baseline \
  node tools/art/preview/capture-building-frontages.mjs before
# With the scene consumer applied:
node tools/art/preview/capture-building-frontages.mjs after
FRONTAGE_ROOT=/workspaces/tut/.git/art-960/baseline \
  node tools/art/preview/capture-frontage-cutaway.mjs before
node tools/art/preview/capture-frontage-cutaway.mjs after
```

The helpers own port 8797 and close Chromium/Vite in `finally`. Run sequentially.
Restart the server after runtime changes; capture HMR/watch is disabled. Full
map dumps go to `.git/art-960/`, while review frames and their sidecars are
committed here. One initial 30 s diagnostic navigation timed out under software
render load; navigation and screenshots use a 120 s diagnostic budget. No game
or CI timeout was changed.

The flat-roof cutaway check uses the existing #943/#947 scene at yaw 2, with no
parameter overrides. Following #1023, only units reveal the interior: one squad
and two separated squads, then exact closure after they leave. A ground-storey
view and exact all-level restoration check attachments against the real layer
API. A separate controlled vision view divides the building into visible,
remembered and never-explored columns, using the real tile index and vision API;
restoring full vision must reproduce the closed control exactly. This checks
the new attachments themselves, alongside the separate live seed-4242 mission
frames. Every case repeats in a second browser. Shader state is recorded beside
the frames; no pointer source is introduced for this evidence.

[Kit and mount contract](../../kits/building-frontages.md).
`model-validation.json` records the six exported GLBs: every material primitive
is watertight, within the 800-triangle / 100 KB module budget, with checksums and
bounds. For each entrance canopy, a conservative triangle-bounds test finds
zero triangles inside the 0.60 u clear door width below its 1.20 u head after
mounting. The native source and three-angle renders accompany the kit.

All 30 paired context/visibility PNGs repeated byte-identically in separate
browsers. The nine visibility cases per phase use baseline `9d9ea01` and after
`f0bd0b9` (same runtime as the context after). All distinct views were opened.
The attachments follow the wall’s fog and unit reveal, and upper-storey details
leave with the real layer cut. In each phase, restoring levels, restoring full
vision, and both unit departures reproduce the closed roof exactly: eight
independent closure checks. `comparisons.json` records every pair’s SHA and
changed-pixel count, plus the three exact full-map controls.

My read: the domestic guards/planters and shared-entry mail make the apartment
and house fronts less anonymous, while the nearby shop awning and broader work
canopy supply a contrasting use where those kinds actually occur. Existing
heights, restrained windows, roofs and roof access remain useful. The shallow
guards are not standing balconies. The reported second group remains apartments.
Generic yard boxes/sandbags/rocks are unchanged; MapGen’s supporting outdoor
arrangement remains open. This is a frontage-kit submission for Director and
Critic judgment, not a claim that the whole #960 outcome is complete.

The live seed-4242 fog frames and final validation results accompany the PR.
