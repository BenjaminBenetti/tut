# Tactical difficulty: measured baseline

What the mission rules actually produce, before any tuning pass (#497).
Measured with `pnpm test:sim` — the seeded sweep from #343, which plays
60 whole missions through the real rules headless, six seeds at each
difficulty from 1 to 10.

Recorded on `67f2fcd`. Re-measure with `pnpm test:sim` and update this
table in the same commit as any tuning change.

## The curve today

| difficulty | won | lost | never ended | seeds |
| ---------- | --- | ---- | ----------- | ----- |
| 1  | 6 | 0 | 0 | 6 |
| 2  | 6 | 0 | 0 | 6 |
| 3  | 6 | 0 | 0 | 6 |
| 4  | 6 | 0 | 0 | 6 |
| 5  | 3 | 0 | 3 | 6 |
| 6  | 2 | 0 | 4 | 6 |
| 7  | 3 | 0 | 3 | 6 |
| 8  | 4 | 0 | 2 | 6 |
| 9  | 3 | 0 | 3 | 6 |
| 10 | 3 | 0 | 3 | 6 |
| **total** | **42** | **0** | **18** | **60** |

```
   won  6 ██████ ██████ ██████ ██████
        5
        4               ░░░░░░               ██████
        3        ░░░░░░ ░░░░░░ ░░░░░░ ██████ ░░░░░░ ░░░░░░
        2                      ░░░░░░
        0 ─────────────────────────────────────────────────
          d1  d2  d3  d4   d5     d6     d7     d8  d9  d10
          └── every seed won ──┘  └── coin flip, never lost ──┘
```

## What it says

**Difficulty has two states, not ten.** Below 5 every seed is a walkover:
24 of 24, no stalls, and nothing distinguishes difficulty 1 from
difficulty 4. At 5 and above it becomes a coin flip between a win and a
mission that never ends.

**The hard half is flat.** Stalls run 3, 4, 3, 2, 3, 3 across difficulties
5 to 10 — they do not climb. **Difficulty 10 is no harder than difficulty
5.** Whatever the difficulty number feeds, it stops making a difference
once it crosses that threshold.

**Nothing is ever lost.** Not once in 60 seeds at any difficulty. This is
#666: the bug population outruns a three-unit force and the rules have no
defeat short of a total wipe, so a mission that cannot be won sits
unwinnable and unlost instead of ending.

## Why this is a baseline and not a tuning pass

The tuning #497 was filed for cannot be done from here, and the table is
the argument. A win-rate curve needs a losing half to have a shape; with
`lost 0` everywhere, moving any tuning value only shuffles seeds between
"won" and "hangs forever". That is not a difficulty curve, and measuring
it twice would not make it one.

So **#666 first**. When a hopeless mission can end, the sweep starts
reporting losses, this table gains its missing column, and the numbers
below become worth moving.

## Where the levers are, for whoever picks that up

Not distances — #489 established that every objective on every shipped
settlement is engageable, and `objective-reachability.test.ts` guards it.
The open questions are the ones this table implicates:

- **spawn timers and wave sizes** (`spawn-tuning.ts`) — the stall is a
  population race, so this is where the 5-and-above cliff most likely
  lives
- **species stats** (`species.ts`) — one sight value and one weapon
  profile per species, shared across every difficulty
- **what difficulty actually scales.** The flat hard half suggests it
  reaches a ceiling early; worth confirming what reads it before tuning
  what it feeds.

Two numbers changed under this table without being weighed against it,
both worth a look in the same pass:

- **mech charges are per weapon since #532**, so a two-weapon mech
  carries 4 + 4 where it carried 4 — roughly double the turns it can
  keep firing, since #533 also limits it to one attack per turn
- **`forceRating` still values a squad by a static `combatRating`**, which
  does not model the second attack #533 gave it

## How to re-measure

```
pnpm test:sim
```

The per-difficulty breakdown is pinned in `mission-sweep.sim.test.ts`
("has no difficulty gradient below 5"), so a change that gives the bottom
of the range any teeth fails there and this table is updated with it —
rather than the two drifting apart.
