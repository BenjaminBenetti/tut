import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import { NO_VISION } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { rememberJevTerrain } from "../service/jev-knowledge-service";
import { radarContacts } from "../service/radar-service";

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

/** Explicit wire projection: compact navigation, observed entities, mission intel and both prompts. */
export function jevState(
  mission: TacticalState,
  view: TacticalState,
  actor: Unit,
  entityPrompt: string,
  commanderPrompt: string,
): Readonly<Record<string, unknown>> {
  const vision = view.vision[actor.team];
  const index = new TileIndex(view.map);
  const visible = new Set(vision.visible);
  const range = Math.max(
    12,
    (view.templates[actor.templateId]?.move ?? 0) * actor.maxAp + 2,
  );
  const localTiles = view.map.tiles.filter(
    (tile) =>
      Math.abs(tile.x - actor.pos.x) + Math.abs(tile.z - actor.pos.z) <= range,
  );
  return {
    entity_prompt: entityPrompt,
    commander_prompt: commanderPrompt,
    actor: describeUnit(view, actor, true),
    turn: mission.turn,
    phase: mission.phase,
    faction: actor.team,
    navigation: {
      scope:
        "Remembered and visible terrain near the actor. Omitted tiles are unknown or outside this local window; do not infer their geometry. Paths are computed by the game on known terrain. Coordinates are x, elevation layer y, z.",
      columns: [
        "x",
        "y",
        "z",
        "passMask",
        "cover",
        "walls",
        "blocksSight",
        "visible",
      ],
      passMask: { infantry: 1, mech: 2 },
      cover: { none: 0, low: 1, high: 2 },
      tiles: localTiles.map((tile) => [
        tile.x,
        tile.y,
        tile.z,
        tile.pass,
        tile.coverProvided,
        tile.walls,
        tile.blocksLos,
        visible.has(index.keyOf(tile)),
      ]),
      connectors: view.map.connectors
        .filter((link) =>
          localTiles.some(
            (tile) => index.keyOf(tile) === index.keyOf(link.from),
          ),
        )
        .map(({ kind, from, to, pass }) => ({ kind, from, to, pass })),
    },
    entities: view.units
      .filter((unit) => unit.id !== actor.id && unit.hp > 0)
      .map((unit) => describeUnit(view, unit, unit.team === actor.team)),
    visible_spawners: view.spawners.map(({ id, pos, hp, destroyed }) => ({
      id,
      pos,
      hp,
      destroyed,
    })),
    objectives: mission.objectives.map((objective) => ({
      id: objective.id,
      kind: objective.kind,
      complete: objective.complete,
      position: mission.spawners.find((nest) => nest.id === objective.targetId)
        ?.pos,
    })),
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

/** Enemy dynamic resources are not known merely because its model is visible. */
function describeUnit(
  view: TacticalState,
  unit: Unit,
  friendly: boolean,
): Readonly<Record<string, unknown>> {
  const template = view.templates[unit.templateId];
  return {
    id: unit.id,
    name: template?.name,
    kind: unit.kind,
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
    status: unit.status.filter((status) => status !== "hidden"),
    ...(friendly
      ? {
          ap: unit.ap,
          max_ap: unit.maxAp,
          movement: template?.move,
          heat: unit.heat,
          systems: template?.systems,
          charges: unit.charges,
          equipment_remaining: unit.equipment,
          weapon_ready_on_turn: unit.weaponReadyOnTurn,
          braced: unit.braced,
        }
      : {}),
  };
}
