import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import { NO_VISION } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { rememberJevTerrain } from "../service/jev-knowledge-service";
import { radarContacts } from "../service/radar-service";
import { jevObjectives } from "./jev-movement";
import { jevSharedCapabilities } from "./jev-capabilities";
import type { EquipmentCatalogue } from "../model/equipment";
import { equipmentOf } from "../service/equipment-service";
import { chargesLeft } from "../service/combat-service";

/** Build a physically filtered rules input. Never hand Jev the raw mission or its event log. */
export function jevPerception(
  mission: TacticalState,
  actor: Unit,
): TacticalState {
  const observed = rememberJevTerrain({
    ...mission,
    jev: mission.jev ?? { entities: {}, commanders: { tdf: "", bugs: "" } },
  });
  const knowledge = observed.jev!.knowledge![actor.team]!;
  const vision = mission.vision[actor.team];
  const spotted = new Set(vision.spotted);
  const visible = new Set(vision.visible);
  const index = new TileIndex(mission.map);
  const units = mission.units
    .filter((unit) => unit.team === actor.team || spotted.has(unit.id))
    .map((unit): Unit =>
      unit.team === actor.team
        ? unit
        : {
            id: unit.id,
            kind: unit.kind,
            team: unit.team,
            sourceId: unit.sourceId,
            templateId: unit.templateId,
            pos: unit.pos,
            facing: unit.facing,
            hp: unit.hp,
            maxHp: unit.maxHp,
            ap: 0,
            maxAp: unit.maxAp,
            passClass: unit.passClass,
            status: unit.status.filter((status) => status !== "hidden"),
            ...(unit.designatedBy === actor.team
              ? {
                  designatedBy: unit.designatedBy,
                  designatedUntilTurn: unit.designatedUntilTurn,
                  designatedAccuracy: unit.designatedAccuracy,
                }
              : {}),
          },
    );
  const templates = Object.fromEntries(
    units.map((unit) => [unit.templateId, mission.templates[unit.templateId]!]),
  );
  const friendlyIds = new Set(
    [...mission.units, ...mission.extracted]
      .filter((unit) => unit.team === actor.team)
      .map((unit) => unit.id),
  );
  return {
    ...mission,
    map: {
      ...mission.map,
      tiles: knowledge.tiles,
      connectors: knowledge.connectors,
      buildings: [],
      props: [],
      infestation: undefined,
      dropships: [],
      hooks: {
        deployZones: [],
        objectives: [],
        edgeSpawns: [],
        extraction: { ...mission.map.hooks.extraction, tiles: [] },
      },
    },
    units,
    templates,
    vision:
      actor.team === "tdf"
        ? { tdf: vision, bugs: NO_VISION }
        : { bugs: vision, tdf: NO_VISION },
    spawners: mission.spawners.filter((nest) =>
      visible.has(index.keyOf(nest.pos)),
    ),
    effects: mission.effects.filter((effect) =>
      visible.has(index.keyOf(effect.tile)),
    ),
    carcasses: mission.carcasses.filter((carcass) =>
      visible.has(index.keyOf(carcass.pos)),
    ),
    radars: mission.radars.filter((radar) => radar.team === actor.team),
    charges: mission.charges.filter((charge) =>
      friendlyIds.has(charge.ownerId),
    ),
    extracted: [],
    log: [],
    edgeSpawn: { nextTurn: 0, wave: 0 },
  };
}

