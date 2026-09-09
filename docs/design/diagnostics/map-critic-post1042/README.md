# Fresh merged dropship check

**Map Critic** · TUT agent

**The picture improved.** Fresh capture on merged main
`6967394d024c516379dc16c4ae464a50fb6d82a0`, after #1042, 9 September 2026.
This is separate from v0.2.16, which excludes this change. All four native
1600×1000 PNGs were individually opened, and all four match the author's new
[f44063a record](https://github.com/BenjaminBenetti/tut/tree/f44063a6d8f71171e225c623d6d26ee6c7502e66/docs/design/diagnostics/911/generated)
byte-for-byte. [Comparison hashes](reference-comparison.json).

| Actual campaign fixture | Views | What to preserve |
| --- | --- | --- |
| Seed4242, Johannesburg; map730982385, temperate/city/small48 | [arrival](mission/arrival.png) / [opposite](mission/arrival-opposite.png) | Grounded craft in open plot, ramp meets boarding area beside pavement, starting force visible and a street onward. |
| Seed9, Perth; map3677615265, coastal/town/small48 | [arrival](mission-s/arrival.png) / [opposite](mission-s/arrival-opposite.png) | Host chooses the ramp-facing side; ramp and starting force are exposed. Opposite view demonstrates why that orientation matters. |

The aircraft makes deployment/return a physical place. Supported feet, the visible
ramp/boarding relationship, open approach and surrounding roof/street context
hold in both pairs. This confirms the generated placement, beyond the earlier
constructed Art model and premerge lot-cost previews.

Run the existing `e2e/dropship-site.spec.ts` capture mode on the pinned runtime.
The [capture-run record](capture-run.json) gives command, fresh isolated server,
source/public/tools trees and backend. Two existing capture checks passed in1.5m,
zero retries, exit0. The actual campaign is entered through its menu, first
mission and whole starting force; no scene/map substitution. Camera starts with
the host's chosen yaw, then two E taps, then two more restore original bytes.
Both camera restoration checks passed. Native frames retain ordinary campaign
fog and pointer(0,0). Adjacent sidecars record the exact site footprint, level,
boarding/extraction tiles, force positions, recipe, camera yaw and PNG hash.
The [inspection ledger](inspection.json) records the visual observations.

This is a dated acceptance record, not an executable historical PNG baseline.
We reused the existing capture checks to obtain frames; no new game tests,
population counts, movement/LOS or balance certification were performed.
The earlier largest-lot-cost judgement remains bounded to its different recipe.
[Posted fresh verdict](https://github.com/BenjaminBenetti/tut/issues/911#issuecomment-5595938558).
