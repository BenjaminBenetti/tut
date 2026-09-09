# Map Critic: v0.2.15 repair verdicts

Nine fresh Map Lab frames, all individually opened. Runtime is merged main
`9d9ea012e97292ae3f96e2500f1609a1cfdbf412` (v0.2.15), captured 23:55 UTC on 8 September through 00:09 UTC on
9 September 2026. Sidecars record the original screenshot file times.
These are new observations; earlier accepted images remain dated records.

## What improved

**#945 / #1007: picture improved.** Coastal grass, sand and earth now meet
in irregular contours with distinct interiors. The snowy yard's exposed
rock patch has a rounded margin instead of right-angle steps. Both reported
locations hold up after one E turn. The broad waterfront road, paving and
railing remain legible constructed edges, and the snowy rural route remains
clear. Preserve that distinction between natural and built boundaries.
The old reference frames are in [#945's dated record](../../945/README.md);
the initial coastal and snowy before frames were opened alongside this check.
The controls here judge readability, not pixel identity across different
runtime revisions. Water's regular grid remains the separately owned #1005.
This verdict concerns material contacts, not a reversal of #813's terrain ruling.

**#959 / #1016: picture improved.** The reported temperate rural track stays
visibly continuous when it crosses brown ground, in both camera directions.
The earlier [temperate before frame](../../959/before/01-temperate.png) loses
that distinction. Snowy and desert controls still show clear brown routes
through their contrasting ground. These fresh controls are visual checks;
#1016's isolated-change pixel comparisons are separately attributed in its
[record](../../959/README.md).

**Stone identity:** the repaired route reads as stone/cobble, not a worn dirt
path. In these frames and the new `mc-resume-03` small rural survey, it reads
as a plausible surfaced access lane serving substantial occupied buildings.
Its narrow width, woodland setting and plot fences still read as rural.
I do not find a defect simply because this rural route is surfaced. This is
a bounded judgement of the scenes viewed, not a requirement that every rural
track be cobbled. Keep its continuous route identity in future variety work.
No movement or LOS certification is claimed.

## Frames and exact recipes

Models and units on, slopes 100%, initial level **all**, pointer outside the
scene, viewport 2400×1500. Small = 48²; medium = 72². Coordinates are (x,y,z).
Pitch below is ground-axis pixels per tile; E means one camera turn.
The JSON beside each PNG records the exact URL, actual pitch, focus, crop,
level readout, runtime identity, error list and PNG SHA-256.

| Frame | Seed | Biome / settlement / size | Focus | Pitch / turn |
| --- | --- | --- | --- | --- |
| [M1](M1-coastal-contours.png) / [M2](M2-coastal-contours.png) | `mc-opening-01` | coastal / rural / small | (5,2,22) | 45 / 0, E |
| [N1](N1-snowy-contours.png) / [N2](N2-snowy-contours.png) | `mc-opening-02` | snowy / city / medium | (56,2,62) | 45 / 0, E |
| [P1](P1-temperate-trail.png) / [P2](P2-temperate-trail.png) | `mc-resume-01` | temperate / rural / small | (13,2,24) | 45 / 0, E |
| [P3](P3-snowy-trail-control.png) | `mc-resume-01` | snowy / rural / small | **(13,3,24)** | 45 / 0 |
| [P4](P4-desert-trail-control.png) | `mc-resume-01` | desert / rural / small | (13,2,24) | 45 / 0 |
| [W1](W1-waterfront-control.png) | `mc-opening-03` | coastal / city / medium | (51,1,40) | 55 / 0 |

## Capture identity

The capture server was started fresh on port 4175 after checkout, using the
repository's stable capture Vite configuration. [Runtime identity](runtime.json)
records the served baseline and src/public/tools tree hashes. Camera framing
uses ordinary controls and coordinate projection; no scene or game data is
replaced. No retouching or generated imagery is used.

The inherited port-4173 server had watching and HMR disabled and retained
old modules after the checkout changed. Its pilot captures were excluded
before judgement and remain only in ignored scratch with an exclusion note.
**Restart the server when the runtime baseline changes.** A contemporaneous
git HEAD value alone does not establish what an old server served.
