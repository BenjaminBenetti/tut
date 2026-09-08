# Unit-only building reveal (#1023)

Pointer position no longer opens a building. The unit reveal retains radius 4,
opacity floor 0.175, eight slots, minimum-opacity composition, the 0.65 inward
soft edge, depth comparison, Bayer discard and 150 ms fade.

The comparison base is **v0.2.15, `9d9ea012e97292ae3f96e2500f1609a1cfdbf412`**.
It is a clean checkout, with the repaired #1013 harness and current terrain.
The paired captures use the existing generated #943/#947 interior fixture and
the production unit controller, scene builder, models and shader. No radius,
opacity or ghost-strength override is applied.

| Scene | Current-main hover | Removed pointer, same position | Current-main squad control | Unit reveal after removal |
| --- | --- | --- | --- | --- |
| Pitched house, one squad, yaw 0 | [before](before/pitched-yaw0-hover.png) | [after](after/pitched-yaw0-hover.png) | [before](before/pitched-yaw0-squad.png) | [after](after/pitched-yaw0-squad.png) |
| Flat roof, two separated squads, yaw 2 | [before](before/flat-yaw2-hover.png) | [after](after/flat-yaw2-hover.png) | [before](before/flat-yaw2-squad.png) | [after](after/flat-yaw2-squad.png) |

All hover frames use the real browser pointer at **(760,405)** in a **1200×950**
viewport. The system cursor is not painted into browser screenshots; coordinates
and live unit uniforms are recorded in each `captures.json`. The baseline
confirmed that this pointer visibly opens both empty roofs. After removal,
each hovered empty roof matches the corresponding closed-roof PNG exactly.

The squad-only after frames match their current-main controls **byte for
byte**. Keeping the pointer over the roof also leaves those unit frames
unchanged: [one squad](after/pitched-yaw0-squad-hover.png),
[two squads](after/flat-yaw2-squad-hover.png). After the units leave, the pointer
stays over the building and both roofs close exactly to their empty
controls: [pitched](after/pitched-yaw0-units-left.png),
[flat](after/flat-yaw2-units-left.png).

All 16 captures repeated byte-identically in a second browser. An independent
PNG and decoded-RGBA comparison verified **all ten after/control pairs: identical
bytes, zero changed pixels**. [Comparison results](controls.json) record each
pair and SHA-256; [before metadata](before/captures.json) and
[after metadata](after/captures.json) record source commits and live uniforms.

The fixture rejects failed model loads; the driver also rejects page errors and
asset-fallback warnings. A 500 ms observation after entering a roof exceeds the
removed dwell/fade interval; this tests the absence of a pointer response. Model
readiness and unit fade completion use their actual completion state, followed
by rendered frames.

```sh
# CAPTURE_ROOT is an untouched comparison checkout inside this workspace.
# Outputs always go to the calling checkout's docs/design/diagnostics/1023/.
CAPTURE_ROOT=/workspaces/tut/.git/art-1023/baseline \
  node tools/art/preview/capture-pointer-removal.mjs before
node tools/art/preview/capture-pointer-removal.mjs after
CI=true pnpm exec playwright test e2e/unit-only-cutaway.spec.ts --fail-on-flaky-tests
```

The helper owns localhost port 8798 and closes its browser and server in
`finally`; run passes sequentially. Metadata identifies the source commits.

Removed: the pointer controller and tuning, hovered-building picker and cache,
inspection-centre calculation, pointer-only canvas accessor, three pointer
uniforms and their shader branch, and the obsolete pointer capture driver.
Missions and Map Lab both stop wiring the pointer source. The map raycaster
remains for action picking. The unit controller, shared ghost materials and
unit shader calculation remain in place.
