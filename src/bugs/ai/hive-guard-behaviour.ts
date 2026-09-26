import { attack } from "../../tactical/model/attack-command";
import type { MissionView } from "../../tactical/model/mission-view";
import type { TacticalCommand } from "../../tactical/model/tactical-command";
import type { UnitId } from "../../tactical/model/unit";
import { HIVE_GUARD_TUNING } from "../data/hive-guard-tuning";
import type { HiveGuardTuning } from "../model/hive-guard-tuning";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import type { AttackOption } from "./utility";
import { attackOptions, bestBy } from "./utility";

// ===========================================
// Behaviour
// ===========================================

/**
 * The Hive Guard (#1179, campaign arc §7.5 and §8): a stationary spine
 * thrower that never leaves its chamber. It is rooted — its species has
 * no move at all — so it never plans a step, never hunts and never
 * closes; each bug phase it throws one volley at the best enemy it can
 * hit from where it stands, or holds.
 *
 * ```
 *   enemies it perceives
 *     └─ attackOptions: reach, line of sight, action points (the rules' own checks)
 *          ├─ none   ──► []                         hold
 *          └─ some   ──► argmax( value·w + kill?·w ) ──► [attack(target)]
 * ```
 *
 * "Best" is the ordinary pricing every bug uses (`attackOptions`,
 * `targetValue`): the expected share of the target's remaining hit
 * points one volley takes, plus a bonus when a top-of-range hit would
 * kill. Exact ties break on `ctx.rng`, as `bestBy` always does. The
 * volley is the species' one weapon, held to reach, line of sight,
 * cover and hit chance like any rifle, and a bug's attack ends its turn,
 * so it is one volley a turn.
 */
export class HiveGuardBehaviour implements BugBehaviour {
  // ===========================================
  // Fields
  // ===========================================

  readonly tag = "guard" as const;
  private readonly tuning: HiveGuardTuning;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param tuning - Target weights; the shipped set by default. */
  constructor(tuning: HiveGuardTuning = HIVE_GUARD_TUNING) {
    this.tuning = tuning;
  }

  // ===========================================
  // BugBehaviour
  // ===========================================

  /** One volley at the best target in reach and sight, or nothing: never a move. */
  choose(
    // The mission as the bugs perceive it (ADR 0006 §2.3): an enemy the
    // swarm has not spotted is not in `mission.units`, so it is never a
    // target however close it stands.
    mission: MissionView,
    unitId: UnitId,
    ctx: BehaviourContext,
  ): readonly TacticalCommand[] {
    const unit = mission.units.find((u) => u.id === unitId);
    if (unit === undefined || unit.hp <= 0) {
      return [];
    }
    const best = bestBy(
      attackOptions(mission, unitId, ctx.combat),
      (option) => this.score(option),
      ctx.rng,
    );
    return best === undefined ? [] : [attack(unitId, best.target.id)];
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** What one validated option is worth to the guard (`HiveGuardTuning`). */
  private score(option: AttackOption): number {
    const t = this.tuning;
    return option.value * t.valueWeight + (option.canKill ? t.killWeight : 0);
  }
}
