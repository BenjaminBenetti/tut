# Merged #1048: building-use cues on main

Fresh main `8451a080e5328b98f82f8b1016dc6ca52ecafe06`, captured 9 September
2026 UTC on an isolated checkout and freshly started server. These are the
Critic's own post-merge Map Lab frames. The earlier preview judgments remain
attributed to the author's separate before/after and visibility records.

## What the picture says

**The frontage half of #960 improves the picture on merged main.** All six
fresh frames were individually opened. The first city pair reads more
clearly as inhabited housing: window planting/guards and the shared doorway
canopy/mailboxes provide recognisable domestic cues. The second seed retains
its different height, roof opening and neighbouring exterior ladder while
using those cues on another block.

S01 distinguishes a striped shop awning from the plain workplace canopy and
the planted residential frontage beside it. The awning leaves the visible
ladder run clear. The rural control retains its complete pitched roof and
contextual fence runs. Every fresh frame is byte-identical to the author's
corresponding accepted after-preview, independently captured here on the
merged runtime. The rural frame also matches that preview's before control.

**The complete issue remains open for outdoor arrangement.** Boxes, sandbags
and isolated yard objects still do not explain how those plots are used.
Keep the successful frontage cues, route widths and usable building height
while MapGen completes that work. Urban fragments are separately owned by
#1006; the deploy landmark remains #911. These exterior views do not repeat
or replace the author's fog/layer/squad controls.

[Earlier author-context judgment](https://github.com/BenjaminBenetti/tut/issues/960#issuecomment-5594085278),
[author visibility-controls judgment](https://github.com/BenjaminBenetti/tut/pull/1048#issuecomment-5594221931).

## Exact reproduction

Map Lab; production models and preview units on; slope 100%; levels **all**;
45 ground-axis pixels per tile; viewport 2400 × 1500; native 1300 × 1050 crops.
Coordinates are camera references `(x,y,z)`, not claimed attachment tiles.

| Frames | Seed | Biome / settlement / size | Focus | Camera |
|---|---|---|---|---|
| I01/I02 | `mc-resume-01` | temperate / city / medium 72² | (43,2,39) | initial / one E turn |
| I03/I04 | `mc-opening-02` | temperate / city / medium 72² | (23,1,34) | initial / one E turn |
| S01 | `mc-resume-01` | temperate / city / medium 72² | (24,2,37) | initial |
| C01 | `mc-opening-01` | temperate / rural / small 48² | (23,4,13) | initial |

The capture adds an accessor to the production camera rig, then uses its
ordinary look-at, rotation and zoom methods to reproduce the author's camera.
It changes no map, asset, material, cutaway state or scene population.
The target is `(x+0.5, y*0.75+0.15, z+0.5)`; the actual camera state, crop,
pitch, runtime trees, capture timestamp, all-level readout, errors and PNG
SHA-256 are in each adjacent JSON. The pointer is parked offscene. Wait 20
rendered frames after framing before capturing.

| Context | Initial view | Second angle |
|---|---|---|
| Reported city intersection | [I01](I01.png) | [I02](I02.png) |
| Second seed, roof and ladder access | [I03](I03.png) | [I04](I04.png) |
| Nearby shop/workplace/home | [S01](S01.png) | — |
| Rural preservation control | [C01](C01.png) | — |

A separately retained manual-camera I01 pilot is not part of these six
publication frames. The first capture server stopped before the next page
loaded; the replacement restarted the same pinned runtime. No failed or
incomplete capture is included in this record.
