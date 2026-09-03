import type { IdGenerator } from "../../core/model/id-generator";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { Mech } from "../../roster/model/mech";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { BUG_SPECIES } from "../../bugs/data/species";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { END_TURN } from "../../tactical/model/end-turn-command";
import { MOVE } from "../../tactical/model/move-command";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import { createAttackHandler } from "../../tactical/service/combat-service";
import type { MissionStartDeps } from "../../tactical/service/mission-start-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import { overwatchHandler } from "../../tactical/service/overwatch-handler";
import type { SpawnDeps } from "../../tactical/service/spawn-service";
import {
  createEdgeWaveStep,
  createHatchStep,
} from "../../tactical/service/spawn-service";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import { registerTacticalCommands } from "../../tactical/service/tactical-command-handlers";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  DEFAULT_PHASE_STEPS,
} from "../../tactical/service/turn-service";
import type { GameContent } from "./game-composition";

// ===========================================
// Types
// ===========================================

/** The content the tactical side reads: a subset of `GameContent`. */
export type TacticalContent = Pick<
  GameContent,
  "squadTypes" | "parts" | "rating" | "upgrades" | "missionTypes"
>;

/** What the tactical side of the app exposes to screens and dev hooks. */
export interface TacticalComposition {
  /** The pure rule handlers registered on the campaign dispatcher, by command tag. */
  readonly handlers: TacticalHandlers;
  /** Deps for `startTacticalMission` over the given id generator. */
  readonly missionStartDepsFor: (ids: IdGenerator) => MissionStartDeps;
}

// ===========================================
// Composition
// ===========================================

/**
 * Wires the tactical domain into the campaign (#342, per the #324
 * ruling): tactical commands join the campaign dispatcher, lifted over
 * `activeMission`, so there is one store, one autosave and one event
 * stream. `handlers` defaults to `shippedTacticalHandlers`, the rules
 * that have landed; a command without a handler dispatches as
 * `unknown-command` until its issue merges. `missionStartDepsFor` gives `LaunchMission` (#341) and the dev
 * hook what `startTacticalMission` needs from the shipped content.
 *
 * ```
 *   composeGame ──► composeTactical(content, handlers)
 *                     ├── registerTacticalCommands(dispatcher, handlers)
 *                     └── missionStartDepsFor(ids) ──► startTacticalMission(...)
 * ```
 */
export function composeTactical(
  dispatcher: CommandDispatcher<GameState>,
  content: TacticalContent,
  handlers: TacticalHandlers = shippedTacticalHandlers(),
): TacticalComposition {
  registerTacticalCommands(dispatcher, handlers);
  const registries = createDefaultRegistries();
  const sheetFor = createSheetLookup(
    content.parts,
    content.rating,
    content.upgrades,
  );
  return {
    handlers,
    missionStartDepsFor: (ids) => ({
      missionTypes: content.missionTypes,
      squadTypes: content.squadTypes,
      sheetFor,
      unitTuning: UNIT_TUNING,
      spawnTuning: SPAWN_TUNING,
      ids,
      registries,
    }),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The rule handlers that have landed, one line per rules issue: this is
 * the single registration site for tactical commands (#342). Tests pass
 * their own object to isolate the lifting path.
 */
export function shippedTacticalHandlers(): TacticalHandlers {
  const spawn: SpawnDeps = {
    species: Object.values(BUG_SPECIES),
    tuning: SPAWN_TUNING,
  };
  return {
    [ATTACK]: createAttackHandler(COMBAT_TUNING),
    [MOVE]: createMoveHandler(createOverwatchReaction(COMBAT_TUNING)),
    [END_TURN]: createEndTurnHandler([
      ...DEFAULT_PHASE_STEPS,
      createHatchStep(spawn),
      createEdgeWaveStep(spawn),
    ]),
    [OVERWATCH]: overwatchHandler,
  };
}

/** A mech's current stat sheet from its loadout, or undefined when it no longer validates. */
export function createSheetLookup(
  parts: PartCatalogue,
  rating: MechRatingTuning,
  upgrades: UpgradeTuning,
): (mech: Mech) => MechStatSheet | undefined {
  return (mech) => {
    const sheet = validateLoadout(mech.loadout, parts, rating, upgrades);
    return sheet.ok ? sheet.value : undefined;
  };
}
