import { spawnerTraitsOf } from "../../model/spawner-variant";
import type { SitrepRule } from "../../model/sitrep-rule";
import type { HardenedClutchesTuning } from "../../model/sitrep-tuning";
import type { Spawner, TacticalState } from "../../model/tactical-state";

// ===========================================
// Hardened Clutches
// ===========================================

/**
 * Hardened Clutches (campaign arc §11, a hazard): the nests are tougher
 * and more fertile. A setup hook only. Every spawner whose variant
 * hatches (`SPAWNER_VARIANT_TRAITS`, the egg spawner) has its hit points
 * multiplied by `hpScale`, rounded up, and releases `extraHatchlings`
 * more bugs with each hatch.
 *
 * "One extra hatch" is read as **one more bug per hatch**, not an extra
 * hatch event: the hatch clock, its interval ladder and every draw the
 * hatch step makes stay as they are, the bonus rides on the spawner
 * (`Spawner.hatchBonus`), and the hatch step adds it to the tuning's
 * `hatchCount`. A second hatch event would have needed a second timer.
 *
 * ```
 *   egg spawner, standing ──► hp ⌈hp × 1.5⌉ (20 → 30), hatchBonus + 1 (2 → 3 bugs a hatch)
 *   spore pod / destroyed ──► untouched: a pod never hatches, and is its own objective
 * ```
 *
 * No draws, no ids: the spawners the type's setup placed are the ones
 * toughened, so the map, the garrison and every other sitrep are exactly
 * as they would be without it.
 *
 * @param tuning - The hit-point scale and the extra bugs a hatch.
 * @returns The rule for the sitrep table.
 */
export function hardenedClutchesSitrep(
  tuning: HardenedClutchesTuning,
): SitrepRule {
  return {
    id: "hardened-clutches",
    setup: (state) => hardenClutches(state, tuning),
  };
}

/**
 * Toughens every standing spawner that hatches. Exported for tests that
 * check the rule apart from the table. A mission with none (a defence)
 * is returned as it came.
 *
 * @param state - The mission after its type's setup, the garrison and any earlier sitrep.
 * @param tuning - The hit-point scale and the extra bugs a hatch.
 * @returns The mission with its hatching spawners hardened.
 */
export function hardenClutches(
  state: TacticalState,
  tuning: HardenedClutchesTuning,
): TacticalState {
  if (!state.spawners.some(isHardenable)) {
    return state;
  }
  return {
    ...state,
    spawners: state.spawners.map((spawner) =>
      isHardenable(spawner)
        ? {
            ...spawner,
            hp: Math.ceil(spawner.hp * tuning.hpScale),
            hatchBonus: (spawner.hatchBonus ?? 0) + tuning.extraHatchlings,
          }
        : spawner,
    ),
  };
}

// ===========================================
// Helpers
// ===========================================

/** Whether the sitrep toughens this spawner: a standing one whose variant hatches. */
function isHardenable(spawner: Spawner): boolean {
  return !spawner.destroyed && spawnerTraitsOf(spawner).hatches;
}
