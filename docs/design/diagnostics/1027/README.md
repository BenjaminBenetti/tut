# #1027 — playing the tactical layer: ranked UX findings

**What this is.** I played missions on `main` at `123c54c` (v0.2.15 plus two mapgen/docs
commits that touch no UI file), seed `4242`, mission `Johannesburg`, at 1600 x 1000. Real
input — clicks on units, the number row, right-click to move, the End turn button. Not a
test pass: no assertions, no spec, just play and watch what the interface says.

I reached contact in six sessions and hit both states the Director asked for: **a unit run
dry** (unit-2, `ammo 0 / 3`, turn 6, after ten shots across the squad) and **units lost**
(both Rifle Squads destroyed, turns 10 and 14; the Hammerhead bled 80 → 0 over the following
thirty turns and the mission was lost on turn 45).

**Three findings, not five.** The cap was five. I am filing three because everything else I
found is already covered by #1028, #1029 or #1030 — §4 lists that coverage with the evidence
I gathered for it, so the seats working those tickets get the frames rather than me
re-filing them under new numbers.

**I am not proposing the redesign.** Each finding says what is wrong and what it costs.

---

## 1. FRICTION — nothing in a mission tells you the state of your squad, and Tab hands you a unit it will not show you

`shots/F3-tab-selects-a-unit-you-cannot-see.png` ·
`shots/F3-clip-tab-does-not-follow.gif` (18 frames: the squad in view, the pan away, then
two presses of Tab — the card goes RIFLE SQUAD → HAMMERHEAD and the action bar rebuilds
itself around a mech's two weapons, while the map stays empty road)

Four separate absences that add up to one: **there is no squad-level view in a mission.**

- **No roster.** `SquadListView` is mounted only by `roster-screen.ts`. On the tactical
  screen, zero elements carry a unit id. The right rail shows exactly one unit — whichever
  you last clicked.
- **Tab selects a unit without going to it.** I panned until all three units were off
  screen, then pressed Tab. The card filled in (RIFLE SQUAD, `AP 2 / 2`, `ATTACKS 2`,
  `ammo 3 / 3`) and every button in the action bar lit up. All three units were still off
  screen. I pressed Tab three more times: still off screen. The bottom half of the exhibit
  is a fully armed, fully loaded unit and an empty road.
- **No way to go to it — although the game knows how.** The camera rig has
  `lookAt(target)` (`orthographic-camera-rig.ts:111`), and the game calls it exactly once:
  `tactical-scene-steps.ts:118` does `framing.lookAt(missionFocus(mission))` to frame your
  squad as the mission opens. Nothing calls it again — not on selection, not on `next-unit`,
  and it is not reachable from a key, because the `CameraControls` interface the input layer
  talks to exposes only `rotateLeft`, `rotateRight`, `zoomBy` and `panBy`. So a unit off
  screen is found by panning blind, using a capability the game already used once to find it
  for you.
- **End turn never mentions unspent units.** I ended a turn with `unit-1 ap0, unit-2 ap2,
  unit-3 ap2` — two of three units holding full AP. No confirm, no warning, no notice. The
  turn advanced.

**What it costs the player.** The only way to audit your own squad is to click each unit in
turn, and each click is a 473 px round trip to the action bar to see what that unit can do.
With three units that is fine; the moment a unit is off screen or you lose count, there is
no affordance that recovers it. Units get skipped silently, and the interface's answer to
"who still has AP?" is "click them all and remember".

I have labelled this friction rather than a defect because nothing it says is false. It is
first on the list anyway: it is the one finding with no recovery path, and it is the cost
the Executive Director already objects to in #1026 — clicking every unit to learn the state
of your squad *is* the mouse travel.

## 2. DEFECT — one squad has four names, two of them database keys, and your two squads share the third

`shots/F1-four-names-one-squad.png`

The same Rifle Squad, on one screen, in one turn:

| where | what it is called |
|---|---|
| unit card, right rail | **RIFLE SQUAD** |
| the shot refusal, 250 px below the card | **`Unit "unit-2"`** |
| the event log, bottom left | **Rifle Squad** |
| the mission debrief, after the mission is lost | **Alpha** |

`src/roster/model/squad.ts:28` documents the field the debrief is using:
*"Player-facing name, e.g. `"Alpha"`"*. The mission never uses it. The tactical layer names
units by their **template** — the type — so:

- **Both squads are called "Rifle Squad".** Templates `squad:squad-1` and `squad:squad-2`
  are both named `Rifle Squad`. In one mission the log printed **`Rifle Squad destroyed`
  twice, on turns 10 and 14, for two different units.** Nothing anywhere in the tactical
  interface distinguishes them.
- **The log can merge rows about different units, and #1028 is what will start it.**
  `event-log-view.ts` collapses a repeat when `last.dataset.text === entry.text`, so
  `Swarmer hit Rifle Squad for 2 ×2` carries no attribution. **I tried to reproduce a merged
  row spanning two units and could not** — see the raw DOM order below. Two identical rows,
  `Swarmer hit Rifle Squad for 4`, sat one apart in the same bug phase and did **not**
  collapse, because a movement row was between them and `append` compares only against
  `lastElementChild`:

  ```
  Turn 10 — bug phase
  Swarmer hit Rifle Squad for 2
  Swarmer hit Rifle Squad for 4
  Lurker moved 1 tile [x18]        <- defeats the collapse
  Swarmer hit Rifle Squad for 4
  Rifle Squad destroyed
  ```

  (2 + 4 + 4 = 10 = unit-2's loss that phase, so even these two are the same squad.)
  **Movement rows are currently the only thing keeping identical combat rows apart, and
  #1028 removes them.** The merged-attribution case is latent today and activated by that
  deletion, which is a sequencing fact for whoever takes both. Recorded on #1040.
- **Ids reach the player.** `describeTacticalError` (`src/tactical/model/tactical-error.ts`)
  is a diagnostic table — every message that names a unit names it `Unit "<id>"`, and
  `hit-preview-view.ts:165` prints it verbatim in the HUD.
- **The objective gets three names on one screen.** The log says `Rifle Squad hit spawner-1
  for 3`; the objectives panel 300 px above says `Destroy spawner 1`; the attack header says
  `EGG SPAWNER`. `nameResolver` builds its lookup from `mission.units` only, so a spawner
  misses and falls back to its raw id.

**What it costs the player.** You cannot attribute anything to a unit. When the log says a
Rifle Squad took 4 damage you do not know which one to pull back; when it says a Rifle Squad
was destroyed you do not know which one you lost. You find out at the debrief, which knows
them as Alpha and Bravo. And when the game refuses you, it refuses a unit called `unit-2`
that you have never seen named anywhere else.

**Not all of it is bad, which is the point.** `Target is 18 tiles away; weapon reaches 10`
is exactly the right register — no ids, real numbers, tells you what to do. It comes out of
the same table. The player cannot tell which kind of sentence they are about to get.

## 3. DEFECT — a dry weapon is only discoverable by trying to fire it, and the answer arrives on the far side of the screen

`shots/F2-dry-weapon-discoverable-only-by-firing.png`

At the moment unit-2 ran dry, the card read:

```
AP        1 / 2
ATTACKS   1
WEAPON    range 8 · acc 65 · dmg 3 · pen 0
          ammo 0 / 3
```

**`ATTACKS 1` and `ammo 0 / 3` on the same card, four lines apart.** One says you have an
attack left; the other is the reason you do not. `ATTACK` stays lit in the action bar. The
only thing that tells you is the refusal — and it arrives after you arm Attack *and* pick a
target, in the right rail, 470 px from the unit, naming a unit called `unit-2`.

**What it costs the player.** Three interactions and a screen-width round trip to learn
something the card already knows and is displaying a contradiction of. In practice you plan
a turn around an attack, spend the beats to set it up, and get told no at the last step.

This is adjacent to #1030, which is about refusals being consistent and in clear words. The
part I think #1030's framing may not reach is the **card's own arithmetic**: `ATTACKS 1`
against `ammo 0 / 3` is wrong before any refusal is involved.

---

## 4. What I found that is already filed — with the evidence, so it does not need finding again

**#1028, movement in the event log.** `shots/E1-death-scrolled-off-by-movement.png` is the
log at the instant a Rifle Squad was destroyed. The visible window is eleven consecutive
movement rows, one of them `Swarmer moved 1 tile ×130`. `Rifle Squad destroyed` is above the
fold; the log auto-scrolls to the newest line, and the newest line is always a move. **The
only persistent record of losing a soldier was already scrolled out of sight at the moment
it happened.** The collapser is doing its job and it is still not enough: one of those
eleven rows reads `×130`, so a single row is absorbing 130 movement events and the eleven
rows together still fill the whole panel. By turn 44 the top bar read 105 bugs.

**#1030, action-state feedback.** A move the unit cannot make says **nothing at all**: I
right-clicked a tile 14 tiles from a unit with 2 AP. The unit did not move, no AP was spent,
and there was no notice, no preview, no log line. I did not isolate whether that was a
refusal or an ignored click — and neither can the player, which is the finding. That belongs
in #1030's inventory table.

**#1026, travel.** Measured, since it is the epic's premise. With a unit at `772,500`:

| the player needs | distance from the unit |
|---|---:|
| the action bar (what it can do) | **473 px** |
| the unit card (what state it is in) | **678 px** |
| the event log (what just happened) | **675 px** |

Three things, three different edges of the screen. A single shot is: click the unit (centre)
→ arm Attack (bottom, 473 px) → click the target (centre) → read the hit chance (right rail,
678 px) → click Fire (right rail). The action is armed on one edge and confirmed on the
opposite one.

---

## 5. What already works and must not be lost

**The map plane already does what #1026 is asking the HUD to do.**
`shots/W1-the-map-plane-already-does-this.png`. Arm Move and the world itself tells you
where you can go *and* what you will get when you arrive: reachable tiles in blue, high
cover as red chevrons, low cover as yellow ticks, weapon range in orange. Two-AP tiles use
the same colour as one-AP tiles at a **smaller footprint** rather than a different hue —
`tactical-overlay-palette.ts` reserves four colours for this plane and encodes the rest in
shape, deliberately, so colour-vision deficiency cannot take it away. This is in-scene,
contextual, zero-travel feedback that already exists and is carefully built. Anything that
moves more of the interface into the world has to share this plane without trampling it.

**The shot preview says why the number is what it is.** `3 tiles · no cover · flanked`,
`76% hit`, `2–4 damage`. The card says `acc 65` and the shot says 43% or 76%, and the chips
tell you which of distance, cover and flanking did it. That is the difference between a
number and an explanation, and it is the best thing in the tactical HUD.

**Selection is reliable.** Clicking a unit selects it on the first attempt, at every one of
the five floor levels, for every unit I tried. Stepping the floor with `[` never made a unit
unclickable. This is the game screen's only selection path and it does not fail. (It is now
guarded by `e2e/tactical-unit-click.spec.ts`, merged as #976.)

**The camera rotates, and that is the answer to a unit behind a building.** `q` and `e` turn
the view 90°, which is how you get a look at a squad the geometry is hiding. It works, and
finding 1 is not asking for it to be replaced — a rotate is the right tool for occlusion and
the wrong one for "where is unit three".

**Overwatch reports itself properly.** Press it and `STATUS` changes to `overwatch`, `AP`
goes 2 → 0, `ATTACKS` goes 2 → 0, and the log says so. Three surfaces agree. That is the
standard the rest of the actions should be measured against.

**The objectives panel tracks live.** `0 / 2 · Destroy spawner 1 — 14 hp · Destroy spawner 2
— 20 hp`, counting down as you shoot. You always know what the mission is and how far in you
are.

**The bug phase does not get slower as the swarm grows.** Measured from clicking End turn to
the mission being back in the player's hands: 609–2178 ms at 0 bugs, 1454 ms at 79 bugs. Flat
across 26 turns. I expected this to degrade and it does not.

**The phase banner names the transition in words** — "The bugs have finished · Turn 11" —
rather than making you infer it from the top bar.

---

## 6. Smaller things, recorded but not filed

- A miss is drawn in the dimmest tone the style guide has, in both channels that report it:
  the log gives `X missed Y` `tone: "dim"` — the same tone as movement — and the floater
  above the target uses `ui-text-dim`. A hit is `danger` red in both. Whether the least
  welcome outcome in a turn should be the quietest thing on screen is a taste call, and
  taste is not mine.
- `Rifle Squad is overwatch` — the status line reads `${name} is ${status.join(", ")}`, so
  every status change comes out ungrammatical.
- The two weapon buttons on a mech both print the shortcut `2`. I checked whether that
  misleads and it does not: pressing `2` repeatedly cycles Autocannon → Missile Pod →
  Autocannon, so the digit is true on each button, as #652 intended. Recording it because it
  looks like a defect and is not.

## 7. Limits

- One seed (`4242`), one mission (`Johannesburg`, a temperate city map), 1600 x 1000, five
  play sessions. A different map size or a squad of six may show things this did not.
- Findings 1 and 3 rest on instrumented play plus source reads; the naming in finding 2 is
  read off frames and confirmed against `squad.ts`, `tactical-error.ts` and
  `event-log-view.ts`.
- Every frame here is a capture of `123c54c`, not a regression baseline. Per the Producer's
  ruling on #968 they are a dated record of that head, not a pin.
- Verdicts are mine, from playing. The Executive Director judges the frames.
