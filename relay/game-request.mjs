import protocol from "../src/tactical/data/jev-protocol.json" with { type: "json" };

// ===========================================
// Closed, bounded JSON shapes
// ===========================================

/** JSON objects only; never treat arrays or inherited properties as named fields. */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Text fields have individual limits in addition to the HTTP body budget. */
function text(max, min = 0) {
  return (value) =>
    typeof value === "string" && value.length >= min && value.length <= max;
}

/** Content IDs remain open for new loadouts, but cannot become object-prototype keys. */
function identifier(value) {
  return (
    text(256, 1)(value) &&
    !/\p{Cc}/u.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value)
  );
}

/** Finite, bounded game numbers; JSON exponents must not smuggle Infinity upstream. */
function number(min = 0, max = 1_000_000) {
  return (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
}

/** Counts and coordinates must be integers. */
function integer(min = 0, max = 1_000_000) {
  return (value) => Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Restrict discriminators to the game's vocabulary. */
function oneOf(...values) {
  return (value) => values.includes(value);
}

/** Bound lists before walking their entries. */
function list(check, max = 4096, min = 0) {
  return (value) =>
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every(check);
}

/** Reject unknown keys at every structured boundary, including prototype-like names. */
function object(required, optional = {}) {
  return (value) =>
    record(value) &&
    Object.keys(required).every((key) => Object.hasOwn(value, key)) &&
    Object.entries(value).every(([key, item]) =>
      Object.hasOwn(required, key)
        ? required[key](item)
        : Object.hasOwn(optional, key) && optional[key](item),
    );
}

/** Dictionaries carry dynamic IDs, never arbitrary unvalidated JSON subtrees. */
function dictionary(check, max = 4096, keyCheck = identifier) {
  return (value) =>
    record(value) &&
    Object.keys(value).length <= max &&
    Object.entries(value).every(([key, item]) => keyCheck(key) && check(item));
}

/** Match server-owned rules without depending on JSON object key order. */
function same(expected, value) {
  if (Array.isArray(expected))
    return (
      Array.isArray(value) &&
      value.length === expected.length &&
      expected.every((item, index) => same(item, value[index]))
    );
  if (record(expected))
    return (
      record(value) &&
      Object.keys(value).length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([key, item]) => Object.hasOwn(value, key) && same(item, value[key]),
      )
    );
  return expected === value;
}

const bool = oneOf(true, false);
const stat = number();
const count = integer();
const label = text(512, 1);
const team = oneOf("tdf", "bugs");
const coordinate = object({
  x: integer(0, 4096),
  y: integer(0, 4096),
  z: integer(0, 4096),
});
const band = list(stat, 2, 2);
const profile = object(
  { range: stat, accuracy: number(0, 100), damage: stat, armorPen: stat },
  {
    aoe: object({ radius: stat, falloff: number(0, 1) }),
    aoeEffect: object({
      kind: oneOf("fire", "smoke"),
      chance: number(0, 1),
      falloff: number(0, 1),
    }),
    demoForce: stat,
    endsTurn: bool,
    overwatchShots: count,
    heat: stat,
    energy: bool,
    indirect: bool,
    minRange: stat,
    requiresBrace: bool,
    guided: bool,
    beam: bool,
    cooldown: count,
  },
);
const weapon = object(
  { id: identifier, name: label, profile },
  { charges: count },
);
const systems = object(
  { heatCapacity: stat, cooling: stat, idleHeat: stat, movementHeat: stat },
  {
    sightBonus: stat,
    jumpRange: stat,
    jumpHeight: stat,
    jumpHeat: stat,
    allTerrain: bool,
    braceAccuracy: stat,
    stationaryAccuracy: stat,
    energyHeatFactor: stat,
    ablativeHits: count,
    ablativeAbsorption: stat,
    coolantUses: count,
    designationAccuracy: stat,
    equipment: list(identifier, 128),
  },
);
const equipmentFields = {
  id: identifier,
  name: label,
  kind: oneOf("radar", "blast", "charge", "heal", "turret", "net"),
  uses: count,
  apCost: stat,
  range: stat,
};
const equipmentOptions = {
  radar: object({ scanRange: stat, batteryTurns: count }),
  profile,
  heal: object({
    amount: stat,
    target: oneOf("organic", "mechanical"),
    radius: stat,
  }),
  delayTurns: count,
  net: object({ captureAtHpFraction: number(0, 1), carryMovePenalty: stat }),
};
const equipment = object(equipmentFields, equipmentOptions);

// ===========================================
// Tactical observations
// ===========================================

const staticFields = {
  type: label,
  kind: oneOf("squad", "mech", "bug", "turret", "generator", "civilian"),
  movement_class: oneOf("infantry", "mech"),
  max_hp: stat,
  armor: stat,
  footprint: integer(1, 256),
  weapons: list(weapon, 128),
};
const staticOptions = {
  equipment: list(identifier, 128),
  max_ap: stat,
  movement: stat,
  systems,
};
const identityFields = {
  id: identifier,
  name: label,
  faction: team,
  relationship: oneOf("friendly", "hostile"),
  position: coordinate,
  facing: oneOf("n", "e", "s", "w"),
  hp: stat,
  status: list(oneOf("overwatch", "hidden", "suppressed"), 16),
};
const resourceOptions = {
  ap: stat,
  heat: stat,
  charges: dictionary((value) => value === "unlimited" || count(value), 128),
  equipment_remaining: dictionary(count, 128),
  weapon_ready_on_turn: dictionary(count, 128),
  braced: bool,
  moved_this_turn: bool,
  ablative_spent: count,
  overwatch_shots: count,
  carrying: identifier,
};
const actor = object(
  {
    ...identityFields,
    ...staticFields,
    ap: stat,
    max_ap: stat,
    movement: stat,
    charges: resourceOptions.charges,
    equipment_remaining: resourceOptions.equipment_remaining,
  },
  { ...staticOptions, ...resourceOptions },
);
const entity = object(
  { ...identityFields, capability_ref: identifier },
  resourceOptions,
);
const capability = object(staticFields, staticOptions);
const selectedMovement = object(
  {
    intent: oneOf(
      "approach_entity",
      "approach_objective",
      "approach_extraction",
      "approach_carcass",
      "investigate_radar",
      "investigate_last_seen",
      "move_north",
      "move_east",
      "move_south",
      "move_west",
      "move_away_from_enemies",
    ),
    route_kind: oneOf("known-route"),
    extract_on_arrival_with_last_ap: bool,
    available_distance: number(Number.MIN_VALUE),
    distance_unit: oneOf("terrain-weighted movement points"),
    ap_cost: oneOf(1),
    proposed_endpoint: coordinate,
    proposed_path: list(coordinate, 1024, 1),
  },
  { target_id: identifier, target_name: label, target_position: coordinate },
);
const stateShape = object(
  {
    entity_prompt: text(protocol.promptMaxLength),
    commander_prompt: text(protocol.promptMaxLength),
    actor,
    turn: integer(1),
    phase: oneOf("player", "bugs"),
    faction: team,
    eligible_to_act: oneOf(true),
    entities: list(entity),
    capabilities: dictionary(capability),
    equipment_definitions: dictionary(equipment, 128),
    visible_spawners: list(
      object({ id: identifier, pos: coordinate, hp: stat, destroyed: bool }),
    ),
    objectives: list(
      object(
        { id: identifier, kind: identifier, complete: bool },
        {
          position: coordinate,
          target_ids: list(identifier, 256),
          failed: bool,
        },
      ),
      256,
    ),
    gameplay: (value) => same(protocol.gameplay, value),
    faction_goal: oneOf(...Object.values(protocol.factionGoals)),
    extraction: list(coordinate),
    last_seen: list(
      object({
        id: identifier,
        position: coordinate,
        knowledge: oneOf(
          "Historical sighting; current location, health and survival unknown",
        ),
      }),
    ),
    radar_contacts: list(
      object({ kind: oneOf("unit", "structure"), pos: coordinate }),
    ),
    friendly_radars: list(
      object({
        id: identifier,
        team,
        pos: coordinate,
        range: stat,
        turnsLeft: count,
      }),
    ),
    friendly_charges: list(
      object({
        id: identifier,
        ownerId: identifier,
        equipmentId: identifier,
        tile: coordinate,
        detonatesOnTurn: count,
      }),
    ),
    visible_carcasses: list(
      object({
        id: identifier,
        pos: coordinate,
        techPoints: count,
        harvested: bool,
      }),
    ),
    observed_hazards: list(
      object({
        id: identifier,
        kind: oneOf("fire", "smoke"),
        tile: coordinate,
        phasesLeft: count,
      }),
    ),
  },
  { selected_movement: selectedMovement },
);

// ===========================================
// Action and target choices
// ===========================================

/** Non-loadout action families; a compatibility check compares these with the command registry. */
export const GAME_SIMPLE_ACTIONS = [
  "move",
  "overwatch",
  "reload",
  "brace",
  "coolant",
  "designate",
  "jump",
  "extract",
  "interact",
  "harvest-carcass",
];
const actionCategory = oneOf(...GAME_SIMPLE_ACTIONS, "attack", "equipment");
/** Recognize action families while keeping weapon and item IDs open to new content. */
const actionId = (value) =>
  identifier(value) &&
  (GAME_SIMPLE_ACTIONS.includes(value) ||
    /^(attack|equipment):.+$/.test(value));
/** A named action exposes a weapon or a usable item, each with its own closed profile. */
const actionCapability = (value) =>
  object({
    weapon_id: identifier,
    weapon: label,
    ap_cost: stat,
    ends_activation: bool,
    profile,
  })(value) ||
  object(
    { ...equipmentFields, ap_cost: stat, uses_left: count },
    equipmentOptions,
  )(value);
const actionType = object(
  {
    action: actionId,
    instructions: text(16000, 1),
    ends_activation: bool,
    ap_costs: list(stat, 128),
    available_options: integer(1, 100000),
  },
  {
    id: actionId,
    name: label,
    purpose: text(2048, 1),
    capability: actionCapability,
  },
);
const group = object(
  { action: actionId, count: integer(1, 100000) },
  {
    region: object({ x: band, y: band, z: band }),
    example_target_ids: list(identifier, 8),
  },
);
const details = object(
  { ap_cost: stat },
  {
    ...equipmentFields,
    ...equipmentOptions,
    ends_activation: bool,
    uses_left: count,
    effect: text(2048, 1),
    weapon: label,
    targetId: identifier,
    hit_chance_percent: number(0, 100),
    damage_range: band,
    distance: stat,
    cover: oneOf(0, 1, 2),
    flanked: bool,
    elevation: number(-4096, 4096),
    blast: object({
      radius: stat,
      leaves_effect: bool,
      victims: list(
        object({
          id: identifier,
          kind: oneOf("unit", "spawner"),
          name: label,
          team,
          distance: stat,
          damage: band,
        }),
      ),
    }),
    healing: object({
      amount: stat,
      radius: stat,
      beneficiaries: list(
        object({
          id: identifier,
          name: label,
          distance: stat,
          amount: stat,
          hpAfter: stat,
        }),
      ),
    }),
  },
);
const concreteAction = object(
  { action: actionCategory, details },
  {
    unitId: identifier,
    attackerId: identifier,
    targetId: identifier,
    weaponId: identifier,
    equipmentId: identifier,
    tile: coordinate,
    objectiveId: identifier,
    carcassId: identifier,
  },
);

/** Current loadouts determine valid top-level IDs; adding weapons/items needs no relay allowlist. */
function actionsFor(state) {
  return new Set([
    ...GAME_SIMPLE_ACTIONS,
    ...state.actor.weapons.map((weapon) => `attack:${weapon.id}`),
    ...(state.actor.equipment ?? []).map((id) => `equipment:${id}`),
  ]);
}

/** Movement IDs must reference the supplied game destination sources. */
function movementIds(state) {
  return new Set([
    "move_north",
    "move_east",
    "move_south",
    "move_west",
    "move_away_from_enemies",
    ...(state.extraction.length ? ["move_to_extraction"] : []),
    ...state.entities.map((entity) => `move_to_entity:${entity.id}`),
    ...state.objectives.map((objective) => `move_to_objective:${objective.id}`),
    ...state.visible_carcasses.map(
      (carcass) => `move_to_carcass:${carcass.id}`,
    ),
    ...state.last_seen.map((entity) => `investigate_last_seen:${entity.id}`),
    ...state.radar_contacts.map(
      ({ pos }) => `investigate_radar:${pos.x}:${pos.y}:${pos.z}`,
    ),
  ]);
}

/** Fix the task wording and restrict every stage to its actual option shape. */
function validChoice(question, state) {
  if (
    !object({
      type: oneOf("choice"),
      instructions: text(16000, 1),
      criteria: record,
    })(question)
  )
    return false;
  const stages = Object.entries(protocol.choiceTasks);
  const stage = stages.find(([, task]) =>
    question.instructions.startsWith(`${protocol.choiceInstructions} ${task} `),
  )?.[0];
  const options = Object.entries(question.criteria);
  if (
    !stage ||
    options.length === 0 ||
    options.length > (stage === "action" || stage === "action-group" ? 32 : 255)
  )
    return false;
  const available = actionsFor(state);
  if (stage === "action-type")
    return (
      question.instructions ===
        `${protocol.choiceInstructions} ${protocol.choiceTasks[stage]}${protocol.actionTypeSuffix}` &&
      options.every(
        ([id, option]) =>
          available.has(id) &&
          actionType(option) &&
          option.action === id &&
          (!Object.hasOwn(option, "id") || option.id === id),
      )
    );
  if (stage === "movement-target") {
    const destinations = movementIds(state);
    return options.every(
      ([id, option]) => destinations.has(id) && text(2048, 1)(option),
    );
  }
  if (stage === "action-group")
    return options.every(
      ([id, option]) =>
        /^group-\d{1,6}$/.test(id) &&
        group(option) &&
        available.has(option.action),
    );
  // The browser pages by description size as well as option count. A single
  // indivisible preview may exceed the page budget, but still has the HTTP cap.
  if (options.length > 1 && JSON.stringify(question.criteria).length > 8000)
    return false;
  return options.every(
    ([id, option]) =>
      /^action-\d{1,6}$/.test(id) &&
      concreteAction(option) &&
      (option.action === "attack"
        ? option.attackerId === state.actor.id &&
          identifier(option.targetId) &&
          available.has(`attack:${option.weaponId}`)
        : option.unitId === state.actor.id &&
          (option.action !== "equipment" ||
            available.has(`equipment:${option.equipmentId}`))),
  );
}

/** Validate the game's exact public envelope before any authenticated upstream call. This is not caller authentication. */
export function validGameRequest(value) {
  if (
    !object({
      model: oneOf(protocol.model),
      state: stateShape,
      questions: record,
    })(value)
  )
    return false;
  const state = value.state;
  if (
    state.actor.faction !== state.faction ||
    state.actor.relationship !== "friendly" ||
    state.phase !== (state.faction === "tdf" ? "player" : "bugs") ||
    state.faction_goal !== protocol.factionGoals[state.faction] ||
    state.actor.hp <= 0 ||
    state.actor.ap <= 0 ||
    !state.entities.every((entity) =>
      Object.hasOwn(state.capabilities, entity.capability_ref),
    )
  )
    return false;
  const entries = Object.entries(value.questions);
  if (entries.length !== 1) return false;
  const [name, question] = entries[0];
  if (name === "action")
    return (
      !Object.hasOwn(state, "selected_movement") && validChoice(question, state)
    );
  if (name !== "distance" || !Object.hasOwn(state, "selected_movement"))
    return false;
  return (
    object({
      type: oneOf("score"),
      instructions: oneOf(protocol.distanceInstructions),
      criteria: (levels) => same(protocol.distanceLevels, levels),
    })(question) &&
    same(
      state.selected_movement.proposed_endpoint,
      state.selected_movement.proposed_path.at(-1),
    )
  );
}
