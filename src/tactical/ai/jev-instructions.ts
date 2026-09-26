import { isRecord } from "../../core/model/record-guard";
import type { JevActionCommand, JevCandidate } from "../model/jev-control";
import type { EquipmentKind } from "../model/equipment";
import type { MechAction } from "../model/mech-action-command";

// ===========================================
// Gameplay rules for each ability
// ===========================================

type CommandCategory<T extends string> = T extends `tactical:${infer Category}`
  ? Category
  : never;
type SimpleCategory = Exclude<
  CommandCategory<JevActionCommand["type"]>,
  "move" | "use-equipment" | "mech-action"
>;

const ACTION_RULES: Readonly<Record<string, string>> = {
  attack:
    "Attack one offered visible enemy unit or nest with this weapon. Only entity targets are offered, including for area-of-effect weapons: the blast is centered on the selected entity. Compare hit_chance_percent (0-100), damage_range in HP, target health/armor, cover and elevation. A range-1 weapon is melee; ranged attacks may miss. A blast can damage allies as well as enemies and destroy terrain; check the listed blast victims for friendly fire. Check the weapon's ammo, heat and cooldown; ends_activation means firing ends the actor's activation and forfeits any AP left after paying the listed cost.",
  overwatch:
    "Overwatch costs 1 AP and ends the actor's activation, forfeiting any remaining AP. It is available with just 1 AP; using it with 2 AP also leaves 0 AP. Watch for enemy movement until the next faction turn. The first weapon fires reaction shots when an enemy moves into legal range and line of sight, subject to ammo, heat and cooldown. It does not attack immediately or guarantee a reaction shot.",
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
    "Work the offered nearby objective for the listed AP cost. This is not a move. At a nest objective it plants demolition charges, dealing objective damage immediately; the nest may require more damage to be destroyed, and reaching its map marker alone does not complete the objective. At a capture-specimen objective it picks up the specimen a fallen carrier dropped beside the actor, which the actor then carries home at a movement cost; carrying it does not complete the objective until the actor extracts.",
  "harvest-carcass":
    "Harvest an offered nearby bug carcass for campaign tech points. This spends AP without attacking, healing or completing a nest objective; weigh the research gain against the actor's current orders and safety.",
} satisfies Readonly<Record<SimpleCategory | MechAction, string>>;

const EQUIPMENT_RULES: Readonly<Record<string, string>> = {
  blast:
    "Throw or use this explosive against one offered visible enemy unit or nest. The targetId identifies the entity; the game aims at a legal tile occupied by that entity, not empty ground. It makes an immediate attack that can miss; its blast can harm allies and enemies and damage terrain. Compare hit_chance_percent, damage_range and the listed blast victims for friendly fire.",
  charge:
    "Place a delayed explosive at an offered tile. It detonates after the item's delayTurns (two turns if absent), not immediately. The later blast can hurt any faction, including this actor; account for friendly positions and escape routes.",
  heal: "Heal eligible friendly units around the offered tile, up to their maximum HP. heal.target distinguishes organic units from mechanical units; heal.amount and heal.radius describe the effect. healing.beneficiaries lists the units helped, actual HP restored and resulting HP. This always heals eligible allies and never attacks enemies. Choose where missing HP can actually be restored.",
  radar:
    "Deploy a radar at an offered tile to detect nearby hostile positions during its lifetime. Radar pings do not reveal terrain or make hidden enemies visible attack targets. Position it to cover useful unknown approaches.",
  turret:
    "Deploy an allied autonomous turret at an offered free tile. It watches for enemies and fires automatically with a limited battery; it does not receive normal movement orders. Consider its firing range, sight lines and friendly positions.",
  net: "Throw the capture net over one offered adjacent enemy bug. It is offered only for a bug of the species a capture-specimen objective wants, worn down to net.captureAtHpFraction of its maximum HP or less. It cannot miss and deals no damage: the bug leaves the battlefield alive and the actor carries it, losing net.carryMovePenalty movement points per AP until it extracts. The objective completes only when the carrier extracts, so bring it home and keep it alive; if the carrier falls, another squad next to it must pick the specimen up with interact.",
} satisfies Readonly<Record<EquipmentKind, string>>;

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
    return `${identity} AP means action points; the actor has ${remaining} AP remaining and up to ${allowance} movement points per AP. Choose an entity, objective, extraction zone, harvestable carcass, radar contact, last-seen location, compass direction or retreat; the game plans a route using the full map layout and known units, accounting for terrain costs, walls, footprints and stairs between floors. A follow-up rates how much of the proposed route to use. Every executed move spends exactly 1 AP: a short move does not save any AP. Unused movement range is lost. Another decision follows from the updated position and vision while AP remains. Balance reaching orders quickly with survival, hazards and friendly positions. Carcass movement stops in harvesting range; Harvest needs a separate action. Radar contacts are positions only and last-seen locations are historical: investigate to gain sight, never treat them as visible attack targets. Arrival does not attack, heal, harvest or complete an objective. An explicit TDF extraction move that reaches the zone with the last AP is followed by free extraction after the walk; with AP remaining, choose Extract next. To guard the zone without leaving, use another movement intent.`;
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
