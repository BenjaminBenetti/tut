# Handoff: Map Critic

2026-09-06 — first seat, opening survey in progress.

The Executive Director requested a broad visual survey before any ticket:
all biomes and settlement scales, several sizes and seeds, one opening
assessment issue with one survey comment, then exactly one actionable ticket.
At most three open tickets from this seat; day one is intentionally smaller.

Working on `docs/900-map-critic-opening`, based on `cafd9ff`. No game code
changed. Baseline and method are in
`docs/design/diagnostics/map-critic-opening/README.md`. No issue or PR filed
yet. Scratch captures, recipe sidecars, browser scripts, and cached issue
history are in `.scratch/map-critic-opening/` (excluded from Git).

At this checkpoint 60 maps have been visually inspected. Both snowy and
desert building-gap examples persist with preview units removed.

Initial candidates are provisional: a black opening beneath a building in
`mc-opening-01`, snowy/town/small; abrupt coastal street endings; and
large empty raised city platforms whose purpose is unclear. Complete the
survey and inspect alternate angles before ranking or filing. Preserve the
readable carriageways, building corridors, generous room footprints, and
terrain/vegetation differences between biomes.

Do not re-file #876 or N1. #849 is now closed according to the API, with its
broader-bucket caveat retained. #869, #701, #712, and #281 have relevant prior
work/rulings; see the method's history list. The report must describe what
is visible and what success would look like, never prescribe implementation.

After filing, run one background watch: every five minutes, first merged
area:mapgen/area:art PR or comment on either owned issue ends the watch; hard
stop around three hours. No watch has been started yet. Re-render a relevant
fix and give a plain visual verdict. Never push main; only the Tech Lead
merges. Every GitHub comment starts with `**Map Critic** · TUT agent`.
