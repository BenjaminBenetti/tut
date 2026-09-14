import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { HealProfile } from "../model/equipment";
import type { EquipmentId } from "../model/equipment";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalApplied } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { UNITS_HEALED } from "../model/unit-healed-event";
import type { BlastTile } from "./blast-service";
import { blastFootprint } from "./blast-service";
import { constructionOf } from "./construction-service";
import { footprintContains, footprintSizeOf } from "./footprint-service";

// ===========================================
// Types
// ===========================================

/** One unit a heal reaches and what it would get. */
export interface HealBeneficiary {
  readonly unit: Unit;
  /** Tiles from the impact, as the footprint measures it. */
  readonly distance: number;
  /** Hit points it gets back, `> 0`: the kit's amount or what it is missing, whichever is less. */
  readonly amount: number;
  /** Its hit points afterwards. */
  readonly hpAfter: number;
}

/** Who a heal at a tile reaches (#1138). */
export interface HealReach {
  /** The tiles the heal reaches, impact first. */
  readonly footprint: readonly BlastTile[];
  /** Everyone it would mend, in footprint order. */
  readonly beneficiaries: readonly HealBeneficiary[];
  /** Units of the right side and make in the area with nothing to mend. */
  readonly alreadyWhole: number;
}

/** What applying a heal returns: the mission with hit points restored, and who got what. */
export interface HealResolved extends TacticalApplied<TacticalState> {
  readonly beneficiaries: readonly HealBeneficiary[];
}

// ===========================================
// Reach
// ===========================================

/**
 * Who a kit used by `user` at `impact` would mend (#1138), and who in
 * the area it passes over.
 *
 * ```
 *   footprint: blastFootprint(impact, radius)   — the grenade's shape (#1121, #1130):
 *              three dimensions, a line from the impact, so a solid wall
 *              or a floor slab stops a heal as it stops a blast
 *   for each living unit standing in it, once, nearest tile first:
 *     other side                    ──► passed over (a heal is not friendly fire's mirror:
 *                                        it never reaches the bugs)
 *     construction ≠ profile.target ──► passed over (a medkit does nothing for a mech)
 *     hp = maxHp                    ──► counted as already whole
 *     otherwise                     ──► mended by min(amount, maxHp − hp)
 * ```
 *
 * The user is a unit of its own side like any other: a medic standing
 * in its own throw is patched too. The order is the footprint's, so
 * the event lists the impact tile first and the log reads the same for
 * one seed.
 *
 * @param mission - The mission the heal happens in.
 * @param user - The unit using the kit; fixes the side that is mended.
 * @param profile - What the kit does.
 * @param impact - The tile it lands on.
 * @param index - An index over the map, built here when the caller has none.
 * @returns The footprint and everyone in it the kit would mend.
 */
export function healReach(
  mission: TacticalState,
  user: Unit,
  profile: HealProfile,
  impact: TileCoord,
  index: TileIndex = new TileIndex(mission.map),
): HealReach {
  const footprint = blastFootprint(mission.map, impact, profile.radius, index);
  const beneficiaries: HealBeneficiary[] = [];
  const seen = new Set<UnitId>();
  let alreadyWhole = 0;
  for (const { tile, distance } of footprint) {
    for (const unit of mission.units) {
      if (unit.hp <= 0 || unit.team !== user.team || seen.has(unit.id)) {
        continue;
      }
      const template = mission.templates[unit.templateId];
      if (template === undefined) {
        throw new Error(
          `Unit "${unit.id}" references a template missing from the mission`,
        );
      }
      if (!footprintContains(unit.pos, footprintSizeOf(template), tile)) {
        continue;
      }
      seen.add(unit.id);
      if (constructionOf(template, unit.kind) !== profile.target) {
        continue;
      }
      const amount = Math.min(profile.amount, unit.maxHp - unit.hp);
      if (amount <= 0) {
        alreadyWhole += 1;
        continue;
      }
      beneficiaries.push({
        unit,
        distance,
        amount,
        hpAfter: unit.hp + amount,
      });
    }
  }
  return { footprint, beneficiaries, alreadyWhole };
}

// ===========================================
// Resolution
// ===========================================

/**
 * Applies a kit used by `userId` at `impact` (#1138): every unit
 * `healReach` names gets its hit points back, and one `UnitsHealed`
 * says who got what. Rolls nothing — a heal cannot miss and has no
 * band — so it takes no context. With nobody to mend the state comes
 * back untouched and no event is raised; the rules refuse that use
 * before it gets here (`nothing-to-heal`), so this is the guard, not
 * the rule.
 *
 * @param mission - The mission, already billed for the use.
 * @param userId - The unit using the kit; must be on the map.
 * @param kitId - Which kit, for the event.
 * @param profile - What the kit does.
 * @param impact - The tile it lands on.
 * @returns The mission with hit points restored, the event, and who was mended.
 */
export function resolveHealAt(
  mission: TacticalState,
  userId: UnitId,
  kitId: EquipmentId,
  profile: HealProfile,
  impact: TileCoord,
): HealResolved {
  const user = mission.units.find((u) => u.id === userId);
  if (user === undefined) {
    return { state: mission, events: [], beneficiaries: [] };
  }
  const { beneficiaries } = healReach(mission, user, profile, impact);
  if (beneficiaries.length === 0) {
    return { state: mission, events: [], beneficiaries };
  }
  const after = new Map(beneficiaries.map((b) => [b.unit.id, b.hpAfter]));
  const state: TacticalState = {
    ...mission,
    units: mission.units.map((unit): Unit => {
      const hp = after.get(unit.id);
      return hp === undefined ? unit : { ...unit, hp };
    }),
  };
  const healed: TacticalEvent = {
    type: UNITS_HEALED,
    payload: {
      kitId,
      userId,
      healed: beneficiaries.map((b) => ({
        unitId: b.unit.id,
        amount: b.amount,
        hpAfter: b.hpAfter,
      })),
    },
  };
  return { state, events: [healed], beneficiaries };
}
