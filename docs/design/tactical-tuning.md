# Tactical difficulty: measured baseline

What the mission rules actually produce, before any tuning pass (#497).
Measured with the seeded sweep from #343 — whole missions played through
the real rules headless, no renderer.

**180 seeds, eighteen per difficulty, 90-turn cap**, pooled from two
independently drawn seed sets (#699 and #708). Re-measure and update this
table in the same commit as any tuning change.

## The curve

| difficulty | won | lost | win rate | auto-resolve target |
| ---------- | --- | ---- | -------- | ------------------- |
| 1  | 18 | 0  | 100% | 99% |
| 2  | 18 | 0  | 100% | 96% |
| 3  | 17 | 1  | 94%  | 90% |
| 4  | 18 | 0  | 100% | 77% |
| 5  | 10 | 8  | 56%  | 56% |
| 6  | 9  | 9  | 50%  | 32% |
| 7  | 11 | 7  | 61%  | 14% |
| 8  | 10 | 8  | 56%  | 6%  |
| 9  | 5  | 13 | 28%  | 2%  |
| 10 | 3  | 15 | 17%  | 1%  |
| **total** | **119** | **61** | **66%** | |

```
  win  100% ████ ████ ████ ████
   rate 75%
        50%                     ░░░░ ░░░░ ░░░░ ░░░░
        25%                                         ░░░░ ▒▒▒▒
         0% ────────────────────────────────────────────────
             d1   d2   d3   d4   d5   d6   d7   d8   d9  d10
             └── walkover ──┘   └─── plateau ───┘   └ decline ┘
```

The target column is the auto-resolver this layer replaced (#62):
`logistic((force − difficulty × difficultyScale) / winSpread)` with
`difficultyScale` 40 and `winSpread` 40 from `AUTO_RESOLVE_TUNING`, for
the starter force at rating ~209.

## What it says

**The bottom of the range is a walkover.** Every seed from difficulty 1 to
4 is won bar one, and nothing separates difficulty 1 from difficulty 4.
The difficulty number buys the player nothing down there. This is pinned
in code by `WALKOVER_CEILING` in `mission-sweep.sim.test.ts`, so a pass
that gives the bottom of the range teeth fails there and this table is
updated with it.

**The top of the range is a plateau and then a decline.** From difficulty
5 to 8 the win rate sits flat at 50–61%: four difficulty steps that do not
change the player's odds. Only at 9 and 10 does it fall away, to 28% and
17%. So difficulty has roughly three states, not ten — walkover, coin
flip, hard — and the middle one is four numbers wide.

**It is far more generous than the auto-resolver through d6–d9**, by 14 to
47 points. A difficulty-8 mission the overworld prices at 6% is won 56% of
the time on the map.

**Every mission ends.** No seed was unresolvable at any difficulty.
`missionOutcome` fires as designed.

### Why this table is pooled, and what that cost

Two independent measurements of this curve disagreed about the top half,
and both are exactly reproducible:

| | d5 | d6 | d7 | d8 | d9 | d10 |
| --- | --- | --- | --- | --- | --- | --- |
| `sweep-*` seeds, 6 each | 50% | 50% | 50% | 67% | 50% | **50%** |
| `tune-*` seeds, 12 each | 58% | 50% | 67% | 50% | 17% | **0%** |

Same rules, same cap, same force, same commit. Replaying either set
reproduces it cell for cell, so neither is a mistake — the seed set is
doing the work. **Map variance dominates difficulty through the whole top
half of the range.** At six or twelve seeds a difficulty the shape of that
half is not reliably measurable, and the first sample's reading of it
("difficulty 10 is no harder than difficulty 5") was a draw, not a
property.

Treat any per-difficulty figure above 4 as ±1 in 18 and do not re-derive a
shape from a small sample. If a tuning pass needs the top half resolved
more finely than this, it needs more seeds, not a different reading of
these.

## Mission length

| outcome | n | median | range |
| ------- | - | ------ | ----- |
| won | 119 | **6 turns** | 4–21 |
| lost | 61 | **42 turns** | 25–78 |

A win takes six turns; a loss takes forty-two. The mission you are losing
is the one that goes on, which is backwards, and it is the pace problem
#666 names.

Turns-to-lose barely varies with difficulty, which is the clue that it is
not a balance property but arithmetic — see below.

One caveat that keeps the number honest: **the sweep's driver never
extracts.** 42 turns is the length of a loss fought to the last unit, not
the length of every losing mission. A player has extraction and would
presumably take it.

## Why a loss takes forty turns

The infantry die early and the mech then grinds. `damageRange` subtracts
unpenetrated armour from the weapon's band before clamping at
`COMBAT_TUNING.minDamage`, and the starter mech carries **9 points of
per-hit armour**:

```
effectiveArmor = max(0, armor − weapon.armorPen)
band           = [damage×0.75, damage×1.25] − effectiveArmor, floored at minDamage (1)
```

| species | damage | armorPen | band vs mech | hatch share |
| ------- | ------ | -------- | ------------ | ----------- |
| swarmer | 3  | 0 | **1–1** | 6/10 |
| lurker  | 6  | 1 | **1–1** | 3/10 |
| brute   | 10 | 2 | 1–6     | 1/10 |

Nine hatchlings in ten do exactly one point to a mech, whatever else
changes. Melee range is 1, so only the ~8 tiles adjacent to the mech can
reach it, and `attackEndsTurn` gives each one bite a turn:

```
8 attackers × ~0.65 accuracy × ~1.3 damage ≈ 6 hp per turn, against 80 hp
```

That is the whole tail, and it predicts a ~40-turn loss without reference
to any balance number.

### The lever this rules out

**Wave size and spawn rate cannot shorten a loss.** Past about eight bugs
in contact the extra ones have nowhere to stand. A difficulty-10 mission
already ends with 128–165 live bugs on the map and still takes 38 turns.
Raising `baseWaveSize`, `sizePerDifficulty` or `hatchCount` makes the map
more crowded and the sweep slower without shortening a single loss — and
it is the obvious lever to reach for.

The levers that do move it change damage per attacker: species `damage`
and `armorPen`, the hatch mix, or the mech's armour.

## Where the other levers are

Not distances — #489 established that every objective on every shipped
settlement is engageable, and `objective-reachability.test.ts` guards it.
Beyond the armour arithmetic above, the table implicates:

- **what difficulty actually scales.** A flat d5–d8 says it reaches a
  ceiling early. Worth confirming what reads the difficulty number before
  tuning what it feeds — the bug is as likely to be "it stops being
  applied" as "it is applied too weakly".
- **species stats** (`species.ts`) — one sight value and one weapon
  profile per species, shared across every difficulty.

Two numbers changed under this table without being weighed against it:

- **mech charges are per weapon since #532**, so a two-weapon mech carries
  4 + 4 where it carried 4 — roughly double the turns it can keep firing,
  since #533 also limits it to one attack per turn.
- **`forceRating` still values a squad by a static `combatRating`**, which
  does not model the second attack #533 gave it.

## Reading the sweep's output

`pnpm test:sim` runs a **15-turn cap** for runtime, so it reports
`won 42, unresolved 18, lost 0` on its own 60 seeds. **That `unresolved`
is not a hang and that `lost 0` is not a missing defeat condition** —
every one of those 18 is a loss that arrives after turn 15, and the median
loss lands at turn 42.

This has misled once already: the sweep merged in #668 asserted `lost 0`
with a comment stating a mission is won or it hangs and there is no losing
it, which #692 disproved by raising the cap. Treat `unresolved` as *"still
playing when the cap arrived"* and nothing more.

## How to re-measure

```
pnpm test:sim
```

To reproduce the table above, raise `TURN_CAP` to 90 and `BUDGET_MS` with
it, and play both seed sets — `sweep-${i}` with difficulty `(i % 10) + 1`,
and `tune-${d}-${i}` for twelve seeds at each difficulty. About 20 minutes
for the 180.
