import { isRecord } from "../../core/model/record-guard";
import type { JevCandidate } from "../model/jev-control";

// ===========================================
// Gameplay rules for each ability
// ===========================================

const ACTION_RULES: Readonly<Record<string, string>> = {
  attack:
    "Attack one offered visible enemy or nest with this weapon. Compare hit_chance_percent (0-100), damage_range in HP, target health/armor, cover and elevation. A range-1 weapon is melee; ranged attacks may miss. A blast can damage allies as well as enemies. Check the weapon's ammo, heat and cooldown; ends_activation means firing spends all remaining AP.",
  "attack-ground":
    "Fire this weapon at an offered tile to damage an area or destroy terrain. This is a weapon attack, not movement. Consider blast victims, damage, lingering effects and friendly fire; a tile can contain allies. ends_activation means firing spends all remaining AP.",
  overwatch:
    "Spend all remaining AP to watch for enemy movement until the next faction turn. The first weapon fires reaction shots when an enemy moves into legal range and line of sight, subject to ammo, heat and cooldown. This ends the actor's actions now; it does not attack immediately or guarantee a reaction shot.",
  reload:
    "Spend the listed AP to restore all weapon charge pools to capacity, or vent a fitted mech's heat to zero. This does not replenish limited equipment uses. Reloading leaves any unspent AP available for another action.",
  brace:
    "Brace this mech to improve firing stability and enable weapons that require bracing. Moving or jumping removes the brace. This does not fire a weapon; consider the AP left for a subsequent attack.",
  coolant:
    "Consume one limited coolant use to clear the mech's heat to zero. This costs zero AP but still consumes the item. It does not attack; another decision follows while AP remains.",
  designate:
    "Mark an offered visible enemy to help allied guided weapons attack that target. This spends AP without dealing damage; weigh the benefit to later shots against attacking now.",
  jump: "Use jump jets to land at an offered tile for the listed AP cost and added heat. This is movement, not an attack; it can cross gaps or elevation that walking cannot. The listed landings already satisfy jump range, height, occupancy and heat limits. Jumping removes bracing and can trigger enemy reaction fire at the landing.",
  extract:
    "Leave the mission from the extraction zone. This removes the actor from the battlefield, so it cannot help with remaining objectives. Choose this when its orders call for withdrawal or extraction.",
  interact:
    "Plant demolition charges at the offered nearby nest objective, dealing objective damage immediately for the listed AP cost. This is not a move. The nest may require more damage to be destroyed; reaching its map marker alone does not complete the objective.",
  "harvest-carcass":
    "Harvest an offered nearby bug carcass for campaign tech points. This spends AP without attacking, healing or completing a nest objective; weigh the research gain against the actor's current orders and safety.",
};

const EQUIPMENT_RULES: Readonly<Record<string, string>> = {
  blast:
    "Throw or use this explosive at an offered tile. It makes an immediate attack that can miss; its blast can harm allies and enemies and damage terrain. Compare the item's damage, radius and lingering effect with units and hazards at the target.",
  charge:
    "Place a delayed explosive at an offered tile. It detonates after the item's delayTurns (two turns if absent), not immediately. The later blast can hurt any faction, including this actor; account for friendly positions and escape routes.",
  heal: "Heal eligible friendly units around the offered tile, up to their maximum HP. heal.target distinguishes organic units from mechanical units; heal.amount and heal.radius describe the effect. This always heals eligible allies and never attacks enemies. Choose where missing HP can actually be restored.",
  radar:
    "Deploy a radar at an offered tile to detect nearby hostile positions during its lifetime. Radar pings do not reveal terrain or make hidden enemies visible attack targets. Position it to cover useful unknown approaches.",
  turret:
    "Deploy an allied autonomous turret at an offered free tile. It watches for enemies and fires automatically with a limited battery; it does not receive normal movement orders. Consider its firing range, sight lines and friendly positions.",
};

// ===========================================
// Context for the current actor and selection
// ===========================================

/** Explain the selected ability from scratch; follow-up requests have no conversation memory. */
export function jevActionInstructions(
  state: Readonly<Record<string, unknown>>,
  candidate: JevCandidate,
): string {
  const actor = isRecord(state.actor) ? state.actor : {};
  const name = candidate.actionType?.name ?? candidate.category;
  const cost =
    candidate.apCost === undefined
      ? "its listed AP"
      : `${String(candidate.apCost)} AP`;
  const identity = `${name}: costs ${cost}.`;
  if (candidate.category === "move") {
    const allowance =
      typeof actor.movement === "number"
        ? String(actor.movement)
        : "actor.movement";
    const remaining =
      typeof actor.ap === "number" ? String(actor.ap) : "actor.ap";
    return `${identity} AP means action points; the actor has ${remaining} AP remaining. Every offered destination costs exactly 1 AP, whether the route is short or uses the full ${allowance} movement points allowed per AP. Movement follows horizontal/vertical neighbors, may turn, and must respect blocked terrain, walls and elevation links. Ordinary tiles cost one movement point; terrain may change that cost. Each option's movement_points is its actual route cost and path_steps is the number of tiles traveled. Unused movement range is lost when this action ends: a short move does not save any AP. After this move, another decision can spend remaining AP from the updated position and vision. To reach a destination quickly, prefer progress along a viable route that needs fewer total movement actions, accounting for obstacles and backtracking; do not simply choose the nearest tile or the longest move. Balance this with orders, cover, hazards and survival. Cover lists n/e/s/w protection: 0 none, 1 low, 2 high. Choose only an offered destination or group; the game computes the path.`;
  }
  if (candidate.category === "equipment") {
    const kind = candidate.actionType?.capability.kind;
    const effect = typeof kind === "string" ? EQUIPMENT_RULES[kind] : undefined;
    return `${identity} ${effect ?? "Use this item's described effect on an offered target tile."} One use consumes a limited uses_left charge; read this item's capability for its range and effect, not another weapon's profile.`;
  }
  return `${identity} ${ACTION_RULES[candidate.category] ?? candidate.actionType?.purpose ?? "Apply the described effect to an offered target."}`;
}

/** Include the chosen weapon or item's exact capability again when selecting its target. */
export function jevSelectedActionInstructions(
  state: Readonly<Record<string, unknown>>,
  candidate: JevCandidate,
): string {
  const capability = candidate.actionType?.capability;
  return `${jevActionInstructions(state, candidate)}${capability ? ` Selected capability: ${JSON.stringify(capability)}.` : ""}`;
}
