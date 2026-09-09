# #1005 — bounded cause assessment, before production repair

Runtime: `ba4d7b1fb909d84f1c6a88f7d675415344df6155`, 2026-09-09. These are dated diagnostic acceptance records, not executable image baselines or a proposed fix. No game source changed. The remaining repair is queued after #960 by the Producer.

Recipe: coastal / rural / small, `mc-opening-01`, focus (40,0,4), initial and one E turn, 55 px/tile, models and preview units on, slopes 100%, all levels, 2400×1500 viewport. Native crops are 1200×1000. JSON records actual camera, focus pixel, clip, full water coordinates, mesh transforms, software-renderer statistics and image hash. The focus recipe matches the Critic; the precise camera translation differs slightly from the historical Critic capture. Every comparison in this assessment uses our identical camera. No pixel-exact match to the older camera is claimed.

| Render | What it isolates | Finding |
| --- | --- | --- |
| [S1](S1-water-surface.png), [S2](S2-water-surface.png) | Unmodified runtime | Fine initial grid, strong dashed grid after rotation, matching the reported defect. |
| `hide-models.json` | Both water GLB parts hidden | PNG is byte-identical to S2 (SHA-256 `0427fde0e8d73a7cf7290effdd4667fdf58e05e6e9868c33a4d0856693f49504`). They contribute no visible pixels in this view. |
| [Ground hidden](hide-ground.png) | Retained water placeholder hidden | Authored wavy water becomes visible, but box-edge seams remain. Simply exposing the current GLB is not the complete repair. |
| [Water shadow reception disabled](no-water-receive.png) | Water receives no cast shadows | Shore shadow disappears while the grid remains. The grid is not the shore's cast shadow. |
| [Ground top faces only](top-only.png) | Drops ground-box sides/bottoms, retaining original top triangles and transforms | Grid disappears; the coastline and its cast shadow remain. This isolates the shared internal box faces as the source of the visible seam. |

`TacticalMapView.buildTiles` retains a full ground box for every non-building ground column, including water. All 577 water columns here are at layer zero; their box top is Y=0.15. `resolveTiles` places the water asset at Y=0.105. Its measured bed top is 0.065 and surface top is 0.085: both below the retained box. Every column uses separate cuboid geometry. The renderer is therefore showing box tops and internal edge faces instead of a continuous water surface. There is no terrain-height or material boundary inside this water, and no missing generation grading is needed.

Repair ownership: graphics integration, with MapGen retaining the cross-domain ticket. A complete repair should render water as a continuous exposed surface without internal side faces and preserve the shoreline/support boundary. Current asset exposure alone is insufficient; no new asset has yet been established as necessary. The top-only probe is diagnosis, not a shipping design: it deliberately leaves the plain placeholder top and does not prove map-edge or all-seed behavior.

All five published PNGs were opened. An additional attempted renderer-wide shadow toggle did not actually remove existing shadow shading; that ineffective probe is excluded and is not evidence. The valid material-level no-receive probe above is the shadow comparison.

Capture checkpoint: `capture.mjs` and `cases.json` copy the scratch helper. It uses capture-only browser routes to expose the real renderer/camera and alter diagnostic mesh visibility/geometry after generation. It currently expects its cases at `.git/mapgen-1005/cases.json`, writes under `.git/mapgen-1005/captures`, and a Vite server on 5177. Copy these checkpoint files there to replay, then run `node .git/mapgen-1005/capture.mjs before`; probes use `WATER_PROBES_MODE=1 WATER_PROBE_LIST=top-only,hide-ground,hide-models,no-water-receive node .git/mapgen-1005/capture.mjs probes`. No full software test gate is claimed for a docs-only diagnostic checkpoint.
