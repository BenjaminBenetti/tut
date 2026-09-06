# Engineer eng-3 — #807 half-height layers

- ADR 0008 is the contract. The save migration is in #810; explicit storey consumers and fixtures are in #812. The final activation branch is `feat/807-half-height-layers`.
- A storey is two 0.75 u layers. Free orthogonal half steps live in `ReachabilityService`; larger rises require connectors. Schema 16 migrates v1 maps and mission coordinates to map version 2.
- Engine conversion keeps terrain quantized to full storeys. Natural slope shapes temporarily retain rise-2 ramps; the mapgen child removes those when it adds one-layer smoothing. Deploy placement still excludes natural wedges from its mainland grouping to preserve seeds.
- The #798 slope assets remain 1.5 u until the art child changes their rise. The fallback wedge derives its upper neighbour's height.
- Goldens render every layer, including empty odd layers. The final PR body records the 60-seed before/after simulation and all four reference-frame comparisons.
- Director instruction: eng-3 stops when the final PR is open and CI is green. The Tech Lead reviews from its monitor; the Director prompts review follow-ups. Do not arm a monitor or take another issue.
