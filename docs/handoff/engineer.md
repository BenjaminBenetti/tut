# Engineer eng-3 — #842 lurker flank fixture

- eng-3 works only `seat:eng-3` / `complexity:high`. Current branch: `test/842-lurker-flank-fixture`, from main. #807's half-height engine work is merged through #810, #812 and #815.
- #842 replaces the lurker sweep's generated `mission-2:map` with a stated `FixtureMapBuilder` premise: one visible north-facing mark, west-side low cover, four start quadrants, and reachable front and rear tiles. The 24 seeds, four-turn limit, `behind > front`, and positive attack count remain.
- The positioning probe refreshes vision and AP between turns; it stops at the first proposed attack without resolving damage or enemy turns. It measures approach preference, not mission engagement or balance. Runtime AI and tuning are unchanged.
- #838 temporarily skips this case for the ADR 0009 scale change. Keep the fixture case enabled when integrating that PR; no generated-map dimensions belong in this assertion.
- Director standing rule: whenever waiting, arm one bounded background watch for seat assignments and Tech Lead comments, reviews or merges on this seat's PRs. Poll every five minutes, exit on the first relevant change, act, then re-arm. Hard stop after three hours; on timeout say `eng-3 idle`. No cron and never two loops.
