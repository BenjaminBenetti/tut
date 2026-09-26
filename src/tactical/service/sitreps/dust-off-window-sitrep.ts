import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import { DROP_SHIP_DEPARTED } from "../../model/drop-ship-departed-event";
import type { SitrepRule } from "../../model/sitrep-rule";
import type { DustOffWindowTuning } from "../../model/sitrep-tuning";
import type { SpawnTuning } from "../../model/spawn-tuning";
import type { TacticalApplied } from "../../model/tactical-event";
import type {
  EdgeSpawnSchedule,
  TacticalState,
} from "../../model/tactical-state";
import { leaveBehind } from "../left-behind-service";
import { waveInterval } from "../spawn-service";

// ===========================================
// Dust-off Window
// ===========================================

/**
 * Dust-off Window (campaign arc §11, a hazard): the drop ship cannot
 * wait. A setup hook fixes the last turn it waits through, sized to the
 * map; a phase step sends it off once that turn has ended, and every
 * unit of the force still on the map is lost with it, exactly as if the
 * player had abandoned the mission (`leaveBehind`, #1132). Whoever
 * boarded is home; the mission ends on them.
 *
 * ```
 *   setup
 *     dustOffTurn = baseTurns + ⌈(width + depth) / tilesPerTurn⌉       16 / 20 / 24
 *     counted waves (a defence) ──► at least lastWaveTurn + turnsAfterLastWave
 *     no extraction on the map  ──► nothing: there is no ship to leave
 *
 *   phase step, any phase with turn > dustOffTurn (the player phase after it)
 *     DropShipDeparted { turn, leftBehind }
 *     leaveBehind ──► hp 0 + UnitAbandoned per unit still on the map
 *     the turn engine's end check ──► won / extracted / lost on the boarded
 * ```
 *
 * A defence cannot be won early: it lasts until its last wave has
 * landed. So the window there is never shorter than that wave's turn
 * plus `turnsAfterLastWave`, which a Swarm Tide set up before it has
 * already brought forward. The spawn tuning is the one the table was
 * built with, the shipped one, as the mission start's default is.
 *
 * @param tuning - The window's base, its growth with the map and a defence's margin.
 * @param spawn - The wave interval a defence's last wave is counted with.
 * @returns The rule for the sitrep table.
 */
export function dustOffWindowSitrep(
  tuning: DustOffWindowTuning,
  spawn: SpawnTuning,
): SitrepRule {
  return {
    id: "dust-off-window",
    setup: (state, map) => openWindow(state, map, tuning, spawn),
    phaseStep: (mission) => departIfDue(mission),
  };
}

/**
 * Sets `dustOffTurn`. Exported for tests that check the rule apart from
 * the table. A mission with no extraction tile is returned as it came.
 *
 * @param state - The mission after its type's setup, the garrison and any earlier sitrep.
 * @param map - The generated map, whose size sets the window.
 * @param tuning - The window's base, its growth with the map and a defence's margin.
 * @param spawn - The wave interval a defence's last wave is counted with.
 * @returns The mission with the drop ship's last turn set.
 */
export function openWindow(
  state: TacticalState,
  map: Pick<TacticalMap, "width" | "depth">,
  tuning: DustOffWindowTuning,
  spawn: SpawnTuning,
): TacticalState {
  if (state.extraction.length === 0) {
    return state;
  }
  return { ...state, dustOffTurn: dustOffTurnFor(state, map, tuning, spawn) };
}

/**
 * The last turn the drop ship waits through on this mission (see
 * `dustOffWindowSitrep`).
 *
 * ```
 *   48 × 48  ──► 8 + ⌈ 96 / 12⌉ = 16
 *   72 × 72  ──► 8 + ⌈144 / 12⌉ = 20
 *   96 × 96  ──► 8 + ⌈192 / 12⌉ = 24
 * ```
 *
 * @param state - The mission; its edge-wave schedule, difficulty and threat are read.
 * @param map - The map's size.
 * @param tuning - The window's base, its growth with the map and a defence's margin.
 * @param spawn - The wave interval a defence's last wave is counted with.
 */
export function dustOffTurnFor(
  state: Pick<TacticalState, "edgeSpawn" | "difficulty" | "threat">,
  map: Pick<TacticalMap, "width" | "depth">,
  tuning: DustOffWindowTuning,
  spawn: SpawnTuning,
): number {
  const bySize =
    tuning.baseTurns + Math.ceil((map.width + map.depth) / tuning.tilesPerTurn);
  const lastWave = lastWaveTurn(state, spawn);
  return lastWave === undefined
    ? bySize
    : Math.max(bySize, lastWave + tuning.turnsAfterLastWave);
}

/**
 * Sends the drop ship off once its last turn has ended: announces
 * `DropShipDeparted` and leaves the force on the map behind. Exported
 * for tests. A mission without the window, or still inside it, is
 * returned as it came; the turn engine ends the mission on the outcome
 * the stranding leaves.
 *
 * @param mission - The mission, with the new phase and turn already set.
 * @returns The mission with the stranded force at zero hit points, and the events.
 */
export function departIfDue(
  mission: TacticalState,
): TacticalApplied<TacticalState> {
  if (
    mission.dustOffTurn === undefined ||
    mission.turn <= mission.dustOffTurn
  ) {
    return { state: mission, events: [] };
  }
  const left = leaveBehind(mission);
  return {
    state: left.state,
    events: [
      {
        type: DROP_SHIP_DEPARTED,
        payload: { turn: mission.dustOffTurn, leftBehind: left.events.length },
      },
      ...left.events,
    ],
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The turn a mission that counts its waves sees its last one, from the
 * schedule as the setup found it; undefined when the waves never stop.
 */
function lastWaveTurn(
  state: Pick<TacticalState, "edgeSpawn" | "difficulty" | "threat">,
  spawn: SpawnTuning,
): number | undefined {
  const schedule: EdgeSpawnSchedule = state.edgeSpawn;
  if (schedule.totalWaves === undefined) {
    return undefined;
  }
  const remaining = Math.max(0, schedule.totalWaves - schedule.wave);
  if (remaining === 0) {
    return undefined;
  }
  return (
    schedule.nextTurn +
    (remaining - 1) * waveInterval(state.difficulty, state.threat, spawn)
  );
}
