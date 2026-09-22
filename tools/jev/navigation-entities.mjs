import assert from "node:assert/strict";
import { buildCase, caseDefinitions, observe } from "./navigation-cases.mjs";
import { squadUnit, bugUnit } from "../../src/tactical/service/unit-factory.ts";
import { SQUAD_TYPES } from "../../src/roster/data/squad-types.ts";
import { BUG_SPECIES } from "../../src/bugs/data/species.ts";
import { UNIT_TUNING } from "../../src/tactical/data/unit-tuning.ts";
import { SHIPPED_EQUIPMENT } from "../../src/tactical/repository/equipment-catalogue.ts";
import { SequentialIdGenerator } from "../../src/core/service/sequential-id-generator.ts";
import { Mulberry32Rng } from "../../src/core/service/mulberry32-rng.ts";
import { hashSeed } from "../../src/core/service/seed-hash.ts";
import {
  footprintFits,
  occupiedKeys,
  searchMoves,
} from "../../src/tactical/service/movement-service.ts";
import {
  unitFootprintTiles,
  footprintTiles,
} from "../../src/tactical/service/footprint-service.ts";

export const ENTITY_ORDERS = [
  "named-ally",
  "named-hostile",
  "equipment",
  "commander",
];
const CALLSIGNS = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliet",
];

/** Expand the same real map sizes into four distinct entity-identification tasks. */
export function entityCaseDefinitions(suite) {
  return caseDefinitions(suite).flatMap((definition) =>
    ENTITY_ORDERS.map((orderKind) => ({
      ...definition,
      id: `${definition.id}-${orderKind}`,
      scenario: "entities-100",
      orderKind,
    })),
  );
}

