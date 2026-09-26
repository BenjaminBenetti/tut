import type { PersonaId } from "../../../content/model/persona-id";
import { ALPHA_CROWNED } from "../../model/alpha-crowned-event";
import type { SitrepRule } from "../../model/sitrep-rule";
import type { AlphaPresentTuning } from "../../model/sitrep-tuning";
import type { TacticalApplied } from "../../model/tactical-event";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { isDormant } from "../../model/unit";
import type { UnitTemplate } from "../../model/unit-template";

// ===========================================
// Constants
// ===========================================

/** The persona a crowned alpha carries (campaign arc §9). */
const ALPHA_PERSONA: PersonaId = "alpha";

/** Appended to the crowned bug's template id for its own, tougher stat block. */
export const ALPHA_TEMPLATE_SUFFIX = ":alpha";

// ===========================================
// Alpha Present
// ===========================================

/**
 * Alpha Present (campaign arc §8, §11, a hazard): one bug on the map is
 * the named alpha the offer's briefing promised. A phase step only: the
 * first phase opening at which a bug stands on the map crowns one, after
 * every other step, so a wave or a hatch that has just landed is
 * already in the running.
 *
 * ```
 *   every phase start, while TacticalState.alpha has no unitId:
 *     crownAlpha ──► the bug, AlphaCrowned
 *   no alpha on the mission, or one already crowned ──► nothing
 * ```
 *
 * @param tuning - The alpha's hit-point and damage bonuses.
 * @returns The rule for the sitrep table.
 */
export function alphaPresentSitrep(tuning: AlphaPresentTuning): SitrepRule {
  return {
    id: "alpha-present",
    phaseStep: (mission) => crownAlpha(mission, tuning),
  };
}

/**
 * Crowns the named alpha (campaign arc §8, §11). Which bug:
 *
 * ```
 *   candidates  living bugs on the map, awake, with no persona of their own
 *               (the Broodmother and the Sovereign stay who they are)
 *   preferred   those of the species a nemesis was last time, if any stand
 *   pick        the largest species: footprint, then its template's max hp;
 *               ties to the first in the mission's unit order, which is
 *               the order their ids were issued
 * ```
 *
 * The bug keeps its species and its behaviour's instincts, and becomes:
 *
 * ```
 *   persona  "alpha" (its fallback plays the species with focus fire)
 *   name     TacticalState.alpha.name
 *   maxHp    round(template maxHp × (1 + hpBonus + hpPerLevel × level)),
 *            and its hit points rise by as much
 *   weapons  damage + damageBonus each, on a template of its own
 *            (`<template id>:alpha`), so combat, the preview and the card
 *            read the bonus without a rule of their own
 * ```
 *
 * The crowned unit's id is written to `TacticalState.alpha.unitId`, so
 * it happens once. Nothing is drawn. No bug on the map, or no alpha on
 * the mission, leaves the mission as it was.
 *
 * @param mission - The mission at a phase opening.
 * @param tuning - The alpha's hit-point and damage bonuses.
 * @returns The mission with its alpha crowned, and `AlphaCrowned`.
 */
export function crownAlpha(
  mission: TacticalState,
  tuning: AlphaPresentTuning,
): TacticalApplied<TacticalState> {
  const alpha = mission.alpha;
  if (alpha === undefined || alpha.unitId !== undefined) {
    return { state: mission, events: [] };
  }
  const chosen = alphaCandidate(mission, alpha.speciesId);
  const template =
    chosen === undefined ? undefined : mission.templates[chosen.templateId];
  if (chosen === undefined || template === undefined) {
    return { state: mission, events: [] };
  }
  const scale = 1 + tuning.hpBonus + tuning.hpPerLevel * alpha.level;
  const maxHp = Math.round(template.maxHp * scale);
  const crownedTemplate: UnitTemplate = {
    ...template,
    id: `${template.id}${ALPHA_TEMPLATE_SUFFIX}`,
    maxHp,
    weapons: template.weapons.map((weapon) => ({
      ...weapon,
      profile: {
        ...weapon.profile,
        damage: weapon.profile.damage + tuning.damageBonus,
      },
    })),
  };
  const crowned: Unit = {
    ...chosen,
    templateId: crownedTemplate.id,
    persona: ALPHA_PERSONA,
    name: alpha.name,
    maxHp,
    hp: chosen.hp + (maxHp - chosen.maxHp),
  };
  return {
    state: {
      ...mission,
      alpha: { ...alpha, unitId: chosen.id },
      units: mission.units.map((unit) =>
        unit.id === chosen.id ? crowned : unit,
      ),
      templates: {
        ...mission.templates,
        [crownedTemplate.id]: crownedTemplate,
      },
    },
    events: [
      {
        type: ALPHA_CROWNED,
        payload: { unitId: chosen.id, name: alpha.name, level: alpha.level },
      },
    ],
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The bug the crown goes to: the largest awake, persona-less living bug,
 * of `species` when one of those stands, first in unit order on a tie.
 */
function alphaCandidate(
  mission: TacticalState,
  species: string | undefined,
): Unit | undefined {
  const candidates = mission.units.filter(
    (unit) =>
      unit.team === "bugs" &&
      unit.kind === "bug" &&
      unit.hp > 0 &&
      unit.persona === undefined &&
      !isDormant(unit),
  );
  const preferred = candidates.filter((unit) => unit.sourceId === species);
  const pool = preferred.length > 0 ? preferred : candidates;
  let best: Unit | undefined;
  for (const unit of pool) {
    if (best === undefined || larger(mission, unit, best)) {
      best = unit;
    }
  }
  return best;
}

/** Whether `a`'s species is strictly larger than `b`'s: footprint, then template max hp. */
function larger(mission: TacticalState, a: Unit, b: Unit): boolean {
  const sizeOf = (unit: Unit): readonly [number, number] => {
    const template = mission.templates[unit.templateId];
    return [template?.footprint ?? 1, template?.maxHp ?? unit.maxHp];
  };
  const [footA, hpA] = sizeOf(a);
  const [footB, hpB] = sizeOf(b);
  return footA > footB || (footA === footB && hpA > hpB);
}
