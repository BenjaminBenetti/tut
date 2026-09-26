# ADR 0013 — Campaign progression and mission-type modules

- Status: Accepted (2026-09-26). Amended the same day: §2.2, §2.4 and §2.5 now describe the director and the story spine as built; §2.3 and §2.4 add `onOffered` and `hookPlacement` for Crash Site (#1179); §2.3 adds optional objectives and §2.5 the story setup and presentation tables for Live Specimen (#1179); §2.3 adds `settle` and source-keyed stipend windows for Evacuation (#1179).
- Context doc: [Campaign Arc](../design/campaign-arc.md)
- Supersedes: nothing. It extends ADR 0003 (state, commands, data) and ADR 0011 (tech tree).

## 1. Context

The campaign plan adds four things:

- acts and a story spine;
- about twelve new mission ids: seven types plus story missions;
- five new species with an act-based mix;
- sitreps, hidden tech nodes and Jev-driven named enemies.

A survey of `main` @ 3c812b9d found that defend-installation (#1175) was added mostly through **proxies and conditionals**, not registries:

- `mission.defence !== undefined`;
- `objective.kind === "defend-generators"`;
- `unit.kind === "generator"`;
- the `"generator"` hook kind;
- a hard-coded `archetype: "settlement"`;
- binary branches in the UI.

Adding a dozen types in the same style would edit the same forty sites a dozen times. That breaks Open/Closed and makes parallel work impossible.

## 2. Decision

### 2.1 Campaign progress is overworld state

**`OverworldState.progress: CampaignProgress`** is a required field.

- **Model:** `src/overworld/model/campaign-progress.ts`.
- **Factory:** `createInitialCampaignProgress()` in `src/overworld/service/campaign-progress-factory.ts`.
- **Migration:** a v28 → v29 step that seeds it.

```ts
interface CampaignProgress {
  readonly act: ActId; // content/model/act-id.ts
  readonly actStartedAt: number; // missionsPlayed when this act began
  readonly missionsPlayed: number; // every resolved mission: won, extracted or lost
  readonly missionsWon: number;
  readonly flags: readonly CampaignFlagId[]; // content/model/campaign-flag-id.ts, closed union
  readonly speciesKilled: readonly BugSpeciesId[]; // first-kill record, feeds autopsies
  readonly nemeses: readonly Nemesis[]; // overworld/model/nemesis.ts
}
```

**Shared vocabulary** lives in `content/model`, because more than one domain reads it (ADR 0002):

- `ActId = "act-1" | "act-2" | "act-3" | "finale"`, with `ACT_IDS`.
- `CampaignFlagId`: a closed union, one id per story item or event. A new flag adds one line.

**Act definitions:**

- Model: `ActDefinition { id, name, boardCap, difficultyBand: {min, max}, typeWeights: Partial<Record<MissionTypeId, number>>, sitrepSlots, sitrepChance }` in `overworld/model/act-definition.ts`.
- Data: `ACTS: Readonly<Record<ActId, ActDefinition>>` in `overworld/data/acts.ts`.
- `typeWeights` is `Partial`, so a new mission type adds its weight when it lands.

**Who changes progress:**

- The launch handler (`launch-mission-service.ts`) is the single place that counts missions: `missionsPlayed`, `missionsWon`, `speciesKilled`.
- Story services change `act` and `flags`.
- Nothing else mutates `progress`.

### 2.2 Missions carry their campaign context

New `Mission` fields are **optional**, so older saves stay valid:

- `pinned?: boolean`: a story, hive or wreck offer. It ignores the board cap and never expires unless its rule says so.
  - Defend Installation is **not** pinned. Its trigger rule offers it outside the cap, and it lapses on its own `expiresDay` like any offer.
- `storyId?: StoryMissionId`: `content/model/story-mission-id.ts`.
- `act?: ActId`: frozen at offer.
- `sitreps?: readonly SitrepId[]`: `content/model/sitrep-id.ts`, frozen at offer.
- `bugMix?: SpeciesMix`: species weights frozen at offer (§2.6).

**Type-specific payload** is one optional field named after the type, defined in its own model file. It follows the pattern of `defence?: InstallationDefence`:

- `crashSite?: CrashSiteSpec` in `overworld/model/crash-site-spec.ts`;
- `evacuation?: EvacuationSpec`;
- and so on.

A new type adds one import and one field to `mission.ts`.

### 2.3 Mission-type modules: one rules table per domain

Each domain owns a small interface and a table keyed by `MissionTypeId`. A `Readonly<Record<MissionTypeId, …>>` makes a missing entry a compile error. A type's behaviour in a domain lives in **one file**: `<domain>/service/missions/<type-id>-<role>.ts`. The table only lists those files.

| Domain | Interface (model file) | Table | Replaces |
|---|---|---|---|
| overworld | `MissionOfferRule`: `debut`, `eligible(state, ctx) → MissionSite[]`, `create(state, site, ctx) → Mission` (director-drawn types); **or** `MissionTriggerRule`: `trigger(state, ctx) → Mission[]` (pinned and event types) | `MISSION_OFFER_RULES` in `overworld/service/missions/mission-offer-rules.ts` | the `trigger` switch and `defenceFor` in `mission-generation-service.ts` |
| overworld | `MissionConsequenceRule`: `onOffered?(state, mission, ctx) → OverworldApplied`, `settle?(mission, result, ctx) → MissionSettlement`, `onResolved(state, mission, result, ctx) → OverworldApplied`, `onExpired(state, mission, ctx) → OverworldApplied` | `MISSION_CONSEQUENCE_RULES` in `overworld/service/missions/mission-consequence-rules.ts` | `infestationDeltaFor` for every type; `ignorePenalty` handling |
| mapgen | `MissionMapRule`: `recipe(mission, type) → { archetype, extraHooks, site?, landmark?, hookPlacement? }` | `MISSION_MAP_RULES` in `mapgen/service/missions/mission-map-rules.ts` | the hard-coded `archetype: "settlement"`, `generatorHooks`, `site: mission.defence…` |
| tactical | `MissionSetupRule`: `setup(state, map, mission, deps) → TacticalState` adds the type's objectives, entities and schedules | `MISSION_SETUP_RULES` in `tactical/service/missions/mission-setup-rules.ts` | the spawner, generator and `totalWaves` conditionals in `mission-start-service.ts` |
| ui | `MissionPresentation`: `icon`, `briefingRows(mission)`, `debriefTagline?(result)` | `MISSION_PRESENTATION` in `ui/service/missions/mission-presentation.ts` | `TYPE_ICONS`, `DEFENCE_FIELDS`, `defenceTagline` |

**Objective kinds get the same treatment in tactical and ui.** Many mission types share an objective kind: pods and hive cores are both "destroy the thing", and Uplink reuses the generators.

- **Tactical:** `ObjectiveRules<K>` in `tactical/model/objective-rules.ts`: `kind`, `complete(o, mission)`, `failed(o, mission)`, `interaction?`, `phaseStep?`, `reachable?`, `marker?`. The table is `OBJECTIVE_RULES` in `tactical/service/objectives/objective-rules.ts`. It replaces `objectiveComplete`/`objectiveFailed` in `defence-service.ts`, `DEFAULT_OBJECTIVE_INTERACTIONS`, and the objective-kind branches in the resolver, the marker service and spawner damage.
- **UI:** `ObjectivePresentation`: `label(o, names)`, `progress?(o, mission)`, `errorText?`. The table is `OBJECTIVE_PRESENTATION` in `ui/service/objectives/objective-presentation.ts`. It replaces the binary tracker, HUD and error-text branches.
- **Deadlines:** an objective may carry `deadlineTurn?: number`. A generic deadline phase step fails it when the turn ends past its deadline, and the kind's `onDeadline?` rule may add consequences (a pod releasing a wave).
- **Optional objectives** (#1179): an objective may carry `optional?: true`. `decidingObjectives` in `objective-status.ts` drops those, and `missionOutcome`, `objectivesComplete`, the leave summary and the tracker's count read only what it keeps. An optional objective still plays and still reports its row in the result. A mission whose objectives are all optional can be extracted from, never won.
- **Results:** the `Objective` union stays closed in `tactical-state.ts`. `MissionResult.objectives?: readonly ObjectiveResult[]`, with `{ kind: string; complete; failed; done?; total? }`, is filled generically by both resolvers. Overworld consequence rules read it. Overworld never imports tactical types.

**Settle** (#1179). A consequence rule cannot touch the economy, yet an evacuation pays ¢100 for each group aboard on top of its reward. A rule may therefore declare `settle(mission, result, ctx) → { creditsAwarded?, infestationDelta? }`. The launch handler lays it over the resolved result **before** anything reads it:

```
  resolver ──► result ──► settle? ──► settled result ──► MissionResolved, credits, lastMissionResult, onResolved
```

So the payment, the event, the debrief and `onResolved` all see one figure. `settle` is pure and draws nothing. Evacuation also zeroes `infestationDelta`: its stakes are the stipend, not the city. A type without `settle` pays what it paid before.

**Timed stipend windows** (#1179). An evacuation's +50% (saved) or −10% (lost, abandoned, ignored or expired) for 10 days is a `StipendModifier` with a `source`. Queuing a window with a `source` replaces any window of that source, so a second saved evacuation refreshes the first. Windows of different sources multiply, and a window with no source (an event's) stacks as before. `source` is optional, so there is no save bump.

**Ordering is part of determinism.** `MISSION_TYPE_IDS`, `MISSION_OFFER_RULES` iteration and every RNG draw keep an append-only order.

### 2.4 The mission director

The `mission-generation` tick step keeps its name and becomes the director. It runs in this order:

1. Run every **pin trigger** (`MissionPinTrigger` in `overworld/model/mission-pin-trigger.ts`). Today there is one: the story's (§2.5). Pins run first, so a story mission claims its city before any other offer. A pin may land on a city that holds an ordinary offer, one that is unpinned and board-drawn (`countsAgainstCap`, handed to the trigger as `MissionPinContext.displaceable`). The director withdraws that offer and emits `MissionWithdrawn` (#1179). A withdrawal is not an expiry: no ignore penalty and no consequence rule. The fill below then refills the freed slot. A pin on a city holding a pinned or triggered offer is a programmer error.
2. Run every `MissionTriggerRule` for event offers, such as Defend Installation.
3. Count the offers that count against the cap: not `pinned`, and of a type with an offer rule. A triggered defence sits outside the cap too (`countsAgainstCap`).
4. While that count is below `ACTS[act].boardCap`:
   1. draw a type with `rng.pickWeighted` from the act's `typeWeights`, restricted to types that have debuted and have an eligible site;
   2. pick the site;
   3. create the offer.
5. Clamp every non-story offer's difficulty into the act's `difficultyBand`. A story offer keeps its fixed difficulty.

**Streams.** Each pin trigger draws on `rng.fork("pin:<id>")`, each trigger rule on `rng.fork("trigger:<type>")`, and the fill on the board stream. A trigger that offers nothing changes nothing.

**Decorators** (`MISSION_OFFER_DECORATORS`) apply to every new offer, pinned or not, each on its own fork.

**Offered** (#1179). Once an offer is on the board and its `MissionOffered` is emitted, the director runs its type's optional `onOffered` and appends its events. Crash Site lands its pod there: +10 on the landing city, which is seen. Later offers in the same tick see the landed map. `onOffered` draws nothing, so no stream moves.

**Hook placement** (#1179). A `MissionMapPlan` may carry `hookPlacement`: per hook kind, `minDistanceFromDeploy` and `maxNearestDistanceFromDeploy` laid over `HOOK_KIND_DEFAULTS` for that one mission. First Skyfall uses it to bring its pod within 14 of deploy. A plan without it produces the same recipe as before.

### 2.5 The story spine

`overworld/service/story-service.ts` owns the spine. It reacts to two things, and the mission director pins from what they record.

**Tech unlocks.**

- `onTechUnlocked(state, node)` is `TechHandlerDeps.onUnlocked`. The composition wires it.
- It records each `{kind:"flag"}` effect with `withFlag` and emits `CampaignFlagSet`. Other effects are for other readers.
- It never pins. The director pins from flags on the next tick, so research and play reach the board through one path.

**Story missions are modules.**

- **Model:** `StoryMissionRule` in `overworld/model/story-mission-rule.ts`.
- **Table:** `STORY_MISSION_RULES: Readonly<Partial<Record<StoryMissionId, StoryMissionRule>>>` in `overworld/service/story/story-mission-rules.ts`. One file per story mission.
- The table is `Partial` because story missions land package by package. An absent entry means "not built yet".
- **Tests:** `fixtureStoryRule(id, overrides)` in `story/story-fixtures.test-helper.ts` builds a rule for tests.

| Field | Meaning |
|---|---|
| `id` | the `StoryMissionId`, equal to its table key |
| `act` | the act it is pinned in; stamped on the offer |
| `pinWhen` | flags that must all be set before it is pinned |
| `create(state, ctx)` | the pinned offer, or `undefined` for "no site today". `buildStoryOffer` builds it on an existing `typeId` at a fixed difficulty, with `pinned`, `storyId` and `act` |
| `onWon` | `StoryEffect[]`, in order: `{kind:"flag", flag}`, `{kind:"advance-act"}` or `{kind:"victory"}` |
| `onLost` | `StoryLossRule`: `{kind:"retry", delayDays}` (arc §4: 5 days) or `{kind:"platform", cityInfestation}` (D7: 30) |

**Pinning.** The story pin trigger pins each built rule when all of these hold:

- the campaign is in the rule's `act`;
- every `pinWhen` flag is set;
- its `storyId` is not on the board;
- it has not been won;
- its loss rule does not hold it back: a retry waits until `storyRetryDay[id]`, and the platform waits after `platform-failed` until `last-hope`.

Each rule draws on its own fork, labelled with its id. A pinned story offer never expires and ignores the cap.

**Its city** (#1179). A story gate is research only (arc D2), so a board full of ordinary offers must not hold a story mission back. A rule picks its city with `pickStoryCity` (`overworld/service/story/story-city.ts`), passing its candidates and its own preference:

```
free candidates            ──► prefer(free)
none free, some claimable  ──► prefer(claimable)   the director withdraws that ordinary offer
none claimable             ──► undefined           asked again tomorrow
```

Another story mission, a hive, or a triggered Defend Installation is never claimable. Live Specimen uses it. First Skyfall does not need it, because its fallback is any free city on the map.

**Results.**

- The launch handler runs the type's `onResolved` first, then `onStoryMissionResolved` when `storyId` is set. A story Crash Site keeps the Crash Site consequences.
- **Won:** the id is added to `storyWon`, then `onWon` applies.
- **Lost or extracted:** `onLost` applies. Only `won` moves the story on.
- **Tracking** uses optional `CampaignProgress` fields, so it needs no migration (§2.9): `storyWon?: StoryMissionId[]` and `storyRetryDay?: Partial<Record<StoryMissionId, number>>`.

**On the map** (#1179). A story offer keeps its type's `typeId`, so the type's `MissionSetupRule` stands up the map first. A story that needs more adds a `StorySetupRule` (`tactical/model/story-setup-rule.ts`) to `STORY_SETUP_RULES` in `tactical/service/story/story-setup-rules.ts`, one file per story mission. The table is `Partial`: a story whose type's setup is the whole of it has no entry.

```
startTacticalMission
  MISSION_SETUP_RULES[mission.typeId].setup(base, map, mission, deps)    the type
  STORY_SETUP_RULES[mission.storyId]?.setup(typed, map, mission, deps)   the story, when it has one
  garrison, sitreps, vision …
```

- The story rule receives the type's result and returns `Result<TacticalState, TacticalError>`. It is pure and draws ids from `deps.ids` in order.
- `MissionStartDeps.storySetupRules?` defaults to the shipped table; tests substitute their own.
- `MissionSetupDeps.species?` carries the bug stat blocks a setup may place (`BugUnitSource[]`). The composition passes the shipped species; tactical never imports bugs data.
- First Skyfall has no entry: the crash site's setup is the whole of it.
- Live Specimen (`live-specimen-setup.ts`) marks the clearance's destroy-spawner objectives `optional` (§2.3), adds `capture-specimen` for the lurker as the one deciding objective, and stands two lurkers by the nests nearest the deploy zone, on ground infantry can walk to from deploy and off the deploy and extraction tiles. If no nest has room, it uses reachable ground at least 8 from every deploy tile, then any reachable ground off the deploy zone. With nothing reachable, it refuses with `map-recipe`. Killing every lurker does not fail the capture: a clearance's edge waves never stop, so the hunt goes on while a net is left.

**In the UI** (#1179). `StoryPresentation` (`ui/model/story-presentation.ts`) and `STORY_PRESENTATION` (`ui/service/story/story-presentation.ts`) sit beside the type table. A story adds briefing rows ahead of its type's, may replace the type's description, and has its debrief tagline asked before the type's. The table is `Partial`. The title stays in `STORY_MISSION_TITLES`. A result carries no story id, so a story's tagline recognises its own result by its payload and by the story's record in `CampaignProgress`.

**The spine rule** (arc §13: "the spine ends the game after the last act that exists").

- `STORY_SPINE` in `overworld/data/story-spine.ts` names the story mission that ends each act.
- An act **exists** when that mission is defined in `STORY_MISSION_RULES` **and every earlier act exists** (`actExists`, #1179). Existence is contiguous because story missions land out of order: Launch Window, which ends Act III, is built before Intact Pod, which ends Act II. So Act III does not exist yet, a Live Specimen win is still the campaign's victory, and no build reaches an act through a gap.
- `advance-act` moves into the next act only if it exists. Otherwise it sets `campaign-won`.

```
built:   live-specimen   (intact-pod)   launch-window   (spore-platform)
exists:  act-1 ✓         act-2 ✗        act-3 ✗         finale ✗      ◄── a gap ends the run
```

| Act | Ended by | Entering it |
|---|---|---|
| `act-1` | `live-specimen` | |
| `act-2` | `intact-pod` | scripts the first hive (`formFirstHive`) |
| `act-3` | `launch-window` (pinned when the Great Hives and Intel III are done) | |
| `finale` | `spore-platform` (its win is `victory`) | |

The arc files Launch Window under the finale. The spine plays it as Act III's last mission, so the finale holds only the platform.

**Act III's story defences** (#1179, arc §4, §6.9). Uplink and Launch Window are built on `defend-installation`, through `buildStoryDefenceOffer` in `story/story-defence-offer.ts`. The facility belongs to the story, so `InstallationDefence.installation` widens to `InstallationSiteId = DeployableTypeId | StoryInstallationId` (`content/model/installation-site-id.ts`), and `deployableId` becomes optional. `INSTALLATION_SITES` gains `tracking-array` and `launch-site`, and every site names the authored `compound` mapgen raises for it. The story sites borrow the sensor array's (2 generators) and the repellent dispersal plant's (4). `storyDefenceCity` chooses the city without a draw, through `pickStoryCity` with every city as a candidate. Its preference is the least infested detected city in a region without a hive, then any detected city, then any city, with ties going to map order. A free city is always taken first. Only when every city holds an offer does it take the preferred ordinary offer's city, which the director withdraws. A pinned or triggered offer, Defend Installation included, is never taken.

| Rule | Act | `pinWhen` | Offer | `onWon` | `onLost` |
|---|---|---|---|---|---|
| `uplink` | `act-3` | none: entering the act is the trigger | d6, tracking array, 5 waves | flag `uplink-won` | retry 5 |
| `launch-window` | `act-3` | `platform-approach`, `great-hives-destroyed` | d8, launch site, 7 waves | `advance-act` | retry 5 (the launch slips) |

- **Uplink's d6** is one step above the Act III floor: the act's first story fight is not easier than Act II's ending. Its 5 waves are what the director's defence sends at the trigger's floor (region mean 40).
- **Launch Window's d8** is the finale band's floor. Its 7 waves are a region at 80, one short of the cap.
- **Intel III, Platform Approach** (`tech.platform-approach`) is an intel node on the support spoke beside Intel I. It costs 280 TP, needs `uplink-won`, and sets `platform-approach`. `great-hives-destroyed` is in the flag vocabulary for the Great Hives package to set. Until that package lands, nothing sets it, so Launch Window never pins.

**D7, the platform** (`{kind:"platform"}`):

- **First loss:** every city gains `cityInfestation` through `addCityInfestation`, capped at 100. The story sets `platform-failed`. The platform is not pinned again until `last-hope` is set.
- **Last Hope:** `tech.last-hope`, a `story` node at 100 TP with `requiresFlags: ["platform-failed"]` and the flag effect `last-hope`, in `tech/data/endgame-intel-nodes.ts`. No family fits a second assault, so it sits with the intel nodes on the support spoke.
- **Second loss:** the story sets `campaign-lost`.

**Other rules set flags through one door.** `setCampaignFlag(state, flag)` sets a flag and emits `CampaignFlagSet`. The Crash Site consequence rule calls it on its first win to set `spore-sample`, which reveals Intel I.

**Outcome.** The outcome step runs last in the day tick and checks in this order:

1. an outcome already stored;
2. `campaign-lost`: defeat, `cause: "story"`;
3. `campaign-won`: victory, `cause: "story"`;
4. threat ≥ 100: defeat, `cause: "threat"`.

- `GameOutcomeKind` gains `"victory"`. `GameOutcome.cause?` is optional.
- `"victory-stub"` stays in the union so old saves still load, but nothing produces it.
- The story's verdict comes before threat, because the mission was played before the day ended.

### 2.6 The bestiary by act

- **Data:** `BESTIARY: Bestiary` in `bugs/data/bestiary.ts`, one `BestiaryEntry` per species (`bugs/model/bestiary.ts`), so a species' shares and debut sit in one row and a new species adds one entry. `Bestiary = Readonly<Partial<Record<BugSpeciesId, BestiaryEntry>>>`. An entry is `{ kind: "rolled", shares: Record<ActId, number>, debut: { act, missionsInAct } }` or `{ kind: "placed" }` for bosses. `SpeciesMix = Readonly<Partial<Record<BugSpeciesId, number>>>` in `bugs/model/species-mix.ts`.
- **Offer time:** `bugMixFor(act, missionsInAct)` in `bugs/service/bestiary-service.ts` keeps the species that have debuted (arc §3: a species that debuted in an earlier act is always in) and renormalises their shares to sum to 1. `withBugMix(mission, progress)` in `overworld/service/missions/bestiary-offer.ts` freezes it on `Mission.bugMix`; the director applies it to every new offer.
- **Tactical:** `startTacticalMission` copies it to `TacticalState.bugMix?`. `spawn-service` rolls species by `bugMix` when it is present, and by `hatchWeight` otherwise.
- **Placed bugs:** bosses and placed bugs (Broodmother, Hive Guard, Sovereign, dormant broods) use a placement path at mission start (`MissionSetupRule`). The weighted roll is not used for them.

### 2.7 Tech conditions and effects

`TechNode` extends ADR 0011 as follows:

- **`kind`:** `"part" | "intel" | "autopsy" | "infantry" | "story"`.
- **`requiresFlags?: readonly string[]`:** the node is hidden until every flag is present.
- **`effects: readonly TechEffect[]`:** replaces `unlocks: PartId[]`. `TechEffect` is `{kind:"part", partId}`, `{kind:"flag", flag}`, `{kind:"squad-type", squadTypeId}` or `{kind:"infantry-upgrade", upgradeId}`.
- **Conditions:** `tech/` still imports nothing above `core`, `economy` and `roster`. The caller passes the campaign's conditions as `TechConditions { flags: ReadonlySet<string> }`.
- **Order of checks:** hidden, then known, then unlocked, then prerequisites, then affordable.

### 2.8 Named enemies and Jev (ADR 0012)

- **Marking:** a named enemy is a bug `Unit` with `persona?: PersonaId`, set by its mission's setup rule.
- **Personas:** `bugs/data/personas.ts` holds each persona's name, entity prompt and commander prompt.
- **Policy lives in the app layer.** `app/controller/jev-default-policy.ts` configures Jev for living persona units when `JevClient.configured`, before their first bug phase. The simulation never enables Jev on its own, so headless sims and auto-resolve never stall.
- **Fallback:** every persona has a deterministic fallback behaviour tag. A failed Jev call falls back to it, as ADR 0012 already does.

### 2.9 Save discipline

- Reshapes need a migration (ADR 0003). New optional fields do not.
- Only **one open branch at a time may bump `GAME_STATE_SCHEMA_VERSION`**. The campaign coordinator assigns the bump.

## 3. Consequences

- **Adding a mission type** becomes new files plus one entry per table. The compiler lists the tables still missing an entry.
- **Existing behaviour is preserved by refactor first.** The existing two types move into modules with no gameplay change, and the existing sims and tests must stay green.
- **More indirection:** a reader follows the table to the module. Each table's file lists its modules in one place.
- **Victory changes:** the "every city at 0" victory is retired. Old saves with a `victory-stub` outcome still load.
- **Adding a story mission** is one file plus one entry in `STORY_MISSION_RULES`. Building the mission that ends an act makes that act exist.
