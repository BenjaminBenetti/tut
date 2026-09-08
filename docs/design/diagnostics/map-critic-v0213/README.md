# Map Critic — current-main repair check, 2026-09-08

Capture baseline: **`5cead6e9d5ec656ddba95b41c63ec29d77818ade`**.
This was main at the start of the pass, after v0.2.13 and pointer inspection
#947. The later layer check uses its separately pinned `d0837c6` baseline.

## Rural fences #917 / #973

**Picture improved.** Unrelated beach panels are gone. The trail run now marks
the edge of the house plot; the longer shore-side run follows the neighbouring
plot/terrace edge. Both retain recognisable timber rails and useful-looking
low cover in a place that explains their presence. The house's doorway and
open approach remain clear from both angles. The accepted paved waterfront
still reads as a deliberate street ending.

All nine fresh PNGs below were opened and judged. The reported before view
and rural entrance before control were also opened from the author's
[committed repair record](../917/README.md). This is a visual verdict, not
another cover-count, pathfinding or pixel-equality claim. The preview deploy
markers moved as part of the shipped generation; the known #911 dropship gap
is not a new finding.

| Views | Recipe | Camera focus / framing | Observation |
| --- | --- | --- | --- |
| [F1](fences/F1-reported.png), [F2](fences/F2-reported.png) | `mc-opening-01`, coastal/rural/small (48²) | `(5,2,22)`, 45 px/tile, initial / one E turn | The original unrelated beach fragments are gone. |
| [T1](fences/T1-trail.png), [T2](fences/T2-trail.png) | Same map | `(20,2,43)`, 45 px/tile, initial / one E turn | A continuous run separates the house plot from the adjacent approach/track. |
| [G1](fences/G1-garden.png), [G2](fences/G2-garden.png) | Same map | `(40,2,18)`, 45 px/tile, initial / one E turn | The long run has a legible plot/terrace-edge context from both sides. |
| [E1](fences/E1-entrance.png), [E2](fences/E2-entrance.png) | Same map | `(34,2,24)`, 55 px/tile, initial / one E turn | Door and immediate approach remain clear. |
| [W1](fences/W1-waterfront-control.png) | `mc-opening-03`, coastal/city/medium (72²) | `(51,1,40)`, 55 px/tile, initial | The paved, railed waterfront is preserved; urban timber panels are outside #917's rural repair. |

Models and preview units on, slopes 100%, initial level label **all**.
Viewport 2400×1500, scene crops 1200×1000. Each PNG has its exact JSON
sidecar with URL, actual level state, camera and baseline. The pointer was
moved off the scene and the view allowed to settle before capture, so
hover inspection does not remove a roof from these controls.

### Director's open-end observation

I rank the garden end **below #945, #959 and #960**. This case does not
justify a separate defect ticket: a finite run can mark one side of a plot
without enclosing it, and the house/terrace give this run that context.
Its open end is visible; no connecting fence or building is claimed hidden
behind the camera. The trail run also leaves a clear end for access.
This is a judgement of these frames, not a blanket exception for arbitrary
fence stubs. A run lacking a legible boundary in another seed remains a
valid finding. No requirement for enclosed fields, gates or a particular
layout is prescribed.

## Continuing findings and cutaway confirmation

The two-angle [follow-up findings](followups/README.md) are filed as
[#1006, isolated city fence panels](https://github.com/BenjaminBenetti/tut/issues/1006)
and [#1005, open-water seams](https://github.com/BenjaminBenetti/tut/issues/1005).
They rank fourth and fifth after #945/#959/#960; the Critic's five-ticket
cap is reached. The successful rural #917 repair remains accepted.

[Current squad/pointer cutaways](cutaway/README.md) were checked in 24 fresh
frames, all opened. The chosen radius-4 squad reveal remains useful; shipped
hover inspection opens adjacent room context and both closure paths restore
the roof. Dim interiors, stipple and accepted near-wall exposure remain
visible limitations.

[The completed continuation](survey/README.md) covers `mc-resume-02` across
all four biomes and three settlement scales at medium 72². All 24 whole/near
source frames and three published sheets were opened. It corroborates the
existing ranked findings, including town instances of #1006; it adds no
sixth ticket. This capture baseline precedes the proposed #945 repair.

[Eight later-main layer-control frames](layers/README.md), all opened, show
useful rooms and stairs but also a failed top-limit control: pressing Up at
initial 5/5 removes the tall roof while leaving the readout unchanged. Both
initial camera-side frames retain their roofs. This corroborates the owned
#978 correction; it is not a claim that every initial roof is absent.

The watch subsequently caught the #1008 model merge. Art's three model
angles and four constructed grass/paving views were opened at merge
`a5efc99`; the ship and boarding ramp read well. [The model-only verdict](https://github.com/BenjaminBenetti/tut/issues/911#issuecomment-5592589464)
keeps generated placement and support proof outstanding under #911. Those
are attributed Art fixtures, not part of our generated-map captures.
