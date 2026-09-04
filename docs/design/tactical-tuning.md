# Tactical difficulty: measured baseline

What the mission rules actually produce, before any tuning pass (#497).
Measured with the seeded sweep from #343 — 60 whole missions through the
real rules headless, six seeds at each difficulty from 1 to 10.

Recorded on `a279068`.

> **Superseded in part by #710, on `ece970e`.** Sealing sight at a corner
> between two opaque props changed the curve materially — difficulty 4
> lost its clean sweep, 7 got easier, and **9 now wins nothing**. The
> win/loss split below was measured before that and the "flat top half"
> claim no longer holds; see *After #710* at the end for what is known
> now. The shape of the tuning problem changed with it, so re-measure
> before tuning against anything here.

Re-measure and update this table in the same commit as any tuning change.

## The curve

Played to a **90-turn cap**, at which every seed resolves. `pnpm test:sim`
uses a 15-turn cap for runtime, so it reports most of the losses below as
`unresolved`; see *Reading the sweep's output* at the end.

| difficulty | won | lost | win rate | median mission |
| ---------- | --- | ---- | -------- | -------------- |
| 1  | 6 | 0 | 100% | 5 turns |
| 2  | 6 | 0 | 100% | 6 turns |
| 3  | 6 | 0 | 100% | 6 turns |
| 4  | 6 | 0 | 100% | 7 turns |
| 5  | 3 | 3 | 50% | 28 turns |
| 6  | 3 | 3 | 50% | 28 turns |
| 7  | 3 | 3 | 50% | 28 turns |
| 8  | 4 | 2 | 67% | 26 turns |
| 9  | 3 | 3 | 50% | 25 turns |
| 10 | 3 | 3 | 50% | 34 turns |
| **total** | **42** | **18** | **70%** | |

```
  win  100% ████ ████ ████ ████
   rate 75%                     ░░░░ ░░░░ ░░░░ ████ ░░░░ ░░░░
        50%                     ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░
         0% ────────────────────────────────────────────────
             d1   d2   d3   d4   d5   d6   d7   d8   d9  d10
             └── walkover ──┘   └──────── flat coin flip ────────┘

  turns    35                                             ██
           30       ░░░░ ░░░░ ░░░░      ░░░░
           25       ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░
            5  ▂▂▂▂ ▂▂▂▂ ▂▂▂▂ ▂▂▂▂
               d1-4  ────────── d5-10 ──────────
```

## What it says

**Difficulty has two states, not ten.** Below 5 every seed is won and
nothing separates difficulty 1 from difficulty 4. At 5 and above the win
rate drops to a flat ~50% and stays there: **difficulty 10 is no harder
than difficulty 5** (3/6 at both). Whatever the difficulty number feeds
stops making a difference once it crosses that threshold. That is the
central thing a tuning pass has to fix, and it is a cliff, not a slope.

**Mission length steps the same way.** 5–7 turns below the threshold,
25–34 above it — four to five times longer, and again flat across the top
half. This is the pace problem #666 names: a mission that ends after 34
turns ends, but it is far longer than a player will sit through.

**Every mission ends.** No seed is unresolvable. The defeat condition in
`missionOutcome` fires as designed.

## Reading the sweep's output

`pnpm test:sim` runs a **15-turn cap** for runtime, so it reports
`won 42, unresolved 18, lost 0`. **That `unresolved` is not a hang and
that `lost 0` is not a missing defeat condition** — every one of those 18
is a loss that arrives after turn 15. The 18 unresolved seeds are exactly
the 18 losses in the table above.

This has misled once already: the sweep merged in #668 asserted `lost 0`
with a comment stating a mission is won or it hangs and there is no
losing it, which #692 disproved by raising the cap. Treat `unresolved`
as *"still playing when the cap arrived"* and nothing more.

To reproduce the table, raise `TURN_CAP` to 90 and `BUDGET_MS` with it.

## Where the levers are

Not distances — #489 established every objective on every shipped
settlement is engageable, and `objective-reachability.test.ts` guards it.
The table implicates:

- **spawn timers and wave sizes** (`spawn-tuning.ts`) — both the win-rate
  cliff and the length cliff appear at the same difficulty, which points
  at the population race rather than at unit stats
- **what difficulty actually scales.** A flat top half says it reaches a
  ceiling early. Worth confirming what reads the difficulty number before
  tuning what it feeds — the bug is as likely to be "it stops being
  applied" as "it is applied too weakly"
- **species stats** (`species.ts`) — one sight value and one weapon
  profile per species, shared across every difficulty

Two numbers changed under this table without being weighed against it:

- **mech charges are per weapon since #532**, so a two-weapon mech carries
  4 + 4 where it carried 4 — roughly double the turns it can keep firing,
  since #533 also limits it to one attack per turn
- **`forceRating` still values a squad by a static `combatRating`**, which
  does not model the second attack #533 gave it

## How to re-measure

```
pnpm test:sim
```

The walkover half is pinned in `mission-sweep.sim.test.ts` ("has no
difficulty gradient below 5"), so a pass that gives the bottom of the
range any teeth fails there and this table is updated with it — rather
than the two drifting apart.

## After #710

Re-measured on `ece970e` at the sweep's 15-turn cap, so wins only — the
losses need the deeper run and have not been taken:

| difficulty | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wins of 6 | 6 | 6 | 6 | 5 | 2 | 3 | 5 | 4 | **0** | 1 |

**The top half is no longer flat.** Difficulty 9 wins nothing and 10 wins
once, while 7 wins five of six — so there is now a gradient at the top to
work with, and the reading above that "difficulty 10 is no harder than
difficulty 5" is wrong as of this commit. What survives is the cliff
between 4 and 5.

Worth noting what caused it: a **line-of-sight fix**, not a tuning value.
Whatever difficulty feeds is sensitive to sight, which is a lead for the
question below about what difficulty actually scales.

To re-take the full win/loss table, `SIM_TURN_CAP=90 pnpm test:sim`.
