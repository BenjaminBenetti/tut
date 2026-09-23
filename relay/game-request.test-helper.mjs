import protocol from "../src/tactical/data/jev-protocol.json" with { type: "json" };

/** Small complete tactical request for HTTP rejection tests; real builders have separate compatibility coverage. */
export function gameRequest() {
  return {
    model: protocol.model,
    state: {
      entity_prompt: "Hold",
      commander_prompt: "Defend",
      turn: 1,
      phase: "player",
      faction: "tdf",
      eligible_to_act: true,
      actor: {
        id: "unit-1",
        name: "Alpha",
        type: "Rifle Squad",
        kind: "squad",
        movement_class: "infantry",
        faction: "tdf",
        relationship: "friendly",
        position: { x: 1, y: 0, z: 1 },
        facing: "n",
        hp: 20,
        max_hp: 20,
        armor: 0,
        footprint: 1,
        ap: 2,
        max_ap: 2,
        movement: 6,
        weapons: [
          {
            id: "primary",
            name: "Carbine",
            profile: { range: 6, accuracy: 75, damage: 3, armorPen: 0 },
          },
        ],
        equipment: [],
        status: [],
        charges: { primary: "unlimited" },
        equipment_remaining: {},
      },
      entities: [],
      capabilities: {},
      equipment_definitions: {},
      visible_spawners: [],
      objectives: [],
      gameplay: protocol.gameplay,
      faction_goal: protocol.factionGoals.tdf,
      extraction: [{ x: 0, y: 0, z: 0 }],
      last_seen: [],
      radar_contacts: [],
      friendly_radars: [],
      friendly_charges: [],
      visible_carcasses: [],
      observed_hazards: [],
    },
    questions: {
      action: {
        type: "choice",
        instructions: `${protocol.choiceInstructions} ${protocol.choiceTasks["action-type"]}${protocol.actionTypeSuffix}`,
        criteria: {
          overwatch: {
            action: "overwatch",
            instructions:
              "Overwatch costs 1 AP and ends the actor's activation.",
            ends_activation: true,
            ap_costs: [1],
            available_options: 1,
          },
        },
      },
    },
  };
}

/** The exact five-level movement question with a nonempty one-AP route. */
export function distanceRequest() {
  const request = gameRequest();
  request.state.selected_movement = {
    intent: "move_east",
    route_kind: "known-route",
    extract_on_arrival_with_last_ap: false,
    available_distance: 1,
    distance_unit: "terrain-weighted movement points",
    ap_cost: 1,
    proposed_endpoint: { x: 2, y: 0, z: 1 },
    proposed_path: [{ x: 2, y: 0, z: 1 }],
  };
  request.questions = {
    distance: {
      type: "score",
      instructions: protocol.distanceInstructions,
      criteria: protocol.distanceLevels,
    },
  };
  return request;
}
