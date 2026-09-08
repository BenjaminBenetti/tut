# Current-main layer controls — useful floors, failed upper-limit control

Baseline **`d0837c613c524e718697ed0f6c32c831e1b9aac3`**, including #961's
storey controls and #978's per-building hillside cut. All eight fresh native screenshots have been opened. The discrepancy
at the upper limit repeats from a second camera side. The floor views are
useful, but the no-change upper-limit control fails.

Preserve the useful floor views: at 1 / 5, room boundaries, a corridor,
furniture and stairs are visible. One up reaches 2 / 5 and exposes the next
furnished floor; one down from the top reaches 4 / 5. Streets and ground
remain visible, giving the player context.

**The upper-limit control does not preserve the initial picture.** L1 starts
with an intact tower roof at 5 / 5. Pressing `]` once leaves the readout at
5 / 5 but removes the roof in L2. This is a visible roof/room change, not
merely an assertion about differing screenshot hashes. The pointer stays
outside the scene. No cause is inferred from generator or rendering code.

The #968 standing-orders watch subsequently reported this as an already
owned #978 regression, found by eng-3 during #996 and routed for a separate
roof repair. These frames corroborate it; they do not create a sixth Critic
ticket or claim discovery priority. My precise observed trigger is an up key
at the limit: both fresh initial views have a roof, and both lose it after
`]` with 5 / 5 unchanged. Do not generalise that to every first frame.

## Reproduction

Start a new campaign with seed **4242**, advance one day, enter the first
mission (**Johannesburg**, `mission-1`, mission seed **1127010053**).
This is the production tactical screen and its existing capture launch hook;
no save or map data was edited. The map is 48 × 48, 14 engine layers.

Frame the five-storey tower near tile **(3, 2, 26)**; its roof reference is
**(3, 12, 26)**. The viewport is 1800 × 1200. The camera was panned using
ordinary keyboard input, measured against the existing tile projection hook.
It stays fixed between L1–L5. The sidecars record the actual projection,
readout, input sequence, page errors and SHA-256. Move the pointer to
(0, 1199), outside the tactical scene, and wait 20 rendered frames after
input before capturing.

| Frame | Input since preceding frame | Readout | Visible result |
|---|---|---|---|
| [L1](L1-top.png) | Initial view | 5 / 5 | Roof intact. |
| [L2](L2-top-after-up.png) | `]` once | 5 / 5 | Roof removed despite unchanged upper-limit readout. |
| [L3](L3-one-down.png) | `[` once | 4 / 5 | One complete storey lower, rooms exposed. |
| [L4](L4-ground.png) | `PageDown` five times | 1 / 5 | Ground-floor rooms and stairs exposed. |
| [L5](L5-one-up.png) | `]` once | 2 / 5 | Next furnished floor exposed. |

Each PNG has an adjacent JSON with the same stem. Earlier failed-framing
pilots are excluded; they do not establish a game defect. This is a visual
re-check, not #996's repeated-run reproducibility certification, not an
above-cut-unit test (#981), and not a new version of the owned hillside issue.

## Second camera side

A fresh launch of the same mission uses one `E` rotation. Wait for the
rotation to settle, then pan with single settled keyboard taps to keep the
tower in frame. Between A1 and A3 the camera stays fixed. Exact final
projection and input state are in each sidecar.

| Frame | Input | Readout | Visible result |
|---|---|---|---|
| [A1](A1-top-rotated.png) | Initial view, rotated once | 5 / 5 | Roof intact from the other side. |
| [A2](A2-top-after-up-rotated.png) | `]` once | 5 / 5 | Same upper-limit roof loss; room plan exposed. |
| [A3](A3-ground-rotated.png) | `PageDown` five times | 1 / 5 | Ground-floor rooms, corridor and stairs legible from this side. |

The good floor cuts should be preserved. The fixed upper-limit control
should retain its already displayed top view when an up press cannot change
the storey, without dropping the roof beneath an unchanged readout.

## Hillside evidence opened, separately attributed

I also opened both of the engineer's **same-run** hillside frames committed
in merged #1003 (`29639b3e2289b6f42f50f9497c688a1c1e17e0f4`):
[before](https://github.com/BenjaminBenetti/tut/blob/29639b3e2289b6f42f50f9497c688a1c1e17e0f4/docs/design/tactical-layer-cut-hillside-before.png)
and [after](https://github.com/BenjaminBenetti/tut/blob/29639b3e2289b6f42f50f9497c688a1c1e17e0f4/docs/design/tactical-layer-cut-hillside-after.png).
The former empty area now contains ground-floor rooms, doors, furniture and
stairs. That is an actual improvement in the hillside picture. These are the
engineer's captures, not mine; the before frame invokes the old cut rule in
the same run, rather than depicting a separate historical build. This does
not replace the still-owed flat-map preservation control under #996/#978.
