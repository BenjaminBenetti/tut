import type { UnitKind } from "../model/unit";
import type { Construction, UnitTemplate } from "../model/unit-template";

// ===========================================
// Construction
// ===========================================

/**
 * What a unit is made of (#1138): the template's own word when it has
 * one, otherwise the rule of its kind — mechs are mechanical, squads
 * and bugs organic. Healing kit asks this before it mends anything,
 * so a medkit passes over a mech and a repair kit over a squad.
 *
 * ```
 *   template.construction set ──► that
 *   kind "mech"               ──► "mechanical"
 *   kind "squad" | "bug"      ──► "organic"
 * ```
 *
 * @param template - The unit's template.
 * @param kind - The unit's kind, which the template does not carry.
 * @returns The construction the rules treat the unit as.
 */
export function constructionOf(
  template: Pick<UnitTemplate, "construction">,
  kind: UnitKind,
): Construction {
  if (template.construction !== undefined) {
    return template.construction;
  }
  return kind === "mech" ? "mechanical" : "organic";
}
