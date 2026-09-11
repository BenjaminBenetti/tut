# #960 — building-use yard arrangements

Urban yards use small seating groups beside homes and apartments, and compact crate groups behind shops and warehouses. The old generic yard allocation is a ceiling; plots stay empty when a supported group with a clear apron does not fit. Doors, windows, connectors, mission clearances and local routes remain open.

## Review comparison

Before: `f44063a` (Map Lab runtime `6967394`). After: `1858f09`, integrated with `main@bbd605c`. Both use the same seeds and cameras, models/preview units on, slope 100%, all layers, 45 px per ground tile, a 2400×1500 viewport and native 1300×1050 crops. Every phase ran in two independent SwiftShader browsers with byte-identical repeats. The first city pair also matches the preceding after images exactly.

| View | Before | After |
| --- | --- | --- |
| I01-city-frontages | [PNG](dropship-first-and-control-before/I01-city-frontages.png) | [PNG](restart-after/I01-city-frontages.png) |
| I02-city-frontages-rotated | [PNG](dropship-first-and-control-before/I02-city-frontages-rotated.png) | [PNG](restart-after/I02-city-frontages-rotated.png) |
| I03-second-seed | [PNG](dropship-second-before/I03-second-seed.png) | [PNG](restart-after/I03-second-seed.png) |
| I04-second-seed-rotated | [PNG](dropship-second-before/I04-second-seed-rotated.png) | [PNG](restart-after/I04-second-seed-rotated.png) |
| C01-rural-roof-control | [PNG](dropship-first-and-control-before/C01-rural-roof-control.png) | [PNG](restart-after/C01-rural-roof-control.png) |
| S01-nearby-shop-workplace-home | [PNG](restart-supplemental-before/S01-nearby-shop-workplace-home.png) | [PNG](restart-after/S01-nearby-shop-workplace-home.png) |
| S02-shop-delivery-yard | [PNG](restart-supplemental-before/S02-shop-delivery-yard.png) | [PNG](restart-after/S02-shop-delivery-yard.png) |

I01/I02 retain the house-side seat. I03 shows the shared seats at the upper left and removes the loose crate between buildings; I04 preserves the reverse view of the roofs and street. S01 retains the canopy and planted frontage while replacing the nearby barriers with a seat. S02 groups two crates against the shop’s rear wall, leaving a clear apron. The full rural C01 before/after image is byte-identical.

Exact cameras, hashes, pixel differences and commands: [comparison record](review-comparison.json), [after sidecar](restart-after/captures.json), [shop baseline sidecar](restart-supplemental-before/captures.json). The other baseline sidecars accompany their PNGs. Images are review evidence, not executable screenshot baselines.

## Verification and cover cost

At `1858f09`: typecheck, full ESLint/Prettier, production build and 2,368 unit tests pass (one optional skip). `src/mapgen`, `src/graphics` and `public` are unchanged from tested generator runtime `ecaebc4`: its 1,200-map wide sweep passed with zero relocations.

The [108-map paired sweep](dropship-paired-survey.json) preserves hooks, dropships, terrain, buildings, roads, connectors and untargeted props in every pair; all 36 complete rural maps remain identical. Cover adjacency measures the loss of distributed cover, not a claim that the same tactical options survive.

| Settlement | Targeted yard props before → after | Mean cover adjacency before → after |
| --- | --- | --- |
| Town | 999 → 359 | 13.51% → 12.46% (−1.05 pp) |
| City | 2,101 → 523 | 11.26% → 8.42% (−2.85 pp) |

## Earlier measurements

Previous comparison frames and their sidecars remain in `before/`, `after/`, `before-delivery/`, `after-delivery/`, `integrated-*` and `dropship-*`. [Validation history](validation.json) records their revisions and both successful and interrupted checks. They are dated records; the review table above identifies this submitted comparison.
