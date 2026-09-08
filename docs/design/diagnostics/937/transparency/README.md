# #937 / #943: radius 4, lighter local reveal

The Executive Director selected **radius 4** from the original comparison,
including the two-squad frame, then asked to double transparency. Radius 4 is
settled. This comparison tunes only the opacity floor. On 2026-09-08 the
Director accepted the 0.175 interpretation in the CLI and requested the final
frames before Tech Lead merge.

## Interpretation, stated before implementation

[Art's pre-implementation value and reasoning](https://github.com/BenjaminBenetti/tut/pull/943#issuecomment-5563083495):
**halve retained opacity, 0.35 → 0.175**. Transparency was already 65%; literally
doubling it gives 130%, which clamps to 100% and an opacity floor of 0. That
complete-removal alternative is included here for judgment.

The opaque-pass shader discards fragments with a 4×4 Bayer pattern. At the
fully open centre, 0.35 retains 6/16 fragments, 0.175 retains 3/16, and 0 retains
none. Thus 0.175 halves the central material sample density. It does not mean
that the numerical transparency doubles, or that every pixel in the window
changes by half: the inward soft edge and underlying scene still contribute.

## Art judgment

**I would ship radius 4 / floor 0.175.** The lighter material trace exposes
furniture, squad silhouettes and routes through the room more clearly than
0.35. The roof still leaves a visible surface over the revealed interior,
with the same solid roof beyond the window.

**Bayer read:** at the native 1200×950 capture size the ordered pattern remains
visible, especially against pale facade panels. At 0.175 it reads as a lighter
material veil, with clearer furniture edges and squad silhouettes than 0.35;
it does not overwhelm those improvements as noise. I would keep the existing
discard technique for this tuning pass. This is a judgment from the fixed
cameras, not a claim that stippling is invisible at every zoom.

Floor 0 gives the clearest furniture silhouettes, but removes the local roof
and front-wall material entirely. With two squads, the interior reads like
an open model with roof strips around it. The whole building does not vanish:
its perimeter and geometry outside the windows still stand. The loss is the
trace of shelter over the rooms where the fight is happening. That is why I
would stop at 0.175. Both pitched cameras and the flat-roof room divisions support that choice.

Radius 4 still reveals most of this upper floor with two separated squads;
the Executive Director saw and chose that coverage. No radius compromise is
being reintroduced. The Director judges this opacity comparison before merge.

## Frames

All candidates use radius 4. The original accepted interior/camera fixtures,
positions, lighting and map data are unchanged; [scene recipes](../README.md#fixed-conditions).
Yaw 2 is the opposite camera with the same target, zoom and two squads.

| Scene | Previous floor 0.35 | Chosen floor 0.175 | Literal doubled transparency, floor 0 | New setting after squads leave |
| --- | --- | --- | --- | --- |
| pitched, 1 squad(s), yaw 0 | [0.35](pitched-1-floor-0.35-yaw0.png) | [0.175](pitched-1-floor-0.175-yaw0.png) | [0](pitched-1-floor-0-yaw0.png) | [closed](pitched-1-floor-0.175-yaw0-units-left.png) |
| pitched, 2 squad(s), yaw 0 | [0.35](pitched-2-floor-0.35-yaw0.png) | [0.175](pitched-2-floor-0.175-yaw0.png) | [0](pitched-2-floor-0-yaw0.png) | [closed](pitched-2-floor-0.175-yaw0-units-left.png) |
| pitched, 2 squad(s), yaw 2 | [0.35](pitched-2-floor-0.35-yaw2.png) | [0.175](pitched-2-floor-0.175-yaw2.png) | [0](pitched-2-floor-0-yaw2.png) | [closed](pitched-2-floor-0.175-yaw2-units-left.png) |
| flat, 1 squad(s), yaw 0 | [0.35](flat-1-floor-0.35-yaw0.png) | [0.175](flat-1-floor-0.175-yaw0.png) | [0](flat-1-floor-0-yaw0.png) | [closed](flat-1-floor-0.175-yaw0-units-left.png) |
| flat, 2 squad(s), yaw 0 | [0.35](flat-2-floor-0.35-yaw0.png) | [0.175](flat-2-floor-0.175-yaw0.png) | [0](flat-2-floor-0-yaw0.png) | [closed](flat-2-floor-0.175-yaw0-units-left.png) |
| flat, 2 squad(s), yaw 2 | [0.35](flat-2-floor-0.35-yaw2.png) | [0.175](flat-2-floor-0.175-yaw2.png) | [0](flat-2-floor-0-yaw2.png) | [closed](flat-2-floor-0.175-yaw2-units-left.png) |

## Reproduce and verify

The exact indoor matrix below was captured at commit **3dfea65**; use that
revision to reproduce its unchanged map background and pixel controls.

```sh
pnpm exec vite --config tools/art/preview/capture-vite.config.mjs --host 127.0.0.1 --port 4199 --strictPort
node tools/art/preview/capture-cutaway-transparency.mjs
CAPTURE=1 pnpm exec playwright test e2e/fog-screenshot.spec.ts --workers=1
```

The two-day pause interrupted the original capture after 16 of 18 candidates.
`node tools/art/preview/capture-cutaway-transparency.mjs --resume` verifies
completed PNG hashes and closure controls, then finishes the remaining cases.
The resumed command exited successfully on 2026-09-08: all 18 candidates, six
original controls, six runtime/closure pairs and 28 inspected PNGs are complete.

Restart the dedicated Vite server after editing its source: file watching/HMR
is disabled to prevent shared pnpm-store updates from reloading a screenshot.
The diagnostic page's `floor` override accepts 0; omitted uniforms use the real
production settings. No player-facing tuning controls are added.

The capture script checks the live radius, opacity floor and active unit count.
Each of the six 0.35 frames must match its original radius-4 frame byte for byte.
For every 0.175 candidate, a second load without either uniform override must
match exactly. Removing all squads and waiting for the existing 150-ms fade
must then produce the exact empty-building/controller-off control at that
camera. No tolerance, alignment or occupancy mismatch is allowed.

[captures.json](captures.json) records each candidate's URL, unit coordinates,
uniforms, hash, baseline equality and runtime/closure assertions. Empty-building
controls and all six final closure frames are committed alongside the 18
comparison frames. Depth comparison, inward softness 0.65 u, fade 0.15 s,
eight-centre capacity, visible-unit source and lighting stay unchanged. Overlaps
still take minimum opacity and do not multiply transparency.

## Validation

Typecheck, lint, build, **2,167 unit tests** (one skipped) and **59 browser tests**
(27 opt-in skips, zero flaky) pass after the revision. Seven simulation tests
passed in the original radius pass; this revision changes no simulation code.

Both seed-4242 fog frames were regenerated and inspected after merging
**main@360778a** into the branch. Capture tree **3d9df1b**, radius **4 / floor
0.175**, using the ordinary fog spec. Both hashes match Tech Lead's independent
twice-repeated captures exactly:

- Turn 1: `480b4516103298fbd7ca5657ba540c6b819e351747811defbb9c0d1ab121448a`
- Turn 7: `97d42868bc4c4c4f8433dbf70d70726aa7a240d8a64900f48e15d570c9bef4ee`

[The corrected comparison record](fog-comparisons.json) compares these actual
head renders against **main's tracked PNGs**: **352,025** changed pixels at
turn 1 and **376,832** at turn 7. Main's tracked files predate later generation
changes, so this large full-frame difference is expected; it is not an isolated
measurement of the opacity change. Compared with the PR's earlier captures,
the new frames change **4,368** and **5,243** pixels respectively.

The earlier zero-difference fog claim used fresh **e014ab1** controls and did
not represent the integrated tree after #936/#940. Tech Lead caught that during
merge review; these renders and this record supersede that fog proof. The
accepted indoor comparison remains pinned to **3dfea65**, which uses the
original review tree's map data. Reproduce its exact matrix at that commit;
the final fog captures use the newer integrated tree. Neither the cutaway
constants nor the shader changed during this correction.
