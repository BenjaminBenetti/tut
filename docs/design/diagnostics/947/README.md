# Pointer inspection (#947)

Historical evidence: pointer inspection was removed in #1023. The commands and
frames below describe the accepted #982 implementation; reproduce that version
at commit `9aefe64eb01822e2a3955c3c546216b3364008c7`. Unit ghosting remains active.

Hovering building geometry opens a local inspection window without a squad inside.
The pointer uses **radius 3**, follows the **raw cursor**, and shares the accepted
**0.175 opacity floor** and **0.65 inward soft edge**. Unit reveals stay at radius
4 with all eight source slots. The pointer is a separate source, composed by
minimum opacity so overlap does not become extra transparent.

[Parameters and input diagnosis stated before code](https://github.com/BenjaminBenetti/tut/issues/947#issuecomment-5589887736).
The Director authorized this direction in comment 5589922789. Art chose the
smaller inspection window because it can move freely across a building; the
larger force window must expose the room around a squad. The first pitched and
flat frames support radius 3: furniture and room divisions become visible while
the surrounding roof still reads as shelter.

The pointer waits **120 ms on a building**, then fades over **150 ms**. It tracks
continuously inside that building. Open ground, canvas leave, loss of focus or
a button drag closes it; a different building closes the previous source before
opening the next one. A stationary pointer does not repeat the map raycast.

## Frames

Unaltered 1200×950 browser captures through the real model loader, tactical
scene builder, shared shader and pointer controller. Both generated fixtures
and cameras are the #937 indoor setup, now on main after #943. The operating
system cursor is absent from browser screenshots; the table records its canvas
coordinates. No diagnostic marker is painted into the scene.

| Building / camera | Open ground (15,475) | Hover (600,475), no squad | Pointer (760,405) plus squad | Pointer leaves, no squad |
|---|---|---|---|---|
| Pitched, yaw 0 | [closed](pitched-yaw0-open-ground.png) | [hovered](pitched-yaw0-hover.png) | [overlap](pitched-yaw0-overlap.png) | [closed again](pitched-yaw0-pointer-left.png) |
| Pitched, yaw 2 | [closed](pitched-yaw2-open-ground.png) | [hovered](pitched-yaw2-hover.png) | [overlap](pitched-yaw2-overlap.png) | [closed again](pitched-yaw2-pointer-left.png) |
| Flat, yaw 0 | [closed](flat-yaw0-open-ground.png) | [hovered](flat-yaw0-hover.png) | [overlap](flat-yaw0-overlap.png) | [closed again](flat-yaw0-pointer-left.png) |
| Flat, yaw 2 | [closed](flat-yaw2-open-ground.png) | [hovered](flat-yaw2-hover.png) | [overlap](flat-yaw2-overlap.png) | [closed again](flat-yaw2-pointer-left.png) |

Each camera also has `hover-shifted` (the same 760,405 pointer with no squad),
`squad-only`, and `overlap-left` frames. The three views separate the pointer's
contribution from the existing force window. See [capture records](captures.json)
for live source counts/strengths, pointer centres, hashes and baseline equality.

The matrix was captured at runtime commit **0af63ba**, containing main through
**b6928d0**. The reference is a **fresh render of main@3c04481**, which contains the accepted
#943 settings. The older #937 indoor matrix was captured before #936 generation
changes, so it is not the baseline for this feature. The baseline does not have
a pointer controller; its `pointer=1` query is ignored. Closed-roof and squad-only
candidate frames must match their equivalent baseline bytes, and pointer-leaves
frames must return exactly to those same controls. No image tolerance is used.
All **28 frames were rendered again on runtime bc2f47f**, which adds resize
handling and Map Lab composition, and every PNG remained byte-identical.
All 16 baseline/closure comparisons passed.

## Live input and Map Lab

[Input measurements](interaction.json) exercise the controller through browser
events, without changing its uniforms. A requested 60 ms sweep actually spent
65.9 ms over the building: all 25 sampled strengths remained zero, and the
[closed frame](pitched-yaw0-brief-sweep-closed.png) matched the open-ground control
byte for byte. Middle-button drag closes inspection; release opens it again.
Twenty stationary frames added no raycasts (27 before and after). Across 28
picks in this 48×48 fixture, median CPU time was 2.1 ms, p95 4.0 ms, maximum
6.9 ms. This is a fixture measurement, not a large-map performance claim.

Map Lab uses its own scene loop, so it has a separate live-entry check:
[closed](map-lab-closed.png), [hovered](map-lab-hover.png), and
[pointer leaves](map-lab-pointer-left.png). The last frame is byte-identical to
the first. [The record](map-lab.json) contains the seed, URL, camera and exact
pointer coordinates. Reproduce at 1200×950, apply wheel delta −900 at (800,450),
then move to the recorded pointer position. No units are present. Both probes
reported zero page errors.

## Fog and validation

The seed-4242 mission was captured at turns 1 and 7 using
`CAPTURE=1 pnpm exec playwright test e2e/fog-screenshot.spec.ts`:
[turn 1](../../tactical-fog-of-war.png), [turn 7](../../tactical-fog-of-war-turn7.png).
Both were inspected. Compared with the PNGs committed on main **b6928d0**, the
scene below the 41 px top banner has **zero changed pixels** in both frames.
The full images differ in 2,002 and 1,984 pixels respectively, confined to
x=72…482, y=10…29: the banner now names Johannesburg following merged #948.
The previously committed controls predated that HUD refresh. This is not a claim
of full-frame equality. [Hashes, bounds and pixel counts](fog-comparisons.json)
record the exact comparison.

Local validation: typecheck, lint, build, **2,190 unit tests** (one skipped),
**seven simulation tests**, **59 browser tests** (27 opt-in captures skipped),
and the fog capture all pass. Regression tests include actual shipped pitched
roof geometry, hidden levels, open ground, source bindings, dwell, building
handoff, drag/leave/focus, resize and stationary-pick invalidation.

## Depth and picking

The normal action picker can return a unit, spawner or walkable tile. A pitched
roof has no walkable tile at its visual level, so that route cannot identify the
roof. The graphics picker uses the foremost visible model instance's owner tile
to identify its building. Hidden levels and retired placeholder meshes are
excluded. Shader discard never changes the CPU raycast surface, so opening a
roof cannot make a stationary pointer lose it and flicker.

The centre follows the cursor ray to 0.70 u above the floor beneath the hit
surface, capped 0.05 u below a lower hit. [The opposite-camera depth study](depth-study/README.md)
rejected the initial floor + 0.05 u anchor because it exposed lower brickwork
and ground through the near floor. The shallower choice retains a clearer room plan. The anchor is capped before the containing footprint
rectangle's far shell if that ray would leave the building. Its projected centre
stays exactly at the pointer. Ground floors do not open into the earth. Geometry
behind the anchor keeps the same fragment depth rule as the unit reveal.

This is still a view-plane cutaway. Near a building edge it can include nearer
floor edges or front walls; it is not a mask that isolates one storey. The depth
revision reduces the lower-storey exposure in the matched centre view, while
the shifted-pointer and overlap frames show the remaining edge behaviour.

This observes canvas pointer events in graphics and is composed in
`DomTacticalSceneHost` and Map Lab’s own scene loop; move/attack picking and commands are untouched. Fog tint
and visibility state stay intact, and units that vision excludes remain absent.

## Reproduce

Start a stable Vite server on the candidate tree (restart it after code changes):

```sh
pnpm exec vite --config tools/art/preview/capture-vite.config.mjs --port 4199 --strictPort
```

Serve a detached main@3c04481 worktree on port 4198 with watching/HMR disabled
and a distinct Vite cache. A worktree under `.git` also needs `server.fs.deny: []`
in its local capture config. Then run:

```sh
node tools/art/preview/capture-pointer-cutaway.mjs
```

Use `--resume` after an interrupted capture: completed image/control hashes are
checked before remaining cases run. `--verify` renders all cases again and
requires byte equality with the saved matrix. The driver moves the real browser pointer and waits for the live uniforms and
rendered frames. It loads both baselines before each camera's candidate series.
Seeds: `mc-opening-01`, temperate/rural, pitched; `mc-opening-02`, temperate/town,
flat. Small 48×48 map, slope share 1, zoom 80, yaws 0 and 2. Unit tiles are
(24,4,15) and (25,6,14) respectively. Both use current layer height 0.75.
