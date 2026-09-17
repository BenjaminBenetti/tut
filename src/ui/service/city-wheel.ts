import type { CityId } from "../../overworld/model/city";
import type { Mission, MissionId } from "../../overworld/model/mission";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import type { RadialMenuHub, RadialMenuItem } from "../view/radial-menu-view";
import { formatCredits, formatPopulation, formatWhole } from "./format";
import { threatTone } from "./threat-band";

/** What the hub reads for a city the player has not detected (GDD §5.3). */
export const UNDETECTED_INFESTATION = "?";

// ===========================================
// Types
// ===========================================

/** What the city wheel shows: the fact at the centre and the choices around it. */
export interface CityWheel {
  readonly hub: RadialMenuHub;
  readonly items: readonly RadialMenuItem[];
}

/** What picking an entry on the wheel means. */
export type CityWheelChoice =
  | { readonly kind: "mission"; readonly missionId: MissionId }
  | { readonly kind: "region" };

// ===========================================
// Constants
// ===========================================

/** Item id of the entry that takes the player to the region panel. */
export const CITY_WHEEL_REGION_ITEM = "region";

/** Item id prefix for a mission entry; the rest is the mission id. */
const MISSION_ITEM_PREFIX = "mission:";

/**
 * Missions the ring can hold beside the Region entry: the ring's six
 * places less that one. A city rarely offers more than one at a time.
 */
export const CITY_WHEEL_MAX_MISSIONS = 5;

// ===========================================
// Building
// ===========================================

/**
 * The info wheel that opens at a city on the strategic map (#1154): the
 * city's infestation at the hub over its name and population (a
 * question mark with a plain tone while the city is undetected, GDD
 * §5.3), a ring
 * entry per mission on offer there (soonest to expire first, the first
 * one primary), and a Region entry that leads to the Situation panel.
 * Pure: state in, ring out; the screen maps a choice back through
 * `cityWheelChoice`.
 *
 * ```
 *            ( Infestation Clearance  D4 · ¢1,200 )
 *   hub: 62 / Tokyo · 37M
 *            ( Region )
 * ```
 *
 * @returns Undefined when the city is not on the map.
 */
export function buildCityWheel(
  state: GameState,
  cityId: CityId,
  missionTypes: MissionTypeCatalogue,
): CityWheel | undefined {
  const city = findCity(state.overworld.map, cityId);
  if (!city) {
    return undefined;
  }
  const missions = state.overworld.missions
    .filter((mission) => mission.cityId === cityId)
    .sort(byExpiry)
    .slice(0, CITY_WHEEL_MAX_MISSIONS);
  const items: RadialMenuItem[] = missions.map((mission, index) => ({
    id: `${MISSION_ITEM_PREFIX}${mission.id}`,
    label: missionTypes[mission.typeId].name,
    icon: "mission",
    detail: `D${formatWhole(mission.difficulty)} · ${formatCredits(mission.rewards.credits)}`,
    ...(index === 0 ? { primary: true } : {}),
  }));
  items.push({ id: CITY_WHEEL_REGION_ITEM, label: "Region", icon: "region" });
  return {
    hub: city.detected
      ? {
          value: formatWhole(city.infestation),
          caption: `${city.name} · ${formatPopulation(city.population)}`,
          tone: threatTone(city.infestation),
        }
      : {
          value: UNDETECTED_INFESTATION,
          caption: `${city.name} · ${formatPopulation(city.population)}`,
          tone: "plain",
        },
    items,
  };
}

/** Maps an item id reported by the ring back to what it stands for; undefined for an unknown id. */
export function cityWheelChoice(itemId: string): CityWheelChoice | undefined {
  if (itemId === CITY_WHEEL_REGION_ITEM) {
    return { kind: "region" };
  }
  if (itemId.startsWith(MISSION_ITEM_PREFIX)) {
    return {
      kind: "mission",
      missionId: itemId.slice(MISSION_ITEM_PREFIX.length),
    };
  }
  return undefined;
}

// ===========================================
// Helpers
// ===========================================

/** Soonest expiry first; ties by id so the order is stable. */
function byExpiry(a: Mission, b: Mission): number {
  return a.expiresDay - b.expiresDay || a.id.localeCompare(b.id);
}
