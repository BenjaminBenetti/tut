# ADR 0013 — Campaign progression and mission-type modules

- Status: Accepted (2026-09-26)
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

- `pinned?: boolean`: a story, hive, defend or wreck offer. It ignores the board cap and never expires unless its rule says so.
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
| overworld | `MissionConsequenceRule`: `onResolved(state, mission, result, ctx) → OverworldApplied`, `onExpired(state, mission, ctx) → OverworldApplied` | `MISSION_CONSEQUENCE_RULES` in `overworld/service/missions/mission-consequence-rules.ts` | `infestationDeltaFor` for every type; `ignorePenalty` handling |
| mapgen | `MissionMapRule`: `recipe(mission, type) → { archetype, extraHooks, site?, landmark? }` | `MISSION_MAP_RULES` in `mapgen/service/missions/mission-map-rules.ts` | the hard-coded `archetype: "settlement"`, `generatorHooks`, `site: mission.defence…` |
| tactical | `MissionSetupRule`: `setup(state, map, mission, deps) → TacticalState` adds the type's objectives, entities and schedules | `MISSION_SETUP_RULES` in `tactical/service/missions/mission-setup-rules.ts` | the spawner, generator and `totalWaves` conditionals in `mission-start-service.ts` |
| ui | `MissionPresentation`: `icon`, `briefingRows(mission)`, `debriefTagline?(result)` | `MISSION_PRESENTATION` in `ui/service/missions/mission-presentation.ts` | `TYPE_ICONS`, `DEFENCE_FIELDS`, `defenceTagline` |

**Objective kinds get the same treatment in tactical and ui.** Many mission types share an objective kind: pods and hive cores are both "destroy the thing", and Uplink reuses the generators.

- **Tactical:** `ObjectiveRules<K>` in `tactical/model/objective-rules.ts`: `kind`, `complete(o, mission)`, `failed(o, mission)`, `interaction?`, `phaseStep?`, `reachable?`, `marker?`. The table is `OBJECTIVE_RULES` in `tactical/service/objectives/objective-rules.ts`. It replaces `objectiveComplete`/`objectiveFailed` in `defence-service.ts`, `DEFAULT_OBJECTIVE_INTERACTIONS`, and the objective-kind branches in the resolver, the marker service and spawner damage.
- **UI:** `ObjectivePresentation`: `label(o, names)`, `progress?(o, mission)`, `errorText?`. The table is `OBJECTIVE_PRESENTATION` in `ui/service/objectives/objective-presentation.ts`. It replaces the binary tracker, HUD and error-text branches.
- **Deadlines:** an objective may carry `deadlineTurn?: number`. A generic deadline phase step fails it when the turn ends past its deadline, and the kind's `onDeadline?` rule may add consequences (a pod releasing a wave).
- **Results:** the `Objective` union stays closed in `tactical-state.ts`. `MissionResult.objectives?: readonly ObjectiveResult[]`, with `{ kind: string; complete; failed; done?; total? }`, is filled generically by both resolvers. Overworld consequence rules read it. Overworld never imports tactical types.

**Ordering is part of determinism.** `MISSION_TYPE_IDS`, `MISSION_OFFER_RULES` iteration and every RNG draw keep an append-only order.

### 2.4 The mission director

The `mission-generation` tick step keeps its name and becomes the director. It runs in this order:

1. Run every `MissionTriggerRule` for pinned and event offers.
2. Count the unpinned offers.
3. While that count is below `ACTS[act].boardCap`:
   1. draw a type with `rng.pickWeighted` from the act's `typeWeights`, restricted to types that have debuted and have an eligible site;
   2. pick the site;
   3. create the offer.
4. Clamp every non-story offer's difficulty into the act's `difficultyBand`.

### 2.5 The story spine

`overworld/service/story-service.ts` reacts to two things:

- **Tech unlocks.** `onTechUnlocked(state, nodeId)` is called from `tech-command-handlers.ts` after a successful `unlockTech`. It can set flags and pin story missions.
- **Story mission results.** These go through the consequence rules of the story mission types. They can advance the act, set flags, win the campaign, or apply D7.

**Outcome:**

- `GameOutcomeKind` gains `"victory"`.
- `"victory-stub"` stays in the union so old saves still load, but no rule produces it any more.
- Defeat is threat ≥ 100, or a second Spore Platform loss.

### 2.6 The bestiary by act

- **Data:** `BESTIARY: Readonly<Record<ActId, SpeciesMix>>` in `bugs/data/bestiary.ts`, with debut rules. `SpeciesMix = Readonly<Partial<Record<BugSpeciesId, number>>>`.
- **Offer time:** `bugMixFor(act, missionsPlayed)` computes the mix and the director freezes it on `Mission.bugMix`.
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
