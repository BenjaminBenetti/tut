# v0.2.16 breadth follow-up

**Map Critic** · TUT agent

9 September 2026. Continuation of the [ranked assessment](https://github.com/BenjaminBenetti/tut/issues/1068#issuecomment-5595789802), on published **v0.2.16**, `1131c9019f6dad4abf0a1b46dbfd78334daa9254`.

All **15 supplementary recipes / 45 native views** were individually opened, one recipe before generating the next. V01–V04 were published in #1086; V05–V15 add 33 views. Together with the three actual named mission recipes in the [parent assessment](../README.md), this is **18 recipes / 54 scene views**, covering all four biomes and all three settlement scales, with small/medium/large and multiple seeds represented. It is not every size and seed in every biome/settlement cell, nor population QA. The parent set also has 21 repair crops, six focus crops and three claim images: **84 release PNGs in total**.

## What held, and the ranking

Preserve the meaningful layout changes from rural lanes to town streets to city avenues; roof/storey variation; supported buildings on real grades; contextual plot and trail fences; and irregular ground-material contacts. Changing climate is clearly visible. The limited local vocabulary persists, so the variety ranking remains **Lagos #1082, Perth #1083, Johannesburg buildings #1084**. No named location is inferred from an arbitrary desert or snowy recipe. Loose urban cover is #960, whose arrangement repair is later than this release.

The medium-to-large desert comparison extends the same avenue grid and stock building family across more blocks. Roof heights and frontages differ, but the whole view makes the recurring freestanding rectangular buildings and open plots more apparent. The next biome-only comparison changes desert to temperate planting/ground while retaining that broad neighborhood character. Changing the seed then moves street spacing, buildings, heights and vegetation groups: the seed matters. Reducing that new seed to small produces a compact layout with the same vocabulary. These observations support #1084/#960 without an additional ticket.

The extra snowy and desert views are defect controls too. Terrain teeth/creases remain subject to #813/#876/N1, distinct from repaired material boundaries. Flat city ground still has buildings of different heights; an exterior frame does not establish a tactical-flatness finding. The solitary desert rural building has exposed foundation and real lot cuts; silhouette alone does not establish an inaccessible door. Isolated desert palms belong to #701. No additional distinct defect was established in this continuation.

The release still has the bare deploy marker, already owned by #911. The [separate fresh merged dropship check](../../map-critic-post1042/README.md) is positive on `6967394`; it is not part of these release frames.

## Exact sequence

Start with the actual Lagos recipe: `1892582247`, temperate/city/medium72. Each row changes only the named parameter from the preceding recipe. Near/quarter-turn views use zoom40 and the centre camera anchor shown; the whole view returns to yaw0 and zooms out. Anchors are framing locations, not claimed prop origins.

| Case | Parameter changed | Seed | Biome / settlement / size | Camera anchor x,y,z | Near / quarter-turn / whole |
| --- | --- | --- | --- | --- | --- |
| V01-coastal-city | biome | `1892582247` | coastal/city/medium72 | 36,0,36 | [near](V01-coastal-city/near.png) / [turn](V01-coastal-city/rotated.png) / [whole](V01-coastal-city/whole.png) |
| V02-coastal-town | settlement | `1892582247` | coastal/town/medium72 | 36,0,36 | [near](V02-coastal-town/near.png) / [turn](V02-coastal-town/rotated.png) / [whole](V02-coastal-town/whole.png) |
| V03-coastal-rural | settlement | `1892582247` | coastal/rural/medium72 | 36,0,36 | [near](V03-coastal-rural/near.png) / [turn](V03-coastal-rural/rotated.png) / [whole](V03-coastal-rural/whole.png) |
| V04-temperate-rural | biome | `1892582247` | temperate/rural/medium72 | 36,0,36 | [near](V04-temperate-rural/near.png) / [turn](V04-temperate-rural/rotated.png) / [whole](V04-temperate-rural/whole.png) |
| V05-temperate-town | settlement | `1892582247` | temperate/town/medium72 | 36,0,36 | [near](V05-temperate-town/near.png) / [turn](V05-temperate-town/rotated.png) / [whole](V05-temperate-town/whole.png) |
| V06-desert-town | biome | `1892582247` | desert/town/medium72 | 36,0,36 | [near](V06-desert-town/near.png) / [turn](V06-desert-town/rotated.png) / [whole](V06-desert-town/whole.png) |
| V07-desert-rural | settlement | `1892582247` | desert/rural/medium72 | 36,0,36 | [near](V07-desert-rural/near.png) / [turn](V07-desert-rural/rotated.png) / [whole](V07-desert-rural/whole.png) |
| V08-snowy-rural | biome | `1892582247` | snowy/rural/medium72 | 36,0,36 | [near](V08-snowy-rural/near.png) / [turn](V08-snowy-rural/rotated.png) / [whole](V08-snowy-rural/whole.png) |
| V09-snowy-town | settlement | `1892582247` | snowy/town/medium72 | 36,0,36 | [near](V09-snowy-town/near.png) / [turn](V09-snowy-town/rotated.png) / [whole](V09-snowy-town/whole.png) |
| V10-snowy-city | settlement | `1892582247` | snowy/city/medium72 | 36,0,36 | [near](V10-snowy-city/near.png) / [turn](V10-snowy-city/rotated.png) / [whole](V10-snowy-city/whole.png) |
| V11-desert-city | biome | `1892582247` | desert/city/medium72 | 36,0,36 | [near](V11-desert-city/near.png) / [turn](V11-desert-city/rotated.png) / [whole](V11-desert-city/whole.png) |
| V12-desert-city-large | size | `1892582247` | desert/city/large96 | 48,0,48 | [near](V12-desert-city-large/near.png) / [turn](V12-desert-city-large/rotated.png) / [whole](V12-desert-city-large/whole.png) |
| V13-temperate-city-large | biome | `1892582247` | temperate/city/large96 | 48,0,48 | [near](V13-temperate-city-large/near.png) / [turn](V13-temperate-city-large/rotated.png) / [whole](V13-temperate-city-large/whole.png) |
| V14-temperate-city-newseed | seed | `mc-variety-01` | temperate/city/large96 | 48,0,48 | [near](V14-temperate-city-newseed/near.png) / [turn](V14-temperate-city-newseed/rotated.png) / [whole](V14-temperate-city-newseed/whole.png) |
| V15-temperate-city-small | size | `mc-variety-01` | temperate/city/small48 | 24,0,24 | [near](V15-temperate-city-small/near.png) / [turn](V15-temperate-city-small/rotated.png) / [whole](V15-temperate-city-small/whole.png) |

## Capture record

Native 2020×1500 scene crops from a 2400×1500 Map Lab viewport, clip x380/y0; models and units on, slope100, levels **all**, pointer(0,0). Near/default camera yaw0, settled E quarter-turn to yaw1, then Q and zoom out to bounds. Adjacent JSON sidecars give the exact recipe, camera, runtime, settings, clip, error list and SHA256. [Inspection ledger](inspection.json) records every opened image and its reading.

Same fresh isolated release server throughout, SwiftShader, production `drawnFrame` helper and pre-navigation asset fallback guard. No map, model or material substitutions. Camera accessor only records/sets framing. `node .scratch/map-critic-v0216/survey-case.mjs INDEX` captures one case then stops for inspection. The tag server was stopped after V15 completed; all capture commands exited0. Exact server startup and source/public/tools trees remain in [runtime.json](../runtime.json). Restart a pinned server to repeat; never infer its runtime from a changed git HEAD while watch/HMR are disabled.

These are dated evidence records, not asserted historical PNG baselines. No movement, LOS, unit-access, mission-success or balance certification follows from exterior views. The full defect control in the parent assessment remains part of each variety issue.
