# Production ASCII state smoke check

On 2026-09-21, the actual `captureJev` and `jevChoicePage` builders were checked against live `jev-1.13.0` through the local relay. The [exact 4×4 request and responses](jev-ascii-production-smoke.json) are retained separately from the earlier hand-built format comparisons.

## Movement fixture

The actor starts at `(0,0,0)`, has two AP and two movement points per AP, and receives `entity_prompt: "Reach objective-1 as quickly as possible."`; `commander_prompt` is empty. All terrain is visible. There are no enemy units, fire or covering obstacles. The blocked cells force a route down the left edge:

```text
    x=0123
z=0   @.#.
z=1   .#..
z=2   ....
z=3   ...O
```

The movement follow-up offers `(1,0,0)`, `(0,0,1)` and `(0,0,2)`, each for one AP. It includes the production gameplay context, map legend, actor/objective records, movement-point costs and action instructions. This check isolates destination selection after choosing movement; it does not execute commands or test a complete mission.

| Trial | Choice | Destination | Confidence | Input tokens |
| --- | --- | --- | --- | --- |
| 1 | `action-2` | `(0,0,2)` | 0.30 | 3,149 |
| 2 | `action-2` | `(0,0,2)` | 0.25 | 3,149 |
| 3 | `action-2` | `(0,0,2)` | 0.38 | 3,149 |

All three selected the efficient two-tile move. Confidence is the upstream field, not a tactical-quality score. Three identical-state trials are a smoke check, not a general performance benchmark.

## Real inspector and size checks

A Chromium preview on campaign seed `4242`, map seed `730982385`, small city, selected mech `unit-1`, used the same entity prompt. The 48×48 map has 14 layers; the faction initially knows surfaces on layer 2. Jev selected `move` → `group-3` → `action-26`, moving from `(8,2,29)` toward objective-1 at `(8,2,6)`, choosing `(8,2,23)` for one AP. The three requests used 7,670 / 7,231 / 7,535 input tokens; measured browser round trips were 260 / 145 / 171 ms. The inspector retained each response and preview left the autosave unchanged. This establishes connectivity and inspectability; it does not establish that this destination is globally optimal.

For payload stress, a synthetic state used the same generated city recipe at size `large` (96×96), with every surface revealed and actors positioned at deployment. All 14 elevation layers were represented, six with known surfaces. The largest request across all generated choice pages was 69,645 UTF-8 bytes and used 28,651 input tokens; Jev accepted it. This was a request-size check, not gameplay evaluation.

The final format retains every known cell and marker. Fog row padding is omitted using an explicit fill and per-row x offsets; walls are ASCII edge maps; connectors and exceptional tile properties share repeated metadata. Detail pages retain all candidates through grouping, bounded by 32 options and 8,000 criteria characters. State size still depends on battlefield contents, so actual upstream usage remains visible in the inspector.
