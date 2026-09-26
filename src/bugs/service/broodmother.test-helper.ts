import { STOREY_LAYERS } from "../../core/model/elevation";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { missionWith } from "../../tactical/service/tactical-fixtures.test-helper";
import { withVision } from "../../tactical/service/vision-service";
import { BROODMOTHER } from "../data/species";
import { placeBroodmother } from "./broodmother-placement";
import { isBroodmother } from "./broodmother-service";

// ===========================================
// Maps
// ===========================================

/** An open grass field of the given size, with three storeys of headroom. */
export function fieldMap(width: number, depth: number): FixtureMapBuilder {
  return new FixtureMapBuilder(width, depth, 3 * STOREY_LAYERS).fillGround();
}

/**
 * A field split by a solid wall along the east side of column `x`, the
 * whole depth of the map: nothing sees or walks across it.
 */
export function walledFieldAt(
  width: number,
  depth: number,
  x: number,
): TacticalMap {
  const builder = fieldMap(width, depth);
  for (let z = 0; z < depth; z++) {
    builder.wall({ x, y: 0, z }, "e", "solid");
  }
  return builder.build();
}

// ===========================================
// Missions
// ===========================================

/** Options for `motherMission`. */
export interface MotherOptions {
  readonly phase?: TacticalState["phase"];
  readonly turn?: number;
  readonly difficulty?: number;
  readonly scars?: number;
  /** Her hit points after placement; full when absent. */
  readonly hp?: number;
  readonly facing?: Unit["facing"];
  /** Compute both sides' vision after placing her; true by default. */
  readonly vision?: boolean;
}

/**
 * A fixture mission on `map` holding `units`, with the Broodmother placed
 * at `anchor` through the real placement seam and vision computed, as a
 * mission start would.
 */
export function motherMission(
  map: TacticalMap,
  units: readonly Unit[],
  anchor: TileCoord,
  options: MotherOptions = {},
): { mission: TacticalState; mother: Unit } {
  const base = missionWith(map, units, {
    phase: options.phase ?? "bugs",
    turn: options.turn ?? 1,
    difficulty: options.difficulty ?? 1,
  });
  const placed = placeBroodmother(base, anchor, {
    ids: new SequentialIdGenerator({ counters: { unit: 900 } }),
    species: BROODMOTHER,
    scars: options.scars ?? 0,
  });
  const adjusted: TacticalState = {
    ...placed,
    units: placed.units.map((unit) =>
      isBroodmother(unit)
        ? {
            ...unit,
            hp: options.hp ?? unit.hp,
            facing: options.facing ?? unit.facing,
          }
        : unit,
    ),
  };
  const mission =
    options.vision === false
      ? adjusted
      : withVision({ state: adjusted, events: [] }).state;
  const mother = mission.units.find(isBroodmother);
  if (mother === undefined) {
    throw new Error("the Broodmother did not fit at the anchor");
  }
  return { mission, mother };
}
