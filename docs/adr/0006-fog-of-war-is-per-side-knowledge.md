# ADR 0006: Fog of war is per-side knowledge in the mission state

- **Status:** Accepted (Tech Lead); §2.4 amended 2026-09-05 on the Director's #748 ruling. Shipped across six PRs and in tags `v0.2.2`/`v0.2.3`; `SideVision` reached its current shape in #722, recorded here in #732. Retrospective: it sat at Proposed while the whole of it was implemented, which is the failure this line now fixes.
- **Date:** 2026-09-04
- **Author:** Tech Lead
- **Requested by:** Executive Director (#514, band 4 item 11): *"No line of sight system! This is one of the core things that makes XCOM good! We need the fog of war!"*
- **Scope:** Architecture §2 (simulation purity), §5 (contracts); `tactical/model/tactical-state.ts`, `tactical/service/sight-service.ts`, `bugs/ai/*`, `graphics/service/tactical-scene-builder.ts`, `save/`

## 1. Context

The mission already knows whether one tile can *see* another:
`hasLineOfSight(map, from, to, index)` walks the plane between two tiles and
`coverAgainst` grades what a shot passes through. Every attack is validated
through it (ADR 0004 §5, `validateTargeting`).

What does not exist is **vision**. Nothing in `TacticalState` records what a
side has seen, so:

- `tactical-scene-builder` draws every unit in `mission.units`, whether or not
  a TDF unit could possibly see it;
- the whole map is drawn from turn one, so there is nothing to scout;
- `BugBehaviour.choose(mission, unitId, ctx)` is handed the entire mission, so
  a bug walks straight at a squad it has no way of knowing about — the mirror
  of the same defect, and the one nobody notices because it looks like the bugs
  are simply good.

That last point is the reason this is an ADR rather than a rendering ticket.
Hiding enemies from the *player* is a change to one scene builder. Hiding them
from the *AI* is a change to the interface every behaviour is written against,
and it is much harder to retrofit once three species depend on the current
shape.

There is also a save consequence: what a side has seen has to survive a reload,
or a save/load cycle becomes a map-wide reveal.

## 2. Decision

### 2.1 Vision is state, computed by a rule, stored on the mission

Add to `TacticalState`:

```ts
/** What each side has seen, and what it can see right now. */
readonly vision: Readonly<Record<Team, SideVision>>;

interface SideVision {
  /** Tile keys this side can see this instant; recomputed, never migrated. */
  readonly visible: readonly TileKey[];
  /** Tile keys this side has ever seen. Monotonic within a mission. */
  readonly explored: readonly TileKey[];
  /** Enemy units currently seen, by id. */
  readonly spotted: readonly UnitId[];
  /**
   * Where this side last saw each enemy it has ever spotted (#716).
   * Accumulated like `explored`, never recomputed: losing sight must not
   * erase it, which is the whole reason it exists.
   */
  readonly lastSeen: Readonly<Record<UnitId, TileCoord>>;
}
```

`lastSeen` is written **only from units currently in `spotted`**. Reading it from
the event log or from `mission.units` would be cheaper and would record positions
the side never observed — the same omniscience §2.3 exists to prevent, arriving
through the back door. A migration that met a save without it seeds it **empty**
rather than reconstructing: a save holds no history to rebuild a sighting from,
and inventing entries hands a side knowledge it never had.

It exists because a behaviour that cannot see its mark otherwise has no mark at
all. #695 measured the consequence: raising the lurker's `exposureWeight` to any
value that changed its route also ended the engagement permanently, because
"prefer cover" resolved to "leave, and forget". Memory is **necessary and not
sufficient** — with it in place the cliff did not move (#722), because there is
also nowhere concealed to approach through (#685 measured 0% of contact tiles
ever unseen).

`visible` and `spotted` are derived: a pure `computeVision(mission, team)` in a
new `tactical/service/vision-service.ts` returns them from unit positions,
`hasLineOfSight` and a per-template `sightRange`. `explored` is the union of
every `visible` so far.

They are **stored anyway**, not recomputed on read, for three reasons: a scene
builder that recomputed vision every frame would do line-of-sight work in the
render loop; `explored` is genuinely accumulated state that cannot be derived
from the current position of anything; and storing it makes spotting an event
rather than a diff two layers apart have to agree on.

### 2.2 Vision is recomputed at exactly three points

At the end of any `PhaseStep` pipeline that can move or kill a unit — that is,
inside `EndTurn` — and after any handler that changes a unit's position or
membership: `Move`, `Extract`, and any handler that kills (`Attack`,
overwatch reactions, `damageSpawner` never moves anyone). Concretely, one
helper `withVision(applied)` wraps a handler's `Applied` and is applied by
`registerTacticalCommands`, the single site that already appends events to the
log (`tactical-command-handlers.ts`). No handler computes vision itself.

Newly spotted units raise a `UnitSpotted` event so the renderer can animate a
reveal and the log can say "Contact". Losing sight raises `UnitLost`.

### 2.3 The AI is given a view, not the mission

`BugBehaviour.choose` changes from taking `TacticalState` to taking a
`MissionView`:

```
  TacticalState ──► viewFor(mission, "bugs") ──► MissionView ──► behaviour
```

`MissionView` exposes the same reads a behaviour uses today — `units`, `map`,
`spawners`, `turn` — with `units` already filtered to the acting side's own
units plus the enemies it can see. A behaviour physically cannot cheat, and the
three shipped behaviours change by their type signature only.

This is the expensive half of the decision and it is deliberate. The
alternative — filtering at each call site — leaves the door open on every new
behaviour, and #332, #333 and #334 show behaviours arrive one per issue from
different seats.

### 2.4 The renderer draws the view: units withheld, terrain always present

`tactical-scene-builder` takes the TDF `MissionView`. An enemy not in
`spotted` has no object in the scene at all, rather than a hidden one: an
invisible-but-present object is one `visible = true` away from a wallhack, and
picking would still find it. **That rule is for units and objectives, and for
nothing else.**

Terrain, walls, connectors and props are **always drawn**, in three states:
visible at full colour, explored-but-not-visible dimmed, and unexplored
**darkened further — never absent.** (Director ruling on #748, 2026-09-05,
recorded in GDD §6.2.1.)

This section originally said _"unexplored tiles draw as nothing — the ground
plane simply is not there"_, and the renderer implemented it faithfully:
`applyVisionTo` zero-scaled every unexplored instance and hid unexplored
connectors, and a wall inherited its tile's vision. The Executive Director's
first playtest of it (#748) saw black voids with hard cliff edges cut along the
seen area, and buildings fragmentary wherever a wall's tile had not been seen.
The wallhack argument that justifies absence for a unit does not transfer to a
wall: nobody gains an advantage from seeing that a building exists, and ground
that is missing reads as a rendering fault rather than as fog. Fixed under
#761.

`explored` stays per side and stored, for the same reason as before —
uncovering ground is the feel of scouting. It is expressed as brightening
rather than as appearing.

### 2.5 Save: one migration, and `visible`/`spotted` are not trusted

`GAME_STATE_SCHEMA_VERSION` goes to 11 with `ADD_MISSION_VISION`, which gives
any in-progress mission an empty `vision` for both sides. On load, the first
`withVision` recomputes `visible` and `spotted` from scratch, so a stale or
hand-edited value cannot leak knowledge; only `explored` is taken from the
save, because it cannot be recomputed.

An empty `explored` on an in-flight mission means a reload re-hides ground the
player had already scouted. That is a real regression for exactly one save —
the one in progress across the upgrade — and the alternative is inventing
explored ground that was never seen. We take the honest reset.

## 3. Consequences

- Three species' behaviours change signature in one commit. They must land
  together, and #514 band 4 must sequence fog after the behaviours it touches.
- Vision cost is `O(units × visible tiles)` per recompute, with `hasLineOfSight`
  already the hot path in combat. It is bounded by recomputing only on the
  events in §2.2, never per frame, and `TileIndex` is already built once per
  map by the move graph. If it bites, the cache to add is a per-tile visibility
  bitset invalidated by movement, not a cheaper line algorithm.
- `MissionView` is a second read interface over the mission. That is the price
  of the AI never cheating, and it gives the renderer a natural seam too.
- Overwatch needs a rule decision the epic does not state: a watcher can only
  react to a mover it can see. This ADR asserts that — reacting to an unseen
  mover is the AI-cheating defect wearing a different hat.
- The e2e suite asserts on units being present in the scene. Specs that deploy
  and immediately look for bugs will need a spotting step, which is a fair
  reflection of the game the Executive Director asked for.

## 4. Alternatives considered

**Render-only fog.** Hide unseen enemies in the scene builder and change
nothing else. It is a day's work and it is what "fog of war" usually means when
it is a ticket. Rejected: the bug AI keeps omniscience, and the player feels it
as bugs that always know where to go — the exact opposite of what the request
is about.

**Derive vision on read, store nothing.** Cheaper state, no migration. Rejected:
`explored` is not derivable, and a renderer recomputing line of sight per frame
puts the most expensive rule in the game in the render loop.

**Per-tile fog on the map rather than per side.** Simpler state — one field on
`Tile`. Rejected: it cannot express two sides with different knowledge, which
§2.3 requires, and `TacticalMap` is generated content that should not carry
per-mission mutable state (ADR 0004 §2).

**Give behaviours a `canSee(unitId)` predicate instead of a filtered view.**
Smaller change. Rejected: it is advisory. A behaviour that forgets to call it
still compiles, still passes its own tests, and cheats in the shipped game.