/** Place 100 shipped units without overlaps; full visibility deliberately isolates roster selection from discovery. */
export function buildEntityCase(definition, visibility) {
  assert.equal(
    visibility,
    "full",
    "Exactly 100 mixed-faction targets requires this fully visible stress scenario; hidden enemies must not be offered",
  );
  const base = buildCase(definition, visibility);
  const rng = new Mulberry32Rng(
    hashSeed(`${definition.seed}:${definition.size}:entity-roster-v1`),
  );
  const ids = new SequentialIdGenerator({ counters: { unit: 2 } });
  const templates = { ...base.mission.templates };
  const units = [base.mission.units[0]];
  const names = { [units[0].id]: "Pathfinder" };
  const reserved = new Set(
    footprintTiles(
      { ...units[0].pos, x: units[0].pos.x - 1, z: units[0].pos.z - 1 },
      3,
    ).map((pos) => base.graph.index.keyOf(pos)),
  );
  const connectors = new Set(
    base.mission.map.connectors.flatMap((link) => [
      base.graph.index.keyOf(link.from),
      base.graph.index.keyOf(link.to),
    ]),
  );
  const available = rng.shuffle(
    base.mission.map.tiles.filter((tile) =>
      base.oracle.has(base.graph.index.keyOf(tile)),
    ),
  );
  const species = Object.values(BUG_SPECIES);
  const indices = Array.from({ length: 100 }, (_, i) => i).sort(
    (a, b) =>
      (b < 60 ? 1 : (species[(b - 60) % species.length].footprint ?? 1)) -
        (a < 60 ? 1 : (species[(a - 60) % species.length].footprint ?? 1)) ||
      a - b,
  );
  // Reserve the scarce large footprints first; smaller units may share free perimeter space.
  for (const i of indices) {
    const friendly = i < 60;
    const type = friendly
      ? SQUAD_TYPES[i % SQUAD_TYPES.length]
      : species[(i - 60) % species.length];
    const size = type.footprint ?? 1;
    const tile = available.find((tile) => {
      if (
        !footprintFits(
          base.graph,
          { x: tile.x - 1, y: tile.y, z: tile.z - 1 },
          size + 2,
          1,
        )
      )
        return false;
      const footprint = footprintTiles(tile, size);
      if (
        footprint.some(
          (pos) =>
            reserved.has(base.graph.index.keyOf(pos)) ||
            connectors.has(base.graph.index.keyOf(pos)),
        )
      )
        return false;
      return base.graph.reachability.neighbours(tile, 1).length >= 3;
    });
    assert(tile, `Could not place all 100 units: ${definition.id}, index ${i}`);
    const name = friendly
      ? `${CALLSIGNS[i % CALLSIGNS.length]}-${String(Math.floor(i / CALLSIGNS.length) + 1).padStart(2, "0")}`
      : `${type.name}-${String(i - 59).padStart(2, "0")}`;
    const placement = {
      pos: { x: tile.x, y: tile.y, z: tile.z },
      facing: ["n", "e", "s", "w"][i % 4],
    };
    const made = friendly
      ? squadUnit(
          {
            id: `crowd-${i}`,
            name,
            typeId: type.id,
            strength: 5,
            maxStrength: 5,
            xp: 0,
            kills: 0,
            missionsSurvived: 0,
          },
          type,
          placement,
          { ids, tuning: UNIT_TUNING },
        )
      : bugUnit(type, placement, { ids });
    templates[made.template.id] = made.template;
    const equipment = Object.fromEntries(
      (made.template.equipment ?? []).map((id) => [
        id,
        SHIPPED_EQUIPMENT.get(id).uses,
      ]),
    );
    const unit = {
      ...made.unit,
      hp: rng.nextInt(Math.min(4, made.unit.maxHp), made.unit.maxHp),
      ap: i % (made.unit.maxAp + 1),
      ...(friendly ? { equipment } : {}),
    };
    units.push(unit);
    names[unit.id] = name;
    for (const pos of footprintTiles(
      { ...unit.pos, x: unit.pos.x - 1, z: unit.pos.z - 1 },
      size + 2,
    ))
      reserved.add(base.graph.index.keyOf(pos));
  }
  let mission = observe({ ...base.mission, units, templates }, visibility);
  const search = searchMoves(
    mission,
    { ...units[0], ap: mission.map.tiles.length },
    base.graph,
  );
  const destinations = units.slice(1).map((unit) => ({
    unit,
    approaches: approachTiles(mission, unit, base.graph),
  }));
  for (const { unit, approaches } of destinations)
    assert(
      approaches.some((pos) => search.costs.has(base.graph.index.keyOf(pos))),
      `Entity ${unit.id} must be approachable`,
    );
  const ranked = destinations
    .map((item) => ({
      ...item,
      distance: Math.min(
        ...item.approaches.map(
          (pos) => search.costs.get(base.graph.index.keyOf(pos)) ?? Infinity,
        ),
      ),
    }))
    .sort(
      (a, b) => b.distance - a.distance || a.unit.id.localeCompare(b.unit.id),
    );
  const eligible =
    definition.orderKind === "named-hostile"
      ? ranked.filter((item) => item.unit.team === "bugs")
      : definition.orderKind === "equipment"
        ? ranked.filter(
            (item) => templates[item.unit.templateId].name === "Radio Squad",
          )
        : definition.orderKind === "commander"
          ? ranked.filter(
              (item) => templates[item.unit.templateId].name === "Medic Squad",
            )
          : ranked.filter((item) => item.unit.team === "tdf");
  const chosen = eligible[0];
  assert(chosen && chosen.distance > 5);
  let entityPrompt = `Rendezvous with ${names[chosen.unit.id]} as quickly as possible.`;
  let commanderPrompt = "";
  if (definition.orderKind === "named-hostile")
    entityPrompt = `Approach ${names[chosen.unit.id]} as quickly as possible. Move only; do not attack.`;
  if (definition.orderKind === "equipment") {
    entityPrompt =
      "Rendezvous with the friendly Radio Squad carrying exactly one radar dish remaining. Move as quickly as possible.";
    mission = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === chosen.unit.id
          ? { ...unit, equipment: { ...unit.equipment, "radar-dish": 1 } }
          : unit,
      ),
    };
  }
  if (definition.orderKind === "commander") {
    const distractor = ranked.find(
      (item) => item.unit.team === "tdf" && item.unit.id !== chosen.unit.id,
    );
    entityPrompt = `Rendezvous with ${names[distractor.unit.id]} as quickly as possible.`;
    commanderPrompt =
      "Override individual rendezvous orders: move to the friendly Medic Squad with the lowest current HP. Reach that squad as quickly as possible.";
    mission = {
      ...mission,
      units: mission.units.map((unit) =>
        unit.id === chosen.unit.id ? { ...unit, hp: 1 } : unit,
      ),
    };
  }
  mission = observe(mission, visibility);
  const target = mission.units.find((unit) => unit.id === chosen.unit.id);
  const goalTiles = approachTiles(mission, target, base.graph);
  const oracle = new Map();
  for (const pos of goalTiles) {
    const reverse = searchMoves(
      mission,
      { ...units[0], pos, ap: mission.map.tiles.length },
      base.graph,
    );
    for (const [key, distance] of reverse.costs)
      if (distance < (oracle.get(key) ?? Infinity)) oracle.set(key, distance);
  }
  const distance = oracle.get(base.graph.index.keyOf(base.start));
  assert(Number.isFinite(distance));
  const goal = {
    id: target.id,
    name: names[target.id],
    position: target.pos,
    distance,
  };
  const optimalAp = Math.ceil(distance / base.movement);
  const choiceOrder = rng.shuffle(
    mission.units.slice(1).map((unit) => unit.id),
  );
  const entityOrder = rng.shuffle(choiceOrder);
  const prompts = { entity: entityPrompt, commander: commanderPrompt };
  return {
    ...base,
    mission,
    goal,
    oracle,
    optimalAp,
    names,
    prompts,
    choiceOrder,
    entityOrder,
    metadata: {
      ...base.metadata,
      scenario: "entities-100",
      orderKind: definition.orderKind,
      goal,
      goalTiles,
      optimalAp,
      prompts,
      entityCount: 100,
      choiceOrder,
      entityOrder,
      roster: mission.units.slice(1).map((unit) => ({
        id: unit.id,
        name: names[unit.id],
        type: templates[unit.templateId].name,
        faction: unit.team,
        position: unit.pos,
        footprint: templates[unit.templateId].footprint ?? 1,
        hp: unit.hp,
        maxHp: unit.maxHp,
      })),
    },
  };
}

/** Reach a free surface connected by one legal step to the target footprint, never the occupied anchor. */
export function approachTiles(mission, target, graph) {
  const occupied = occupiedKeys(mission, graph.index, mission.units[0].id);
  const result = new Map();
  for (const pos of unitFootprintTiles(mission, target)) {
    const tile = graph.index.getAt(pos);
    if (!tile) continue;
    for (const next of graph.reachability.neighbours(tile, 1)) {
      const key = graph.index.keyOf(next);
      if (!occupied.has(key))
        result.set(key, { x: next.x, y: next.y, z: next.z });
    }
  }
  return [...result.values()];
}
