# Map Critic — merged repairs and the #936 correction

Fresh visual re-check on main `2878dfc`, 2026-09-06. This build includes
foundations (#913), roofs and working cutaways (#925), paved-platform removal
(#926), and waterfront endings (#932). It precedes #936 and #937.

## The corrected preservation rule

The Executive Director overruled the exception for raised vegetated beds.
Both the paved and planted settlement plinths are defects. **Real-place
plausibility outranks tactical usefulness.** A fenced wall of dirt occupying
a city block does not become appropriate because it supplies high ground
or has trees on top. Earlier praise in the opening survey and calibration
record is superseded by [#936](https://github.com/BenjaminBenetti/tut/issues/936).

Preserve coherent buildings, readable streets, appropriate planting and
natural terrain. City verticality should come from usable storeys, interiors,
roofs, stairs, ladders and land that actually rises. If removing the beds
leaves cities tactically flat, report that finding with usable building
height and roof access as the intended improvement. Do not reintroduce the
mounds. A taller silhouette alone is not proof of usable vertical play.

The Director still judges frames before merge; the Critic's re-check does
not replace that approval. No generator implementation was read for these
judgements, and no game code or assets were changed.

## #906 — picture improved

The former black openings below the snowy and desert buildings are replaced
by visible support meeting the surrounding terrain. Both camera angles
retain that support. The desert ladder still reads clearly against the
building; its lower end no longer hangs beside a black strip. The already
grounded desert building continues to meet its adjacent land convincingly.

| View | Original evidence | Fresh main |
| --- | --- | --- |
| Snowy, initial angle | [D01](../map-critic-opening/details/D01-snowy-town-foundation.png) | [B01](details/B01-snowy-foundation.png) |
| Snowy, one E turn | [D02](../map-critic-opening/details/D02-snowy-town-foundation-rotated.png) | [B02](details/B02-snowy-foundation.png) |
| Desert beside ladder | [D05](../map-critic-opening/details/D05-desert-town-foundation.png) | [B03](details/B03-desert-foundation.png) |
| Desert, one E turn | [Art's original second angle](../906/before/desert-rotated.png) | [B04](details/B04-desert-foundation.png) |
| Already-grounded desert building | [Art's original control](../906/before/desert-grounded.png) | [B05](details/B05-grounded-control.png) |

This is a visual verdict, not a new geometry measurement or a claim that
the entire image is unchanged. Preserve the ladder, building proportions
and coherent wall-to-ground contact.

## #915 — picture improved

The city asphalt now stops before a paved waterfront with a visible railed
water edge. The road no longer appears to continue into open water. Both
angles show a deliberate transition from carriageway to pedestrian edge.

The town's change is smaller: a paved lookout now separates the road from
the railing. It is still austere, but the endpoint is more understandable.
The railing was already present before the repair; adding that paved
termination is the visible improvement.

| View | Original evidence | Fresh main |
| --- | --- | --- |
| City, initial angle | [D09](../map-critic-opening/details/D09-medium-coastal-road-end.png) | [W01](details/W01-city-waterfront.png) |
| City, one E turn | [Original rotated view](../map-critic-calibration/details/W01-city-road-rotated.png) | [W02](details/W02-city-waterfront.png) |
| Town, initial angle | [D03](../map-critic-opening/details/D03-coastal-road-end.png) | [W03](details/W03-town-waterfront.png) |
| Town, one E turn | — | [W04](details/W04-town-waterfront.png) |

The raised planted block beside the city waterfront remains a #936 defect.
This verdict preserves the readable street and water boundary, not that bed.

## #916 — visible shelter and a working local reveal

The reported furnished rooms now sit beneath a continuous pitched roof.
The whole building reads as weather-sheltered instead of an open shell.
The same temperate building holds up from [the first angle](details/R01-rural-roof.png)
and [one E turn](details/R02-rural-roof.png). The [snowy rural control](details/C03-snowy-roof-control.png)
also shows complete roofs with preview units off.
The separate committed Art control also runs the actual scene and cutaway
controller, which Map Lab's sample units do not run. On current main, the
pitched and flat roofs each open a local view of the squad and nearby floor.
The pitched roof closes again when the squad leaves.

| Control | Closed | Local reveal |
| --- | --- | --- |
| Pitched roof | [Opaque](cutaway/pitched-ghost-0.png) | [Squad visible](cutaway/pitched-ghost-1.png) |
| Flat roof | [Opaque](cutaway/flat-ghost-0.png) | [Squad visible](cutaway/flat-ghost-1.png) |

[After the squad leaves](cutaway/pitched-unit-left.png), the pitched roof
again reads as continuous shelter. The exact controller URL, unit tile,
viewport and recipe are in the cutaway JSON records.

The present reveal is tight: it explains the squad and a patch of floor,
while much of the room and its routes remain hidden. These frames are the
baseline for [#937](https://github.com/BenjaminBenetti/tut/issues/937), whose
larger radius is pending. Check whether the room becomes legible at the new
size, including two separated units with overlapping reveals, while enough
roof and wall remain to explain the building. No radius or shader setting
was changed for this re-check.

## #910 — the paved-platform removal improved the picture

The [former raised paved block](../map-critic-opening/details/D04-city-platform.png)
is now an [ordinary ground-level plot](details/P01-former-paved-platform.png).
The tall paved enclosure and its perimeter railing no longer dominate this
street corner. This is a clear improvement to the exact reported symptom.
Scattered fences and the weak relationship between props and plots remain
separate findings; #917 already owns the isolated fence panels.

The earlier recommendation to preserve planted versions is withdrawn.
This paved-platform verdict does not clear the surviving beds under #936.

## #936 — baseline for the next judgement

The [snowy city bed](details/V01-snowy-raised-bed.png) makes the corrected
principle visible: a large green slab, sheer walls, ramps and a railing
occupy a city block between buildings. Its cover props and elevated position
do not explain why people would have built it there. The city waterfront
views above show another planted block from two angles. Both belong to #936.

The [temperate city](details/C01-city-verticality-baseline.png) and
[temperate town](details/C02-town-verticality-baseline.png) provide context
before that removal. There are buildings of different heights, readable
streets and, in the town, rising terrain worth preserving. The city contains
the artificial beds. MapGen's [#940 report](https://github.com/BenjaminBenetti/tut/issues/936#issuecomment-5562862262)
reports unchanged stock town maps and identifies its separate coastal-town
bank as natural terrain. C02 is our temperate-town comparison. Keep the town as a preservation control, not a claimed
town-bed removal. These views establish a comparison point, not a finding
that cities have already lost tactical height.

After the change, revisit these recipes and inspect routes through buildings
and onto usable roofs. Judge accessible positions and choices, not just
the height of the skyline. If usable height is lacking, file it under the
building/roof-access direction the Director has set.

## Reproduction

Every Map Lab PNG has a JSON sidecar with seed, biome, settlement, size,
viewport and exact URL. Detail crops record camera focus `(x,y,z)`, pitch
and rotation; C01–C03 use the initial camera framing, with no pan or zoom,
and record the map bounds instead. All use models on, slopes 100% and all
levels, using the initial “all” setting with no floor parameter or level
input. The sidecars record the raw slider value and maximum. Its two-layer
step can display value 10 with max 11 while the visible label still says
“all”; C01 records that observed label. Moving the slider is a different
control state and must not be used as a substitute for initial “all”. `y` is a half-height layer. Small is 48²;
medium is 72². Preview units are on for details and off for C01–C03.

- B01/B02: `mc-opening-01`, snowy/town/small, `(37,3,39)`, 78 px/tile.
- B03/B04: `mc-opening-02`, desert/town/small, `(32,0,18)`, 70 px/tile.
- B05: same desert recipe, `(38,0,35)`, 60 px/tile.
- W01/W02: `mc-opening-03`, coastal/city/medium, `(51,1,40)`, 55 px/tile.
- W03/W04: `mc-opening-01`, coastal/town/small, `(37,2,14)`, 60 px/tile.
- R01/R02: `mc-opening-01`, temperate/rural/small, `(24,4,15)`, 55 px/tile.
- P01: `mc-opening-01`, temperate/city/small, `(33,3,30)`, 60 px/tile.
  The original platform focus was `(33,5,30)`; the same horizontal location
  now has ground at layer 3. Both requested and actual focus are recorded.
- V01: `mc-opening-02`, snowy/city/medium, `(56,4,62)`, 45 px/tile.
- C01: `mc-opening-02`, temperate/city/medium, initial framing.
- C02: `mc-opening-02`, temperate/town/small, initial framing.
- C03: `mc-opening-01`, snowy/rural/small, initial framing.

The paired detail views differ by one E camera turn. The crops are direct
screenshots; no retouching, geometry changes or material substitutions.

The cutaway frames use the existing Art diagnostic page at
`tools/art/preview/roof-cutaway.html`, on this same checkout, with its
unmodified `roof=pitched|flat` and `ghost=0|1` controls. The scene uses actual
generated maps and the game's renderer. Their fixed camera differs from
Map Lab; `cutaway/context.json` records that distinction.

Systematic prevalence, pathfinding and LOS counts remain QA work. These
observations do not establish a post-#936 verticality verdict or a post-#937
radius verdict; those changes were not present in this build.
