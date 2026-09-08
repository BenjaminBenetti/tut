# Map Critic — after the planted plinths were removed

Visual re-check of merged main `900d9a33a0990d9872a283acde8da805ec218452`,
2026-09-06, after #936 / #940. The Director accepted the repair's frames
before merge. These are fresh Map Lab views of that merged build.

## Settlement plausibility improved

Preserve the readable streets, complete building silhouettes and planting
that meets the surrounding ground. The snowy city block now contains open
snow-covered ground between its buildings. The large green slab, its sheer
walls, ramps and perimeter railing are gone. A second camera angle shows
the same ordinary relationship between the yard, buildings and pavement.

At the coastal city waterfront, palms and rocks now stand on grass beside
the street and beach. The raised dirt box is gone. The paved waterfront
termination from #915 remains clear from both angles. The eye can read a
street, a verge and a shore together, without an unexplained retaining box
interrupting that sequence.

| Recipe / focus | Before #936 | Fresh merged main |
| --- | --- | --- |
| Snowy/city/medium `mc-opening-02`, horizontal `(56,62)` | [Raised bed](../map-critic-recheck-936/details/V01-snowy-raised-bed.png) | [Street-level yard](details/V01-snowy-raised-bed.png), [one E turn](details/V02-snowy-bed-rotated.png) |
| Coastal/city/medium `mc-opening-03`, `(51,1,40)` | [First angle](../map-critic-recheck-936/details/W01-city-waterfront.png), [one E turn](../map-critic-recheck-936/details/W02-city-waterfront.png) | [First angle](details/W01-city-waterfront.png), [one E turn](details/W02-city-waterfront.png) |

The surviving isolated fence panels remain with #917. Removing the plinths
does not by itself give every prop a convincing purpose, but restoring them
would undo the improvement. Their former cover value earns no exception.

## Height: flatter ground, with building positions still legible

The [temperate city context](details/C01-city-verticality-baseline.png)
has a much flatter outdoor plane after the artificial blocks disappear.
The remaining buildings provide the vertical structure: different roof
heights, windows above opposing streets, rooms and corridors on successive
storeys, stairs and roof access. That is the direction the Director set.

For the brick building around `(23,1,34)`, compare the deliberate
[ground-level cut](details/H06-city-ground-level2.png),
[next-storey cut](details/H07-city-upper-level4.png) and
[top-storey cut](details/H08-city-top-level8.png). The stair, room doors and
circulation remain readable as the floors change. The [complete roof](details/H01-city-roof-context.png)
has a visible stair opening at `(23,9,34)`. The [rotated all-level view](details/H09-city-roofs-rotated.png)
also shows roof openings and an exterior ladder on a neighboring building.
The [rotated ground-level cut](details/H10-city-ground-rotated.png) checks
the interior arrangement from the other side.

**These views do not justify a new finding that the city has become
tactically flat.** There is still a readable vertical fight for infantry,
with sheltered rooms and exposed roof positions above the street. The loss
of outdoor high ground is visible, and MapGen has separately measured its
cost for mechs. Building interiors and roofs remain infantry territory under
the existing rule. This is a visual judgement of these blocks, not a claim
that every city's movement or LOS has been tested. Keep looking across later
seeds; a demonstrated lack of useful height should still be filed with
building/roof access and natural terrain as the direction, never plinths.

The [temperate town](details/C02-town-verticality-baseline.png) retains its
rising land and graded streets. Its PNG and the [snowy rural control](details/C03-snowy-roof-control.png)
are byte-identical to their pre-#936 captures. They are preservation controls,
not claimed examples of removed town beds. MapGen's stock-town finding and
the Director's acceptance are recorded on #940.

## Next ranked finding: natural ground has hard square material borders

Preserve the distinct coastal palette and the shore as an orientation cue.
The problem is the contact between those materials on natural ground:
grass, sand and dirt form sharply bounded patches with long straight edges,
right-angle corners and tile-sized stair steps. There is no built edging
or field boundary to explain those outlines. The individual surface textures
have detail, but their joins still make the land read as assembled squares.

Fresh [first angle](details/M01-coastal-material-edges.png) and
[one E turn](details/M02-coastal-material-edges-rotated.png): coastal/rural/small
`mc-opening-01`, `(5,2,22)`, 45 px/tile, all levels, models and units on,
slopes 100%. The snowy city yard above supplies a second biome example:
the exposed-rock patch meets snow in a similarly hard right-angled outline.

This is opening-survey rank 5, now ready to file. It concerns surface
boundaries, separate from the fence placement in #917 and the accepted
#813/#876/N1 elevation geometry. The issue search found no existing ticket
for this symptom; #394 supplied surface textures and #798 supplied slope
pieces, without settling natural material joins. Route to both MapGen and
Art because the cause cannot be assigned by eye.

Success means believable contacts between natural ground materials at the
same play zoom, while their identities and the route/height read remain
clear. The implementation belongs to the owners. The separate observation
that temperate trails can disappear into broad dirt patches still needs its
own focused follow-up; it is not bundled into this ticket.

## Controls and reproduction

Every committed PNG has a JSON sidecar containing the exact recipe, URL,
camera focus or initial framing, viewport, crop, level selection and merged
build SHA. Coordinates are `(x,y,z)`, with `y` in half-height layers.
Medium maps are 72² and small maps are 48². Models are on and slopes are
100%. All-level captures retain the initial **all** setting; intentional
floor cuts are identified separately.

- Snowy city: `mc-opening-02`, medium, horizontal focus `(56,62)`, 45 px/tile,
  initial camera angle and one E turn. The sidecars record the new ground
  focus after the raised bed's old layer disappeared.
- Coastal city: `mc-opening-03`, medium, `(51,1,40)`, 55 px/tile, two angles.
- Temperate city context and height controls: `mc-opening-02`, medium.
  C01 and H06–H10 use initial framing, no pan/zoom, preview units off.
  H06/H07/H08 use the visible Levels slider at 2/4/8 half-height layers;
  H10 uses 2 and one E turn. H09 uses all levels and one E turn.
  H01 is the closer all-level roof view at 55 px/tile, units on.
- Temperate town: `mc-opening-02`, small, initial framing, units off.
- Snowy rural: `mc-opening-01`, small, initial framing, units off.
- Material-edge pair: `mc-opening-01`, coastal/rural/small, `(5,2,22)`,
  45 px/tile, initial angle and one E turn, units on.

There are 15 committed PNGs with JSON sidecars in this record. All were
visually inspected, including the two preservation controls whose image
bytes match the already inspected baseline exactly.

The floor-cut control is the slider's recorded value and visible label.
Do not interpret a `floor` URL number as a half-height layer: one earlier
attempt selected a higher story than its provisional filename implied.
That attempt is retained only in scratch and excluded from this evidence.

The [previous re-check record](../map-critic-recheck-936/README.md) preserves
the baseline before #936 and the old cutaway radius before #937. No game
code, assets or generation parameters were changed for these judgements.
Pathfinding, LOS and systematic prevalence remain QA work.
