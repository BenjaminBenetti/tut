import type { JevControl } from "../src/tactical/model/jev-control";
import type { TacticalState } from "../src/tactical/model/tactical-state";
import { initialVision } from "../src/tactical/service/vision-service";

// ===========================================
// What a staged board clears
// ===========================================

/** The lists on a mission whose entries are not places on its map. */
type UnplacedList = "units" | "extracted" | "log" | "sitreps";

/**
 * Every list on a mission, found by type rather than by hand. A list
 * added to `TacticalState` later lands here on its own, and the
 * constant below stops compiling until it is named there or in
 * `UnplacedList`.
 */
type MissionList = {
  [K in keyof TacticalState]-?: NonNullable<
    TacticalState[K]
  > extends readonly unknown[]
    ? K
    : never;
}[keyof TacticalState];

/** The lists whose entries stand on tiles of the mission's map. */
type PlacedList = Exclude<MissionList, UnplacedList>;

/**
 * Every placed list, empty. Typed over `PlacedList`, so it is complete
 * by construction: the tech carcasses (#1171) were missed by hand, and a
 * carcass left at (21, 2, 26) on a 32×24 board stopped the scene from
 * mounting at all.
 */
const NOTHING_PLACED: Readonly<Record<PlacedList, readonly []>> = {
  objectives: [],
  spawners: [],
  carcasses: [],
  effects: [],
  radars: [],
  charges: [],
  extraction: [],
  blazeSites: [],
};

// ===========================================
// Staging
// ===========================================

/**
 * What a spec puts on the staged board: the board and who stands on it,
 * plus any other field it sets, such as its own fires, scanners or
 * charges, or the templates of the units it adds.
 */
export type Staging = Pick<TacticalState, "map" | "units"> &
  Partial<Omit<TacticalState, "map" | "units" | "vision">>;

/**
 * Moves a live mission onto a staged board. Everything the launched
 * mission had placed on its own map is cleared, so none of it can
 * outlive the board it stood on.
 *
 * ```
 *   launched mission ──► placed lists emptied ──► staging on top ──► vision
 *                        (spawners, carcasses,     (map, units, any    recomputed
 *                         effects, charges, ...)    list it sets)      from it
 *   jev.knowledge (terrain Jev remembers seeing) ──► forgotten
 * ```
 *
 * A resumed save keeps the vision it was given and nothing recomputes it
 * on load, so vision is rebuilt here from the staged board with the real
 * rules, as the specs did by hand before this helper.
 *
 * The launched mission is whatever the seed's first offer happens to be,
 * and that changes whenever the director, the bestiary or the map rules
 * do. A spec that stages its own board depends only on what it stages.
 *
 * @param mission - The mission the game launched, read from the autosave.
 * @param staging - The board, the units on it, and any field to set.
 * @returns The mission on the staged board, with fresh vision.
 */
export function stageMission(
  mission: TacticalState,
  staging: Staging,
): TacticalState {
  const { vision: _stale, jev, ...kept } = mission;
  const blind: Omit<TacticalState, "vision"> = {
    ...kept,
    ...(jev === undefined ? {} : { jev: forgetTerrain(jev) }),
    ...NOTHING_PLACED,
    ...staging,
  };
  return { ...blind, vision: initialVision(blind) };
}

/**
 * Jev's controls without the terrain it remembers, which names tiles of
 * the board the mission launched on.
 *
 * @param jev - The launched mission's Jev controls.
 * @returns The same controls with no remembered terrain.
 */
function forgetTerrain(jev: JevControl): JevControl {
  const { knowledge: _stale, ...kept } = jev;
  return kept;
}
