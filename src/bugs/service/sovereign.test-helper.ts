import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { missionWith } from "../../tactical/service/tactical-fixtures.test-helper";
import { withVision } from "../../tactical/service/vision-service";
import { SOVEREIGN } from "../data/species";
import { placeSovereign } from "./sovereign-placement";
import { isSovereign } from "./sovereign-service";

// ===========================================
// Missions
// ===========================================

/** Options for `sovereignMission`. */
export interface SovereignOptions {
  readonly phase?: TacticalState["phase"];
  readonly turn?: number;
  readonly difficulty?: number;
  /** Her hit points after placement; full when absent. */
  readonly hp?: number;
  /** The core she guards; her own anchor when absent, none at all when `null`. */
  readonly core?: TileCoord | null;
  /** Compute both sides' vision after placing her; true by default. */
  readonly vision?: boolean;
}

/**
 * A fixture mission on `map` holding `units`, with the Sovereign placed
 * at `anchor` through the real placement seam and vision computed, as a
 * mission start would.
 *
 * @param map - The map.
 * @param units - Everyone else on it.
 * @param anchor - Her anchor: the lowest-`x`, lowest-`z` tile of her 4×4 block.
 * @param options - Phase, turn, difficulty, hit points, core, vision.
 * @returns The mission and her unit in it.
 */
export function sovereignMission(
  map: TacticalMap,
  units: readonly Unit[],
  anchor: TileCoord,
  options: SovereignOptions = {},
): { mission: TacticalState; sovereign: Unit } {
  const base = missionWith(map, units, {
    phase: options.phase ?? "bugs",
    turn: options.turn ?? 1,
    difficulty: options.difficulty ?? 1,
  });
  const placed = placeSovereign(base, anchor, {
    ids: new SequentialIdGenerator({ counters: { unit: 950 } }),
    species: SOVEREIGN,
    core: options.core ?? anchor,
  });
  const adjusted: TacticalState = {
    ...placed,
    units: placed.units.map((unit) => {
      if (!isSovereign(unit)) {
        return unit;
      }
      const hurt = { ...unit, hp: options.hp ?? unit.hp };
      if (options.core !== null) {
        return hurt;
      }
      const { core: _none, ...coreless } = hurt;
      return coreless;
    }),
  };
  const mission =
    options.vision === false
      ? adjusted
      : withVision({ state: adjusted, events: [] }).state;
  const sovereign = mission.units.find(isSovereign);
  if (sovereign === undefined) {
    throw new Error("the Sovereign did not fit at the anchor");
  }
  return { mission, sovereign };
}