/** Compact wire projection: shared capabilities, observed entities, public goals and faction orders. */
export function jevState(
  mission: TacticalState,
  view: TacticalState,
  actor: Unit,
  entityPrompt: string,
  commanderPrompt: string,
  unitNames: Readonly<Record<string, string>>,
  equipment: EquipmentCatalogue,
): Readonly<Record<string, unknown>> {
  const vision = view.vision[actor.team];
  const objectives = jevObjectives(mission);
  return {
    entity_prompt: entityPrompt,
    commander_prompt: commanderPrompt,
    actor: describeUnit(view, actor, true, unitNames[actor.id], equipment),
    turn: mission.turn,
    phase: mission.phase,
    faction: actor.team,
    ...jevSharedCapabilities(
      view.units
        .filter((unit) => unit.id !== actor.id && unit.hp > 0)
        .map((unit) =>
          describeUnit(
            view,
            unit,
            unit.team === actor.team,
            unitNames[unit.id],
            equipment,
          ),
        ),
    ),
    equipment_definitions: Object.fromEntries(
      [
        ...new Set(
          view.units.flatMap(
            (unit) => view.templates[unit.templateId]?.equipment ?? [],
          ),
        ),
      ].flatMap((id) => {
        const definition = equipment.get(id);
        return definition ? [[id, definition]] : [];
      }),
    ),
    visible_spawners: view.spawners.map(({ id, pos, hp, destroyed }) => ({
      id,
      pos,
      hp,
      destroyed,
    })),
    objectives,
    gameplay: {
      turn: "This is a turn-based tactical battle: the TDF player faction acts, then the bug faction. You control only actor. A living actor with AP can act during its faction's phase; AP refreshes on its next faction turn. Enemy resources not shown are unknown.",
      resources:
        "AP means action points, HP means health points. Zero HP removes a unit. actor.ap is the budget remaining now; actor.max_ap is its normal turn budget. Each action pays its listed AP cost immediately. If AP remains, you receive an updated state and choose another action. Never assume all attacks cost one AP: some consume every remaining AP.",
      movement:
        "actor.movement is movement points per AP, not remaining AP. An ordinary tile costs one movement point; infestation slows TDF and speeds bugs, and rough terrain can slow mechs. The game finds routes toward the chosen entity, objective or direction using known terrain, walls, occupied footprints and elevation. A distance question can shorten the proposed one-AP route. Every move option spends exactly one AP; unused distance cannot be saved for later.",
      combat:
        "Attack previews report hit chance in percent and damage in HP. Ranged cover and height affect shots; cover is directional and does not reduce adjacent melee damage. Armor reduces damage and armor penetration bypasses armor. Blast attacks can hurt allies and destroy cover. Profiles describe capabilities; offered previews describe the actual target.",
      knowledge:
        "Faction vision is shared. Unseen terrain stays unknown; remembered terrain may be stale. capability_ref refers to shared capabilities; equipment IDs refer to equipment_definitions. Per-entity resources stay on that entity. Radar contacts are positions only, not visible targets. Objective locations are public but do not reveal surrounding terrain or hidden nest health. Names in orders refer to actor.name and entities[].name.",
      objectives:
        "For destroy-spawner objectives the TDF must destroy the nest with attacks or an offered nearby interact action; merely reaching the marker does not complete it. Bugs defend their nests and oppose TDF. Extraction removes the actor from this mission; use it only when its orders call for leaving.",
    },
    faction_goal:
      actor.team === "bugs"
        ? "Defend the nests and defeat the TDF."
        : "Complete the mission objectives and preserve the force.",
    extraction: mission.extraction,
    last_seen: Object.entries(vision.lastSeen)
      .filter(([id]) => !vision.spotted.includes(id))
      .map(([id, position]) => ({
        id,
        position,
        knowledge:
          "Historical sighting; current location, health and survival unknown",
      })),
    radar_contacts: radarContacts(mission, actor.team),
    friendly_radars: view.radars,
    friendly_charges: view.charges,
    visible_carcasses: view.carcasses,
    observed_hazards: view.effects,
  };
}

/** Separate roster identity from type; visible enemies do not disclose private resources. */
function describeUnit(
  view: TacticalState,
  unit: Unit,
  friendly: boolean,
  name: string | undefined,
  equipment: EquipmentCatalogue,
): Readonly<Record<string, unknown>> {
  const template = view.templates[unit.templateId];
  return {
    id: unit.id,
    name: name ?? template?.name,
    // Mech templates carry their given name, unlike squad types and bug species.
    type: unit.kind === "mech" ? "Mech" : template?.name,
    kind: unit.kind,
    movement_class: unit.passClass,
    faction: unit.team,
    relationship: friendly ? "friendly" : "hostile",
    position: unit.pos,
    facing: unit.facing,
    hp: unit.hp,
    max_hp: unit.maxHp,
    armor: template?.armor,
    footprint: template?.footprint ?? 1,
    weapons: template?.weapons,
    equipment: template?.equipment,
    status: friendly
      ? unit.status
      : unit.status.filter((status) => status !== "hidden"),
    ...(friendly
      ? {
          ap: unit.ap,
          max_ap: unit.maxAp,
          movement: template?.move,
          heat: unit.heat,
          systems: template?.systems,
          charges: Object.fromEntries(
            (template?.weapons ?? []).map((weapon) => [
              weapon.id,
              chargesLeft(unit, weapon) ?? "unlimited",
            ]),
          ),
          equipment_remaining: Object.fromEntries(
            equipmentOf(template, unit, equipment).map((item) => [
              item.definition.id,
              item.usesLeft,
            ]),
          ),
          weapon_ready_on_turn: unit.weaponReadyOnTurn,
          braced: unit.braced,
          moved_this_turn: unit.movedThisTurn,
          ablative_spent: unit.ablativeSpent,
          overwatch_shots: unit.overwatchShots,
        }
      : {}),
  };
}
