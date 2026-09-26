import type { MissionTypeCatalogue } from "../../overworld/model/mission-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { displayWeaponName } from "../../tactical/model/unit-weapon";
import type { EquipmentCatalogue } from "../../tactical/model/equipment";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import { equipmentOf } from "../../tactical/service/equipment-service";
import {
  stagePending,
  stageSurvivors,
} from "../../tactical/service/mission-stage-service";
import type { MissionPresentationCatalogue } from "../model/mission-presentation";
import { chargeRegisterFor } from "./charge-register";
import { formatWhole } from "./format";
import { MISSION_PRESENTATION } from "./missions/mission-presentation";
import { stageNamesOf } from "./stage-track";
import { namesFor } from "./tactical-error-text";

// ===========================================
// Types
// ===========================================

/** One unit going on to the next stage, as the transition lists it. */
export interface StageSurvivorRow {
  readonly unitId: string;
  /** The roster name: "Alpha", "Hammerhead". */
  readonly name: string;
  /** "7 / 10". */
  readonly hp: string;
  /** True below full health: the row says it goes on hurt. */
  readonly wounded: boolean;
  /**
   * What it has left to spend, one line per weapon with a pool and per
   * item carried: "Autocannon · heat 2 / 4", "ammo 1 / 3",
   * "Breaching charge · uses 1 / 2".
   */
  readonly stores: readonly string[];
}

/** The screen between two stages of a linked mission. */
export interface StageTransition {
  /** "Hull cleared. The squad boards the core." */
  readonly headline: string;
  /** "Next: The core, stage 2 of 2". */
  readonly next: string;
  /** What does not happen between the stages. */
  readonly note: string;
  /** Who goes on, in the order they go. */
  readonly survivors: readonly StageSurvivorRow[];
}

/** Where the transition reads the mission's type and its words. */
export interface StageTransitionDeps {
  /** The types, for the stages' names; absent, the stages are numbered. */
  readonly missionTypes?: MissionTypeCatalogue;
  /** The types' words; the shipped table by default. */
  readonly presentations?: MissionPresentationCatalogue;
  /** What the survivors may carry; the shipped catalogue by default. */
  readonly equipment?: EquipmentCatalogue;
}

// ===========================================
// Constants
// ===========================================

/** The one thing every linked mission's transition says: nothing mends. */
export const STAGE_TRANSITION_NOTE =
  "No repairs, no re-arm, no swaps: the squad goes on as it stands.";

// ===========================================
// Query
// ===========================================

/**
 * The transition between a linked mission's stages (ADR 0013
 * amendment, #1179), or undefined when `mission` has no stage waiting:
 * a one-map mission, a stage still being fought, a lost stage or the
 * last one.
 *
 * ```
 *   Hull cleared. The squad boards the core.        ◄─ presentation.stageTransition
 *   Next: The core, stage 2 of 2                    ◄─ stageNamesOf
 *   No repairs, no re-arm, no swaps: …
 *   Hammerhead   7 / 10   Autocannon · heat 2 / 4
 *   Alpha        6 / 6    ammo 1 / 3 · Breaching charge · uses 0 / 2
 * ```
 *
 * The survivors are the ones the rules carry on (`stageSurvivors`), as
 * they left the map: what they show here is what they start the next
 * stage with. The type is the offer's, which stays on the board until
 * the mission is finished.
 *
 * @param mission - The active mission.
 * @param campaign - The campaign it belongs to, for names and the offer.
 * @param deps - The types and their words.
 */
export function stageTransitionOf(
  mission: TacticalState,
  campaign: GameState | undefined,
  deps: StageTransitionDeps = {},
): StageTransition | undefined {
  const stage = mission.stage;
  if (stage === undefined || !stagePending(mission)) {
    return undefined;
  }
  const typeId = campaign?.overworld.missions.find(
    (offer) => offer.id === mission.missionId,
  )?.typeId;
  const presentation =
    typeId === undefined
      ? undefined
      : (deps.presentations ?? MISSION_PRESENTATION)[typeId];
  const stages = stageNamesOf(mission, campaign, deps.missionTypes);
  const nextIndex = stage.index + 1;
  const names = namesFor(mission, campaign);
  const equipment = deps.equipment ?? SHIPPED_EQUIPMENT;
  return {
    headline:
      presentation?.stageTransition?.(stage.index) ??
      `${stages[stage.index] ?? "The stage"} cleared.`,
    next: `Next: ${stages[nextIndex] ?? "the next stage"}, stage ${formatWhole(nextIndex + 1)} of ${formatWhole(stage.count)}`,
    note: STAGE_TRANSITION_NOTE,
    survivors: stageSurvivors(mission).map((unit) =>
      survivorRow(
        unit,
        names.unit(unit.id),
        mission.templates[unit.templateId],
        equipment,
      ),
    ),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * One survivor's row: its health and every pool it spends from, in the
 * unit card's words (`chargeRegisterFor`), so the two never disagree.
 */
function survivorRow(
  unit: Unit,
  name: string,
  template: UnitTemplate | undefined,
  equipment: EquipmentCatalogue,
): StageSurvivorRow {
  const gauge = chargeRegisterFor(unit.kind).gauge;
  const weapons = template?.weapons ?? [];
  const pools = weapons.flatMap((weapon) => {
    const capacity = weapon.charges;
    if (capacity === undefined) return [];
    const left = unit.charges?.[weapon.id] ?? capacity;
    const label = displayWeaponName(weapons, weapon);
    const pool = `${gauge} ${formatWhole(left)} / ${formatWhole(capacity)}`;
    return [label === undefined ? pool : `${label} · ${pool}`];
  });
  const items = equipmentOf(template, unit, equipment).map(
    (carried) =>
      `${carried.definition.name} · uses ${formatWhole(carried.usesLeft)} / ${formatWhole(carried.definition.uses)}`,
  );
  return {
    unitId: unit.id,
    name,
    hp: `${formatWhole(unit.hp)} / ${formatWhole(unit.maxHp)}`,
    wounded: unit.hp < unit.maxHp,
    stores: [...pools, ...items],
  };
}
