# Jev 4×4 movement-format comparison

Follow-up: [explaining movement AP costs](jev-4x4-ap-comparison.md) produced 10/10 A3 choices for each format. The original results below are retained; their instructions did not explicitly ask for AP-efficient movement.

Run: 2026-09-21T05:43:02.846Z to 2026-09-21T05:43:05.249Z. Model: `jev-1.13.0`. All 20 requests succeeded.

On this exact map, neither sample format reliably selected the most efficient move. The game-format sample selected A2 in all ten trials. ASCII selected A2 nine times and A3 once. Both avoided the B1 dead end in this batch, so the previously reported confident B1 response was not reproduced.

```text
    A B C D
  1 @ . # .
  2 . # . .
  3 . . . .
  4 . . . O
```

`@` is the actor, `O` is the objective, `#` is blocked, and `.` is walkable. Every action can move up to two orthogonal tiles, including turns. Both formats offer the same destinations, in the same order: B1, A2, A3. One move costs one AP regardless of whether it travels one or two tiles.

The local breadth-first search found these remaining walking distances and minimum action counts:

| Destination | Steps used by this move | Walking steps remaining | Minimum total move actions, including this move |
| --- | ---: | ---: | ---: |
| B1 | 1 | 7 | 5 |
| A2 | 1 | 5 | 4 |
| A3 | 2 | 4 | 3 |

**A3 is the most efficient choice.** A2 is legal and lies on a shortest walking path, but underuses its AP. B1 requires backtracking. The success metric below is selecting the most AP-efficient destination, not merely choosing a legal tile or making progress.

| Metric | Game-format sample | ASCII sample |
| --- | ---: | ---: |
| Best move, A3 | 0/10 | 1/10 |
| Progress toward objective | 10/10 | 10/10 |
| Mean reported confidence | 23.8% | 31.2% |
| Mean probability assigned to A3 | 17.4% | 41.5% |
| Input tokens per request | 1297 | 475 |
| Output tokens per request | 46 | 42 |
| Mean HTTP round trip | 120.7 ms | 118.5 ms |

The confidence column is the API’s `confidence` field, not the probability of the selected option. Timings include network latency from this workspace; these calls went directly to the upstream API and exclude the browser and relay.

| Trial | Game choice | Reported confidence | ASCII choice | Reported confidence |
| ---: | --- | ---: | --- | ---: |
| 1 | A2 (`action-1`) | 21% | A2 | 34% |
| 2 | A2 (`action-1`) | 28% | A2 | 36% |
| 3 | A2 (`action-1`) | 25% | A2 | 31% |
| 4 | A2 (`action-1`) | 18% | A2 | 29% |
| 5 | A2 (`action-1`) | 17% | A2 | 40% |
| 6 | A2 (`action-1`) | 20% | A2 | 30% |
| 7 | A2 (`action-1`) | 26% | A2 | 26% |
| 8 | A2 (`action-1`) | 35% | A3 | 21% |
| 9 | A2 (`action-1`) | 21% | A2 | 35% |
| 10 | A2 (`action-1`) | 27% | A2 | 30% |

ASCII reduced input tokens by **63.4%** and assigned more probability to A3, but this small batch does not establish reliable movement or a meaningful latency improvement. The main observed failure was underusing movement range, not selecting an illegal destination.

These are ten repetitions of one map, not ten independent maps or ten complete trajectories. The requests reproduce the simplified samples in the discussion, with identical question text and no prompt tuning between trials. They omit unrelated combat state and the production decision instructions. The model version is pinned; both use the same question ID (`action`), and the first format alternates each trial to reduce ordering effects.

The comparison changes the whole sample representation: ASCII also uses coordinate option names and natural-language descriptions, while the game sample includes actor/AP metadata, compact tile tuples and structured action previews. This does not isolate ASCII grid encoding alone. Full probabilities and requests are preserved so these differences can be inspected. No ground-truth distances were sent to Jev.

A useful next experiment would keep the choices and other state identical while changing only map encoding. Separately, giving each option a game-computed path distance would test whether explicit route progress helps action selection. No gameplay integration was changed by this experiment.

Exact requests, responses, probabilities, timing, token usage and the computed oracle: [results JSON](jev-4x4-format-results.json). Reusable runner: [compare-map-formats.mjs](../../tools/jev/compare-map-formats.mjs).

Validate the map and inspect the requests without making API calls:

```sh
node tools/jev/compare-map-formats.mjs --dry-run
```

To repeat the 20 real calls with `JevKey` from the ignored root `.env`:

```sh
node --env-file=.env tools/jev/compare-map-formats.mjs .producer/jev/map-format-rerun.json
```
