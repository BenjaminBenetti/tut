import JEV_PROTOCOL from "../data/jev-protocol.json";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import { NO_VISION } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { rememberJevTerrain } from "../service/jev-knowledge-service";
import type { JevDestinationSources } from "./jev-destinations";
import { jevSharedCapabilities } from "./jev-capabilities";
import type { EquipmentCatalogue } from "../model/equipment";
import { equipmentOf } from "../service/equipment-service";
import { chargesLeft } from "../service/combat-service";
import { spawnerFootprintTiles } from "../service/footprint-service";
import { movePerAction } from "../service/movement-service";

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
      spawnerFootprintTiles(nest).some(
        (tile) => index.inBounds(tile) && visible.has(index.keyOf(tile)),
      ),
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
  destinations: JevDestinationSources,
): Readonly<Record<string, unknown>> {
  return {
    entity_prompt: entityPrompt,
    commander_prompt: commanderPrompt,
    actor: describeUnit(view, actor, true, unitNames[actor.id], equipment),
    turn: mission.turn,
    phase: mission.phase,
    faction: actor.team,
    ...jevSharedCapabilities(
      destinations.entities
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
    objectives: destinations.objectives,
    gameplay: JEV_PROTOCOL.gameplay,
    faction_goal: JEV_PROTOCOL.factionGoals[actor.team],
    extraction: destinations.extraction,
    last_seen: destinations.last_seen,
    radar_contacts: destinations.radar_contacts,
    friendly_radars: view.radars,
    friendly_charges: view.charges,
    visible_carcasses: destinations.visible_carcasses,
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
          // Per action, less what a carried specimen costs (#1179).
          movement:
            template === undefined ? undefined : movePerAction(view, unit),
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
          // The species of the specimen it carries, or lies beside once
          // it has fallen (#1179).
          carrying: unit.carrying?.species,
        }
      : {}),
  };
}
