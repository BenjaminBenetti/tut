import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Mission } from "../../overworld/model/mission";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import {
  buildCityWheel,
  CITY_WHEEL_MAX_MISSIONS,
  CITY_WHEEL_REGION_ITEM,
  cityWheelChoice,
  UNDETECTED_INFESTATION,
} from "./city-wheel";

const mission = (id: string, cityId: string, expiresDay: number): Mission => ({
  id,
  typeId: "infestation-clearance",
  cityId,
  difficulty: 4,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "medium",
    seed: id,
  },
  rewards: { credits: 1200 },
  createdDay: 1,
  expiresDay,
  ignorePenalty: 10,
});

/** A new game with Tokyo at `infestation` and the given missions on offer. */
function stateWith(infestation: number, missions: Mission[] = []): GameState {
  const base = createNewGame(
    { seed: 5, createdAt: "2026-09-16T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  return {
    ...base,
    overworld: {
      ...base.overworld,
      missions,
      map: {
        ...base.overworld.map,
        cities: base.overworld.map.cities.map((c) =>
          c.id === "tokyo"
            ? { ...c, infestation, detected: infestation > 0 }
            : c,
        ),
      },
    },
  };
}

describe("buildCityWheel", () => {
  it("puts the infestation at the hub over the name and population, toned by band", () => {
    const wheel = buildCityWheel(stateWith(62), "tokyo", MISSION_TYPES);
    expect(wheel?.hub).toEqual({
      value: "62",
      caption: "Tokyo · 37M",
      tone: "warn",
    });
    // A clean city is undetected, so it reads the same as a hidden landing.
    expect(buildCityWheel(stateWith(0), "tokyo", MISSION_TYPES)?.hub).toEqual({
      value: UNDETECTED_INFESTATION,
      caption: "Tokyo · 37M",
      tone: "plain",
    });
    expect(buildCityWheel(stateWith(3), "tokyo", MISSION_TYPES)?.hub.tone).toBe(
      "ok",
    );
    expect(
      buildCityWheel(stateWith(90), "tokyo", MISSION_TYPES)?.hub.tone,
    ).toBe("danger");
  });

  it("hides an undetected city's infestation behind a plain question mark (GDD §5.3)", () => {
    const base = stateWith(62);
    const hidden: GameState = {
      ...base,
      overworld: {
        ...base.overworld,
        map: {
          ...base.overworld.map,
          cities: base.overworld.map.cities.map((c) =>
            c.id === "tokyo" ? { ...c, detected: false } : c,
          ),
        },
      },
    };
    expect(buildCityWheel(hidden, "tokyo", MISSION_TYPES)?.hub).toEqual({
      value: UNDETECTED_INFESTATION,
      caption: "Tokyo · 37M",
      tone: "plain",
    });
  });

  it("offers only the Region entry when the city has no mission", () => {
    const wheel = buildCityWheel(stateWith(3), "tokyo", MISSION_TYPES);
    expect(wheel?.items.map((i) => i.id)).toEqual([CITY_WHEEL_REGION_ITEM]);
    expect(wheel?.items[0]?.icon).toBe("region");
  });

  it("lists the city's missions soonest first, the first primary, then Region", () => {
    const wheel = buildCityWheel(
      stateWith(3, [
        mission("mission-2", "tokyo", 9),
        mission("mission-1", "tokyo", 4),
        mission("mission-3", "seoul", 2),
      ]),
      "tokyo",
      MISSION_TYPES,
    );
    expect(wheel?.items.map((i) => i.id)).toEqual([
      "mission:mission-1",
      "mission:mission-2",
      CITY_WHEEL_REGION_ITEM,
    ]);
    expect(wheel?.items[0]).toMatchObject({
      label: "Infestation Clearance",
      icon: "mission",
      detail: "D4 · ¢1,200",
      primary: true,
    });
    expect(wheel?.items[1]?.primary).toBeUndefined();
  });

  it("caps missions so the ring never exceeds six entries", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      mission(`mission-${String(i)}`, "tokyo", 10 + i),
    );
    const wheel = buildCityWheel(stateWith(3, many), "tokyo", MISSION_TYPES);
    expect(wheel?.items).toHaveLength(CITY_WHEEL_MAX_MISSIONS + 1);
    expect(wheel?.items.at(-1)?.id).toBe(CITY_WHEEL_REGION_ITEM);
  });

  it("is undefined for a city that is not on the map", () => {
    expect(
      buildCityWheel(stateWith(3), "atlantis", MISSION_TYPES),
    ).toBeUndefined();
  });
});

describe("cityWheelChoice", () => {
  it("maps ring ids back to a mission, the region, or nothing", () => {
    expect(cityWheelChoice("mission:mission-7")).toEqual({
      kind: "mission",
      missionId: "mission-7",
    });
    expect(cityWheelChoice(CITY_WHEEL_REGION_ITEM)).toEqual({ kind: "region" });
    expect(cityWheelChoice("fire")).toBeUndefined();
  });
});
