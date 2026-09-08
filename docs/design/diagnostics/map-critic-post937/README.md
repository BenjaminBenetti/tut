# Map Critic — merged cutaway re-check, 2026-09-08

**Picture improved.** The merged radius **4** and opacity floor **0.175**
expose substantially more useful room context: walls, furniture, floor space
between objects and the relationship between two separated squads. This
holds for pitched and flat roofs and the opposite camera. The light surface
trace and intact outer roof/facade still explain the enclosing building.
Both roof types visibly close again after the squads leave, from both sides.

Preserve that wider readable interior and reliable return to full shelter.
The broad two-squad opening is the Executive Director's selected tradeoff;
this verdict does not reopen radius 3. The stipple remains visible and the
interior palette remains dim. Neither erases the improvement in these views;
this is not a general interior-lighting sign-off. The Director's separate
request to assess brightness during play remains recorded in the #916/#937
history.

## Baseline and method

Captured on main **`5040bd001a5c54f4ba16597a3a5b101f63cbc4ab`**, containing
#943 / merge `5e4ea1abb6eebcfed0f45e6dcc57bb9cf6491d26` and the #936 removal.
The six `runtime` frames use the unoverridden merged cutaway control; the
recorded live values are 4 / 0.175. The six `old` frames use **the same
current-main scenes** with the control's diagnostic overrides `radius=2`
and `floor=0.35`. They isolate the previous tuning, not an older game build.
No game, shader or map data was edited by the Critic.

The six comparison sheets were visually inspected at native frame dimensions;
the four closure PNGs were opened separately. Sheets pair the two original
1200×950 frames without resizing, with captions added outside the pictures.
All 16 original PNGs and sidecars remain in [details](details).
[Full capture manifest](captures.json) records URLs, actual squad positions,
viewports, live values, source hashes and reproduction recipes.

## Scenes

These are the Art Director's accepted actual-cutaway controls; Map Lab's
preview units alone do not exercise this controller. All levels, production
models/lighting, slope 100%, 80 pixels per world unit, fixed 1200×950 viewport.
Coordinates `(x,y,z)` use half-height map layers.

| Roof | Map recipe | Primary squad | Second squad |
| --- | --- | --- | --- |
| Pitched | `mc-opening-01`, temperate/rural/small (48²) | `(24,4,15)` | `(21,4,11)` |
| Flat | `mc-opening-02`, temperate/town/small (48²) | `(25,6,14)` | `(23,6,11)` |

The camera centres on the primary squad tile, at `tileTop(y) + 0.7`. Yaw 0
is the first orientation; yaw 2 views the opposite side. Each scene compares
one squad at yaw 0, two separated squads at yaw 0, and those same two squads
at yaw 2. Press L after each two-squad runtime view for the closure frame.
This is a visual check, not a movement, LOS, fade-timing or general gameplay test.

| Case | Previous-settings / merged-defaults pair | After squads leave |
| --- | --- | --- |
| Pitched, one, yaw 0 | [Compare](pairs/pitched-1-yaw0.jpg) | — |
| Pitched, two, yaw 0 | [Compare](pairs/pitched-2-yaw0.jpg) | [Closed](details/pitched-2-yaw0-runtime-closed.png) |
| Pitched, two, yaw 2 | [Compare](pairs/pitched-2-yaw2.jpg) | [Closed](details/pitched-2-yaw2-runtime-closed.png) |
| Flat, one, yaw 0 | [Compare](pairs/flat-1-yaw0.jpg) | — |
| Flat, two, yaw 0 | [Compare](pairs/flat-2-yaw0.jpg) | [Closed](details/flat-2-yaw0-runtime-closed.png) |
| Flat, two, yaw 2 | [Compare](pairs/flat-2-yaw2.jpg) | [Closed](details/flat-2-yaw2-runtime-closed.png) |

```sh
pnpm exec vite --config tools/art/preview/capture-vite.config.mjs --host 127.0.0.1 --port 4199 --strictPort
```

Open `/tools/art/preview/roof-cutaway.html?roof=pitched&units=2&yaw=0`
for a merged runtime example. Change roof, unit count or yaw as in the table.
Append `&radius=2&floor=0.35` for the matched previous-settings control.
The capture configuration keeps shared-store updates from reloading a frame.

## Watch outcome

The resumed seat's **one bounded watch completed**: started
2026-09-08 17:47:49 UTC, 300-second polls, hard deadline 20:47:49 UTC.
It exited at **18:07:51 UTC** on #943, merged at **18:05:54 UTC**. The
post-merge picture verdict above follows that event. No concurrent watch
or cron was installed; do not restart this completed loop.
