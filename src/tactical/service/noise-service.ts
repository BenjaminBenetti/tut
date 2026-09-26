import { ATTACK_RESOLVED } from "../model/attack-resolved-event";
import { BLAST_RESOLVED } from "../model/blast-resolved-event";
import type { Noise, NoiseTuning } from "../model/noise";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";

// ===========================================
// Noise
// ===========================================

/**
 * The noise one event made, if it was loud (#1179): an explosion is
 * heard from where it went off, a heavy gun from where it was fired.
 *
 * ```
 *   BlastResolved, went off (hit), not smoke        ──► heard at impact
 *   AttackResolved by a mech                        ──► heard at the shooter
 *   AttackResolved with a gun of armorPen ≥ heavy   ──► heard at the shooter
 *   anything else                                   ──► silent
 * ```
 *
 * The gun is the shooter's weapon whose range the event records
 * (`weaponRange`), since a mech carries two; a squad or a bug carries
 * one. A rocket's blast is loud as a blast; its shot need not be.
 * Pure: reads the mission to find the shooter and its template.
 *
 * @param event - Any tactical event.
 * @param mission - The mission the event happened in (the shooter's position and weapons).
 * @param tuning - What makes a gun heavy.
 * @returns The noise, or undefined for a quiet event.
 */
export function noiseOf(
  event: TacticalEvent,
  mission: TacticalState,
  tuning: NoiseTuning,
): Noise | undefined {
  if (event.type === BLAST_RESOLVED) {
    const blast = event.payload;
    return blast.hit && blast.smoke !== true
      ? { at: blast.impact, by: blast.attackerId }
      : undefined;
  }
  if (event.type !== ATTACK_RESOLVED) {
    return undefined;
  }
  const shot = event.payload;
  const shooter = mission.units.find((unit) => unit.id === shot.attackerId);
  if (shooter === undefined) {
    return undefined;
  }
  if (shooter.kind === "mech") {
    return { at: shooter.pos, by: shooter.id };
  }
  const heavy = (mission.templates[shooter.templateId]?.weapons ?? []).some(
    (weapon) =>
      weapon.profile.range === shot.weaponRange &&
      weapon.profile.armorPen >= tuning.heavyArmorPen,
  );
  return heavy ? { at: shooter.pos, by: shooter.id } : undefined;
}
