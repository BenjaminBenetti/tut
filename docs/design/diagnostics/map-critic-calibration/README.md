# Map Critic — Director calibration and follow-up evidence

2026-09-06. Follow-up to the [opening survey](../map-critic-opening/README.md)
and [survey issue #905](https://github.com/BenjaminBenetti/tut/issues/905).
These are fresh Map Lab captures on `f43f73c98525bb4fe7927670dce7b09d52321a77`.
Only documents changed between that main commit and the survey's `cafd9ff`
visual baseline. No game code or assets were changed for these captures.

## Calibration now in force

The Executive Director's standing bar is that maps should "look more like
the world, more like the earth": somewhere people built and live in, with
varied buildings and coherent, beautiful surroundings.

- The cap is **five open Map Critic tickets**, raised from three after
  calibration. Rank findings and hold the remainder. Report to the Director
  if MapGen or Art starts queueing instead of working.
- **Placement, frequency and plausibility are part of reading as a real
  place.** A correctly rendered feature can still be a generation defect
  because it does not belong there. Do not hold these findings for taste
  approval by default. File uncertainty explicitly; escalate genuine forks
  that would produce materially different games, or conflicts with prior
  Executive Director rulings.
- **[#910](https://github.com/BenjaminBenetti/tut/issues/910): blank raised
  paved platforms are a generation defect.** The opening assessment's taste
  framing and recommendation to give them a purpose are superseded. Ask why
  they occur there at all. Do not decorate them just to justify keeping them.
  Useful soil/vegetation beds remain worth preserving.
- **[#911](https://github.com/BenjaminBenetti/tut/issues/911): the TDF
  dropship is the owned arrival/extraction landmark gap.** Extraction stays
  on the deploy zone deliberately. Do not file bare marked deploy rectangles
  again. Art owns the model; MapGen owns placement and clearance.
- Waterfront endings, fences and missing roofs are authorised findings.
  Lead with what to preserve, check a second angle, and cross-reference
  existing work. Route to both areas when the cause cannot be assigned by eye.
- The **Director still judges every frame before merge**; the Tech Lead
  merges. Critic autonomy covers finding, filing and visually re-checking.
- Prefer an unambiguous capture over one that needs a caveat to be read
  correctly. The old D08 `floor=0` interior cut must not illustrate missing
  roofs or terrain. The roof evidence below uses **all levels**.

The Director's [role amendment #912](https://github.com/BenjaminBenetti/tut/pull/912)
records the cap and defect test in the [role brief](../../../process/roles/map-critic.md).
The [handoff](../../../handoff/map-critic.md) holds the live ticket queue.

Filed from this evidence: [waterfront #915](https://github.com/BenjaminBenetti/tut/issues/915)
(`p1`, MapGen), [roofs #916](https://github.com/BenjaminBenetti/tut/issues/916)
(`p1`, MapGen + Art), and [fences #917](https://github.com/BenjaminBenetti/tut/issues/917)
(`p2`, MapGen). Together with #906 and #910, these fill the five-ticket cap.
Hard material borders and the remaining building/plot variety findings stay
in the handoff for capacity.

## Capture and visual ledger

Models on, slopes 100%, all levels visible, viewport 2400×1500 throughout.
Coordinates below are the camera focus `(x,y,z)`; `y` is a half-height layer.
Each PNG has a JSON sidecar containing the exact URL and framing. All eight
images were inspected at native resolution. These are observations of the
render, not a prevalence census, generator review or movement/LOS sign-off.

| Evidence | Recipe | Focus / camera | Observation |
| --- | --- | --- | --- |
| [W01](details/W01-city-road-rotated.png) | `mc-opening-03`, coastal/city/medium (72×72), units on | `(51,1,40)`, 55 px/tile, one E turn, 1200×950 | The marked carriageway still ends directly at water from the second angle. Pavements stop beside it; no destination is revealed. |
| [F01](details/F01-coastal-fences.png) | `mc-opening-01`, coastal/rural/small (48×48), units on | `(5,2,22)`, 45 px/tile, initial orientation, 1200×1000 | Separated wooden panels on open sand and grass describe no readable plot boundary. The post-and-rail silhouette and palm groups read clearly. |
| [F02](details/F02-coastal-fences-rotated.png) | Same as F01 | Same focus and pitch, one E turn | No joining boundary appears behind the first angle. The two sand panels remain isolated, as does the panel among the palms. |
| [R01](details/R01-temperate-open-roof.png) | `mc-opening-01`, temperate/rural/small (48×48), units on | `(24,4,15)`, 55 px/tile, initial orientation, 1200×950 | Furnished upper rooms and corridor have no visible overhead shelter. Exterior walls are intact. |
| [R02](details/R02-temperate-open-roof-rotated.png) | Same as R01 | Same focus and pitch, one E turn | The same complete absence over the upper rooms persists from the other side. |
| [R03](details/R03-temperate-units0-context.png) | Same recipe as R01, units off | Initial framing, no camera changes, 2020×1500 scene crop | Both buildings remain open at the top without preview units. No floor cut; the level slider is at its maximum. |
| [R04](details/R04-snowy-units0-context.png) | `mc-opening-01`, snowy/rural/small (48×48), units off | Initial framing, no camera changes, 2020×1500 scene crop | Furnished rooms remain open to the sky amid snow. All levels; the changed biome does not supply a roof. |
| [R05](details/R05-roofed-control.png) | `mc-opening-02`, temperate/town/small (48×48), units off | Initial framing, no camera changes, 2020×1500 scene crop | Positive roof control: visible flat surfaces enclose these buildings. Preserve that shelter read and existing rooftop access. This does not endorse their separate base gaps. |

The overview controls show the 48×48 board at its initial framing; map
coordinates span `x,z = 0..47`. The primary roof reproduction is R01/R02's
precise focus. R03/R04 remove preview units to distinguish the roof symptom
from the deliberate local ghosting in [#526](https://github.com/BenjaminBenetti/tut/issues/526).
Roof walkability remains the deliberate distinction recorded in ADR 0004;
this finding asks for visible shelter and prescribes no new movement surface.

W01 complements the original [D09 city road](../map-critic-opening/details/D09-medium-coastal-road-end.png)
and [D03 town stub](../map-critic-opening/details/D03-coastal-road-end.png).
D03 **has a railing**; its defect is the unexplained road destination.
F01 revisits the original D07 location. Fence context preserves the
[#281 cover-density ruling](https://github.com/BenjaminBenetti/tut/issues/281)
and the rural low-cover role recorded in [#247](https://github.com/BenjaminBenetti/tut/issues/247).

No accepted #876 saddle, N1 channel, #813 connector treatment or #826 scale
choice is reopened. Building bases remain [#906](https://github.com/BenjaminBenetti/tut/issues/906),
with the Art Director. These frames establish current defects, not an
improvement verdict on a merged repair.
